# Architecture

## In one sentence

A small set of persisted facts — tournament configuration, participants and match
results — is transformed into everything else by pure, deterministic functions:
brackets, standings, statistics.

---

## 1. Layers

```
UI            React components, pages, layouts
              knows only selectors and actions
State         Zustand slices, memoised selectors
              holds persisted facts only
Domain        format engine, seeding, standings, statistics
(pure)        no imports from React, the store or the database
Persistence   IndexedDB, migrations, import/export
Platform      Vite, static hosting
```

The domain layer imports nothing from React, Zustand or the database. It is plain
TypeScript made of pure functions, enforced by ESLint via `import/no-restricted-paths`.

This boundary is not dogma. It is what keeps tournament logic testable without a
browser, allows moving it into a web worker when performance demands it, and lets
the same code run server-side if the app ever gains a backend. A single
`useStore()` call inside the engine destroys all three options.

---

## 2. The bracket is never stored

Persisted: tournament configuration, participant list, match results.
Derived on every load: who occupies which slot, standings, statistics, placements.

The practical benefit is that correcting a first-round result propagates through
the whole tournament automatically. With a stored bracket state, downstream
invalidation has to be implemented by hand, which is the classic source of bugs in
bracket software. Undo/redo and future server synchronisation fall out of this
almost for free.

The cost is recomputation on load — well inside budget for realistic tournament
sizes, and memoised on top.

---

## 3. Data model

### Principles

1. **Normalised.** Entities live in `Record<Id, Entity>`; relationships are IDs only.
2. **Derived data is never stored.** Statistics, standings and bracket positions
   are functions of state.
3. **Timestamps are UTC ISO-8601 strings.** No `Date` objects in persisted data —
   they are not JSON-serialisable.
4. **Every entity carries `id`, `createdAt`, `updatedAt`.**
5. **Assets are stored separately** from metadata so tournament lists load without
   dragging binary data along.

### Master data

```ts
/** A game title. Owns the map pool, because maps belong to the game, not the tournament. */
interface Game {
  id: GameId;
  name: string;
  shortName: string; // "CS2", "LoL"
  iconAssetId?: AssetId;
  maps: MapDefinition[];
  defaultMatchFormat: MatchFormat;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

interface MapDefinition {
  id: MapId;
  name: string;
  imageAssetId?: AssetId;
  active: boolean; // removed from the active pool but preserved historically
}

/** Persistent team identity, reusable across tournaments. */
interface Team {
  id: TeamId;
  name: string;
  tag: string;
  logoAssetId?: AssetId;
  bannerAssetId?: AssetId;
  region?: Region;
  countryCode?: string; // ISO 3166-1 alpha-2
  description?: string;
  foundedAt?: IsoDate;
  socials: SocialLink[];
  archived: boolean; // archive instead of delete, to protect match history from dangling refs
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

interface Player {
  id: PlayerId;
  nickname: string;
  realName?: string; // personal data — see section 7
  countryCode?: string;
  avatarAssetId?: AssetId;
  socials: SocialLink[];
  archived: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * Time-bounded membership of a player in a team.
 *
 * Modelled as its own entity because players change teams. A direct
 * `Team.players[]` relation makes historical questions ("who played in last
 * year's final?") unanswerable, and retrofitting it later means migrating all
 * existing data.
 */
interface RosterEntry {
  id: RosterEntryId;
  teamId: TeamId;
  playerId: PlayerId;
  role?: string;
  joinedAt: IsoDate;
  leftAt?: IsoDate; // undefined means active
  isSubstitute: boolean;
}

/** Binary data, kept in its own table. */
interface Asset {
  id: AssetId;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  originalFileName: string;
  createdAt: IsoDateTime;
}
```

### Tournament and stages

