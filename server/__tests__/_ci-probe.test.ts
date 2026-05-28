// Deliberate failing test to verify CI red-signal attribution.
// Removed before this PR merges. See spec 02-ci-pipeline checklist Step 4.
test('ci-probe-server: deliberate failure to verify server-tests turns red', () => {
  expect(1).toBe(2);
});
