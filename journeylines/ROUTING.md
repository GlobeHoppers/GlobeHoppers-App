# Routing Notes

GlobeHoppers keeps Mapbox driving route generation private in GitHub Actions and uses generated route cache data in the browser. Studio route editing now shows the dynamic default start/home-base location for the selected trip date, with optional override and additional legs for chain trips.


## v3.4 Studio workflow notes

The Studio editor now preserves scroll position across commits, supports right-click editing from the Trips drawer, and keeps trip previews ordered as Start Location, Leg 1, additional legs, and End Location.

## v3.5 notes

- Chained trips with Round trip enabled return to the original start location after the final additional leg.
- The Studio preview now shows Start, Leg 1, Additional legs, and End Location in the correct order.


## v3.6 Return-home mode

Round trips now support an explicit `returnMode` field. For simple round trips, the return method defaults to Leg 1. For chained trips, the final return-home leg uses `returnMode` instead of blindly copying the previous leg. This allows routes such as plane → train → plane home.
