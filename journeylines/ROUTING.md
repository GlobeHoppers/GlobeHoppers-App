Base: GlobeHoppers v5.0.3
Update: v5.0.4 suggestion close and vessel routing corrections
Changes:
- Override start location autocomplete now hides the suggestion popup after a selected start location is applied.
- Train routes are now more aggressively shortest-route biased.
- Train Natural Earth guidance is rejected if it strays too far from the direct route corridor.
- Train fallback route is closer to a direct rail-like route, preventing San Diego ↔ Cabo from detouring to mainland Mexico.
- Added long-distance ocean gateway routing for west North America ↔ Mediterranean boat trips such as San Diego ↔ Athens.
- Complex ocean boat routes now use Panama and Gibraltar-style gateways instead of drawing across continents.
