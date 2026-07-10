Base: GlobeHoppers v4.32
Update: v4.33 timeline insertion playback reconciliation
Changes:
- Playback now tracks active trip identity plus leg index, not only numeric activeIndex.
- When trips/locations change and the legs array rebuilds, playback reconciles to the same trip/leg in the new timeline.
- Next-leg advancement resolves from the current rebuilt legs array before advancing.
- Jump/play actions update playback identity explicitly.
- Trip expansion now skips invalid/missing locations or legs instead of crashing runtime.
