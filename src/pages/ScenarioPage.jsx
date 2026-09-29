import { useState, useMemo } from 'react';
import { Play, Loader2, Info } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext.jsx';

const BASE_PEAK_MMHR = 74;

const DEFAULT_FORM = {
  targetZone: 'Chennai Metropolitan Region (Adyar / Cooum Basins)',
  rainfallIntensity: 50.0,
  tidalSurge: 1.5,
  stormProfile: 'Constant Rainfall',
  runoffCoeff: 0.75,
  forecastHorizon: 3,
  forecastInterval: 30,
  intensityFactor: 50 / BASE_PEAK_MMHR,
};

export default function ScenarioPage({ onNavigate }) {
  const { dataStatus, setScenario, simulate, hasSimulation } = useSimulation();

  const [form, setForm] = useState(DEFAULT_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [running, setRunning] = useState(false);

  const patch = (key, val) => {
    setForm(f => {
      const next = { ...f, [key]: val };
      if (key === 'rainfallIntensity') {
        const num = Math.max(0, Number(val) || 0);
        next.rainfallIntensity = num;
        next.intensityFactor = num / BASE_PEAK_MMHR;
      }
      return next;
    });
    if (hasSimulation) setIsDirty(true);
  };

  const handleRun = () => {
    const intensity = Number(form.rainfallIntensity);
    if (isNaN(intensity) || intensity <= 0) return;

    setRunning(true);
    setTimeout(() => {
      setRunning(false);
      const scenario = {
        ...form,
        rainfallIntensity: intensity,
        intensityFactor: intensity / BASE_PEAK_MMHR,
        name: `Rainfall ${intensity} mm/hr — ${form.forecastHorizon}h Forecast`,
      };
      setScenario(scenario);
      simulate(scenario);
      setIsDirty(false);
      onNavigate('/simulation');
    }, 500);
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#1a140e',
    background: '#ffffff',
    border: '1px solid #d6cbc0',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '700',
    color: '#1a140e',
    marginBottom: '6px',
  };

  const helperStyle = {
    fontSize: '12px',
    color: '#786c5e',
    marginTop: '4px',
  };

  return (
    <div className="main-content" style={{ padding: '24px 32px', gap: 20, background: '#faf7f2' }}>
      
      {/* ── TITLE BANNER (Matching Dam-Safe Reference) ──────────────── */}
      <div>
        <h1 style={{
          fontSize: 30, fontWeight: 900, color: '#1a140e',
          lineHeight: 1.2, marginBottom: 6, letterSpacing: '-0.02em',
        }}>
          Create Flood Scenario
        </h1>
        <p style={{ fontSize: 14, color: '#786c5e', lineHeight: 1.5 }}>
          All parameters are in SI metric units. Configure flood nowcasting inputs and run a downstream inundation simulation.
        </p>
      </div>

      {isDirty && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
          padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <Info size={15} color="#d97706" />
          <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
            Scenario configuration changed. Click "Run Flood Simulation" to re-calculate outputs.
          </span>
        </div>
      )}

      {/* ── 2-COLUMN GRID (Matching Dam-Safe Reference) ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

        {/* LEFT COLUMN — INPUT FORM */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          
          {/* Target Zone */}
          <div>
            <label style={labelStyle}>Target Zone / Region</label>
            <input
              type="text"
              readOnly
              value={form.targetZone}
              style={{ ...inputStyle, background: '#faf7f2', color: '#5c5245', cursor: 'not-allowed' }}
            />
          </div>

          {/* Rainfall Intensity */}
          <div>
            <label style={labelStyle}>Rainfall Intensity (mm/h)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.rainfallIntensity}
              onChange={e => patch('rainfallIntensity', e.target.value)}
              style={inputStyle}
            />
            <div style={helperStyle}>
              Observed peak rainfall rate: {form.rainfallIntensity} mm/h | Maximum peak: 150 mm/h
            </div>
          </div>

          {/* 2-Column Row: Tidal Surge + Storm Profile */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Tidal Surge Elevation (m MSL)</label>
              <input
                type="number"
                step="0.1"
                value={form.tidalSurge}
                onChange={e => patch('tidalSurge', e.target.value)}
                style={inputStyle}
              />
              <div style={helperStyle}>Coastal boundary water level</div>
            </div>

            <div>
              <label style={labelStyle}>Design Storm Profile</label>
              <select
                value={form.stormProfile}
                onChange={e => patch('stormProfile', e.target.value)}
                style={inputStyle}
              >
                <option value="Constant Rainfall">Constant Rainfall</option>
                <option value="3 hr Heavy Storm">3 hr Heavy Storm</option>
                <option value="6 hr Monsoonal">6 hr Monsoonal</option>
              </select>
              <div style={helperStyle}>Time profile of design storm</div>
            </div>
          </div>

          {/* Runoff Coefficient */}
          <div>
            <label style={labelStyle}>Urban Runoff Coefficient (C)</label>
            <input
              type="number"
              step="0.05"
              min="0.1"
              max="0.95"
              value={form.runoffCoeff}
              onChange={e => patch('runoffCoeff', e.target.value)}
              style={inputStyle}
            />
            <div style={helperStyle}>Impervious surface runoff fraction (typical range: 0.10 – 0.95)</div>
          </div>

          {/* 2-Column Row: Duration + Interval */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Simulation Duration (hrs)</label>
              <select
                value={form.forecastHorizon}
                onChange={e => patch('forecastHorizon', Number(e.target.value))}
                style={inputStyle}
              >
                <option value={1}>1 hr</option>
                <option value={2}>2 hrs</option>
                <option value={3}>3 hrs</option>
                <option value={6}>6 hrs</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Output Step Interval (mins)</label>
              <select
                value={form.forecastInterval}
                onChange={e => patch('forecastInterval', Number(e.target.value))}
                style={inputStyle}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN — SCENARIO SUMMARY CARD */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #ebe4da',
          borderRadius: 14,
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
        }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1a140e', margin: 0 }}>
            Scenario Summary
          </h3>

          <div style={{ height: 1, background: '#ebe4da' }} />

          {/* Key-Value Summary List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: '#786c5e' }}>Study Zone</span>
              <strong style={{ color: '#1a140e' }}>Chennai Metro</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: '#786c5e' }}>Rainfall Intensity</span>
              <strong style={{ color: '#1a140e' }}>{form.rainfallIntensity} mm/h</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: '#786c5e' }}>Tidal Surge</span>
              <strong style={{ color: '#1a140e' }}>{form.tidalSurge} m</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: '#786c5e' }}>Storm Profile</span>
              <strong style={{ color: '#1a140e' }}>{form.stormProfile}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: '#786c5e' }}>Runoff Coeff.</span>
              <strong style={{ color: '#1a140e' }}>{form.runoffCoeff}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: '#786c5e' }}>Duration</span>
              <strong style={{ color: '#1a140e' }}>{form.forecastHorizon} hr</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span style={{ color: '#786c5e' }}>Output Interval</span>
              <strong style={{ color: '#1a140e' }}>{form.forecastInterval} min</strong>
            </div>
          </div>

          <div style={{ height: 1, background: '#ebe4da', margin: '4px 0' }} />

          {/* Primary Action Button */}
          <button
            id="btn-run-simulation"
            onClick={handleRun}
            disabled={running || dataStatus === 'loading'}
            style={{
              background: '#634B29',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '14px 20px',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: '0.03em',
              cursor: running ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(99,75,41,0.25)',
              transition: 'all 0.15s',
              marginTop: 8,
            }}
          >
            {running ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Running Nowcast…
              </>
            ) : (
              <>
                <Play size={18} fill="#ffffff" />
                Run Flood Simulation
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
}
