# Repository Guidelines

## Project Structure & Architecture

This TypeScript game uses React and TanStack Start (SPA). `src/engine/` contains rules; `src/service/` exposes shared operations; `src/storage/` provides IndexedDB and CLI JSON adapters. `src/routes/`, `src/components/`, and `src/stores/` organize navigation, UI, and public state. Never duplicate game rules or persistence in React.

`config/` holds content; `tests/` contains tests; `scripts/` provides CLI/verification tools; `assets/` contains artwork. Cloudflare Workers Static Assets serves `dist/client`.

## Development Commands

Use Bun 1.3.14+ and Node.js 22.12+.

- `bun install --frozen-lockfile`: install dependencies and Lefthook hooks.
- `bun run dev`: start development server.
- `bun run build`: generate assets and SPA shell; requires a listening port.
- `bun run preview`: preview the build.
- `bun run check`: check formatting, lint, types, JSON schemas, and content.
- `bun run format`: apply VitePlus formatting.
- `bun run test`: run Vitest tests.
- `bun run cli --help`: inspect CLI operations.
- `bun run deploy:check`: build and validate deployment without publishing.

## Coding Style & Naming

Use strict TypeScript, two-space indentation, double quotes, and semicolons; VitePlus enforces formatting. Name React files `lower_snake_case.tsx` and components `PascalCase`. Prefer Japanese for user-facing text.

Use TanStack Form with field-level subscriptions; never mirror entire forms into parent state or Nano Stores. Do not hand-edit `src/route_tree.gen.ts` or `config/schemas/`; regenerate schemas with `bun run schema:generate`. Consult `.agents/skills/react-start/SKILL.md` for Start changes; vendored examples are excluded from application conventions.

## Testing Guidelines

Name tests `tests/*.test.ts`. Use Vitest, React Testing Library, jsdom, and fake-indexeddb. No numeric coverage threshold is configured; verify affected SPEC acceptance conditions, deterministic replay, and save integrity.

Run `bun run test:browser` against a running server; `GAME_URL` overrides its URL. Use `bun run test:public` for CLI playthroughs. Public playtests must use only player-visible information; record internal debugging separately.

## Workflow, Commits & Pull Requests

Read `docs/README.md`, relevant plans, and `docs/SPEC.md` first. Follow specification → CLI implementation/verification → UI; retain the full lifespan in reduced-scope prototypes. Update behavior and acceptance conditions in SPEC, rationale in `docs/decisions.md`, and unresolved questions in `docs/open-questions.md`. Link specifications; avoid duplication. Distinguish proposals, verified results, and real-world parenting claims.

History uses action-oriented subjects, e.g. `Adopt TanStack Start for the web game`; Conventional Commits are not established. PRs should explain behavior, reference SPEC/decision IDs and related issues, report checks/limitations, and include screenshots for visual changes. Lefthook formats staged files, then runs lint; warnings fail.

For illustrations, follow `docs/art-direction.md` and supply `assets/marketing/hero.png` as the generation reference. Planning requests authorize documentation only.
