import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

// ============================================================
//  FloodMap — MapLibre GL preview for the Home page
// ============================================================
export default function FloodMap({ datasets, floodResults }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm-tiles' }],
      },
      center: [80.255, 13.027],
      zoom: 11,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    map.on('load', () => {
      // Boundary
      if (datasets?.boundary) {
        map.addSource('boundary', { type: 'geojson', data: datasets.boundary });
        map.addLayer({
          id: 'boundary-fill',
          type: 'fill',
          source: 'boundary',
          paint: { 'fill-color': '#1d4ed8', 'fill-opacity': 0.06 },
        });
        map.addLayer({
          id: 'boundary-line',
          type: 'line',
          source: 'boundary',
          paint: { 'line-color': '#1d4ed8', 'line-width': 2, 'line-dasharray': [4, 3] },
        });
      }

      // Roads
      if (datasets?.roads) {
        map.addSource('roads', { type: 'geojson', data: datasets.roads });
        map.addLayer({
          id: 'roads-line',
          type: 'line',
          source: 'roads',
          paint: { 'line-color': '#64748b', 'line-width': 1.5 },
        });
      }

      // Drainage nodes
      if (datasets?.drainageNodes) {
        const nodeGeoJSON = {
          type: 'FeatureCollection',
          features: datasets.drainageNodes.map(n => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [n.longitude, n.latitude] },
            properties: { node_id: n.node_id },
          })),
        };
        map.addSource('nodes', { type: 'geojson', data: nodeGeoJSON });
        map.addLayer({
          id: 'nodes-circle',
          type: 'circle',
          source: 'nodes',
          paint: {
            'circle-color': '#0ea5e9',
            'circle-radius': 4,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          },
        });
      }

      // Buildings
      if (datasets?.buildings) {
        map.addSource('buildings', { type: 'geojson', data: datasets.buildings });
        map.addLayer({
          id: 'buildings-fill',
          type: 'fill',
          source: 'buildings',
          paint: { 'fill-color': '#94a3b8', 'fill-opacity': 0.3 },
        });
      }

      // Flood overlay (last timestep)
      if (floodResults?.length) {
        const lastStep = floodResults[floodResults.length - 2] ?? floodResults[0];
        const floodGeoJSON = {
          type: 'FeatureCollection',
          features: lastStep
            .filter(c => c.depth_cm > 5)
            .map(c => ({
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [[
                  [c.lon - 0.004, c.lat - 0.004],
                  [c.lon + 0.004, c.lat - 0.004],
                  [c.lon + 0.004, c.lat + 0.004],
                  [c.lon - 0.004, c.lat + 0.004],
                  [c.lon - 0.004, c.lat - 0.004],
                ]],
              },
              properties: { depth: c.depth_cm, risk: c.risk_key, color: c.risk_color },
            })),
        };
        map.addSource('flood', { type: 'geojson', data: floodGeoJSON });
        map.addLayer({
          id: 'flood-fill',
          type: 'fill',
          source: 'flood',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.45,
          },
        }, 'roads-line');
      }
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []); // only mount once

  // Update flood layer if results change after mount
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !floodResults?.length) return;
    if (!map.isStyleLoaded()) return;

    const lastStep = floodResults[floodResults.length - 2] ?? floodResults[0];
    const floodGeoJSON = {
      type: 'FeatureCollection',
      features: lastStep
        .filter(c => c.depth_cm > 5)
        .map(c => ({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [c.lon - 0.004, c.lat - 0.004],
              [c.lon + 0.004, c.lat - 0.004],
              [c.lon + 0.004, c.lat + 0.004],
              [c.lon - 0.004, c.lat + 0.004],
              [c.lon - 0.004, c.lat - 0.004],
            ]],
          },
          properties: { depth: c.depth_cm, risk: c.risk_key, color: c.risk_color },
        })),
    };

    if (map.getSource('flood')) {
      map.getSource('flood').setData(floodGeoJSON);
    } else {
      map.addSource('flood', { type: 'geojson', data: floodGeoJSON });
      map.addLayer({
        id: 'flood-fill',
        type: 'fill',
        source: 'flood',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.45,
        },
      });
    }
  }, [floodResults]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 520, flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 520, flex: 1 }} />

      {/* Legend */}
      <div className="map-legend">
        <div style={{ fontWeight: 700, fontSize: 10, marginBottom: 5, color: '#334155' }}>MAP LEGEND</div>
        <div className="map-legend-item">
          <div className="legend-color" style={{ background: '#1d4ed8', height: 2, border: '1px dashed #1d4ed8' }} />
          <span>Study Area</span>
        </div>
        <div className="map-legend-item">
          <div className="legend-color" style={{ background: '#64748b' }} />
          <span>Road Network</span>
        </div>
        <div className="map-legend-item">
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0ea5e9', flexShrink: 0 }} />
          <span>Drainage Nodes</span>
        </div>
        {floodResults?.length > 0 && (
          <div className="map-legend-item">
            <div className="legend-color" style={{ background: '#dc2626', opacity: 0.6 }} />
            <span>Flood Depth</span>
          </div>
        )}
      </div>

      {/* Compass */}
      <div className="map-compass">N</div>
    </div>
  );
}
