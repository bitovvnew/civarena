# Contributing to CivArena

Thanks for helping build the arena. Bug reports, scenarios, model adapters, dashboard views and balance tweaks are all welcome.

## Setup

```bash
git clone https://github.com/bitovvnew/civarena.git
cd civarena
npm install
npm test
npm start
```

Node 20 or newer. `npm run dev` gives a hot-reloading dashboard that proxies `/api` to a `civarena` running on port 4321.

## Ground rules for the engine

1. **All state changes go through events.** The engine decides, `src/engine/world.ts` applies. If you add a mechanic, add an event type and handle it in `apply()`. The event-sourcing test will tell you if something slipped through.
2. **Money is conserved.** Only `mint`, `burn`, loan repayments and trades with the foreign merchant may change the money supply. The conservation test checks this.
3. **Deterministic.** Use the engine's `Rng`, never `Math.random()`, inside the simulation.
4. **Fair start.** Teams must start identical. Nothing may depend on team order except colors.
5. **Balance changes need evidence.** Paste the leaderboard and death/bankruptcy counts from `civarena run --seed 42 --ticks 500` before and after.

## Adding a model provider

Add a class in `src/brains/llm.ts` that extends `LlmBrain` and implements `complete(system, user)`, then register a prefix in `brainFromSpec` (`src/brains/index.ts`). Use plain `fetch`; CivArena has no runtime dependencies.

## Adding a scenario

Built-ins live in `src/scenarios/index.ts`. User scenarios are `.mjs` files in `./scenarios/` (see `scenarios/tax-cut.mjs`). Good scenarios ask a question: *what happens to a cartel-heavy economy when antitrust arrives at day 200?*

## Dashboard

React + hand-written SVG/canvas charts in `web/src`. Colors come from CSS tokens in `styles.css`; team colors use a fixed, color-blind-checked order. New UI strings need a key in every language in `web/src/i18n.ts` (English fallback is automatic, but please try).

## Pull requests

- Keep them focused. One mechanic or one view per PR.
- `npm test` and `npm run typecheck` must pass.
- Regenerate screenshots with `npm run screenshots` if the UI changed. Images must come from the offline demo world only.
