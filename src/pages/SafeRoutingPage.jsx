import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import {
  Navigation, Map as MapIcon, ArrowLeftRight, Layers,
  Search, AlertTriangle, ShieldCheck, CheckCircle2, Clock,
  Route as RoadIcon, ArrowRight, TrendingUp, Info, Activity,
  Sliders, RefreshCw, X, AlertCircle, CornerUpRight, MapPin,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext.jsx';
import { ROUTING_OBJECTIVES, PRESET_LOCATIONS } from '../config/routingConfig.js';
import { calculateFloodAwareRoutes } from '../services/routingEngine.js';

const TIMES = ['T+0', 'T+30', 'T+60', 'T+90', 'T+120', 'T+150', 'T+180'];
const CELL_HALF = 0.0042;

// ── Flood GeoJSON builder ─────────────────────────────────────────
function makeFloodGeoJSON(floodStep) {
  return {
    type: 'FeatureCollection',
    features: (floodStep ?? []).filter(c => c.depth_cm > 1).map(c => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [c.lon - CELL_HALF, c.lat - CELL_HALF],
          [c.lon + CELL_HALF, c.lat - CELL_HALF],
          [c.lon + CELL_HALF, c.lat + CELL_HALF],
          [c.lon - CELL_HALF, c.lat + CELL_HALF],
          [c.lon - CELL_HALF, c.lat - CELL_HALF],
        ]],
      },
      properties: { depth_cm: c.depth_cm, risk_key: c.risk_key, risk_color: c.risk_color },
    })),
  };
}

