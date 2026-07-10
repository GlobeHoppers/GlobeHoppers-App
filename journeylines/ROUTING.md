Base: GlobeHoppers v4.35
Update: v4.35.1 delete confirmation click fix
Changes:
- Delete confirmation backdrop now opts back into pointer events inside the pointer-disabled studio shell.
- Confirmation popup/buttons are layered above the Add/Edit modal and receive clicks reliably.
- Added pointer event propagation guards on the confirmation popup and buttons.
