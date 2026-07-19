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
