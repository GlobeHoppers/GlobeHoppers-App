# GlobeHoppers v3.25

Follow-camera and arrival ripple polish:
- Follow mode is restored as the default playback camera mode
- Playing from globe/global mode returns to follow mode
- Globe button sends a second overview command 12ms later to match the desired second-click behavior on the first click
- Arrival pulse is layered below placards and vehicle
- Arrival pulse is now an oval/ripple on the globe surface instead of a perfect circle
- Active arrival pulse is hidden immediately when switching to globe overview
- package intentionally omits src/data/trips.json and package-lock.json
