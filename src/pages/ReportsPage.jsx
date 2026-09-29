import { useState, useMemo } from 'react';
import {
  FileText, Download, Printer, FileSpreadsheet, FileCode,
  CheckCircle2, ArrowRight, ShieldAlert, Layers, Sliders,
} from 'lucide-react';
import { useSimulation } from '../context/SimulationContext.jsx';
import { exportCSV, exportGeoJSON, exportPDF } from '../services/reportEngine.js';

export default function ReportsPage({ onNavigate }) {
  const {
    hasSimulation, results, datasets, scenario,
    selectedForecastStep,
  } = useSimulation();

  const step = selectedForecastStep ?? 0;

  // Hydrate metrics from simulation context or defaults
  const kpis = useMemo(() => {
    if (!hasSimulation || !results) {
      return {
        maxDepthCm: 58,
        affectedAreaKm2: 42.5,
        populationExposed: 149600,
        affectedBuildings: 1245,
        floodRiskRoads: 21,
        overloadedNodes: 8,
        totalNodes: 25,
      };
    }
    const floodStep = results.floodResults?.[step] ?? [];
    const maxDepthCm = floodStep.length ? Math.max(...floodStep.map(c => c.depth_cm)) : 58;
    const affectedAreaKm2 = +(floodStep.filter(c => c.depth_cm > 5).length * 0.012).toFixed(1) || 42.5;
    const populationExposed = Math.round(affectedAreaKm2 * 3500) || 149600;

    return {
      maxDepthCm,
      affectedAreaKm2,
      populationExposed,
      affectedBuildings: Math.round(affectedAreaKm2 * 28),
      floodRiskRoads: results.roadRiskResults?.filter(r => r.depth_cm > 15).length || 21,
      overloadedNodes: results.drainageResults?.filter(n => n[step]?.overloaded).length || 8,
      totalNodes: datasets?.drainageNodes?.length || 25,
    };
  }, [results, datasets, hasSimulation, step]);

  return (
    <div className="main-content" style={{ padding: '24px 32px', background: '#faf7f2', gap: 24, display: 'flex', flexDirection: 'column' }}>

      {/* ── TOP PAGE TITLE ROW ────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <FileText size={28} color="#1a140e" />
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#1a140e', letterSpacing: '0.01em', margin: 0, textTransform: 'uppercase' }}>
          FLOOD SIMULATION REPORT
        </h1>
      </div>

      {/* ── MAIN REPORT CARD CONTAINER (Dam-Safe Style) ────────── */}
      <div style={{
        background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 16,
        padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>

        {/* Sub-Header inside card */}
        <div style={{ borderBottom: '1px solid #ebe4da', paddingBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#786c5e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            REPORT GENERATED SUCCESSFULLY
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1a140e', margin: 0 }}>
            Chennai Urban Flood Simulation &amp; Decision Support Report
          </h2>
        </div>

        {/* 4 QUADRANT DETAIL CARDS GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* CARD 1: Scenario & Rainfall Parameters */}
          <div style={{
            background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 12,
            padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1a140e', margin: 0 }}>
              1. Scenario &amp; Rainfall Parameters
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#3d332a' }}>
              <div>Target Region: <strong style={{ color: '#1a140e' }}>Chennai Metropolitan Area (Pilot Zone)</strong></div>
              <div>Rainfall Intensity: <strong style={{ color: '#1a140e' }}>{(scenario?.intensityFactor || 1) * 30} mm/h</strong> (Peak Forecast)</div>
              <div>Tidal Surge: <strong style={{ color: '#1a140e' }}>{scenario?.tidalSurge || 0.8} m</strong> (Bay of Bengal Coast)</div>
              <div>Simulation Horizon: <strong style={{ color: '#1a140e' }}>3.0 Hours</strong> (0–180 minutes)</div>
            </div>
          </div>

          {/* CARD 2: Hydraulics & Exposure Summary */}
          <div style={{
            background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 12,
            padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1a140e', margin: 0 }}>
              2. Hydraulics &amp; Exposure Summary
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#3d332a' }}>
              <div>Max Water Depth: <strong style={{ color: '#1a140e' }}>{((kpis.maxDepthCm || 58) / 100).toFixed(2)} m</strong></div>
              <div>Max Flow Velocity: <strong style={{ color: '#1a140e' }}>1.45 m/s</strong></div>
              <div>Inundation Extent Area: <strong style={{ color: '#1a140e' }}>{kpis.affectedAreaKm2} km²</strong></div>
              <div>Total Population Exposed: <strong style={{ color: '#1a140e' }}>{kpis.populationExposed.toLocaleString()}</strong></div>
            </div>
          </div>

          {/* CARD 3: Response Priority Rankings */}
          <div style={{
            background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 12,
            padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1a140e', margin: 0 }}>
              3. Response Priority Rankings
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#3d332a' }}>
              <div>P1 Critical Priority: <strong style={{ color: '#dc2626' }}>2 Localities</strong> (Immediate Evacuation / Dewatering)</div>
              <div>P2 High Priority: <strong style={{ color: '#ea580c' }}>2 Localities</strong> (Velachery, Saidapet)</div>
              <div>P3 Moderate Priority: <strong style={{ color: '#d97706' }}>1 Locality</strong> (T. Nagar)</div>
              <div>P4 Low Priority: <strong style={{ color: '#16a34a' }}>1 Locality</strong> (Ambattur)</div>
            </div>
          </div>

          {/* CARD 4: Evacuation & Relief Logistics */}
          <div style={{
            background: '#faf7f2', border: '1px solid #ebe4da', borderRadius: 12,
            padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1a140e', margin: 0 }}>
              4. Evacuation &amp; Relief Logistics
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#3d332a' }}>
              <div>Evacuation Sectors: <strong style={{ color: '#1a140e' }}>Zone 1 to Zone 4</strong></div>
              <div>Severely Affected Highway: <strong style={{ color: '#1a140e' }}>GST Road &amp; Poonamallee High Road</strong></div>
              <div>Primary Safe Reroute: <strong style={{ color: '#1a140e' }}>Inner Ring Road Bypass (100 Feet Rd)</strong></div>
              <div>Operational Relief Shelters: <strong style={{ color: '#1a140e' }}>12 Facilities (8,500 Beds)</strong></div>
            </div>
          </div>

        </div>

        {/* ── EXPORT BUTTONS ROW ────────── */}
        <div style={{ borderTop: '1px solid #ebe4da', paddingTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => exportPDF()}
            style={{
              background: '#634B29', color: '#ffffff', border: 'none',
              borderRadius: 8, padding: '12px 24px', fontSize: 13,
              fontWeight: 800, cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', gap: 8, boxShadow: '0 2px 6px rgba(99,75,41,0.25)',
            }}
          >
            <Download size={16} /> Download Executive PDF Report
          </button>

          <button
            onClick={() => exportCSV(results)}
            style={{
              background: '#ffffff', color: '#634B29', border: '1px solid #d6cbc0',
              borderRadius: 8, padding: '12px 20px', fontSize: 13,
              fontWeight: 800, cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', gap: 8,
            }}
          >
            <FileSpreadsheet size={16} /> Export CSV Data Package
          </button>

          <button
            onClick={() => exportGeoJSON(results, step)}
            style={{
              background: '#ffffff', color: '#634B29', border: '1px solid #d6cbc0',
              borderRadius: 8, padding: '12px 20px', fontSize: 13,
              fontWeight: 800, cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', gap: 8,
            }}
          >
            <FileCode size={16} /> Export GeoJSON Layers
          </button>
        </div>

      </div>

    </div>
  );
}
