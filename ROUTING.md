Base: GlobeHoppers v4.36.1
Update: v4.36.2 save lock conflict hardening and row ID rollback
Changes:
- Removed trip IDs from expanded GlobeHopper Timeline rows to restore prior row layout.
- Trip ID remains visible in Add/Edit Hop details.
- Added a client-side repository save lock using localStorage/sessionStorage so rapid saves do not race each other across Studio lifecycle changes or tabs.
- Added a short post-save cooldown before releasing the lock so GitHub refs have time to settle.
- Increased non-fast-forward retry attempts and backoff for GitHub 422/409 reference conflicts.
