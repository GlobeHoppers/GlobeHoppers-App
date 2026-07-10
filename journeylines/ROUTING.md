Base: GlobeHoppers v4.36
Update: v4.36.1 persistent queued save batch status and trip IDs
Changes:
- Repository save queue moved to module scope so the 3-second timer survives Studio/menu/modal lifecycle changes.
- Pending repository save status now shows the full batch/list of pending add/edit/delete operations.
- Queue status and commit messages include trip IDs.
- Expanded GlobeHopper Timeline cards show the trip ID in small gray text at bottom right.
- Add/Edit Hop modal shows the trip ID in small gray text under the title.
