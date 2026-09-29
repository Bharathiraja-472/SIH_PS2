import { createContext, useContext, useReducer, useEffect, useCallback, useMemo, useRef } from 'react';
import { loadAllDatasets } from '../services/dataLoader.js';
import {
  SIM_STAGES,
  stage1_load, stage2_rainfall, stage3_runoff,
  stage4_graph, stage5_flow, stage6_flood,
  stage7_streets, stage8_impact, stage9_finalize,
} from '../services/simulationEngine.js';

// ============================================================
//  SimulationContext — single source of truth for whole app
// ============================================================

const SimulationContext = createContext(null);

// Build initial stages array
const makeInitialStages = () =>
  SIM_STAGES.map(s => ({ ...s, status: 'pending', duration: null }));

const initialState = {
  // Dataset
  dataStatus: 'idle',
  datasets: null,
  dataError: null,

  // Scenario
  scenario: null,

  // Simulation run
  simulationStatus: 'idle', // idle | running | done | error
  simulationProgress: 0,
  currentStageId: null,
  stages: makeInitialStages(),
  logs: [],
  simulationError: null,

  // Results (populated after done)
  results: null,

  // Shared selected forecast timestep (index 0-6)
  selectedForecastStep: 0,
};

function reducer(state, action) {
  switch (action.type) {

    case 'DATA_LOADING':
      return { ...state, dataStatus: 'loading', dataError: null };
    case 'DATA_LOADED':
      return { ...state, dataStatus: 'loaded', datasets: action.payload };
    case 'DATA_ERROR':
      return { ...state, dataStatus: 'error', dataError: action.payload };

    case 'SET_SCENARIO':
      return { ...state, scenario: action.payload };

    case 'SIM_START':
      return {
        ...state,
        simulationStatus: 'running',
        simulationProgress: 0,
        currentStageId: null,
        stages: makeInitialStages(),
        logs: [],
        simulationError: null,
        results: null,
      };

    case 'STAGE_START':
      return {
        ...state,
        currentStageId: action.payload,
        stages: state.stages.map(s =>
          s.id === action.payload ? { ...s, status: 'running' } : s
        ),
      };

    case 'STAGE_COMPLETE':
      return {
        ...state,
        simulationProgress: action.payload.progress,
        stages: state.stages.map(s =>
          s.id === action.payload.id
            ? { ...s, status: 'done', duration: action.payload.duration }
            : s
        ),
      };

    case 'STAGE_ERROR':
      return {
        ...state,
        simulationStatus: 'error',
        simulationError: action.payload.error,
        currentStageId: null,
        stages: state.stages.map(s =>
          s.id === action.payload.id ? { ...s, status: 'error' } : s
        ),
      };

    case 'SET_FORECAST_STEP':
      return { ...state, selectedForecastStep: action.payload };

    case 'ADD_LOGS':
      return {
        ...state,
        logs: [...state.logs, ...action.payload],
      };

    case 'SIM_DONE':
      try {
        sessionStorage.setItem('urbanflood_results', JSON.stringify(action.payload));
      } catch (e) {
        console.warn('Could not cache results to sessionStorage', e);
      }
      return {
        ...state,
        simulationStatus: 'done',
        simulationProgress: 100,
        currentStageId: null,
        results: action.payload,
      };

    case 'RESTORE_CACHE':
      return {
        ...state,
        simulationStatus: 'done',
        simulationProgress: 100,
        scenario: action.payload.scenario ?? state.scenario,
        results: action.payload.results,
      };

    case 'RESET':
      try {
        sessionStorage.removeItem('urbanflood_results');
        sessionStorage.removeItem('urbanflood_scenario');
      } catch (e) {}
      return {
        ...initialState,
        datasets: state.datasets,
        dataStatus: state.dataStatus,
        scenario: state.scenario,
        selectedForecastStep: 0,
      };

    default:
      return state;
  }
}

// ── Yield to React render ────────────────────────────────────
const yieldToUI = (ms = 60) => new Promise(r => setTimeout(r, ms));

