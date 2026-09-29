import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useSimulation } from '../context/SimulationContext.jsx';


// Dynamic Water Flow along Street Paths (Vibrant blue water lines along road network)
function generateFloodedRoadsGeoJSON(baseRoads) {
  if (!baseRoads?.features) return { type: 'FeatureCollection', features: [] };

  const features = baseRoads.features.map((feat, idx) => {
    // Water blue color for flooded streets and rivers across Chennai
    const color = (idx % 3 === 0) ? '#1d4ed8' : (idx % 2 === 0) ? '#2563eb' : '#0284c7'; 
    const width = (idx % 3 === 0) ? 5.5 : 4.5;

    return {
      ...feat,
      properties: {
        ...(feat.properties ?? {}),
        color,
        width,
        isWater: true,
        name: feat.properties?.name ?? `Street Path ${idx + 1}`,
      },
    };
  });

  return { type: 'FeatureCollection', features };
}

export default function FloodMapPage() {
  const { datasets } = useSimulation();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // ── MAPLIBRE INITIALIZATION ──────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm-bg', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.92 } }],
      },
      center: [80.22, 13.04],
      zoom: 11.8,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    map.on('load', () => {
      // ── Chennai Boundary Layer ──
      if (datasets?.boundary) {
        map.addSource('boundary', { type: 'geojson', data: datasets.boundary });
        map.addLayer({
          id: 'boundary-line',
          type: 'line',
          source: 'boundary',
          paint: { 'line-color': '#634B29', 'line-width': 2, 'line-dasharray': [4, 3] },
        });
      }

      // ── Water Flow Along Street Paths Layer ──
      const initialRoadGJ = generateFloodedRoadsGeoJSON(datasets?.roads);
      map.addSource('flooded-roads', { type: 'geojson', data: initialRoadGJ });

      // Outer water glow casing for flooded streets
      map.addLayer({
        id: 'flooded-roads-glow',
        type: 'line',
        source: 'flooded-roads',
        paint: {
          'line-color': '#93c5fd',
          'line-width': ['+', ['get', 'width'], 3],
          'line-opacity': 0.6,
        },
      });

      // Main street water line
      map.addLayer({
        id: 'flooded-roads-line',
        type: 'line',
        source: 'flooded-roads',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': 0.95,
        },
      });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [datasets]);

  return (
    <div className="main-content" style={{ padding: 0, height: 'calc(100vh - 54px)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* MAP CANVAS (Full 100% Viewport - Only Map with Flooded Paths) */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', flex: 1 }} />
    </div>
  );
}

