import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
function load(filename) { const module = { exports: {} }; new Function('exports', 'module', ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module.exports, module); return module.exports; }
const { matchesLocation } = load('supabase/functions/_shared/locationSearch.ts');
const { hasCoordinates, distanceInKm } = load('src/lib/nearbySearch.ts');
for (const query of ['Erbil', 'Arbil', 'أربيل', 'اربيل', 'هەولێر', 'Erbil, Kurdistan Region, Iraq']) assert.ok(matchesLocation({ city: 'اربيل', country: 'Iraq' }, query), query);
assert.ok(matchesLocation({ city: 'اربيل', country: 'Iraq' }, 'العراق'));
assert.ok(!matchesLocation({ city: 'اربيل', country: 'Iraq' }, 'Duhok'));
assert.ok(!matchesLocation({ city: null }, 'Erbil'));
assert.ok(hasCoordinates(0, 0));
for (const pair of [[null, null], [undefined, 44], [NaN, 44], [91, 44], [36, 181], ['', ''], [36, null]]) assert.ok(!hasCoordinates(...pair));
assert.equal(distanceInKm(36.289, 44.045, 36.289, 44.045), 0);
assert.ok(distanceInKm(36.289, 44.045, 36.289056, 44.045069) < 1);
assert.ok(distanceInKm(36.289, 44.045, 60.17, 24.94) > 50);
assert.ok(Number.isFinite(distanceInKm(0, 0, 0, 180)));
console.log('PASS: city aliases, display labels, missing coordinates, nearby/distant boundaries, and geographic distance');