```ts
interface Tournament {
  id: TournamentId;
  name: string;
  slug: string;
  description?: string;
  gameId: GameId;
  organizer?: string;
  logoAssetId?: AssetId;
  bannerAssetId?: AssetId;
  startsAt?: IsoDateTime;
  endsAt?: IsoDateTime;
  status: TournamentStatus; // draft | registration | live | completed | cancelled
  participants: Participant[];
  stageIds: StageId[]; // ORDERED — defines how the tournament progresses
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** A team within ONE tournament. Carries tournament-specific data such as the seed. */
interface Participant {
  id: ParticipantId;
  teamId: TeamId;
  seed: number; // 1 is strongest
  status: 'active' | 'withdrawn' | 'disqualified';
  note?: string;
}

/**
 * One phase of a tournament. The key to composability is `entrySeeding`, which
 * describes WHERE the participants come from: the tournament entry list, or the
 * outcome of an earlier stage.
 */
interface Stage {
  id: StageId;
  tournamentId: TournamentId;
  name: string;
  order: number;
  format: FormatConfig;
  entrySeeding: SeedingRule[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
```

### Format configuration

```ts
type FormatConfig =
  | SingleEliminationConfig
  | DoubleEliminationConfig
  | RoundRobinConfig
  | GroupStageConfig
  | SwissConfig;

interface SingleEliminationConfig {
  kind: 'single_elimination';
  thirdPlaceMatch: boolean;
  byePlacement: 'seeded' | 'random';
  matchFormats: RoundMatchFormats; // best-of per round, e.g. Bo5 final
}

interface DoubleEliminationConfig {
  kind: 'double_elimination';
  grandFinal: 'single' | 'bracket_reset';
  loserBracketSeeding: 'standard' | 'reversed';
  matchFormats: RoundMatchFormats;
}

interface RoundRobinConfig {
  kind: 'round_robin';
  legs: 1 | 2; // single or double round robin
  pointSystem: PointSystem;
  tiebreakers: Tiebreaker[]; // ordered chain
  matchFormat: MatchFormat;
}

interface GroupStageConfig {
  kind: 'group_stage';
  groupCount: number;
  distribution: 'snake' | 'sequential' | 'random' | 'manual';
  perGroup: Omit<RoundRobinConfig, 'kind'>;
}

interface SwissConfig {
  kind: 'swiss';
  rounds: number;
  pairing: 'dutch' | 'random_within_score_group';
  avoidRematches: boolean;
  tiebreakers: Tiebreaker[];
  matchFormat: MatchFormat;
}

type Tiebreaker =
  | 'points'
  | 'head_to_head'
  | 'map_difference'
  | 'round_difference'
  | 'maps_won'
  | 'buchholz'
  | 'median_buchholz'
  | 'seed'
  | 'manual';

interface PointSystem {
  win: number;
  draw: number;
  loss: number;
  forfeit: number;
}
type MatchFormat = { kind: 'bo'; games: 1 | 3 | 5 | 7 } | { kind: 'single_game' };
```

### Seeding rules — the composition mechanism

```ts
/** Describes how a stage is populated: one rule fills a slot range from a source. */
interface SeedingRule {
  id: SeedingRuleId;
  source: SeedingSource;
  targetSlots: { from: number; to: number }; // 1-based
  order: 'as_ranked' | 'snake' | 'random';
}

type SeedingSource =
  /** Straight from the tournament entry list */
  | { kind: 'participants'; seedRange?: { from: number; to: number } }
  /** Placements from a round robin or Swiss stage */
  | { kind: 'stage_standings'; stageId: StageId; placeRange: { from: number; to: number } }
  /** Placements per group — "top 2 of each group" */
  | { kind: 'group_standings'; stageId: StageId; placeRange: { from: number; to: number } }
  /** Losers of a bracket round, e.g. winner bracket feeding the loser bracket */
  | { kind: 'bracket_losers'; stageId: StageId; round: number }
  /** Set by hand */
  | { kind: 'manual'; participantIds: ParticipantId[] };
```

This is what makes combinations configuration rather than code:

| Setup                                 | Composition                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Group stage into knockout             | `group_stage`, then `single_elimination` seeded from `group_standings` with `placeRange {1,2}` and `order: 'snake'` |
| League into playoffs                  | `round_robin` with `legs: 2`, then a bracket seeded from `stage_standings` `{1,4}`                                  |
| Round robin into double elimination   | identical, with `double_elimination` as the second stage                                                            |
| Multiple qualifiers into a main event | stages `Q1..Qn`, main event with n rules of `placeRange {1,1}` into disjoint `targetSlots`                          |

