// Every property type the interface knows is offered in the type picker under
// a translated name (#1117).
//
//   node scripts/check-proptypes.mjs
//
// The names were a list of plain strings, so nothing put them through t(),
// check-i18n could not see them, and a German interface said "Multi-select"
// and named a new property "Number". propertyTypes() writes each name as a
// literal t('…') call; this check fails on an entry written any other way,
// and on a type in PropType (types.ts) the picker leaves out.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '../src');
const types = readFileSync(join(src, 'types.ts'), 'utf8');
const picker = readFileSync(join(src, 'components/propertyTypes.tsx'), 'utf8');

const union = types.match(/export type PropType =([\s\S]*?);/);
if (!union) {
  console.error('  ✗ PropType not found in types.ts');
  process.exit(1);
}
// Strip comments first: a comment between the members may hold quotes.
const declared = [...union[1].replace(/\/\/.*$/gm, '').matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);

const body = picker.match(/export function propertyTypes\(\)[\s\S]*?\n}\n/);
if (!body) {
  console.error('  ✗ propertyTypes() not found in components/propertyTypes.tsx');
  process.exit(1);
}
const entries = [...body[0].matchAll(/\{\s*value:\s*'([a-zA-Z]+)',\s*label:\s*([^}]*?)\s*\}/g)].map((m) => ({ value: m[1], label: m[2] }));

let failed = 0;
for (const e of entries) {
  if (!/^t\('[^']+'\)$/.test(e.label)) {
    failed++;
    console.error(`  ✗ ${e.value}: its name is ${e.label}, not a literal t('…')`);
  }
}
const offered = new Set(entries.map((e) => e.value));
for (const v of declared) {
  if (!offered.has(v)) {
    failed++;
    console.error(`  ✗ ${v} is a PropType the type picker does not offer`);
  }
}
console.log(`  property types: ${entries.length} offered, ${declared.length} declared, ${failed} failed`);
if (failed) process.exit(1);
