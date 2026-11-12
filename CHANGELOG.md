# Changelog

## 0.1.0 (2026-11-12)

First public release.

### Engine
- Event-sourced world: every change is an event, the world is a pure reduction of its log (verified in tests).
- Five goods (food, wood, ore, tools, luxury), five jobs with production chains, tools that wear out, food that spoils.
- Uniform-price call auctions per good, price discovery from supply and demand.
- Foreign merchant with import ceiling, export floor, its own wallet and a floating exchange rate.
- Government: income tax, wealth tax, welfare, universal basic income, antitrust, public spending.
- Central bank and credit money: loans mint money, repayments burn it, defaults cause bankruptcies and bank losses.
- Cartels that form from team strategy, set price floors, get betrayed or broken up by regulators.
- Hunger, health, deaths, births, inheritance.
- Six shocks: drought, mine collapse, tech boom, plague, gold rush, trade embargo.
- Deterministic seeds; replays as `.civ.json(.gz)`.

### Brains
- Adapters for OpenAI, Anthropic, Gemini, Ollama and any OpenAI-compatible server (plain fetch, no SDKs).
- Five offline personalities so the demo runs with zero API keys.
- Team leaderboard: wealth share, GDP share, survival, equality.

### Dashboard
- Live world map, KPI tiles, leaderboard with team strategies, dramatic event feed, economy charts, wealth share, prices, trade network.
- Controls for taxes, rates, UBI, welfare, antitrust, printing money and shocks.
- Timeline scrubbing, replay player, drag-and-drop replays, static demo build for GitHub Pages.
- English, Russian, Spanish, German, Chinese and Japanese; light and dark themes; mobile layout.

### CLI
- `civarena`, `civarena run`, `civarena replay`, `civarena scenarios`; scenario plugins from `./scenarios`.
