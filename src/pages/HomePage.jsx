import { useMemo } from 'react';
import {
  CloudRain, Droplets, AlertTriangle, Navigation,
  Activity, Network, Clock, ArrowRight,
  Loader2, Map, Sliders, Zap,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext.jsx';
import FloodMap from '../components/FloodMap.jsx';
import { getRiskLevel } from '../config/thresholds.js';

export default function HomePage({ onNavigate }) {
  const {
    dataStatus, datasets, hasSimulation,
    results, kpis,
  } = useSimulation();

  return (
    <div className="main-content" style={{ padding: '20px 24px', gap: 16, background: '#faf7f2' }}>

      {/* ── TOP: Title card + Action buttons (Dam-Safe Style) ─────────────── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
        borderLeft: '6px solid #634B29', padding: '28px 36px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div>
          <h1 style={{
            fontSize: 32, fontWeight: 900, color: '#1a140e',
            lineHeight: 1.1, marginBottom: 8, letterSpacing: '-0.02em',
          }}>
            UrbanFlood-X
          </h1>
          <p style={{ fontSize: 14, color: '#786c5e', lineHeight: 1.5, maxWidth: 620 }}>
            Urban Flood Nowcasting &amp; Decision Support System. Simulate
            street-level flooding and generate emergency response plans.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          <button
            id="btn-create-scenario"
            onClick={() => onNavigate('/scenario')}
            style={{
              background: '#634B29', color: '#ffffff', border: 'none',
              borderRadius: 8, padding: '12px 24px', fontSize: 13,
              fontWeight: 800, letterSpacing: '0.05em', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 2px 4px rgba(99,75,41,0.2)', transition: 'all 0.15s',
            }}
          >
            <Sliders size={16} />
            CREATE SCENARIO
          </button>
          <button
            id="btn-open-floodmap"
            onClick={() => onNavigate('/flood-map')}
            style={{
              background: '#faf7f2', border: '1px solid #d6cbc0',
              color: '#634B29', borderRadius: 8, padding: '12px 24px',
              fontSize: 13, fontWeight: 800, letterSpacing: '0.05em',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s',
            }}
          >
            <Map size={16} />
            VIEW FLOOD MAP
          </button>
        </div>
      </div>

      {/* ── MIDDLE: Two-column — Info + Analysis ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* LEFT — Chennai Metropolitan Region card */}
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          borderLeft: '6px solid #634B29', padding: '24px 28px',
          display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1a140e', marginBottom: 4, letterSpacing: '0.02em' }}>
              CHENNAI METROPOLITAN REGION
            </h2>
            <p style={{ fontSize: 14, color: '#786c5e' }}>
              Tamil Nadu · Southern India
            </p>
          </div>

          <div style={{ height: 1, background: '#ebe4da' }} />

          {/* KPI stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#8c8275', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                Current Rainfall
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1a140e', lineHeight: 1 }}>
                {hasSimulation ? kpis.currentRainfall : '8.1'}
                <span style={{ fontSize: 15, fontWeight: 500, color: '#786c5e', marginLeft: 4 }}>mm/h</span>
              </div>
              <div style={{ fontSize: 11, color: '#8c8275', marginTop: 4 }}>
                Interval: 30 min
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8c8275', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                Max Flood Depth
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1a140e', lineHeight: 1 }}>
                {hasSimulation ? kpis.maxFloodDepth : '54.4'}
                <span style={{ fontSize: 15, fontWeight: 500, color: '#786c5e', marginLeft: 4 }}>cm</span>
              </div>
              <div style={{ fontSize: 11, color: '#8c8275', marginTop: 4 }}>
                Peak Step: T+3
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8c8275', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                Study Area
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a140e', lineHeight: 1.2 }}>
                Chennai Metro
              </div>
              <div style={{ fontSize: 11, color: '#8c8275', marginTop: 4 }}>
                Pilot Zone
              </div>
            </div>
          </div>

          <div style={{ borderBottom: '1px stroke dotted #ebe4da', height: 1 }} />

          {/* Bottom info row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
            <span style={{ fontSize: 13, color: '#3d332a', fontWeight: 600 }}>
              Forecast Horizon: <strong>0–3 hrs</strong> &nbsp;|&nbsp; Time Steps: <strong>7</strong>
            </span>
            <button
              onClick={() => onNavigate('/scenario')}
              style={{
                background: 'none', border: 'none', color: '#634B29',
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              Configure Scenario <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* RIGHT — Nowcast Analysis Summary */}
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
          padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}>
          <div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1a140e', marginBottom: 4 }}>
              Chennai Flood Nowcast Analysis
            </h3>
            <p style={{ fontSize: 13, color: '#786c5e' }}>
              Inundation model for 0–3 hrs simulation horizon.
            </p>
          </div>

          {/* Inner stats box matching reference */}
          <div style={{
            background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 10,
            padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
          }}>
            <div>
              <div style={{ fontSize: 11, color: '#8c8275', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
                Max Flood Depth
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a140e' }}>
                {hasSimulation ? `${kpis.maxFloodDepth} cm` : '54.4 cm'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8c8275', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
                Flood-Risk Roads
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a140e' }}>
                {hasSimulation ? `${kpis.floodRiskRoadCount} Roads` : '5 Roads'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8c8275', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
                Overloaded Drainage
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a140e' }}>
                {hasSimulation ? `${kpis.overloadedNodeCount} / ${kpis.totalNodeCount}` : '15 / 15'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8c8275', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
                Critical Hotspots
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a140e' }}>
                {hasSimulation ? `${kpis.criticalHotspotCount} Nodes` : '254 Nodes'}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
            <button
              onClick={() => onNavigate('/flood-map')}
              style={{
                flex: 1, justifyContent: 'center', padding: '10px 18px', fontSize: 13,
                fontWeight: 800, background: '#634B29', color: '#ffffff', border: 'none',
                borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 4px rgba(99,75,41,0.2)',
              }}
            >
              View Flood Map
            </button>
            <button
              onClick={() => onNavigate('/alerts')}
              style={{
                flex: 1, justifyContent: 'center', padding: '10px 18px', fontSize: 13,
                fontWeight: 800, background: '#ffffff', color: '#634B29', border: '1px solid #d6cbc0',
                borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              Hazard Alerts
            </button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM: Chennai Pilot Area Map (expanded size) ───── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 14,
        display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: 0, overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #ebe4da', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: '#faf7f2',
            border: '1px solid #ebe4da', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Map size={15} color="#634B29" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1a140e' }}>Chennai Pilot Area</div>
            <div style={{ fontSize: 12, color: '#786c5e' }}>Operational forecast area map.</div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 560, display: 'flex', flexDirection: 'column' }}>
          {dataStatus === 'loaded' ? (
            <FloodMap
              datasets={datasets}
              floodResults={hasSimulation ? results.floodResults : null}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 560, gap: 8, color: '#786c5e' }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              Loading map data…
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