New combinations require no code.

### Matches and results

```ts
interface Match {
  id: MatchId;
  tournamentId: TournamentId;
  stageId: StageId;

  /** Position within the format structure. Set by the engine, not the user. */
  position: MatchPosition;

  /** Participants as RESOLVABLE references — the core of automatic progression */
  slotA: MatchSlot;
  slotB: MatchSlot;

  format: MatchFormat;
  status: MatchStatus; // pending | ready | live | completed | walkover | cancelled
  scheduledAt?: IsoDateTime;
  games: GameResult[]; // per-map results; the match score is DERIVED from these
  outcome?: MatchOutcome;
  streamUrl?: string;
  vodUrl?: string;
  notes?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

interface MatchPosition {
  bracket?: 'winner' | 'loser' | 'grand_final' | 'third_place';
  round: number;
  indexInRound: number;
  groupIndex?: number;
  leg?: 1 | 2;
}

/**
 * A match slot is either a concrete team or a reference to a result that is not
 * in yet. Resolving such references IS the automatic progression — there is no
 * separate "advance the winner" step anywhere in the codebase.
 */
type MatchSlot =
  | { kind: 'participant'; participantId: ParticipantId }
  | { kind: 'winner_of'; matchId: MatchId }
  | { kind: 'loser_of'; matchId: MatchId }
  | { kind: 'seeded'; slotIndex: number } // resolved by a SeedingRule
  | { kind: 'bye' }
  | { kind: 'tbd' };

interface GameResult {
  id: GameResultId;
  index: number; // map 1, 2, 3 ...
  mapId?: MapId;
  scoreA: number;
  scoreB: number;
  winner?: 'A' | 'B' | 'draw';
  pickedBy?: 'A' | 'B' | 'decider';
  sideA?: string;
  notes?: string;
}

interface MatchOutcome {
  winner: 'A' | 'B' | 'draw';
  reason: 'played' | 'walkover' | 'forfeit' | 'disqualification' | 'manual';
  decidedAt: IsoDateTime;
}
```

### What the data model deliberately omits

Not persisted, because it is derivable:

- match score (`2:1`) — aggregated from `games[]`
- who occupies which bracket slot — resolution of `MatchSlot`
- group and league tables — matches plus point system plus tiebreakers
- team statistics (win rate, W/L, map stats, head-to-head) — aggregation over matches
- final placements — a function of the last stage
- whether a stage is complete — all its matches are completed

---

## 4. Format engine

### Contract

Every format implements the same interface. New formats are plugins, not changes
to the core.

```ts
interface TournamentFormat<TConfig extends FormatConfig> {
  readonly kind: TConfig['kind'];

  /** Builds the full match structure. Pure and deterministic. */
  generateStructure(input: {
    stageId: StageId;
    config: TConfig;
    slotCount: number;
  }): GeneratedStructure;

  /** Resolves open slots against the results that exist. */
  resolveSlots(input: {
    structure: GeneratedStructure;
    results: ReadonlyMap<MatchId, MatchOutcome>;
    seededSlots: ReadonlyMap<number, ParticipantId>;
  }): ResolvedStructure;

  /** Standings as of the current state. */
  computeStandings(input: {
    structure: ResolvedStructure;
    config: TConfig;
    matches: readonly Match[];
  }): Standing[];

  /** Validates a configuration BEFORE generating, producing errors for the UI. */
  validate(config: TConfig, slotCount: number): ValidationResult;
}
```

Formats register in a `FormatRegistry` keyed by `kind`. Adding one is a file plus
a registration call.

### The derivation pipeline

```ts
/** The single most important function in the application. Pure. */
function deriveTournamentState(
  tournament: Tournament,
  stages: readonly Stage[],
  matches: readonly Match[],
): DerivedTournamentState;
```

Per stage, in `order`:

