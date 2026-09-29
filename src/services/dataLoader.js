import Papa from 'papaparse';

// ============================================================
//  Data Loader — loads all 10 datasets from /public/data/
//  Includes coastline filtering (lon <= 80.265) so no grid lines
//  or nodes ever extend into the Bay of Bengal sea.
// ============================================================

const COASTLINE_MAX_LON = 80.265;

async function fetchCSV(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const text = await res.text();
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (r) => resolve(r.data),
      error: reject,
    });
  });
}

async function fetchGeoJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

export async function loadAllDatasets() {
  const t0 = performance.now();

  const [
    boundary,
    rawRoads,
    rawBuildings,
    rainfall,
    rawDemGrid,
    rawDrainageNodes,
    rawDrainagePipes,
    landcover,
    floodPredictions,
  ] = await Promise.all([
    fetchGeoJSON('/data/chennai_pilot_boundary.geojson'),
    fetchGeoJSON('/data/roads.geojson'),
    fetchGeoJSON('/data/buildings.geojson'),
    fetchCSV('/data/rainfall_nowcast.csv'),
    fetchCSV('/data/dem_grid.csv'),
    fetchCSV('/data/drainage_nodes.csv'),
    fetchCSV('/data/drainage_pipes.csv'),
    fetchCSV('/data/landcover.csv'),
    fetchCSV('/data/sample_flood_predictions.csv'),
  ]);

  // ── COASTLINE CUTOFF (Chennai coastline is at longitude ~80.265°E) ──

  // 1. Filter DEM Grid (land only)
  const demGrid = rawDemGrid.filter(c => (c.longitude ?? c.lon) <= COASTLINE_MAX_LON);

  // 2. Filter Drainage Nodes (land only)
  const drainageNodes = rawDrainageNodes.filter(n => (n.longitude ?? n.lon) <= COASTLINE_MAX_LON);
  const validNodeIds = new Set(drainageNodes.map(n => n.node_id));

  // 3. Filter Drainage Pipes (only connecting land nodes)
  const drainagePipes = rawDrainagePipes.filter(p => validNodeIds.has(p.from_node) && validNodeIds.has(p.to_node));

  // 4. Filter Roads (only segments on land)
  const roads = {
    ...rawRoads,
    features: (rawRoads?.features ?? []).filter(feat => {
      const coords = feat.geometry?.coordinates ?? [];
      return coords.every(pt => pt[0] <= COASTLINE_MAX_LON);
    }),
  };

  // 5. Filter Buildings (only on land)
  const buildings = {
    ...rawBuildings,
    features: (rawBuildings?.features ?? []).filter(feat => {
      const coords = feat.geometry?.coordinates?.[0] ?? [];
      return coords.every(pt => pt[0] <= COASTLINE_MAX_LON);
    }),
  };

  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

  return {
    boundary,
    roads,
    buildings,
    rainfall,
    demGrid,
    drainageNodes,
    drainagePipes,
    landcover,
    floodPredictions,
    meta: {
      loadedAt: new Date().toISOString(),
      elapsedSeconds: elapsed,
      counts: {
        rainfallSteps:   rainfall.length,
        demCells:        demGrid.length,
        drainageNodes:   drainageNodes.length,
        drainagePipes:   drainagePipes.length,
        landcoverCells:  landcover.length,
        roads:           roads.features?.length ?? 0,
        buildings:       buildings.features?.length ?? 0,
        floodSamples:    floodPredictions.length,
      },
    },
  };
}
