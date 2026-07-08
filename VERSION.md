# GlobeHoppers v3.41 — Black Screen Runtime Fix

Built from the v3.40 stable patch but fixes the runtime black-screen regression caused by the hop-modal pause listener referencing `legs` before it was initialized during render. Keeps the requested post-v3.38 updates: glass menus, active Edit Timeline highlighting, mixed name colors/corner accents, looser date wrapping, guest color picker positioning, and playback pausing only for Add/Edit Hop modals.