export default function SafeRoutingPage({ onNavigate }) {
  const {
    hasSimulation, results, datasets,
    selectedForecastStep, setSelectedForecastStep,
  } = useSimulation();

  const step = selectedForecastStep ?? 0;

  // Inputs state
  const [startLoc, setStartLoc]                       = useState(PRESET_LOCATIONS[0]); // T. Nagar
  const [destLoc, setDestLoc]                         = useState(PRESET_LOCATIONS[1]); // Perambur
  const [selectedObjective, setSelectedObjective]     = useState('FLOOD_SAFETY');
  const [isMapSelectMode, setIsMapSelectMode]         = useState(null); // 'start' | 'dest' | null

  // Map layer controls
  const [showSafeRoute, setShowSafeRoute]             = useState(true);
  const [showNormalRoute, setShowNormalRoute]         = useState(true);
  const [mapLayers, setMapLayers]                     = useState({ flood: true, roads: true, safeRoute: true, normalRoute: true });

  // Map reference
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);

  // Derive current step road risk results
  const currentRoadRisk = useMemo(() => {
    if (!hasSimulation || !results?.roadRiskResults) return [];
    const scale = (step + 1) / 7;
    return results.roadRiskResults.map(r => ({
      ...r,
      depth_cm: +(r.depth_cm * scale).toFixed(1),
      risk_key: r.depth_cm * scale > 50 ? 'CRITICAL' : r.depth_cm * scale > 30 ? 'SEVERE' : r.depth_cm * scale > 15 ? 'FLOODED' : r.depth_cm * scale > 5 ? 'WATCH' : 'SAFE',
    }));
  }, [results, hasSimulation, step]);

  // Calculate Routes using routingEngine
  const routeData = useMemo(() => {
    if (!datasets?.roads || !startLoc || !destLoc) {
      return { safeRoute: null, normalRoute: null };
    }
    return calculateFloodAwareRoutes(
      datasets.roads,
      currentRoadRisk,
      startLoc,
      destLoc,
      selectedObjective
    );
  }, [datasets, currentRoadRisk, startLoc, destLoc, selectedObjective]);

  const { safeRoute, normalRoute } = routeData;

  const handleSwap = () => {
    const temp = startLoc;
    setStartLoc(destLoc);
    setDestLoc(temp);
  };

  // ── MAPLIBRE INITIALIZATION ────────────────────────────────────
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
        layers: [{ id: 'osm-bg', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.90 } }],
      },
      center: [80.23, 13.04],
      zoom: 11.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    map.on('load', () => {
      // 1. Boundary Layer
      if (datasets?.boundary) {
        map.addSource('boundary', { type: 'geojson', data: datasets.boundary });
        map.addLayer({ id: 'boundary-line', type: 'line', source: 'boundary', paint: { 'line-color': '#634B29', 'line-width': 2, 'line-dasharray': [4, 3] } });
      }

      // 2. Flood Inundation Layer
      const floodStep = results?.floodResults?.[step] ?? [];
      map.addSource('flood', { type: 'geojson', data: makeFloodGeoJSON(floodStep) });
      map.addLayer({
        id: 'flood-fill',
        type: 'fill',
        source: 'flood',
        paint: { 'fill-color': ['coalesce', ['get', 'risk_color'], '#1d4ed8'], 'fill-opacity': 0.40 },
      });

      // 3. Road Network Layer with Risk Colors
      if (datasets?.roads) {
        map.addSource('roads', { type: 'geojson', data: datasets.roads });
        map.addLayer({
          id: 'roads-line',
          type: 'line',
          source: 'roads',
          paint: { 'line-color': '#94a3b8', 'line-width': 2.5, 'line-opacity': 0.6 },
        });
      }

      // 4. Start & Destination Pins Sources & Layers
      map.addSource('start-pin', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [startLoc.lng ?? startLoc.lon ?? 80.2341, startLoc.lat ?? 13.0418] },
            properties: { label: 'A' },
          }],
        },
      });

      map.addLayer({
        id: 'start-pin-circle',
        type: 'circle',
        source: 'start-pin',
        paint: { 'circle-color': '#16a34a', 'circle-radius': 9, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
      });

      map.addSource('dest-pin', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [destLoc.lng ?? destLoc.lon ?? 80.2458, destLoc.lat ?? 13.1092] },
            properties: { label: 'B' },
          }],
        },
      });

      map.addLayer({
        id: 'dest-pin-circle',
        type: 'circle',
        source: 'dest-pin',
        paint: { 'circle-color': '#dc2626', 'circle-radius': 9, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
      });
    });

    map.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      if (isMapSelectMode === 'start') {
        setStartLoc({ id: 'custom-start', name: `Point (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)`, lat, lng });
        setIsMapSelectMode(null);
      } else if (isMapSelectMode === 'dest') {
        setDestLoc({ id: 'custom-dest', name: `Point (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)`, lat, lng });
        setIsMapSelectMode(null);
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Update Map Layers & Route Lines when Step or Route changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // Update Flood Inundation Layer
    const floodStep = results?.floodResults?.[step] ?? [];
    if (map.getSource('flood')) {
      map.getSource('flood').setData(makeFloodGeoJSON(floodStep));
    }

    // Update Start & Destination Markers
    if (map.getSource('start-pin')) {
      map.getSource('start-pin').setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [startLoc.lng ?? startLoc.lon ?? 80.2341, startLoc.lat ?? 13.0418] },
        }],
      });
    }

    if (map.getSource('dest-pin')) {
      map.getSource('dest-pin').setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [destLoc.lng ?? destLoc.lon ?? 80.2458, destLoc.lat ?? 13.1092] },
        }],
      });
    }

    // Update Route Layers
    ['route-normal-line', 'route-safe-line'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });

    // Draw Normal Route (dashed red line)
    if (normalRoute?.geoJsonFeature && mapLayers.normalRoute) {
      map.addSource('route-normal-line', { type: 'geojson', data: normalRoute.geoJsonFeature });
      map.addLayer({
        id: 'route-normal-line',
        type: 'line',
        source: 'route-normal-line',
        paint: { 'line-color': '#dc2626', 'line-width': 4, 'line-dasharray': [3, 3], 'line-opacity': 0.8 },
      });
    }

    // Draw Flood-Safe Route (solid prominent green line)
    if (safeRoute?.geoJsonFeature && mapLayers.safeRoute) {
      map.addSource('route-safe-line', { type: 'geojson', data: safeRoute.geoJsonFeature });
      map.addLayer({
        id: 'route-safe-line',
        type: 'line',
        source: 'route-safe-line',
        paint: { 'line-color': '#10b981', 'line-width': 6.5, 'line-opacity': 0.95 },
      });
    }

    // Fit map bounds to encompass start, destination, and routes
    if (safeRoute?.geoJsonFeature?.geometry?.coordinates?.length) {
      const coords = safeRoute.geoJsonFeature.geometry.coordinates;
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }
  }, [step, results, safeRoute, normalRoute, startLoc, destLoc, mapLayers]);

  // Map layer toggle handler
  const toggleMapLayer = useCallback((key, checked) => {
    setMapLayers(l => ({ ...l, [key]: checked }));
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = checked ? 'visible' : 'none';
    const MAP = { flood: ['flood-fill'], roads: ['roads-line'], safeRoute: ['route-safe-line'], normalRoute: ['route-normal-line'] };
    (MAP[key] ?? []).forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis); });
  }, []);

  // ── NO SIMULATION STATE ────────────────────────────────────────
  if (!hasSimulation) {
    return (
      <div className="main-content" style={{ padding: '24px 32px', background: '#faf7f2' }}>
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          padding: '48px 32px', textAlign: 'center', maxWidth: 540, margin: '60px auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          <Navigation size={36} color="#634B29" />
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1a140e', margin: 0 }}>
            Flood-Safe Routing Requires Active Forecast
          </h2>
          <p style={{ fontSize: 14, color: '#786c5e', lineHeight: 1.5, margin: 0 }}>
            Run a flood nowcast scenario to calculate flood-risk weighted routes and avoid inundated road corridors.
          </p>
          <button
            onClick={() => onNavigate('/scenario')}
            style={{
              background: '#634B29', color: '#ffffff', border: 'none',
              borderRadius: 8, padding: '12px 24px', fontSize: 13,
              fontWeight: 800, cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', gap: 8, marginTop: 8,
            }}
          >
            <Sliders size={16} /> CREATE SCENARIO
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content" style={{ padding: '20px 28px', background: '#faf7f2', gap: 20, display: 'flex', flexDirection: 'column' }}>

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
        borderLeft: '6px solid #634B29', padding: '20px 28px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#1a140e', lineHeight: 1.1, marginBottom: 4, letterSpacing: '-0.01em' }}>
            Flood-Safe Routing
          </h1>
          <p style={{ fontSize: 13, color: '#786c5e', margin: 0 }}>
            Find a route that minimizes exposure to predicted urban flooding across the 0–3 hour forecast horizon.
          </p>
        </div>

        {/* Timestep Selector Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#634B29', marginRight: 4 }}>Forecast Time:</span>
          {TIMES.map((t, idx) => (
            <button
              key={t}
              onClick={() => setSelectedForecastStep(idx)}
              style={{
                background: step === idx ? '#634B29' : '#faf7f2',
                color: step === idx ? '#ffffff' : '#1a140e',
                border: step === idx ? '1px solid #634B29' : '1px solid #d6cbc0',
                borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 800,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── TOP SECTION: ROUTE PLANNER + ROUTE SUMMARY CARD ────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>

        {/* ROUTE PLANNER CARD */}
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#1a140e', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            ROUTE PLANNER
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            {/* Start Location */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} /> Start Location
              </label>
              <select
                value={startLoc.id}
                onChange={e => {
                  const found = PRESET_LOCATIONS.find(p => p.id === e.target.value);
                  if (found) setStartLoc(found);
                }}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d6cbc0',
                  fontSize: 13, fontWeight: 700, background: '#faf7f2', color: '#1a140e', outline: 'none',
                }}
              >
                {PRESET_LOCATIONS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="custom-start">{startLoc.name}</option>
              </select>
              <button
                onClick={() => setIsMapSelectMode(isMapSelectMode === 'start' ? null : 'start')}
                style={{
                  marginTop: 6, background: 'none', border: 'none', color: isMapSelectMode === 'start' ? '#16a34a' : '#786c5e',
                  fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <MapPin size={12} /> {isMapSelectMode === 'start' ? 'Click Map for Start...' : 'Select on Map'}
              </button>
            </div>

            {/* Swap Button */}
            <button
              onClick={handleSwap}
              style={{
                marginTop: 14, background: '#faf7f2', border: '1px solid #d6cbc0',
                borderRadius: '50%', width: 34, height: 34, display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#634B29',
              }}
            >
              <ArrowLeftRight size={14} />
            </button>

            {/* Destination */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} /> Destination
              </label>
              <select
                value={destLoc.id}
                onChange={e => {
                  const found = PRESET_LOCATIONS.find(p => p.id === e.target.value);
                  if (found) setDestLoc(found);
                }}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d6cbc0',
                  fontSize: 13, fontWeight: 700, background: '#faf7f2', color: '#1a140e', outline: 'none',
                }}
              >
                {PRESET_LOCATIONS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="custom-dest">{destLoc.name}</option>
              </select>
              <button
                onClick={() => setIsMapSelectMode(isMapSelectMode === 'dest' ? null : 'dest')}
                style={{
                  marginTop: 6, background: 'none', border: 'none', color: isMapSelectMode === 'dest' ? '#dc2626' : '#786c5e',
                  fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <MapPin size={12} /> {isMapSelectMode === 'dest' ? 'Click Map for Dest...' : 'Select on Map'}
              </button>
            </div>
          </div>

          {/* Routing Mode Radio Options */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Routing Mode
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { k: 'FLOOD_SAFETY', label: 'Flood-Safe', desc: 'Minimize flood exposure' },
                { k: 'BALANCED',     label: 'Balanced',   desc: 'Safety + Shortest' },
                { k: 'SHORTEST',     label: 'Shortest',   desc: 'Ignore flood penalty' },
              ].map(mode => (
                <label
                  key={mode.k}
                  style={{
                    background: selectedObjective === mode.k ? '#dfd3bf' : '#faf7f2',
                    border: selectedObjective === mode.k ? '1.5px solid #634B29' : '1px solid #d6cbc0',
                    borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex',
                    flexDirection: 'column', gap: 2, transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="routingMode"
                      checked={selectedObjective === mode.k}
                      onChange={() => setSelectedObjective(mode.k)}
                      style={{ accentColor: '#634B29' }}
                    />
                    <strong style={{ fontSize: 12, color: '#1a140e' }}>{mode.label}</strong>
                  </div>
                  <span style={{ fontSize: 10, color: '#786c5e', marginLeft: 20 }}>{mode.desc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => {
              // Trigger route recalculation
              setSelectedObjective(prev => prev);
            }}
            style={{
              background: '#634B29', color: '#ffffff', border: 'none',
              borderRadius: 8, padding: '12px 24px', fontSize: 13,
              fontWeight: 800, cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 2px 6px rgba(99,75,41,0.25)', marginTop: 4,
            }}
          >
            <Navigation size={16} /> Find Flood-Safe Route
          </button>
        </div>

        {/* RECOMMENDED ROUTE SUMMARY CARD */}
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase' }}>
                RECOMMENDED FLOOD-SAFE ROUTE
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '3px 8px', borderRadius: 6 }}>
                AVAILABLE
              </span>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1a140e', margin: 0 }}>
              {startLoc.name} → {destLoc.name}
            </h2>
          </div>

          {safeRoute ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8c8275', textTransform: 'uppercase' }}>Total Distance</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#1a140e' }}>{safeRoute.totalDistanceKm} km</div>
              </div>

              <div style={{ background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8c8275', textTransform: 'uppercase' }}>Est. Travel Time</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#1a140e' }}>{safeRoute.estimatedTimeMin} min</div>
              </div>

              <div style={{ background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8c8275', textTransform: 'uppercase' }}>Max Flood Depth</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: safeRoute.maxDepthCm > 30 ? '#dc2626' : '#16a34a' }}>
                  {safeRoute.maxDepthCm} cm
                </div>
              </div>

              <div style={{ background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8c8275', textTransform: 'uppercase' }}>Overall Route Risk</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: safeRoute.overallRisk === 'CRITICAL' || safeRoute.overallRisk === 'HIGH' ? '#dc2626' : '#16a34a' }}>
                  {safeRoute.overallRisk}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#786c5e', fontStyle: 'italic', padding: '16px 0' }}>
              No connected route is available for the selected locations at this forecast time.
            </div>
          )}

          <div style={{ fontSize: 11, color: '#786c5e', borderTop: '1px solid #ebe4da', paddingTop: 10 }}>
            Forecast timestep: <strong>{TIMES[step]}</strong> &nbsp;|&nbsp; Route avoids severely flooded roads.
          </div>
        </div>

      </div>

      {/* ── HERO MAP (DOMINANT CENTER VISUAL ~60% HEIGHT) ──────── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
        overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 540, position: 'relative',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        {/* Map Canvas */}
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%', flex: 1 }} />

        {/* Map Layer Controls */}
        <div style={{
          position: 'absolute', bottom: 12, right: 12, background: 'rgba(255,255,255,0.96)',
          border: '1px solid #ebe4da', borderRadius: 8, padding: '8px 12px', zIndex: 10,
          display: 'flex', gap: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {[
            { k: 'flood', label: 'Flood Overlay' },
            { k: 'safeRoute', label: 'Flood-Safe Route' },
            { k: 'normalRoute', label: 'Normal Route' },
            { k: 'roads', label: 'Road Network' },
          ].map(l => (
            <label key={l.k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#3d332a', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={mapLayers[l.k]}
                onChange={e => toggleMapLayer(l.k, e.target.checked)}
                style={{ accentColor: '#634B29' }}
              />
              {l.label}
            </label>
          ))}
        </div>

        {/* Map Legend */}
        <div style={{
          position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.96)',
          border: '1px solid #ebe4da', borderRadius: 8, padding: '10px 14px', zIndex: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase' }}>Route Legend</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <div style={{ width: 16, height: 4, background: '#10b981', borderRadius: 2 }} />
            <strong>Flood-Safe Route</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <div style={{ width: 16, height: 4, background: '#dc2626', borderRadius: 2, borderStyle: 'dashed' }} />
            <span>Normal Route</span>
          </div>
          <div style={{ borderBottom: '1px solid #ebe4da', margin: '2px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 }}>
            <span style={{ color: '#16a34a', fontWeight: 800 }}>🟢 A: Start</span>
            <span style={{ color: '#dc2626', fontWeight: 800 }}>🔴 B: Destination</span>
          </div>
        </div>
      </div>

      {/* ── ROUTE COMPARISON TABLE ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Flood-Safe vs Normal Route Comparison */}
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1a140e', margin: 0 }}>
              Route Comparison
            </h2>
            <p style={{ fontSize: 13, color: '#786c5e', margin: 0 }}>
              Flood-Safe Route vs Normal Direct Route at {TIMES[step]}.
            </p>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ebe4da' }}>
                <th style={{ padding: '8px 10px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Metric</th>
                <th style={{ padding: '8px 10px', fontSize: 12, fontWeight: 800, color: '#10b981' }}>Flood-Safe Route</th>
                <th style={{ padding: '8px 10px', fontSize: 12, fontWeight: 800, color: '#dc2626' }}>Normal Route</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f5f1eb' }}>
                <td style={{ padding: '10px', fontSize: 13, color: '#786c5e' }}>Distance</td>
                <td style={{ padding: '10px', fontSize: 13, fontWeight: 800, color: '#1a140e' }}>{safeRoute?.totalDistanceKm ?? '-'} km</td>
                <td style={{ padding: '10px', fontSize: 13, color: '#786c5e' }}>{normalRoute?.totalDistanceKm ?? '-'} km</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f5f1eb' }}>
                <td style={{ padding: '10px', fontSize: 13, color: '#786c5e' }}>Est. Travel Time</td>
                <td style={{ padding: '10px', fontSize: 13, fontWeight: 800, color: '#1a140e' }}>{safeRoute?.estimatedTimeMin ?? '-'} min</td>
                <td style={{ padding: '10px', fontSize: 13, color: '#786c5e' }}>{normalRoute?.estimatedTimeMin ?? '-'} min</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f5f1eb' }}>
                <td style={{ padding: '10px', fontSize: 13, color: '#786c5e' }}>Max Flood Depth</td>
                <td style={{ padding: '10px', fontSize: 13, fontWeight: 800, color: safeRoute?.maxDepthCm > 30 ? '#dc2626' : '#16a34a' }}>
                  {safeRoute?.maxDepthCm ?? 0} cm
                </td>
                <td style={{ padding: '10px', fontSize: 13, fontWeight: 800, color: normalRoute?.maxDepthCm > 30 ? '#dc2626' : '#16a34a' }}>
                  {normalRoute?.maxDepthCm ?? 0} cm
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f5f1eb' }}>
                <td style={{ padding: '10px', fontSize: 13, color: '#786c5e' }}>Overall Risk</td>
                <td style={{ padding: '10px', fontSize: 13, fontWeight: 800, color: safeRoute?.overallRisk === 'CRITICAL' ? '#dc2626' : '#16a34a' }}>
                  {safeRoute?.overallRisk ?? 'LOW'}
                </td>
                <td style={{ padding: '10px', fontSize: 13, fontWeight: 800, color: normalRoute?.overallRisk === 'CRITICAL' ? '#dc2626' : '#16a34a' }}>
                  {normalRoute?.overallRisk ?? 'HIGH'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Avoided High-Risk Road Segments */}
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1a140e', margin: 0 }}>
              Avoided High-Risk Segments
            </h2>
            <p style={{ fontSize: 13, color: '#786c5e', margin: 0 }}>
              Road corridors excluded by Flood-Safe routing due to inundation.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ebe4da' }}>
                  <th style={{ padding: '8px 10px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Road Segment</th>
                  <th style={{ padding: '8px 10px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Flood Depth</th>
                  <th style={{ padding: '8px 10px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Risk Status</th>
                </tr>
              </thead>
              <tbody>
                {(safeRoute?.avoidedRoads ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: '16px 10px', fontSize: 13, color: '#786c5e', fontStyle: 'italic' }}>
                      No major road segments required bypass at {TIMES[step]}.
                    </td>
                  </tr>
                ) : (
                  (safeRoute?.avoidedRoads ?? []).map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f5f1eb' }}>
                      <td style={{ padding: '10px', fontSize: 13, fontWeight: 800, color: '#1a140e' }}>{r.name}</td>
                      <td style={{ padding: '10px', fontSize: 13, color: '#dc2626', fontWeight: 800 }}>{r.depthCm} cm</td>
                      <td style={{ padding: '10px', fontSize: 12, fontWeight: 800, color: '#dc2626' }}>{r.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