1. Generate the structure from `format` and slot count.
2. Resolve `entrySeeding` rules against already-derived earlier stages.
3. Resolve slots — this is where progression happens.
4. Propagate byes: a match against a bye is immediately decided.
5. Derive match status (`pending` becomes `ready` once both slots are concrete).
6. Compute standings.
7. Feed the result into the next stage's context.

Memoised on a hash of the inputs. The contract is already worker-compatible
because the engine touches neither the DOM nor the store.

### Byes

With 13 participants in single elimination: the next power of two is 16, so three
byes. They are assigned by seed (seeds 1–3 receive them) and represented as
`MatchSlot = { kind: 'bye' }`. Progression needs no special case, so any
participant count works without a dedicated code path.

---

## 5. Persistence

### Storage layout

```ts
db.version(1).stores({
  games: 'id, name',
  teams: 'id, name, tag, archived',
  players: 'id, nickname, archived',
  rosters: 'id, teamId, playerId',
  tournaments: 'id, slug, gameId, status, startsAt',
  stages: 'id, tournamentId, order',
  matches: 'id, tournamentId, stageId, status, scheduledAt',
  assets: 'id',
  meta: 'key', // schema version, settings, last backup
});
```

IndexedDB rather than LocalStorage for domain data. LocalStorage caps out around
5 MB, is synchronous (blocking the main thread) and stores strings only — logos
as base64 would exhaust it at roughly 30 teams. IndexedDB stores blobs natively.

Assets live in their own table so tournament lists load metadata without blobs.
Images are loaded lazily and cached as object URLs, with revocation on cleanup.
Uploads are normalised before storage: logos capped at 512×512, banners at
1920×480, converted to WebP.

UI preferences (theme, language) stay in LocalStorage: they are needed
synchronously at startup and are tiny.

### Import and export

```ts
interface TournaCoreExport {
  schemaVersion: number;
  exportedAt: IsoDateTime;
  appVersion: string;
  scope: 'full' | 'tournament' | 'teams';
  data: { games; teams; players; rosters; tournaments; stages; matches; assets? };
}
```

- Assets are base64-encoded only when explicitly requested; otherwise file size explodes.
- Imports are validated against a schema. Never `JSON.parse` straight into the store.
- A migration pipeline lifts older files version by version.
- Two modes: `replace` and `merge` with ID conflict resolution.
- An automatic backup is taken before every import, since import is otherwise irreversible.

Without schema versioning, the first data model change would break every existing
export irrecoverably — and there is no server-side backup to fall back on.

### Autosave and backup

- Autosave debounced 500 ms after each mutation.
- Rolling backups: the last three full snapshots, rotated daily.
- Manual backup as a JSON download.
- Storage warning above 80% quota via `navigator.storage.estimate()`.
- `navigator.storage.persist()` requested on first tournament creation, to prevent
  the browser evicting the data.

---

## 6. Routing

Hash-based routing. Static hosts serve a 404 for unknown paths and have no SPA
rewrite, so every deep link opened directly or reloaded would break under history
routing. The common 404.html redirect workaround causes a visible double load and
pollutes browser history.

Routes:

| Route                                           | View                                       |
| ----------------------------------------------- | ------------------------------------------ |
| `/`                                             | Dashboard                                  |
| `/tournaments`, `/tournaments/new`              | Tournament list, creation wizard           |
| `/tournaments/:id`                              | Tournament overview with stage tabs        |
| `/tournaments/:id/stages/:stageId`              | Bracket, group table or league table       |
| `/tournaments/:id/matches`, `/matches/:matchId` | Match list and detail                      |
| `/tournaments/:id/settings`                     | Metadata, stage editing, duplicate, delete |
| `/teams`, `/teams/:id`, `/teams/:id/edit`       | Team list, profile, editor                 |
| `/games`                                        | Game titles and map pools                  |
| `/statistics`                                   | Cross-tournament analytics                 |
| `/transfer`                                     | Import and export                          |
| `/settings`                                     | Appearance, language, data                 |
| `/legal/imprint`, `/legal/privacy`              | Legal pages                                |

Every page except the shell and the 404 view is lazy loaded.

---

## 7. Privacy and rights by construction