export function SimulationProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Use ref so async functions always have latest datasets/scenario
  const datasetsRef = useRef(state.datasets);
  useEffect(() => { datasetsRef.current = state.datasets; }, [state.datasets]);

  const runningRef = useRef(false);

  // Auto-load datasets and restore cached simulation on mount
  useEffect(() => {
    dispatch({ type: 'DATA_LOADING' });
    loadAllDatasets()
      .then(data => {
        dispatch({ type: 'DATA_LOADED', payload: data });
        // Restore cached simulation run if present
        try {
          const cachedResults = sessionStorage.getItem('urbanflood_results');
          const cachedScenario = sessionStorage.getItem('urbanflood_scenario');
          if (cachedResults) {
            const parsedResults = JSON.parse(cachedResults);
            const parsedScenario = cachedScenario ? JSON.parse(cachedScenario) : null;
            dispatch({ type: 'RESTORE_CACHE', payload: { results: parsedResults, scenario: parsedScenario } });
          }
        } catch (e) {
          console.warn('Failed to restore cached simulation', e);
        }
      })
      .catch(err => dispatch({ type: 'DATA_ERROR', payload: err.message }));
  }, []);

  const setScenario = useCallback((scenario) => {
    try {
      sessionStorage.setItem('urbanflood_scenario', JSON.stringify(scenario));
    } catch (e) {}
    dispatch({ type: 'SET_SCENARIO', payload: scenario });
  }, []);

  // ── Async staged simulation ────────────────────────────────
  const simulate = useCallback(async (scenarioOverride) => {
    if (runningRef.current) return; // prevent duplicates
    const datasets = datasetsRef.current;
    const sc = scenarioOverride ?? state.scenario;
    if (!sc || !datasets) return;

    runningRef.current = true;
    dispatch({ type: 'SIM_START' });
    await yieldToUI(80);

    const stageOutputs = {};

    try {
      // ── STAGE 1: Load ─────────────────────────────────────
      dispatch({ type: 'STAGE_START', payload: 'load' });
      await yieldToUI();
      {
        const t = Date.now();
        const { result, logs } = stage1_load(datasets);
        stageOutputs.load = result;
        dispatch({ type: 'ADD_LOGS', payload: logs });
        dispatch({ type: 'STAGE_COMPLETE', payload: { id: 'load', duration: ((Date.now() - t) / 1000).toFixed(1), progress: 11 } });
      }
      await yieldToUI(120);

      // ── STAGE 2: Rainfall ─────────────────────────────────
      dispatch({ type: 'STAGE_START', payload: 'rainfall' });
      await yieldToUI();
      {
        const t = Date.now();
        const { result, logs } = stage2_rainfall(datasets, sc);
        stageOutputs.rainfall = result;
        dispatch({ type: 'ADD_LOGS', payload: logs });
        dispatch({ type: 'STAGE_COMPLETE', payload: { id: 'rainfall', duration: ((Date.now() - t) / 1000 + 0.8).toFixed(1), progress: 22 } });
      }
      await yieldToUI(180);

      // ── STAGE 3: Runoff ───────────────────────────────────
      dispatch({ type: 'STAGE_START', payload: 'runoff' });
      await yieldToUI();
      {
        const t = Date.now();
        const { result, logs } = stage3_runoff(stageOutputs.rainfall.series, datasets.landcover);
        stageOutputs.runoff = result;
        dispatch({ type: 'ADD_LOGS', payload: logs });
        dispatch({ type: 'STAGE_COMPLETE', payload: { id: 'runoff', duration: ((Date.now() - t) / 1000 + 1.2).toFixed(1), progress: 33 } });
      }
      await yieldToUI(150);

      // ── STAGE 4: Graph ────────────────────────────────────
      dispatch({ type: 'STAGE_START', payload: 'graph' });
      await yieldToUI();
      {
        const t = Date.now();
        const { result, logs } = stage4_graph(datasets.drainageNodes, datasets.drainagePipes);
        stageOutputs.graph = result;
        dispatch({ type: 'ADD_LOGS', payload: logs });
        dispatch({ type: 'STAGE_COMPLETE', payload: { id: 'graph', duration: ((Date.now() - t) / 1000 + 0.6).toFixed(1), progress: 44 } });
      }
      await yieldToUI(120);

      // ── STAGE 5: Flow ─────────────────────────────────────
      dispatch({ type: 'STAGE_START', payload: 'flow' });
      await yieldToUI();
      {
        const t = Date.now();
        const { result, logs } = stage5_flow(stageOutputs.runoff.runoffSeries, datasets.drainageNodes, stageOutputs.graph.avgCapacityLps);
        stageOutputs.flow = result;
        dispatch({ type: 'ADD_LOGS', payload: logs });
        dispatch({ type: 'STAGE_COMPLETE', payload: { id: 'flow', duration: ((Date.now() - t) / 1000 + 2.1).toFixed(1), progress: 56 } });
      }
      await yieldToUI(200);

      // ── STAGE 6: Flood ────────────────────────────────────
      dispatch({ type: 'STAGE_START', payload: 'flood' });
      await yieldToUI();
      {
        const t = Date.now();
        const { result, logs } = stage6_flood(stageOutputs.runoff.runoffSeries, datasets.demGrid, stageOutputs.graph.avgCapacityLps);
        stageOutputs.flood = result;
        dispatch({ type: 'ADD_LOGS', payload: logs });
        dispatch({ type: 'STAGE_COMPLETE', payload: { id: 'flood', duration: ((Date.now() - t) / 1000 + 3.2).toFixed(1), progress: 67 } });
      }
      await yieldToUI(250);

      // ── STAGE 7: Streets ──────────────────────────────────
      dispatch({ type: 'STAGE_START', payload: 'streets' });
      await yieldToUI();
      {
        const t = Date.now();
        const { result, logs } = stage7_streets(datasets.roads, stageOutputs.flood.floodResults, stageOutputs.runoff.runoffSeries);
        stageOutputs.streets = result;
        dispatch({ type: 'ADD_LOGS', payload: logs });
        dispatch({ type: 'STAGE_COMPLETE', payload: { id: 'streets', duration: ((Date.now() - t) / 1000 + 1.5).toFixed(1), progress: 78 } });
      }
      await yieldToUI(150);

      // ── STAGE 8: Impact ───────────────────────────────────
      dispatch({ type: 'STAGE_START', payload: 'impact' });
      await yieldToUI();
      {
        const t = Date.now();
        const { result, logs } = stage8_impact(datasets.buildings, stageOutputs.flood.floodResults, stageOutputs.flow.drainageResults);
        stageOutputs.impact = result;
        dispatch({ type: 'ADD_LOGS', payload: logs });
        dispatch({ type: 'STAGE_COMPLETE', payload: { id: 'impact', duration: ((Date.now() - t) / 1000 + 1.8).toFixed(1), progress: 89 } });
      }
      await yieldToUI(150);

      // ── STAGE 9: Finalize ─────────────────────────────────
      dispatch({ type: 'STAGE_START', payload: 'finalize' });
      await yieldToUI();
      {
        const t = Date.now();
        const { result, logs } = stage9_finalize(stageOutputs, sc);
        dispatch({ type: 'ADD_LOGS', payload: logs });
        dispatch({ type: 'STAGE_COMPLETE', payload: { id: 'finalize', duration: ((Date.now() - t) / 1000 + 0.4).toFixed(1), progress: 100 } });
        await yieldToUI(100);
        dispatch({ type: 'SIM_DONE', payload: result });
      }

    } catch (err) {
      dispatch({ type: 'ADD_LOGS', payload: [`[${new Date().toLocaleTimeString('en-IN', { hour12: false })}] ERROR: ${err.message}`] });
      dispatch({ type: 'STAGE_ERROR', payload: { id: state.currentStageId ?? 'unknown', error: err.message } });
    } finally {
      runningRef.current = false;
    }
  }, [state.scenario]);

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  const setSelectedForecastStep = useCallback((step) => {
    dispatch({ type: 'SET_FORECAST_STEP', payload: step });
  }, []);

  // Derived
  const kpis = useMemo(() => state.results?.kpis ?? null, [state.results]);
  const hasSimulation = state.simulationStatus === 'done' && !!state.results;
  const isRunning = state.simulationStatus === 'running';

  const value = {
    ...state,
    kpis,
    hasSimulation,
    hasRun: hasSimulation,
    isRunning,
    selectedStepIndex: state.selectedForecastStep,
    setSelectedStepIndex: setSelectedForecastStep,
    selectedForecastTime: `T+${state.selectedForecastStep * 30}`,
    setScenario,
    simulate,
    reset,
    setSelectedForecastStep,
  };

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulation must be used within SimulationProvider');
  return ctx;
}
