import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

import { nanoid } from 'nanoid';

import { parseChallonge, type ChallongeTournament } from '@services/challonge/challongeSchema';
import { mapChallongeTournaments, type TournamentReport } from '@services/challonge/mapTournament';
import { buildExport, parseImport, type TransferData } from '@services/transfer/transfer';

/**
 * Converts Challonge tournaments into a TournaCore import file.
 *
 * Deliberately a script rather than a feature of the application. TournaCore
 * makes no network requests at runtime — its content security policy forbids
 * them and a test enforces it — and an API key has no business sitting in a
 * browser. Run offline, the conversion produces an ordinary export file that
 * goes in through the same validated import path as any other.
 *
 * The key is read from the environment and never passed on the command line,
 * where it would end up in the shell history.
 */

const USAGE = `
Usage:
  vite-node scripts/import-challonge.ts -- [options]

Source (one of):
  --tournament <id>     Challonge tournament id or url slug. Repeatable.
                        Requires CHALLONGE_API_KEY in the environment.
  --file <path>         A previously saved Challonge response, or the JSON
                        behind a public bracket page (challonge.com/<slug>.json,
                        which needs no key).
  --name <text>         Tournament name for a public bracket, whose payload
                        does not carry one.
  --date <YYYY-MM-DD>   When the tournament took place. A public bracket carries
                        no date, so without this it is dated the day you import.

Output:
  --out <path>          Write the TournaCore import file. Omit for a dry run.
  --save-raw <path>     Save the raw Challonge response before converting.
  --existing <path>     A TournaCore export, so teams you already have are
                        reused instead of duplicated.
  --allow-partial       Write even when some results could not be placed.
`.trim();

interface Args {
  tournaments: string[];
  file?: string;
  name?: string;
  date?: string;
  out?: string;
  saveRaw?: string;
  existing?: string;
  allowPartial: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { tournaments: [], allowPartial: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];

