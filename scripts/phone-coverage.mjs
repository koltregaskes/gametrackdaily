import assert from 'node:assert/strict';
export function assertPhoneCoverage(results,routes){assert.ok(routes.length,'No launch routes');for(const route of routes)for(const width of [320,390,1280])assert.equal(results.filter(r=>r.route===route&&r.width===width).length,1,route+' missing or duplicate '+width+'px acceptance');}
