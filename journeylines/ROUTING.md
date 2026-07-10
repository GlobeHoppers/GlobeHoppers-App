Base: GlobeHoppers v4.33
Update: v4.34 play saved hop and route-save hardening
Changes:
- After Add/Edit Hop local validation succeeds, the saved hop becomes the active hop and starts playing as soon as the rebuilt timeline contains it.
- Pending saved-hop playback is identity-based so out-of-order inserts resolve against the rebuilt legs array instead of stale indices.
- Route form handlers now use functional draft updates to avoid stale-state overwrites between destination and additional-leg fields.
- Save validation now blocks adjacent duplicate route points and route references to missing locations before writing trips/locations/routeDetails.
- Multi-file GitHub trip saves no longer silently fall back to sequential Contents API writes, which reduces the chance of partial repo updates.
