# TournaCore

Tournament management for esports and gaming events. Runs entirely in the browser
— no server, no account, no data transfer. Shipped as a static site.

> **Status:** early development. The application shell, theming and tooling are in
> place; tournament features are being built on top.

## Idea

Functionality in the spirit of a tournament wiki, presented like a modern gaming
platform. The goal is support for single and double elimination, round robin,
group stages and Swiss system — and above all their **combination** into
multi-phase tournaments such as group stage into playoffs, or qualifiers into a
main event.

## Your data stays with you

TournaCore has no server. Everything you create lives in your browser's IndexedDB.
There is no tracking, there are no analytics cookies, and no third-party services
are embedded — the application opens no outbound connections at all. That is not
just a promise: it is encoded in the Content Security Policy and verified by an
automated test ([`tests/e2e/no-network.spec.ts`](tests/e2e/no-network.spec.ts)).

The trade-off: **your data is only as safe as your browser profile.** Use the JSON
export as a backup once it is available.

## Getting started

```bash
npm install
npm run dev
```

| Command                           | Purpose                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run ci`                      | Format, lint, typecheck, tests, build — same as the pipeline |
| `npm run test:watch`              | Unit tests in watch mode                                     |
| `npm run test:e2e`                | End-to-end tests (builds first)                              |
| `npm run build -- --mode analyze` | Bundle analysis written to `stats.html`                      |
| `npm run import:challonge`        | Convert Challonge tournaments into an import file            |

## Importing from Challonge

Under **Import / Export** there is a box to paste a Challonge tournament into.
Open `https://challonge.com/<slug>.json` in a tab, copy the lot, paste it in, and
the conversion reports what it found before anything is written.

There is no URL field, and there will not be one: the application makes no
outbound requests — its Content Security Policy forbids them and a test enforces
it — and Challonge sends no cross-origin headers and sits behind bot protection,
so fetching from here could not work regardless. Pasting leaves the fetching
where it already works: a browser tab you opened.

The same conversion is available as a script, which is what private tournaments
and bulk migrations need.

For a **public** tournament no key is needed at all. Open
`https://challonge.com/<slug>.json` in a browser, save it, and convert that:

```bash
npm run import:challonge -- --file bracket.json --name "My Cup"
```

The public payload carries no tournament name, which is what `--name` supplies.
For private tournaments, or to fetch several at once, use the API instead:

```bash
export CHALLONGE_API_KEY=...
npm run import:challonge -- --tournament my-cup --save-raw raw.json
```

Without `--out` this is a dry run: it reports what each tournament would become,
how many results found a fixture and what it had to skip. Add `--out
import.json` to write the file, then load it under **Import / Export** and
choose _merge_.

Worth knowing before you start:

- **Teams are matched by name** across every tournament in one run, which is
  what makes cross-tournament statistics and ratings meaningful. Pass
  `--existing <export.json>` so teams you already have are reused rather than
  duplicated.
- **Single and double elimination, round robin and Swiss** convert. Tournaments
  using Challonge's group stages are skipped rather than half-imported.
- **The loser bracket draw is detected, not assumed.** Which winner bracket
  casualty drops onto which survivor decides who meets whom after a defeat, and
  bracket software does not agree on the rule. Each supported arrangement is
  tried and whichever accounts for more of the recorded history is kept; the
  report names it.
- **Swiss pairings are recomputed** by this application's own algorithm, so
  rounds after the first may pair differently than they did on Challonge. The
  report says how many results this left unplaced.
- **Nothing is written if a result has no fixture to sit on**, because the
  import would be missing part of its history. `--allow-partial` overrides that
  once you have read the report.
- Challonge has no country codes and no series length. Flags stay empty, and
  the best-of is inferred from the longest series actually recorded.

## Stack

React 19 · TypeScript (strict) · Vite 7 · TailwindCSS 4 · React Router (hash
routing) · Zustand · IndexedDB · Vitest · Playwright · ESLint · Prettier

## Architecture

A small set of persisted facts — tournament configuration, participants and match
results — is transformed into everything else by pure, deterministic functions.

The bracket is **never stored**; it is derived on every load. A corrected result
therefore propagates through the entire tournament instead of leaving an
inconsistent state behind.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning, and
[CONTRIBUTING.md](CONTRIBUTING.md) for working conventions.

## Deployment

Pushing to `main` runs the full pipeline and, if every check passes, publishes to
GitHub Pages. The base path is derived from the repository name; for a custom
domain, set `VITE_BASE_PATH=/`.

To enable it: create the repository, push, then set _Settings → Pages → Source_ to
**GitHub Actions**.

**Before making the site publicly available:** the legal notice and privacy policy
under `src/pages/legal/` contain placeholders that must be completed.

## Licence

[MIT](LICENSE), covering the source code. Users are responsible for any content
they load into the application, including logos, banners and names.
