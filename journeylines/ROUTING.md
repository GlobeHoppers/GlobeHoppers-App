Base: GlobeHoppers v4.34
Update: v4.35 delete/save sync hardening
Changes:
- Delete/save paths now use latest trips and locations refs, preventing stale-state re-adds when deleting multiple hops quickly.
- Repository background save can auto-repair missing city-generated locations such as perth-08, quebec-10, or calgary-01 from the city database before committing.
- If a missing location cannot be repaired, save still fails loudly with a popup.
- Local locations are updated when auto-repair succeeds so the app and repo stay in sync.
