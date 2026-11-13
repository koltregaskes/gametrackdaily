import assert from 'node:assert/strict';
// A quiet UI fallback must not hide a failed same-origin data request in launch CI.
export function assertFetchedData(records, base) {
  const prefix = new URL('data/', base).href;
  const failures = records.filter(r => r.url.startsWith(prefix) && (r.failed || r.status >= 400));
  assert.deepEqual(failures, [], 'Required public data failed to load');
}
