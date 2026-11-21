/** v9 single-user production candidate runtime selection.
 * All three subsystems default on together; no additional clock or storage.
 * ?v9Legacy=1 (or ?v9=0) restores the v7.5.15-compatible viewer and engine.
 * Per-subsystem URL flags are retained for controlled regression tests.
 */
export function isV9FeatureEnabled(search = '', name = '') {
  const params = new URLSearchParams(search);
  if (params.get('v9Legacy') === '1' || params.get('v9') === '0') return false;
  const override = params.get(name);
  return override == null ? true : override === '1';
}
