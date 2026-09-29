import { useEffect } from 'react';
import { CheckCircle, Loader2, ArrowRight, Activity, Play, Sliders } from 'lucide-react';
import { useSimulation } from '../context/SimulationContext.jsx';

const PIPELINE_STEPS = [
  { id: 'load', name: 'Preparing terrain and DEM elevation model...' },
  { id: 'rainfall', name: 'Processing rainfall intensity & runoff conditions...' },
  { id: 'graph', name: 'Modeling stormwater drainage network & node capacities...' },
  { id: 'flow', name: 'Calculating street-level hydraulic flood wave propagation...' },
  { id: 'finalize', name: 'Generating spatial inundation depth & hazard map...' },
];

export default function SimulationPage({ onNavigate }) {
  const {
    scenario, simulationStatus, simulationProgress,
    stages, datasets, simulate, isRunning,
  } = useSimulation();

  // Auto-start simulation if scenario exists and status is idle
  useEffect(() => {
    if (scenario && simulationStatus === 'idle' && datasets && !isRunning) {
      simulate(scenario);
    }
  }, []);

  const isComplete = simulationStatus === 'done';
  const isFailed = simulationStatus === 'error';
  const progressPercent = simulationProgress ?? (isComplete ? 100 : 0);

  // ── NO SCENARIO CONFIGURED ─────────────────────────────────────
  if (!scenario && simulationStatus === 'idle') {
    return (
      <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', background: '#faf7f2' }}>
        <div style={{
          background: '#ffffff', border: '1px solid #ebe4da', borderRadius: 16,
          padding: '40px 48px', maxWidth: 540, width: '100%', textAlign: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#faf7f2', border: '1px solid #ebe4da', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Activity size={24} color="#634B29" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1a140e', marginBottom: 8 }}>
            No Scenario Configured
          </h2>
          <p style={{ fontSize: 14, color: '#786c5e', lineHeight: 1.5, marginBottom: 24 }}>
            Configure rainfall and simulation parameters first to generate flood predictions.
          </p>
          <button
            onClick={() => onNavigate('/scenario')}
            style={{
              background: '#634B29', color: '#ffffff', border: 'none', borderRadius: 8,
              padding: '12px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <Sliders size={16} />
            Create Nowcast Scenario
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN SIMULATION CARD (Matching Dam-Safe Reference) ─────────
  return (
    <div className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '82vh', background: '#faf7f2', padding: '24px' }}>
      
      <div style={{
        background: '#ffffff',
        border: '1px solid #ebe4da',
        borderRadius: 16,
        maxWidth: 620,
        width: '100%',
        padding: '36px 40px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        
        {/* Title & Status */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{
            fontSize: 22,
            fontWeight: 900,
            color: '#1a140e',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}>
            {isComplete
              ? 'SIMULATION COMPLETE'
              : isFailed
                ? 'SIMULATION FAILED'
                : 'SIMULATION IN PROGRESS...'}
          </h2>
          <p style={{ fontSize: 14, color: '#786c5e', margin: 0, lineHeight: 1.5 }}>
            {isComplete
              ? 'Street-level hydraulic runoff and spatial inundation computed successfully.'
              : isFailed
                ? 'An error occurred during computational hydraulic execution.'
                : 'Downstream hydraulic wave propagation and spatial inundation computing...'}
          </p>
        </div>

        {/* Progress Bar Section */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: '#1a140e' }}>Estimated Progress</span>
            <span style={{ fontWeight: 800, color: '#1a140e' }}>{progressPercent}%</span>
          </div>
          <div style={{ height: 10, background: '#ebe4da', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: isFailed ? '#dc2626' : '#634B29',
              width: `${progressPercent}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Log / Step List Container */}
        <div style={{
          background: '#faf7f2',
          border: '1px solid #ebe4da',
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {PIPELINE_STEPS.map((step, idx) => {
            const matchedStage = stages.find(s => s.id === step.id);
            const isStepDone = isComplete || (matchedStage && matchedStage.status === 'done');
            const isStepRunning = !isComplete && matchedStage && matchedStage.status === 'running';

            return (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13.5, color: '#5c5245', fontWeight: 600 }}>
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isStepDone ? (
                    <CheckCircle size={18} color="#634B29" />
                  ) : isStepRunning ? (
                    <Loader2 size={18} color="#634B29" style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #d6cbc0' }} />
                  )}
                </div>
                <span style={{ color: isStepDone ? '#1a140e' : isStepRunning ? '#634B29' : '#786c5e' }}>
                  {step.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bottom Primary Button */}
        <button
          id="btn-view-floodmap"
          onClick={() => onNavigate('/flood-map')}
          disabled={!isComplete}
          style={{
            width: '100%',
            background: isComplete ? '#634B29' : '#d6cbc0',
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            padding: '14px 20px',
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            cursor: isComplete ? 'pointer' : 'not-allowed',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: isComplete ? '0 4px 12px rgba(99,75,41,0.25)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          VIEW FLOOD ANIMATION <ArrowRight size={16} />
        </button>

      </div>

    </div>
  );
}