### No external requests

The app opens no connection to a foreign origin at runtime. No CDN fonts, no
analytics, no externally loaded images, no error reporting.

This is the basis of the entire privacy position, and it is enforced rather than
documented:

- Content Security Policy on production builds, with `connect-src 'self'` as the
  decisive directive.
- `tests/e2e/no-network.spec.ts` fails as soon as a request targets a foreign origin.
- Dependency licences are checked in CI.

A single CDN font would transmit every visitor's IP address to a third party and
change the legal assessment of the whole project. Lines like that slip into a
codebase casually, which is why a test guards it.

### Data protection

| Aspect                 | Position                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Server-side processing | None. There is no server. All data stays in the browser.                                                  |
| Host logs              | The static host records access data including IP addresses. This must be disclosed in the privacy policy. |
| Local storage          | Strictly necessary for the app to function at all, therefore consent-free. No cookie banner.              |
| Real player names      | Optional field. Users become controllers for third-party data; the UI should encourage nicknames.         |
| Exports and sharing    | Data leaves the device. Warn when personal data is included.                                              |
| Data subject rights    | Satisfied by construction: export covers portability, clearing application data covers erasure.           |

The legal notice and privacy policy under `src/pages/legal/` contain placeholders
that must be completed before the site is made publicly available.

### Third-party rights

- No game logos, team logos, map images or trademarks in the repository, not even
  as sample data. Demo data uses invented names.
- No hotlinking: images are uploaded locally, never referenced by URL. Hotlinking
  would be both a copyright and a privacy problem.
- Uploaded assets stay on the user's device.
- Users are responsible for the rights to material they upload; this is stated in
  the upload dialog and the legal notice.
- Importing from external tournament databases is a licensing question in its own
  right — several publish under share-alike terms requiring attribution.

---

## 8. Design system

Themes are implemented through CSS variables switched by a `data-theme` attribute
on the root element, not through Tailwind `dark:` prefixes on every component. A
third theme (high contrast for stream overlays, for example) therefore remains a
single CSS file rather than a change across hundreds of components.

Tokens live in `src/styles/tokens.css` and are mapped onto utilities in
`globals.css` using `@theme inline`, so generated utilities reference the variable
instead of copying its value. That is what makes a runtime theme switch work.

Light mode is deliberately not an inverted dark mode: accent saturation and
lightness are chosen independently so contrast meets WCAG AA in both themes.

**Type.** Inter for UI, JetBrains Mono with tabular figures for scores and times —
proportional digits make numbers visibly jump when they update live. Scale ratio
1.25. Fonts must be self-hosted; a CDN is out of the question.

**Colour as signal.** Accents always mean something: live, winner, warning, active.
Nothing is decorative. This is why dense bracket views stay readable.

**Motion.** 120 ms for hover and colour changes, 200 ms for cards and popovers,
400 ms spring for bracket progression. No permanently running animation except the
live pulse. All motion respects `prefers-reduced-motion`.

**Accessibility.** Full keyboard operation including bracket navigation, visible
focus rings, AA contrast in both themes, and status never conveyed by colour alone
— "live" carries a dot _and_ a label, a winner has a border _and_ weight.

---

## 9. Bracket rendering

Layout is computed by a pure function producing node coordinates and connector
paths, separate from rendering. No DOM measurement, so it is testable without a
browser and causes no reflow.

Nodes are absolutely positioned DOM elements over an SVG layer for the connectors:
pure SVG makes text and hover interaction awkward, pure DOM cannot draw clean
curves. Zoom and pan use a CSS transform on the container rather than recomputing
layout. Beyond roughly 64 matches, only nodes within the viewport are rendered.

Drag and drop is limited to draft state. Once a tournament starts, manual slot
edits would make the derivation chain inconsistent.

---

## 10. Stack decisions

