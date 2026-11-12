// Example scenario plugin. Any .mjs/.js file in ./scenarios is picked up automatically.
//   civarena --scenario tax-cut
//
// A Scenario has: id, name, description, optional `setup` (starting rules)
// and optional `onTick(api)` which can queue the same commands the dashboard sends.

/** @type {import('../dist/engine/plugins.js').Scenario} */
export default {
  id: 'tax-cut',
  name: 'Election-year tax cut',
  description: 'Taxes start at 25%. At tick 150 a new government slashes them to 5% and ends welfare.',
  setup: { gov: { taxRate: 0.25, welfare: true } },
  onTick(api) {
    if (api.tick === 150) {
      api.command({ type: 'tax', rate: 0.05 });
      api.command({ type: 'welfare', on: false });
      api.headline('A new government wins on a promise: lower taxes, no handouts.', 2);
    }
  },
};
