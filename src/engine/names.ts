import type { Rng } from './rng.js';

// Invented, culture-mixed names. Fictional citizens only.
const FIRST = [
  'Ada', 'Bram', 'Cleo', 'Dara', 'Eli', 'Fen', 'Gus', 'Hana', 'Ivo', 'Juno', 'Kai', 'Lior', 'Mira', 'Nico', 'Odo', 'Pia',
  'Quin', 'Rhea', 'Sol', 'Tavi', 'Uma', 'Vex', 'Wren', 'Xan', 'Yara', 'Zed', 'Aiko', 'Bo', 'Cyra', 'Dax', 'Esme', 'Faro',
  'Gale', 'Hux', 'Ines', 'Jax', 'Kira', 'Lumi', 'Milo', 'Nova', 'Orla', 'Pax', 'Rafi', 'Sage', 'Tess', 'Ulf', 'Vera', 'Wim',
  'Yuki', 'Zara', 'Anya', 'Basil', 'Coco', 'Dmitri', 'Elio', 'Freya', 'Goran', 'Hugo', 'Isla', 'Jiro', 'Kofi', 'Lena',
];
const LAST = [
  'Ashdown', 'Brightwater', 'Coppervale', 'Duskmere', 'Emberfield', 'Flintmoor', 'Goldfinch', 'Hollowell', 'Ironwood',
  'Juniper', 'Kettleby', 'Larkspur', 'Millbrook', 'Northgate', 'Oakhart', 'Pennywhistle', 'Quarrystone', 'Ravensworth',
  'Saltmarsh', 'Thornbury', 'Underhill', 'Valecrest', 'Whitlock', 'Yarrow', 'Zephyr', 'Ambergast', 'Blackthorn', 'Cinder',
  'Dovetail', 'Fairweather', 'Gristmill', 'Harrow', 'Inkwell', 'Kestrel', 'Lockwood', 'Marlowe', 'Nettle', 'Orchard',
];

export function makeName(rng: Rng): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}
