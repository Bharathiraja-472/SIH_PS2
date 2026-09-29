CHENNAI URBAN FLOOD NOWCASTING - SAMPLE PROTOTYPE DATA PACK
Problem Statement: SIH 26085

IMPORTANT:
All datasets in this pack are SYNTHETIC / SIMULATED and are intended only
for a software prototype/demo. They are NOT official Chennai municipal,
IMD, GCC, drainage, elevation, or flood observations.

Pilot area:
Approximate Chennai-area bounding box:
Longitude 80.15 to 80.35
Latitude 12.95 to 13.15

Files:
1. chennai_pilot_boundary.geojson  - prototype study boundary
2. dem_grid.csv                    - synthetic elevation grid
3. rainfall_nowcast.csv            - synthetic 0-3 hour rainfall input
4. roads.geojson                   - synthetic road network
5. buildings.geojson               - synthetic building footprints
6. landcover.csv                   - synthetic land-cover/runoff coefficients
7. drainage_nodes.csv              - synthetic manholes/nodes
8. drainage_pipes.csv              - synthetic drainage pipes
9. sample_flood_predictions.csv    - sample dashboard output

Suggested pipeline:
rainfall -> runoff -> drainage capacity -> surcharge/excess water
-> flood depth -> road risk -> route avoidance.

Use real Chennai datasets later if the prototype is extended beyond demonstration.