| Area          | Choice                               | Reasoning                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routing       | React Router, hash mode              | Static hosting has no SPA rewrite                                                                                                                                                                                                                                                              |
| State         | Zustand                              | ~1.2 kB against ~13 kB. The store holds only normalised facts while all logic sits in the pure domain layer, so a heavier framework's strengths barely apply while its boilerplate does. Selector granularity also matters: a bracket with 128 match components re-renders per selected slice. |
| Persistence   | Dexie over IndexedDB                 | Blob support, asynchronous, clean migration model                                                                                                                                                                                                                                              |
| Validation    | Schema validation on import          | Untrusted JSON must never reach the store unchecked                                                                                                                                                                                                                                            |
| Drag and drop | dnd-kit                              | Smaller than the alternative, no HTML5 DnD backend, and keyboard operable — which the HTML5 API is not                                                                                                                                                                                         |
| Styling       | TailwindCSS with CSS-variable tokens | Runtime theme switching without regenerating stylesheets                                                                                                                                                                                                                                       |
| Icons         | lucide-react                         | Tree-shakeable with named imports                                                                                                                                                                                                                                                              |
| Tests         | Vitest and Playwright                | Vitest shares the Vite config                                                                                                                                                                                                                                                                  |

Deliberately avoided: date libraries with no tree-shaking, any UI kit pulled in
wholesale, and every form of third-party runtime script.

---

## 11. Folder structure

```
src/
├── app/          bootstrap: router, providers, error boundary
├── domain/       PURE LOGIC — no React, store or database imports
│   ├── formats/  registry plus one directory per format
│   ├── seeding/  seeding rule resolution, snake ordering, bye distribution
│   ├── standings/  points, tiebreaker chains, Buchholz
│   ├── statistics/ team aggregation, map stats, head-to-head
│   ├── bracket/  layout computation, coordinates, connector paths
│   └── derive.ts the central entry point
├── models/       types, schemas, branded IDs, type guards
├── store/        Zustand slices and memoised selectors
├── services/     side effects: database, transfer, assets, backup
├── components/   ui/, bracket/, tournament/, team/, match/, charts/
├── layouts/      app shell, sidebar, top bar
├── pages/        one per route, lazy loaded
├── hooks/
├── utils/
├── i18n/
└── styles/
```

`pages` and `components` are separate because pages are route-bound and fetch
data, while components are reusable and presentational. Without that split,
"reusable" is a claim rather than a property.

---

## 12. Budgets

| Metric                             | Target                                 | Enforced by      |
| ---------------------------------- | -------------------------------------- | ---------------- |
| Initial bundle (gzip)              | < 250 kB                               | CI build step    |
| Bracket render, 128 teams          | < 100 ms, 60 fps on pan and zoom       | manual profiling |
| Tournament derivation, 256 matches | < 16 ms                                | benchmark        |
| Domain layer coverage              | > 90% branches                         | Vitest threshold |
| Type safety                        | strict, no `any` in domain or services | ESLint, tsconfig |

The coverage gate applies to the domain layer only. A bug in tournament
progression corrupts a running tournament and cannot be repaired by the user,
whereas a UI bug is merely annoying.

---

## 13. Scope boundaries

Explicitly out of scope for now, to keep the architecture honest about what it
does and does not solve:

- real-time synchronisation between devices
- user accounts and authentication
- server-side data storage
- automated import from external tournament platforms
- payments, ticketing, prize money
- anti-cheat, ranking or matchmaking

None of these requires a rewrite later — see below.

---

## 14. Designed for later

| Future capability       | What makes it possible now                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote database         | Services work against a repository interface; the local implementation is one of potentially several, and no UI code knows about the database |
| User accounts           | Every entity carries timestamps; an owner field is additive                                                                                   |
| Multiple administrators | Results are the only truth, so conflicts resolve per match rather than per bracket — the tractable case                                       |
| Live match management   | Match status and per-map results already exist; only a transport is missing                                                                   |
| Real-time statistics    | Statistics are derived, so they are current the moment a result changes                                                                       |
| Offline and installable | Nothing in the critical path touches the network                                                                                              |
| Localisation            | i18n wired from the start, no hardcoded strings                                                                                               |
| Mobile                  | Breakpoints carried throughout; the bracket gains a dedicated compact view                                                                    |
| External imports        | Transfer adapters sit behind an interface; further sources are mappers                                                                        |
