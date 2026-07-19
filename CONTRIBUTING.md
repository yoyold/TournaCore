# Contributing

## The one hard architectural rule

`src/domain` is pure. No imports from React, Zustand, Dexie, `components`, `pages`
or `services`. Only `domain`, `models` and `utils` are allowed.

ESLint enforces this through `import/no-restricted-paths`. When the rule gets in
your way, the design is almost always wrong rather than the rule. It protects
three things: testability without a browser, moving the engine into a web worker
later, and reusing the same logic server-side if the app ever gains a backend.

## What is never stored

Derived data does not belong in the database. Never persist:

- match score (follows from the per-map results)
- bracket occupancy (follows from resolving match slots)
- standings tables (follow from matches plus point system and tiebreakers)
- team statistics (follow from all matches)
- final placements

Only tournament configuration, participants and match results are persisted.
Everything else is recomputed. This is what makes a corrected result in round one
propagate through the entire tournament instead of leaving an inconsistent state
behind.

## No external requests

The app must not open a connection to a foreign origin at runtime. No CDN fonts,
no analytics, no externally loaded images, no error reporting.

This is the basis of the entire privacy position. It is backed by the CSP in
`vite.config.ts` and by `tests/e2e/no-network.spec.ts`. Check new dependencies
against it.

## No third-party brand assets

No game logos, team logos, map images or trademarks in the repository, not even
as sample data. Demo data uses invented names.

## Definition of done

1. Fully typed. No `any`, no `@ts-ignore`.
2. Domain logic covered by unit tests. `src/domain` has a 90% coverage gate.
3. Exported functions carry TSDoc explaining **why**, not **what**.
4. All user-facing strings go through i18n.
5. Empty, loading and error states exist.
6. Keyboard operable, focus visible, AA contrast in both themes.
7. Responsive down to 768px.
8. `npm run ci` passes.

## Styling

Colours and spacing come from the design tokens in `src/styles/tokens.css`,
mapped in `globals.css`. Use `bg-surface`, `text-fg-secondary`, `border-line` —
not Tailwind palette classes like `bg-slate-800`, and no `dark:` prefixes for
colours. The reason: a third theme should remain a single CSS file.

## Comments

Comments explain decisions, not syntax. Write them in English. Where a piece of
code is not self-evident, say _why_ it looks the way it does.

## Commits

- Conventional Commits, using the scopes defined in `commitlint.config.js`.
- Written in English, subject line in the imperative.
- No trailers.

Example: `feat(domain): add single elimination structure generation`

## Commands

```bash
npm run dev            # dev server
npm run ci             # everything the pipeline runs
npm run test:watch     # unit tests in watch mode
npm run test:e2e       # end-to-end tests (builds first)
npm run build -- --mode analyze   # bundle analysis written to stats.html
```
