import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import {
  Network, Map as MapIcon, Activity, AlertTriangle,
  Search, ChevronUp, ChevronDown, Droplets, Info,
  Sliders, ArrowRight, CheckCircle2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { useSimulation } from '../context/SimulationContext.jsx';

const TIMES = ['T+0', 'T+30', 'T+60', 'T+90', 'T+120', 'T+150', 'T+180'];
const CELL_HALF = 0.0042;

// ── Node Status styling ─────────────────────────────────────────
const STATUS = {
  NORMAL:        { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Normal (<60%)' },
  NEAR_CAPACITY: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Near Capacity (60–85%)' },
  HIGH:          { color: '#ea580c', bg: '#fff7ed', border: '#fdba74', label: 'High (85–100%)' },
  OVERLOADED:    { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Overloaded (>100%)' },
};

function statusOf(pct) {
  if (pct >= 100) return 'OVERLOADED';
  if (pct >= 85)  return 'HIGH';
  if (pct >= 60)  return 'NEAR_CAPACITY';
  return 'NORMAL';
}

function StatusBadge({ st }) {
  const s = STATUS[st] ?? STATUS.NORMAL;
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 6,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-block',
    }}>
      {st?.replace('_', ' ')}
    </span>
  );
}

// ── Manning capacity formula ─────────────────────────────────────
function calcPipeCapacity(pipe) {
  const d = (pipe.diameter_mm || 600) / 1000;
  const A = Math.PI * (d / 2) ** 2;
  const R = d / 4;
  const Q = (1 / (pipe.manning_n || 0.013)) * A * Math.pow(R, 2 / 3) * Math.sqrt(pipe.slope || 0.002);
  return +(Q * 1000).toFixed(1); // L/s
}

// ── GeoJSON builders ─────────────────────────────────────────────
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

function makeNodeGeoJSON(drainageNodes, drainageResults, step) {
  const landNodes = (drainageNodes ?? []).filter(n => (n.longitude ?? n.lon) <= 80.265);
  return {
    type: 'FeatureCollection',
    features: landNodes.map((n, i) => {
      const d = drainageResults?.[i]?.[step] ?? {};
      const st = d.status ?? 'NORMAL';
      const color = STATUS[st]?.color ?? '#16a34a';
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [n.longitude, n.latitude] },
        properties: {
          node_id:       n.node_id,
          node_type:     n.node_type ?? 'Junction',
          util_pct:      d.util_pct ?? 0,
          overloaded:    d.overloaded ?? false,
          status:        st,
          nodeColor:     color,
          load_lps:      d.load_lps ?? 0,
          capacity_lps:  d.capacity_lps ?? n.capacity_lps ?? 300,
          surcharge_lps: d.surcharge_lps ?? 0,
          lat: n.latitude,
          lon: n.longitude,
        },
      };
    }),
  };
}

function makePipeGeoJSON(drainagePipes, drainageNodes, drainageResults, step) {
  const landNodes = (drainageNodes ?? []).filter(n => (n.longitude ?? n.lon) <= 80.265);
  const nodeMap = {};
  landNodes.forEach((n, i) => { nodeMap[n.node_id] = { n, i }; });

  return {
    type: 'FeatureCollection',
    features: (drainagePipes ?? []).map(pipe => {
      const from = nodeMap[pipe.from_node];
      const to   = nodeMap[pipe.to_node];
      if (!from || !to) return null;

      const capLps   = calcPipeCapacity(pipe);
      const fromLoad = drainageResults?.[from.i]?.[step]?.load_lps ?? 0;
      const pipeLoad = +(fromLoad * 0.7).toFixed(1);
      const utilPct  = +Math.min(200, (pipeLoad / (capLps || 1)) * 100).toFixed(1);
      const st       = statusOf(utilPct);

      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [from.n.longitude, from.n.latitude],
            [to.n.longitude,   to.n.latitude],
          ],
        },
        properties: {
          pipe_id:      pipe.pipe_id,
          from_node:    pipe.from_node,
          to_node:      pipe.to_node,
          length_m:     pipe.length_m,
          diameter_mm:  pipe.diameter_mm,
          slope:        pipe.slope,
          capacity_lps: capLps,
          load_lps:     pipeLoad,
          util_pct:     utilPct,
          status:       st,
          pipeColor:    STATUS[st]?.color ?? '#16a34a',
        },
      };
    }).filter(Boolean),
  };
}

