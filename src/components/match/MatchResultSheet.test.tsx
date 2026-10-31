import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  asId,
  now,
  type Match,
  type MatchId,
  type ParticipantId,
  type StageId,
  type Team,
  type TeamId,
  type TournamentId,
} from '@models/index';

import { MatchResultSheet } from './MatchResultSheet';

import type { ResolvedMatch, StructuralMatch } from '@domain/formats/types';

const TOURNAMENT = asId<TournamentId>('t1');
const STAGE = asId<StageId>('s1');
const MATCH = asId<MatchId>('s1/winner/r1/m0');

const team = (id: string, name: string, tag: string): Team => ({
  id: asId<TeamId>(id),
  name,
  tag,
  countryCode: 'DE',
  socials: [],
  archived: false,
  createdAt: now(),
  updatedAt: now(),
});

const TEAMS: Record<string, Team> = {
  p1: team('t-a', 'Nova Collective', 'NOV'),
  p2: team('t-b', 'Iron Meridian', 'IRM'),
};

const teamOf = (participantId: string): Team | undefined => TEAMS[participantId];

const structural: StructuralMatch = {
  id: MATCH,
  position: { bracket: 'winner', round: 1, indexInRound: 0 },
  slotA: { kind: 'winner_of', matchId: asId<MatchId>('s1/winner/r0/m0') },
  slotB: { kind: 'winner_of', matchId: asId<MatchId>('s1/winner/r0/m1') },
  format: { kind: 'bo', games: 3 },
};

function resolved(overrides: Partial<ResolvedMatch> = {}): ResolvedMatch {
  return {
    id: MATCH,
    position: structural.position,
    format: structural.format,
    slotA: { kind: 'participant', participantId: asId<ParticipantId>('p1') },
    slotB: { kind: 'participant', participantId: asId<ParticipantId>('p2') },
    status: 'ready',
    isBye: false,
    ...overrides,
  };
}

function setup(options: { match?: ResolvedMatch; stored?: Match } = {}) {
  const onSave = vi.fn<(match: Match) => Promise<void>>().mockResolvedValue(undefined);
  const onClose = vi.fn();

  render(
    <MatchResultSheet
      match={options.match ?? resolved()}
      structural={structural}
      stored={options.stored}
      tournamentId={TOURNAMENT}
      stageId={STAGE}
      teamOf={teamOf}
      onSave={onSave}
      onClose={onClose}
    />,
  );

  return { onSave, onClose, user: userEvent.setup() };
}

const scoreFields = () => screen.getAllByRole('spinbutton') as unknown as HTMLInputElement[];

/**
 * The panel opens on the series score, which is how a result is usually
 * written down. These cases are about the map-by-map path, so they switch.
 */
async function mapByMap(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Maps einzeln' }));
}

