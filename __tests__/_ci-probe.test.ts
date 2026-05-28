// Deliberate failing test to verify CI red-signal attribution.
// Removed before this PR merges. See spec 02-ci-pipeline checklist Step 3.
test('ci-probe-app: deliberate failure to verify app-tests turns red', () => {
  expect(1).toBe(2);
});