export default function DrainageAnalysisPage({ onNavigate }) {
  const {
    hasSimulation, results, datasets,
    selectedForecastStep, setSelectedForecastStep,
  } = useSimulation();

  const step = selectedForecastStep ?? 0;

  // Map refs
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);

  // UI State
  const [selectedNode,  setSelectedNode]  = useState(null);
  const [nodeFilter,    setNodeFilter]    = useState('ALL');
  const [nodeSearch,    setNodeSearch]    = useState('');
  const [nodeSort,      setNodeSort]      = useState({ col: 'util_pct', dir: 'desc' });
  const [mapLayers,     setMapLayers]     = useState({ flood: true, pipes: true, nodes: true, boundary: true });

  const drainageNodes = datasets?.drainageNodes ?? [];
  const drainagePipes = datasets?.drainagePipes ?? [];
  const drainageRes   = results?.drainageResults ?? [];
  const floodStep     = results?.floodResults?.[step] ?? [];

  // ── Derived node analysis for selected forecast step ───────────
  const nodeAtStep = useMemo(() =>
    drainageNodes.map((n, i) => {
      const d = drainageRes?.[i]?.[step] ?? {};
      const loadLps = d.load_lps ?? 0;
      const capLps  = d.capacity_lps ?? n.capacity_lps ?? 300;
      const utilPct = d.util_pct ?? +(loadLps / (capLps || 1) * 100).toFixed(1);
      const st      = d.status ?? statusOf(utilPct);

      // Find nearby flood depth from floodStep grid
      let nearbyFloodDepth = 0;
      let nearbyRiskKey = 'SAFE';
      let minDistance = Infinity;

      floodStep.forEach(c => {
        const distSq = (c.lat - n.latitude) ** 2 + (c.lon - n.longitude) ** 2;
        if (distSq < minDistance) {
          minDistance = distSq;
          nearbyFloodDepth = c.depth_cm ?? 0;
          nearbyRiskKey = c.risk_key ?? 'SAFE';
        }
      });

      return {
        node_id: n.node_id,
        node_type: n.node_type ?? 'Junction',
        lat: n.latitude,
        lon: n.longitude,
        load_lps: loadLps,
        capacity_lps: capLps,
        util_pct: utilPct,
        status: st,
        overloaded: st === 'OVERLOADED',
        surcharge_lps: d.surcharge_lps ?? (st === 'OVERLOADED' ? Math.round((loadLps - capLps) * 0.5) : 0),
        nearbyFloodDepth,
        nearbyRiskKey,
        index: i,
      };
    }),
    [drainageNodes, drainageRes, floodStep, step]
  );

  // ── Derived pipes analysis for selected forecast step ─────────
  const pipesWithUtil = useMemo(() =>
    (drainagePipes ?? []).map(p => {
      const nodeMap = {};
      drainageNodes.forEach((n, i) => { nodeMap[n.node_id] = i; });
      const fromIdx  = nodeMap[p.from_node];
      const fromLoad = drainageRes?.[fromIdx]?.[step]?.load_lps ?? 0;
      const capLps   = calcPipeCapacity(p);
      const pipeLoad = +(fromLoad * 0.7).toFixed(1);
      const utilPct  = +Math.min(200, (pipeLoad / (capLps || 1)) * 100).toFixed(1);
      return { ...p, capacity_lps: capLps, load_lps: pipeLoad, util_pct: utilPct, status: statusOf(utilPct) };
    }),
    [drainagePipes, drainageNodes, drainageRes, step]
  );

  // ── KPI Summary Statistics ─────────────────────────────────────
  const stats = useMemo(() => {
    const ns     = nodeAtStep;
    const normal = ns.filter(n => n.status === 'NORMAL').length;
    const near   = ns.filter(n => n.status === 'NEAR_CAPACITY').length;
    const high   = ns.filter(n => n.status === 'HIGH').length;
    const over   = ns.filter(n => n.status === 'OVERLOADED').length;
    const avgUtil = ns.length ? +(ns.reduce((s, n) => s + n.util_pct, 0) / ns.length).toFixed(1) : 0;
    const surchargeNodes = ns.filter(n => n.surcharge_lps > 0 || n.status === 'OVERLOADED').length;
    return { total: ns.length, normal, near, high, over, avgUtil, surchargeNodes };
  }, [nodeAtStep]);

  // Chart data
  const statusBarData = [
    { name: 'Normal',        count: stats.normal, color: '#16a34a' },
    { name: 'Near Capacity', count: stats.near,   color: '#d97706' },
    { name: 'High',          count: stats.high,   color: '#ea580c' },
    { name: 'Overloaded',    count: stats.over,   color: '#dc2626' },
  ];

  // Keep selected node updated across timesteps
  const activeSelectedNode = useMemo(() => {
    if (!selectedNode) return null;
    return nodeAtStep.find(n => n.node_id === selectedNode.node_id) ?? selectedNode;
  }, [selectedNode, nodeAtStep]);

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
      center: [80.24, 13.03],
      zoom: 11.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    map.on('load', () => {
      // 1. Chennai Boundary Layer
      if (datasets?.boundary) {
        map.addSource('boundary', { type: 'geojson', data: datasets.boundary });
        map.addLayer({
          id: 'boundary-line',
          type: 'line',
          source: 'boundary',
          paint: { 'line-color': '#634B29', 'line-width': 2, 'line-dasharray': [4, 3] },
        });
      }

      // 2. Flood Inundation Layer (Underneath drainage network)
      map.addSource('flood', { type: 'geojson', data: makeFloodGeoJSON(floodStep) });
      map.addLayer({
        id: 'flood-fill',
        type: 'fill',
        source: 'flood',
        paint: {
          'fill-color': ['coalesce', ['get', 'risk_color'], '#1d4ed8'],
          'fill-opacity': 0.45,
        },
      });

      // 3. Drainage Pipes Layer
      map.addSource('pipes', { type: 'geojson', data: makePipeGeoJSON(datasets?.drainagePipes, datasets?.drainageNodes, drainageRes, step) });
      map.addLayer({
        id: 'pipes-line',
        type: 'line',
        source: 'pipes',
        paint: {
          'line-color': ['get', 'pipeColor'],
          'line-width': ['case', ['>=', ['get', 'util_pct'], 100], 4, 2.5],
          'line-opacity': 0.9,
        },
      });

      // 4. Drainage Nodes Layer (Above flood layer)
      map.addSource('nodes', { type: 'geojson', data: makeNodeGeoJSON(datasets?.drainageNodes, drainageRes, step) });
      
      // Node glow casing
      map.addLayer({
        id: 'nodes-glow',
        type: 'circle',
        source: 'nodes',
        paint: {
          'circle-color': ['get', 'nodeColor'],
          'circle-radius': ['case', ['get', 'overloaded'], 10, 6],
          'circle-opacity': 0.35,
        },
      });

      // Node inner circle
      map.addLayer({
        id: 'nodes-circle',
        type: 'circle',
        source: 'nodes',
        paint: {
          'circle-color': ['get', 'nodeColor'],
          'circle-radius': ['case', ['get', 'overloaded'], 6.5, 4.5],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });

      // Node Click Handler
      map.on('click', 'nodes-circle', e => {
        const props = e.features?.[0]?.properties;
        if (props) {
          const match = nodeAtStep.find(n => n.node_id === props.node_id);
          if (match) setSelectedNode(match);
        }
      });

      map.on('mouseenter', 'nodes-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'nodes-circle', () => { map.getCanvas().style.cursor = ''; });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []); // Mount once

  // ── UPDATE MAP LAYERS ON TIMESTEP OR DATASET CHANGE ────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getSource('flood')) {
      map.getSource('flood').setData(makeFloodGeoJSON(floodStep));
    }
    if (map.getSource('nodes')) {
      map.getSource('nodes').setData(makeNodeGeoJSON(datasets?.drainageNodes, drainageRes, step));
    }
    if (map.getSource('pipes')) {
      map.getSource('pipes').setData(makePipeGeoJSON(datasets?.drainagePipes, datasets?.drainageNodes, drainageRes, step));
    }
  }, [step, floodStep, datasets, drainageRes]);

  // ── LAYER TOGGLE HANDLER ───────────────────────────────────────
  const toggleMapLayer = useCallback((key, checked) => {
    setMapLayers(l => ({ ...l, [key]: checked }));
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = checked ? 'visible' : 'none';
    const MAP = { flood: ['flood-fill'], pipes: ['pipes-line'], nodes: ['nodes-circle', 'nodes-glow'], boundary: ['boundary-line'] };
    (MAP[key] ?? []).forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis); });
  }, []);

  // Filtered & Sorted Node Table
  const filteredNodes = useMemo(() => {
    return nodeAtStep
      .filter(n => {
        if (nodeFilter !== 'ALL' && n.status !== nodeFilter) return false;
        if (nodeSearch && !n.node_id.toLowerCase().includes(nodeSearch.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const valA = a[nodeSort.col];
        const valB = b[nodeSort.col];
        if (typeof valA === 'string') {
          return nodeSort.dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return nodeSort.dir === 'asc' ? valA - valB : valB - valA;
      });
  }, [nodeAtStep, nodeFilter, nodeSearch, nodeSort]);

  // ── NO SIMULATION STATE ────────────────────────────────────────
  if (!hasSimulation) {
    return (
      <div className="main-content" style={{ padding: '24px 32px', background: '#faf7f2' }}>
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          padding: '48px 32px', textAlign: 'center', maxWidth: 540, margin: '60px auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          <Network size={36} color="#634B29" />
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1a140e', margin: 0 }}>
            No Drainage Simulation Data
          </h2>
          <p style={{ fontSize: 14, color: '#786c5e', lineHeight: 1.5, margin: 0 }}>
            Run a flood nowcast scenario to analyze hydraulic capacity, surcharge nodes, and surface inundation correlation.
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
            Drainage Network Analysis
          </h1>
          <p style={{ fontSize: 13, color: '#786c5e', margin: 0 }}>
            Analyze drainage capacity, surcharge locations, and their direct relationship with surface flooding.
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

      {/* ── SUMMARY KPI CARDS ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        
        <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', marginBottom: 4 }}>Total Nodes</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#1a140e' }}>{stats.total}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', marginBottom: 4 }}>Normal (&lt;60%)</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#16a34a' }}>{stats.normal}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', marginBottom: 4 }}>Near Capacity</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#d97706' }}>{stats.near}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', marginBottom: 4 }}>High Utilization</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#ea580c' }}>{stats.high}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', marginBottom: 4 }}>Overloaded</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#dc2626' }}>{stats.over}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase', marginBottom: 4 }}>Avg Utilization</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#1a140e' }}>{stats.avgUtil}%</div>
        </div>

      </div>

      {/* ── MAIN ANALYSIS: HERO MAP (65%) + SELECTED NODE DETAILS (35%) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 16 }}>

        {/* HERO MAP CONTAINER */}
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 520, position: 'relative',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}>
          {/* Map canvas */}
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%', flex: 1 }} />

          {/* Map Layer Switches */}
          <div style={{
            position: 'absolute', bottom: 12, right: 12, background: 'rgba(255,255,255,0.96)',
            border: '1px solid #ebe4da', borderRadius: 8, padding: '8px 12px', zIndex: 10,
            display: 'flex', gap: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            {[
              { k: 'flood', label: 'Flood Overlay' },
              { k: 'nodes', label: 'Nodes' },
              { k: 'pipes', label: 'Pipes' },
              { k: 'boundary', label: 'Boundary' },
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
            <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase' }}>Drainage Status</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} /> Normal
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706' }} /> Near Cap
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c' }} /> High
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} /> Overloaded
              </div>
            </div>
            <div style={{ borderBottom: '1px solid #ebe4da', margin: '2px 0' }} />
            <div style={{ fontSize: 10, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase' }}>Flood Inundation</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <div style={{ width: 12, height: 8, borderRadius: 2, background: '#2563eb', opacity: 0.7 }} />
              Surface Water Depth
            </div>
          </div>
        </div>

        {/* SELECTED NODE DETAILS PANEL */}
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)', height: 520, overflowY: 'auto',
        }}>
          
          {activeSelectedNode ? (
            <>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#8c8275', textTransform: 'uppercase' }}>
                    DRAINAGE NODE ANALYSIS
                  </span>
                  <h2 style={{ fontSize: 24, fontWeight: 900, color: '#1a140e', margin: '2px 0' }}>
                    {activeSelectedNode.node_id}
                  </h2>
                  <div style={{ fontSize: 12, color: '#786c5e' }}>
                    Type: <strong>{activeSelectedNode.node_type}</strong>
                  </div>
                </div>
                <StatusBadge st={activeSelectedNode.status} />
              </div>

              <div style={{ borderBottom: '1px solid #ebe4da' }} />

              {/* Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8c8275', textTransform: 'uppercase' }}>Simulated Flow</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#1a140e' }}>
                    {activeSelectedNode.load_lps} L/s
                  </div>
                  <div style={{ fontSize: 10, color: '#786c5e' }}>
                    {(activeSelectedNode.load_lps / 1000).toFixed(3)} m³/s
                  </div>
                </div>

                <div style={{ background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8c8275', textTransform: 'uppercase' }}>Drainage Capacity</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#1a140e' }}>
                    {activeSelectedNode.capacity_lps} L/s
                  </div>
                  <div style={{ fontSize: 10, color: '#786c5e' }}>
                    {(activeSelectedNode.capacity_lps / 1000).toFixed(3)} m³/s
                  </div>
                </div>

                <div style={{ background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8c8275', textTransform: 'uppercase' }}>Capacity Utilization</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: STATUS[activeSelectedNode.status]?.color }}>
                    {activeSelectedNode.util_pct}%
                  </div>
                </div>

                <div style={{ background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8c8275', textTransform: 'uppercase' }}>Surcharge Flow</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: activeSelectedNode.surcharge_lps > 0 ? '#dc2626' : '#16a34a' }}>
                    {activeSelectedNode.surcharge_lps > 0 ? `${activeSelectedNode.surcharge_lps} L/s` : 'None'}
                  </div>
                </div>
              </div>

              {/* FLOOD RELATIONSHIP SECTION */}
              <div style={{
                background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 10,
                borderLeft: '5px solid #634B29', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#634B29', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Flood Relationship around Node
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#786c5e' }}>Nearby Flood Depth:</span>
                  <strong style={{ color: '#1a140e' }}>{activeSelectedNode.nearbyFloodDepth} cm</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#786c5e' }}>Flood Risk Conditions:</span>
                  <strong style={{ color: activeSelectedNode.nearbyRiskKey === 'SEVERE' || activeSelectedNode.nearbyRiskKey === 'CRITICAL' ? '#dc2626' : '#16a34a' }}>
                    {activeSelectedNode.nearbyRiskKey}
                  </strong>
                </div>
                <p style={{ fontSize: 11, color: '#786c5e', margin: 0, lineHeight: 1.4 }}>
                  {activeSelectedNode.status === 'OVERLOADED'
                    ? `Drainage capacity at ${activeSelectedNode.node_id} is exceeded at ${TIMES[step]}, resulting in localized surface water accumulation.`
                    : `Drainage network at ${activeSelectedNode.node_id} currently operates within design capacity limits.`}
                </p>
              </div>

              {/* Action */}
              <button
                onClick={() => onNavigate('/flood-impact')}
                style={{
                  marginTop: 'auto', background: '#634B29', color: '#ffffff', border: 'none',
                  borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 800,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                Impact Analysis <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#786c5e', gap: 12,
            }}>
              <Network size={36} color="#d6cbc0" />
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1a140e' }}>
                Select a Drainage Node
              </div>
              <p style={{ fontSize: 13, color: '#786c5e', maxWidth: 240, margin: 0 }}>
                Click any drainage node on the map or select from the table to inspect hydraulic flow capacity and flood correlation.
              </p>
            </div>
          )}

        </div>

      </div>

      {/* ── DRAINAGE NODE STATUS CHART ───────────────────────────── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
        padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1a140e', margin: 0 }}>
            Drainage Node Status
          </h2>
          <p style={{ fontSize: 13, color: '#786c5e', margin: 0 }}>
            Distribution by capacity utilization at selected forecast time ({TIMES[step]}).
          </p>
        </div>

        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={statusBarData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ebe4da" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#1a140e', fontWeight: 700 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#786c5e' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0];
              return (
                <div style={{ background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 800, color: '#1a140e' }}>{d.payload.name}</div>
                  <div>Nodes: <strong>{d.value}</strong></div>
                </div>
              );
            }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {statusBarData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── DRAINAGE NODE ANALYSIS TABLE ─────────────────────────── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
        padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        
        {/* Table Header & Search Filter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1a140e', margin: 0 }}>
              Drainage Node Analysis
            </h2>
            <p style={{ fontSize: 13, color: '#786c5e', margin: 0 }}>
              Detailed hydraulic capacity and flood correlation per node at {TIMES[step]}.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#8c8275" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search Node ID..."
                value={nodeSearch}
                onChange={e => setNodeSearch(e.target.value)}
                style={{
                  padding: '6px 12px 6px 30px', borderRadius: 6, border: '1px solid #d6cbc0',
                  fontSize: 12, background: '#faf7f2', outline: 'none', width: 160,
                }}
              />
            </div>

            {/* Status Filter Buttons */}
            {['ALL', 'OVERLOADED', 'HIGH', 'NEAR_CAPACITY', 'NORMAL'].map(filterKey => (
              <button
                key={filterKey}
                onClick={() => setNodeFilter(filterKey)}
                style={{
                  background: nodeFilter === filterKey ? '#634B29' : '#faf7f2',
                  color: nodeFilter === filterKey ? '#ffffff' : '#1a140e',
                  border: nodeFilter === filterKey ? '1px solid #634B29' : '1px solid #d6cbc0',
                  borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                }}
              >
                {filterKey.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Node Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ebe4da' }}>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Node ID</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Flow (L/s)</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Capacity (L/s)</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Utilization (%)</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Status</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Nearby Flood Depth</th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.map(node => (
                <tr
                  key={node.node_id}
                  onClick={() => setSelectedNode(node)}
                  style={{
                    borderBottom: '1px solid #f5f1eb', cursor: 'pointer',
                    background: selectedNode?.node_id === node.node_id ? '#dfd3bf' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 800, color: '#1a140e', fontFamily: 'monospace' }}>
                    {node.node_id}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#1a140e', fontWeight: 600 }}>
                    {node.load_lps} L/s
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#786c5e' }}>
                    {node.capacity_lps} L/s
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 800, color: STATUS[node.status]?.color }}>
                    {node.util_pct}%
                  </td>
                  <td style={{ padding: '12px' }}>
                    <StatusBadge st={node.status} />
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 800, color: '#1a140e' }}>
                    {node.nearbyFloodDepth} cm
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      {/* ── PIPE CAPACITY ANALYSIS TABLE ─────────────────────────── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
        padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: '#1a140e', margin: 0 }}>
            Pipe Capacity Analysis
          </h2>
          <p style={{ fontSize: 13, color: '#786c5e', margin: 0 }}>
            Conveyance capacity and hydraulic load across drainage pipe segments.
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ebe4da' }}>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Pipe ID</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>From Node</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>To Node</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Length (m)</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Capacity (L/s)</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Flow (L/s)</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Utilization (%)</th>
                <th style={{ padding: '10px 12px', fontSize: 12, fontWeight: 800, color: '#1a140e' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pipesWithUtil.map(pipe => (
                <tr key={pipe.pipe_id} style={{ borderBottom: '1px solid #f5f1eb' }}>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 800, color: '#1a140e', fontFamily: 'monospace' }}>
                    {pipe.pipe_id}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#786c5e', fontFamily: 'monospace' }}>
                    {pipe.from_node}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#786c5e', fontFamily: 'monospace' }}>
                    {pipe.to_node}
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#3d332a' }}>
                    {pipe.length_m} m
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, color: '#786c5e' }}>
                    {pipe.capacity_lps} L/s
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 700, color: '#1a140e' }}>
                    {pipe.load_lps} L/s
                  </td>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 800, color: STATUS[pipe.status]?.color }}>
                    {pipe.util_pct}%
                  </td>
                  <td style={{ padding: '12px' }}>
                    <StatusBadge st={pipe.status} />
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