describe('MatchResultSheet', () => {
  it('shows both teams', () => {
    setup();

    expect(screen.getByText('Nova Collective')).toBeInTheDocument();
    expect(screen.getByText('Iron Meridian')).toBeInTheDocument();
  });

  it('saves a decided series with the derived winner', async () => {
    const { onSave, user } = setup();
    await mapByMap(user);

    const [a1, b1] = scoreFields();
    await user.type(a1!, '13');
    await user.type(b1!, '7');

    await user.click(screen.getByRole('button', { name: /map hinzufügen/i }));
    const [, , a2, b2] = scoreFields();
    await user.type(a2!, '13');
    await user.type(b2!, '9');

    await user.click(screen.getByRole('button', { name: /speichern/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0];
    expect(saved.games).toHaveLength(2);
    expect(saved.outcome?.winner).toBe('A');
    expect(saved.outcome?.reason).toBe('played');
  });

  it('leaves a half-played series without an outcome', async () => {
    const { onSave, user } = setup();
    await mapByMap(user);

    const [a1, b1] = scoreFields();
    await user.type(a1!, '13');
    await user.type(b1!, '7');
    await user.click(screen.getByRole('button', { name: /speichern/i }));

    // Best of three needs two map wins.
    expect(onSave.mock.calls[0]![0].outcome).toBeUndefined();
  });

  /**
   * A blank row is a row the user has not filled in, not a nil-all draw.
   * Counting it as a played map would decide series early.
   */
  it('ignores rows where no score was entered', async () => {
    const { onSave, user } = setup();
    await mapByMap(user);

    await user.click(screen.getByRole('button', { name: /map hinzufügen/i }));
    const [a1, b1] = scoreFields();
    await user.type(a1!, '13');
    await user.type(b1!, '7');

    await user.click(screen.getByRole('button', { name: /speichern/i }));

    expect(onSave.mock.calls[0]![0].games).toHaveLength(1);
  });

  it('saves on Enter, so a result needs no mouse', async () => {
    const { onSave, user } = setup();
    await mapByMap(user);

    const [a1, b1] = scoreFields();
    await user.type(a1!, '13');
    await user.type(b1!, '7{Enter}');

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('awards a walkover without any maps', async () => {
    const { onSave, user } = setup();

    await user.click(screen.getByRole('button', { name: /kampflos für iron meridian/i }));

    const saved = onSave.mock.calls[0]![0];
    expect(saved.outcome).toMatchObject({ winner: 'B', reason: 'walkover' });
    expect(saved.games).toHaveLength(0);
  });

  it('refuses input while the participants are undetermined', () => {
    setup({
      match: resolved({
        slotB: { kind: 'tbd', source: { kind: 'tbd' } },
        status: 'pending',
      }),
    });

    expect(screen.getByText(/stehen noch nicht fest/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /speichern/i })).toBeDisabled();
  });

  it('preloads an existing result for editing', () => {
    const stored: Match = {
      id: MATCH,
      tournamentId: TOURNAMENT,
      stageId: STAGE,
      position: structural.position,
      slotA: structural.slotA,
      slotB: structural.slotB,
      format: structural.format,
      games: [
        {
          id: asId<Match['games'][number]['id']>('g1'),
          index: 1,
          scoreA: 13,
          scoreB: 4,
          winner: 'A',
        },
      ],
      createdAt: now(),
      updatedAt: now(),
    };

    // Map scores of its own, so it opens map by map rather than as a series.
    setup({ stored });

    const [a1, b1] = scoreFields();
    expect(a1!.value).toBe('13');
    expect(b1!.value).toBe('4');
  });

  it('closes on Escape', async () => {
    const { onClose, user } = setup();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

/**
 * Recording a best-of series by its score.
 *
 * This is the path that was missing. Without it a 2:1 had to be written on the
 * only row the panel offered, where it reads as a single map won 2-1 — one map
 * win out of the two a best-of-three needs. The result was stored, the match
 * stayed open, and every table ignored it.
 */
describe('MatchResultSheet, series score', () => {
  it('opens on the series score', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Serienstand' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('turns a series score into the maps it consists of', async () => {
    const { onSave, user } = setup();

    const [a, b] = scoreFields();
    await user.type(a!, '2');
    await user.type(b!, '1');
    await user.click(screen.getByRole('button', { name: /speichern/i }));

    const saved = onSave.mock.calls[0]![0];
    expect(saved.games).toHaveLength(3);
    expect(saved.games.filter((game) => game.winner === 'A')).toHaveLength(2);
    expect(saved.games.filter((game) => game.winner === 'B')).toHaveLength(1);
    expect(saved.outcome?.winner).toBe('A');
    expect(saved.outcome?.reason).toBe('played');
  });

  it('decides the match, which is the entire point', async () => {
    const { onSave, user } = setup();

    const [a, b] = scoreFields();
    await user.type(a!, '0');
    await user.type(b!, '2');
    await user.click(screen.getByRole('button', { name: /speichern/i }));

    expect(onSave.mock.calls[0]![0].outcome?.winner).toBe('B');
  });

  /** A best-of-three cannot end 3:1, and saying so beats storing nonsense. */
  it('refuses a score the format could not produce', async () => {
    const { onSave, user } = setup();

    const [a, b] = scoreFields();
    await user.type(a!, '3');
    await user.type(b!, '1');

    expect(screen.getByText(/kann es in einem BO3 nicht geben/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /speichern/i }));
    expect(onSave.mock.calls[0]![0].games).toHaveLength(0);
    expect(onSave.mock.calls[0]![0].outcome).toBeUndefined();
  });

  it('says a series is still open before it is complete', async () => {
    const { user } = setup();

    const [a, b] = scoreFields();
    await user.type(a!, '1');
    await user.type(b!, '1');

    expect(screen.getByText(/kann es in einem BO3 nicht geben/i)).toBeInTheDocument();
  });

  /** Reopening a result recorded as a series shows it as one. */
  it('reads a stored series back', () => {
    const stored: Match = {
      id: MATCH,
      tournamentId: TOURNAMENT,
      stageId: STAGE,
      position: structural.position,
      slotA: structural.slotA,
      slotB: structural.slotB,
      format: structural.format,
      games: [
        {
          id: asId<Match['games'][number]['id']>('g1'),
          index: 1,
          scoreA: 0,
          scoreB: 0,
          winner: 'A',
        },
        {
          id: asId<Match['games'][number]['id']>('g2'),
          index: 2,
          scoreA: 0,
          scoreB: 0,
          winner: 'A',
        },
        {
          id: asId<Match['games'][number]['id']>('g3'),
          index: 3,
          scoreA: 0,
          scoreB: 0,
          winner: 'B',
        },
      ],
      createdAt: now(),
      updatedAt: now(),
    };

    setup({ stored });

    expect(screen.getByRole('button', { name: 'Serienstand' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const [a, b] = scoreFields();
    expect(a!.value).toBe('2');
    expect(b!.value).toBe('1');
  });
});
