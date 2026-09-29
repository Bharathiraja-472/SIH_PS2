import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import {
  ShieldAlert, AlertTriangle, Info, Map as MapIcon, Layers,
  Search, Sliders, ArrowRight, CheckCircle2, XCircle, ChevronRight,
  TrendingUp, Activity, Bell, Navigation, Eye, Check,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { useSimulation } from '../context/SimulationContext.jsx';
import { generateAlerts, computeAlertSummary } from '../services/alertEngine.js';

const TIMES = ['T+0', 'T+30', 'T+60', 'T+90', 'T+120', 'T+150', 'T+180'];
const CELL_HALF = 0.0042;

// ── Severity Styling ─────────────────────────────────────────────
const SEVERITY = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'CRITICAL' },
  SEVERE:   { color: '#ea580c', bg: '#fff7ed', border: '#fdba74', label: 'SEVERE' },
  WARNING:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'WARNING' },
  INFO:     { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', label: 'INFO' },
};

function SeverityBadge({ severity }) {
  const s = SEVERITY[severity] ?? SEVERITY.INFO;
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-block',
    }}>
      {s.label}
    </span>
  );
}

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

export default function HazardAlertsPage({ onNavigate }) {
  const {
    hasSimulation, results, datasets,
    selectedForecastStep, setSelectedForecastStep,
  } = useSimulation();

  const step = selectedForecastStep ?? 0;

  // View Mode: 'SELECTED' (Selected Time) vs 'ALL' (All Forecast Timesteps)
  const [viewMode, setViewMode] = useState('SELECTED');

  // Filter & Search states
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery]       = useState('');
  const [selectedAlert, setSelectedAlert]   = useState(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState(new Set());
  const [mapLayers, setMapLayers] = useState({ flood: true, alerts: true, drainage: true, roads: true });

  // Map references
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);

  // Generate alerts dynamically from simulation results
  const stepFilter = viewMode === 'ALL' ? 'ALL' : step;
  const rawAlerts = useMemo(() => {
    if (!hasSimulation || !results) return [];
    return generateAlerts(results, datasets, stepFilter);
  }, [results, datasets, hasSimulation, stepFilter]);

  // Alert summary KPI counts
  const summary = useMemo(() => computeAlertSummary(rawAlerts), [rawAlerts]);

  // Filtered alert cards list
  const filteredAlerts = useMemo(() => {
    return rawAlerts.filter(a => {
      if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
      if (categoryFilter !== 'ALL' && a.category !== categoryFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchTitle = a.title.toLowerCase().includes(q);
        const matchLoc   = a.location.toLowerCase().includes(q);
        const matchCond  = (a.triggerCondition || '').toLowerCase().includes(q);
        if (!matchTitle && !matchLoc && !matchCond) return false;
      }
      return true;
    });
  }, [rawAlerts, severityFilter, categoryFilter, searchQuery]);

  // Alert evolution timeline chart data (T+0 to T+180)
  const timelineData = useMemo(() => {
    if (!hasSimulation || !results) return [];
    return TIMES.map((t, idx) => {
      const stepAlerts = generateAlerts(results, datasets, idx);
      return {
        time: t,
        Critical: stepAlerts.filter(a => a.severity === 'CRITICAL').length,
        Severe:   stepAlerts.filter(a => a.severity === 'SEVERE').length,
        Warning:  stepAlerts.filter(a => a.severity === 'WARNING').length,
      };
    });
  }, [results, datasets, hasSimulation]);

  // Top Hazard Locations Table
  const topHazardLocations = useMemo(() => {
    if (!rawAlerts.length) return [];
    const locMap = {};
    rawAlerts.forEach(a => {
      if (!locMap[a.location]) {
        locMap[a.location] = {
          location: a.location,
          category: a.category,
          maxDepth: a.depth_cm ?? (a.surcharge_lps ? 'Surcharge' : '-'),
          timestep: a.timestep,
          severity: a.severity,
          lat: a.lat,
          lng: a.lng,
        };
      }
    });
    return Object.values(locMap).slice(0, 7);
  }, [rawAlerts]);

  // Focus map on alert location
  const focusOnMap = useCallback((alertItem) => {
    setSelectedAlert(alertItem);
    const map = mapRef.current;
    if (map && alertItem.lat && alertItem.lng) {
      map.flyTo({ center: [alertItem.lng, alertItem.lat], zoom: 14.5, essential: true });
    }
  }, []);

  const toggleAcknowledge = (id) => {
    setAcknowledgedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      // Boundary
      if (datasets?.boundary) {
        map.addSource('boundary', { type: 'geojson', data: datasets.boundary });
        map.addLayer({ id: 'boundary-line', type: 'line', source: 'boundary', paint: { 'line-color': '#634B29', 'line-width': 2, 'line-dasharray': [4, 3] } });
      }

      // Flood Inundation Layer
      const floodStep = results?.floodResults?.[step] ?? [];
      map.addSource('flood', { type: 'geojson', data: makeFloodGeoJSON(floodStep) });
      map.addLayer({
        id: 'flood-fill',
        type: 'fill',
        source: 'flood',
        paint: { 'fill-color': ['coalesce', ['get', 'risk_color'], '#1d4ed8'], 'fill-opacity': 0.45 },
      });

      // Roads
      if (datasets?.roads) {
        map.addSource('roads', { type: 'geojson', data: datasets.roads });
        map.addLayer({ id: 'roads-line', type: 'line', source: 'roads', paint: { 'line-color': '#64748b', 'line-width': 1.5 } });
      }

      // Drainage Nodes
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
          paint: { 'circle-color': '#0ea5e9', 'circle-radius': 4, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 },
        });
      }

      // Alert Pin Markers GeoJSON Layer
      const alertGeoJSON = {
        type: 'FeatureCollection',
        features: rawAlerts.map(a => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
          properties: {
            id: a.id,
            title: a.title,
            severity: a.severity,
            color: SEVERITY[a.severity]?.color ?? '#ea580c',
          },
        })),
      };

      map.addSource('alerts', { type: 'geojson', data: alertGeoJSON });
      map.addLayer({
        id: 'alert-pins-glow',
        type: 'circle',
        source: 'alerts',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 11,
          'circle-opacity': 0.35,
        },
      });
      map.addLayer({
        id: 'alert-pins-circle',
        type: 'circle',
        source: 'alerts',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 6.5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      map.on('click', 'alert-pins-circle', e => {
        const props = e.features?.[0]?.properties;
        if (props) {
          const match = rawAlerts.find(a => a.id === props.id);
          if (match) setSelectedAlert(match);
        }
      });

      map.on('mouseenter', 'alert-pins-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'alert-pins-circle', () => { map.getCanvas().style.cursor = ''; });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Update map source data when step or rawAlerts change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const floodStep = results?.floodResults?.[step] ?? [];
    if (map.getSource('flood')) {
      map.getSource('flood').setData(makeFloodGeoJSON(floodStep));
    }

    const alertGeoJSON = {
      type: 'FeatureCollection',
      features: rawAlerts.map(a => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
        properties: {
          id: a.id,
          title: a.title,
          severity: a.severity,
          color: SEVERITY[a.severity]?.color ?? '#ea580c',
        },
      })),
    };

    if (map.getSource('alerts')) {
      map.getSource('alerts').setData(alertGeoJSON);
    }
  }, [step, results, rawAlerts]);

  // Map layer toggle handler
  const toggleMapLayer = useCallback((key, checked) => {
    setMapLayers(l => ({ ...l, [key]: checked }));
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = checked ? 'visible' : 'none';
    const MAP = { flood: ['flood-fill'], alerts: ['alert-pins-circle', 'alert-pins-glow'], drainage: ['nodes-circle'], roads: ['roads-line'] };
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
          <ShieldAlert size={36} color="#634B29" />
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1a140e', margin: 0 }}>
            No Flood Forecast Available
          </h2>
          <p style={{ fontSize: 14, color: '#786c5e', lineHeight: 1.5, margin: 0 }}>
            Run a flood nowcast scenario to detect hazard conditions, drainage surcharge locations, and road closure warnings.
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
            Hazard Alerts Command
          </h1>
          <p style={{ fontSize: 13, color: '#786c5e', margin: 0 }}>
            Monitor predicted flood hazards, drainage surcharge, and rapid water level changes across the forecast period.
          </p>
        </div>

        {/* Forecast View Mode + Timestep Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {/* View Mode Toggle */}
          <div style={{ background: '#faf7f2', border: '1px solid #d6cbc0', borderRadius: 8, padding: 3, display: 'flex', gap: 2 }}>
            <button
              onClick={() => setViewMode('SELECTED')}
              style={{
                background: viewMode === 'SELECTED' ? '#634B29' : 'transparent',
                color: viewMode === 'SELECTED' ? '#ffffff' : '#1a140e',
                border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}
            >
              Selected Time
            </button>
            <button
              onClick={() => setViewMode('ALL')}
              style={{
                background: viewMode === 'ALL' ? '#634B29' : 'transparent',
                color: viewMode === 'ALL' ? '#ffffff' : '#1a140e',
                border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}
            >
              All Forecast (0–3h)
            </button>
          </div>

          {/* Timestep Pills (When Selected Time mode active) */}
          {viewMode === 'SELECTED' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {TIMES.map((t, idx) => (
                <button
                  key={t}
                  onClick={() => setSelectedForecastStep(idx)}
                  style={{
                    background: step === idx ? '#634B29' : '#faf7f2',
                    color: step === idx ? '#ffffff' : '#1a140e',
                    border: step === idx ? '1px solid #634B29' : '1px solid #d6cbc0',
                    borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SUMMARY KPI CARDS (4 Compact Cards) ──────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        
        <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 12, padding: '16px 20px', borderLeft: '4px solid #dc2626' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', marginBottom: 4 }}>Critical Alerts</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#dc2626', lineHeight: 1 }}>{summary.critical}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 12, padding: '16px 20px', borderLeft: '4px solid #ea580c' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', marginBottom: 4 }}>Severe Alerts</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#ea580c', lineHeight: 1 }}>{summary.severe}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 12, padding: '16px 20px', borderLeft: '4px solid #d97706' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', marginBottom: 4 }}>Warnings</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#d97706', lineHeight: 1 }}>{summary.warning}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 12, padding: '16px 20px', borderLeft: '4px solid #634B29' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', marginBottom: 4 }}>Active Alerts ({viewMode === 'ALL' ? '0–3h' : TIMES[step]})</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#634B29', lineHeight: 1 }}>{summary.total}</div>
        </div>

      </div>

      {/* ── MAIN AREA: HERO MAP (~60%) + ACTIVE ALERTS LIST (~40%) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>

        {/* HERO MAP */}
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 560, position: 'relative',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%', flex: 1 }} />

          {/* Map Layer Controls */}
          <div style={{
            position: 'absolute', bottom: 12, right: 12, background: 'rgba(255,255,255,0.96)',
            border: '1px solid #ebe4da', borderRadius: 8, padding: '8px 12px', zIndex: 10,
            display: 'flex', gap: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            {[
              { k: 'flood', label: 'Flood Overlay' },
              { k: 'alerts', label: 'Alert Markers' },
              { k: 'drainage', label: 'Drainage' },
              { k: 'roads', label: 'Roads' },
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

          {/* Legend */}
          <div style={{
            position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.96)',
            border: '1px solid #ebe4da', borderRadius: 8, padding: '10px 14px', zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase' }}>Alert Severity</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} /> Critical
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c' }} /> Severe
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706' }} /> Warning
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb' }} /> Info
              </div>
            </div>
          </div>
        </div>

        {/* ACTIVE ALERTS LIST */}
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)', height: 560, overflowY: 'hidden',
        }}>
          
          {/* Header & Search */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1a140e', margin: 0 }}>
                Active Alerts List ({filteredAlerts.length})
              </h2>
            </div>

            {/* Search + Category Dropdown */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} color="#8c8275" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search alert, location..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%', padding: '6px 10px 6px 30px', borderRadius: 6,
                    border: '1px solid #d6cbc0', fontSize: 12, background: '#faf7f2', outline: 'none',
                  }}
                />
              </div>

              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{
                  padding: '6px 10px', borderRadius: 6, border: '1px solid #d6cbc0',
                  fontSize: 11, fontWeight: 700, background: '#faf7f2', color: '#1a140e', outline: 'none',
                }}
              >
                <option value="ALL">All Types</option>
                <option value="FLOOD_DEPTH">Flood Depth</option>
                <option value="DRAINAGE">Drainage Surcharge</option>
                <option value="ROAD_RISK">Road Flooding</option>
                <option value="RAPID_RISE">Rapid Rise</option>
              </select>
            </div>

            {/* Severity Filter Pills */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['ALL', 'CRITICAL', 'SEVERE', 'WARNING'].map(sev => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  style={{
                    background: severityFilter === sev ? '#634B29' : '#faf7f2',
                    color: severityFilter === sev ? '#ffffff' : '#1a140e',
                    border: severityFilter === sev ? '1px solid #634B29' : '1px solid #d6cbc0',
                    borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  }}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Cards Scroll Container */}
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
            {filteredAlerts.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#786c5e', fontSize: 13 }}>
                No active hazards matching selected filters.
              </div>
            ) : (
              filteredAlerts.map(alert => {
                const isAck = acknowledgedIds.has(alert.id);
                const isSel = selectedAlert?.id === alert.id;

                return (
                  <div
                    key={alert.id}
                    onClick={() => focusOnMap(alert)}
                    style={{
                      background: isSel ? '#dfd3bf' : '#faf7f2',
                      border: isSel ? '1.5px solid #634B29' : '1px solid #ebe4da',
                      borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
                      cursor: 'pointer', transition: 'all 0.15s', opacity: isAck ? 0.65 : 1,
                    }}
                  >
                    {/* Top Row: Severity + Timestep + ID */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <SeverityBadge severity={alert.severity} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#634B29', fontFamily: 'monospace' }}>
                          {alert.timestep}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: '#8c8275', fontFamily: 'monospace' }}>
                        {alert.id}
                      </span>
                    </div>

                    {/* Title */}
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#1a140e', lineHeight: 1.2 }}>
                      {alert.title}
                    </div>

                    {/* Location */}
                    <div style={{ fontSize: 12, color: '#786c5e' }}>
                      Location: <strong style={{ color: '#1a140e' }}>{alert.location}</strong>
                    </div>

                    {/* Condition details */}
                    <div style={{ fontSize: 12, color: '#3d332a', background: '#ffffff', padding: '8px 10px', borderRadius: 6, border: '1px solid #ebe4da' }}>
                      {alert.triggerCondition}
                    </div>

                    {/* Operator Attention */}
                    {alert.operatorAttention && (
                      <div style={{ fontSize: 11, color: '#634B29', fontStyle: 'italic' }}>
                        <strong>Operator Attention:</strong> {alert.operatorAttention}
                      </div>
                    )}

                    {/* Card Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <button
                        onClick={e => { e.stopPropagation(); focusOnMap(alert); }}
                        style={{
                          background: '#634B29', color: '#ffffff', border: 'none',
                          borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 800,
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Eye size={12} /> Focus on Map
                      </button>

                      <button
                        onClick={e => { e.stopPropagation(); toggleAcknowledge(alert.id); }}
                        style={{
                          background: isAck ? '#d6cbc0' : '#ffffff',
                          color: '#1a140e', border: '1px solid #d6cbc0',
                          borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {isAck ? <><Check size={12} /> Acknowledged</> : 'Acknowledge'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>

      </div>

      {/* ── ALERT TREND — 0–3 HOUR FORECAST CHART ────────────────── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
        padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1a140e', margin: 0 }}>
            Alert Trend — 0–3 Hour Forecast
          </h2>
          <p style={{ fontSize: 13, color: '#786c5e', margin: 0 }}>
            Evolution of predicted alert severity distribution across the forecast timeline.
          </p>
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={timelineData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ebe4da" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 12, fill: '#1a140e', fontWeight: 700 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#786c5e' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 800, color: '#1a140e', marginBottom: 4 }}>{label} Forecast</div>
                  {payload.map(p => (
                    <div key={p.name} style={{ color: p.color, fontWeight: 700 }}>
                      {p.name}: <strong>{p.value}</strong>
                    </div>
                  ))}
                </div>
              );
            }} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
            <Bar dataKey="Critical" fill="#dc2626" stackId="a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Severe" fill="#ea580c" stackId="a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Warning" fill="#d97706" stackId="a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── TOP HAZARD LOCATIONS TABLE ───────────────────────────── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
        padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1a140e', margin: 0 }}>
            Top Hazard Locations
          </h2>
          <p style={{ fontSize: 13, color: '#786c5e', margin: 0 }}>
            Primary asset sectors experiencing detected hazard alerts.
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ebe4da' }}>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Location / Asset</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Hazard Category</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Max Flood Depth / Load</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Forecast Time</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Severity</th>
              </tr>
            </thead>
            <tbody>
              {topHazardLocations.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f5f1eb' }}>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 800, color: '#1a140e' }}>
                    {row.location}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#786c5e' }}>
                    {row.category?.replace('_', ' ')}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 800, color: '#1a140e' }}>
                    {typeof row.maxDepth === 'number' ? `${row.maxDepth} cm` : row.maxDepth}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#634B29', fontWeight: 800, fontFamily: 'monospace' }}>
                    {row.timestep}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <SeverityBadge severity={row.severity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