    switch (flag) {
      case undefined:
        break;
      case '--tournament':
        if (value === undefined) throw new Error('--tournament needs a value');
        args.tournaments.push(value);
        i += 1;
        break;
      case '--file':
        if (value === undefined) throw new Error('--file needs a value');
        args.file = value;
        i += 1;
        break;
      case '--name':
        if (value === undefined) throw new Error('--name needs a value');
        args.name = value;
        i += 1;
        break;
      case '--date':
        if (value === undefined) throw new Error('--date needs a value');
        args.date = value;
        i += 1;
        break;
      case '--out':
        if (value === undefined) throw new Error('--out needs a value');
        args.out = value;
        i += 1;
        break;
      case '--save-raw':
        if (value === undefined) throw new Error('--save-raw needs a value');
        args.saveRaw = value;
        i += 1;
        break;
      case '--existing':
        if (value === undefined) throw new Error('--existing needs a value');
        args.existing = value;
        i += 1;
        break;
      case '--allow-partial':
        args.allowPartial = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option "${flag}"`);
    }
  }

  return args;
}

const API = 'https://api.challonge.com/v1/tournaments';

/**
 * Fetches one tournament with its participants and matches.
 *
 * One request per tournament: the list endpoint does not return matches, and
 * asking for them separately would mean reconciling three responses.
 */
async function fetchTournament(id: string, apiKey: string): Promise<unknown> {
  const url = new URL(`${API}/${encodeURIComponent(id)}.json`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('include_participants', '1');
  url.searchParams.set('include_matches', '1');

  const response = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!response.ok) {
    const hint =
      response.status === 401
        ? ' — check CHALLONGE_API_KEY'
        : response.status === 404
          ? ' — check the tournament id, and that the key owns it'
          : '';
    throw new Error(`Challonge replied ${String(response.status)} for "${id}"${hint}`);
  }

  return response.json();
}

async function loadExisting(path: string): Promise<TransferData> {
  const parsed = parseImport(await readFile(path, 'utf8'));
  return parsed.data;
}

function printReport(report: TournamentReport): void {
  const status = report.skipped ? 'SKIPPED' : 'ok';
  console.log(`\n${report.name}  [${report.source}]  ${status}`);

  if (report.skipped) {
    for (const note of report.notes) console.log(`  ! ${note.message}`);
    return;
  }

  console.log(`  format        ${report.format}`);
  console.log(`  participants  ${String(report.participants)}`);
  console.log(
    `  results       ${String(report.placed)} of ${String(report.fixtures)} fixtures` +
      (report.open > 0 ? `, ${String(report.open)} still open` : ''),
  );

  for (const note of report.notes) console.log(`  ! ${note.message}`);

  if (report.contested.length > 0) {
    console.log(
      `  ${String(report.contested.length)} result(s) where Challonge's winner disagrees with its scores;` +
        ' the winner was kept:',
    );
    for (const entry of report.contested) {
      console.log(
        `    match ${entry.challongeMatchId}: ${entry.winner} won, scores ${entry.score}`,
      );
    }
  }

  if (report.unplaced.length > 0) {
    console.log(`  ${String(report.unplaced.length)} result(s) could not be placed:`);
    for (const entry of report.unplaced) {
      console.log(
        `    match ${entry.challongeMatchId}: ${entry.player1} vs ${entry.player2} (${entry.score})`,
      );
    }
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (args.tournaments.length === 0 && args.file === undefined)) {
    console.log(USAGE);
    return args.help ? 0 : 1;
  }

  let raw: unknown;

  if (args.file !== undefined) {
    raw = JSON.parse(await readFile(args.file, 'utf8'));
  } else {
    const apiKey = process.env['CHALLONGE_API_KEY'];
    if (!apiKey) {
      console.error('CHALLONGE_API_KEY is not set. Export it and run again.');
      return 1;
    }

    const fetched: unknown[] = [];
    for (const id of args.tournaments) {
      console.log(`Fetching ${id} …`);
      fetched.push(await fetchTournament(id, apiKey));
    }
    raw = fetched;
  }

  if (args.saveRaw !== undefined) {
    await writeFile(args.saveRaw, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    console.log(`Raw response written to ${args.saveRaw}`);
  }

  let sources: ChallongeTournament[];
  try {
    sources = parseChallonge(raw, args.name);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const existing =
    args.existing !== undefined
      ? await loadExisting(args.existing)
      : { games: [], teams: [], tournaments: [], stages: [], matches: [] };

  const { data, reports } = mapChallongeTournaments(sources, {
    existingTeams: existing.teams,
    existingGames: existing.games,
    existingSlugs: existing.tournaments.map((tournament) => tournament.slug),
    timestamp: new Date().toISOString(),
    ...(args.date !== undefined ? { playedAt: new Date(args.date).toISOString() } : {}),
    newId: () => nanoid(),
  });

  for (const report of reports) printReport(report);

  const unplaced = reports.reduce((sum, report) => sum + report.unplaced.length, 0);
  const contested = reports.reduce((sum, report) => sum + report.contested.length, 0);
  const skipped = reports.filter((report) => report.skipped).length;

  console.log(
    [
      '',
      '─────',
      `${String(data.tournaments.length)} tournament(s), ${String(data.teams.length)} new team(s), ` +
        `${String(data.matches.length)} result(s)`,
      skipped > 0 ? `${String(skipped)} tournament(s) skipped` : undefined,
      contested > 0
        ? `${String(contested)} result(s) with a winner that contradicts the scores`
        : undefined,
      unplaced > 0 ? `${String(unplaced)} result(s) could not be placed` : undefined,
    ]
      .filter((line) => line !== undefined)
      .join('\n'),
  );

  if (args.out === undefined) {
    console.log('\nDry run. Pass --out <path> to write the import file.');
    return 0;
  }

  /*
   * An unplaced result means the imported tournament would be missing part of
   * its history. That is a decision for the person running this, not for the
   * script, so it has to be said out loud and confirmed with a flag.
   */
  if (unplaced > 0 && !args.allowPartial) {
    console.error(
      '\nRefusing to write: some results have no fixture to sit on, so the import\n' +
        'would be incomplete. Re-run with --allow-partial if that is acceptable.',
    );
    return 1;
  }

  if (data.tournaments.length === 0) {
    console.error('\nNothing to write.');
    return 1;
  }

  const file = buildExport(data);
  await writeFile(args.out, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  console.log(`\nWritten to ${args.out}.`);
  console.log('Import it in the app under Import / Export, choosing "merge".');

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
