// ============================================================
//  Impact Engine — derives all impact stats from simulation results
//  Called via useMemo in FloodImpactPage — no separate backend needed
// ============================================================

const CELL_AREA_KM2 = 0.012; // each DEM cell ≈ 0.012 km²
const POP_DENSITY   = 5800;  // prototype urban density ppl/km² (labelled as estimate)

// Synthetic pilot zones derived from lat/lon bounds in the DEM grid
export const IMPACT_ZONES = [
  { name: 'T. Nagar',   minLat: 13.02, maxLat: 13.06, minLon: 80.22, maxLon: 80.28, district: 'Chennai', density: 7800 },
  { name: 'Anna Nagar', minLat: 13.06, maxLat: 13.10, minLon: 80.17, maxLon: 80.25, district: 'Chennai', density: 6200 },
  { name: 'Perambur',   minLat: 13.06, maxLat: 13.10, minLon: 80.25, maxLon: 80.32, district: 'Chennai', density: 5900 },
  { name: 'Adyar',      minLat: 12.95, maxLat: 13.01, minLon: 80.22, maxLon: 80.30, district: 'Chennai', density: 5400 },
  { name: 'Guindy',     minLat: 13.00, maxLat: 13.04, minLon: 80.18, maxLon: 80.25, district: 'Chennai', density: 4800 },
  { name: 'Velachery',  minLat: 12.95, maxLat: 13.01, minLon: 80.18, maxLon: 80.22, district: 'Chennai', density: 5100 },
  { name: 'Ambattur',   minLat: 13.07, maxLat: 13.11, minLon: 80.15, maxLon: 80.20, district: 'Chennai', density: 4200 },
];

function riskFromDepth(d) {
  if (d > 50) return 'CRITICAL';
  if (d > 30) return 'SEVERE';
  if (d > 15) return 'FLOODED';
  if (d > 5)  return 'WATCH';
  return 'SAFE';
}

/** Compute all impact metrics for a given forecast timestep */
export function computeImpact(floodResults, drainageResults, roadRiskResults, buildings, stepIdx) {
  const floodStep = floodResults?.[stepIdx] ?? [];

  // ── Flood extent ─────────────────────────────────────────
  const affectedCells = floodStep.filter(c => c.depth_cm > 5);
  const affectedArea  = +(affectedCells.length * CELL_AREA_KM2).toFixed(2);
  const maxDepth      = floodStep.length ? +Math.max(...floodStep.map(c => c.depth_cm)).toFixed(1) : 0;
  const avgDepth      = affectedCells.length
    ? +(affectedCells.reduce((s, c) => s + c.depth_cm, 0) / affectedCells.length).toFixed(1)
    : 0;

  // ── Population (prototype estimate) ──────────────────────
  const populationExposed = Math.round(affectedArea * POP_DENSITY);

  // ── Buildings (spatial overlap approximation) ─────────────
  const totalBuildings = buildings?.features?.length ?? 0;
  const affectedBuildingsPct = affectedCells.length / Math.max(floodStep.length, 1);
  const affectedBuildings    = Math.round(totalBuildings * affectedBuildingsPct * 1.3);
  const severeBuildings      = Math.round(affectedBuildings * 0.25);
  const criticalBuildings    = Math.round(affectedBuildings * 0.10);

  // ── Roads ────────────────────────────────────────────────
  const totalRoads    = roadRiskResults?.length ?? 0;
  const floodRiskRoads  = roadRiskResults?.filter(r => r.risk_key !== 'SAFE').length   ?? 0;
  const severeRoads     = roadRiskResults?.filter(r => r.risk_key === 'SEVERE').length  ?? 0;
  const criticalRoads   = roadRiskResults?.filter(r => r.risk_key === 'CRITICAL').length ?? 0;

  // ── Drainage ─────────────────────────────────────────────
  const drainageAtStep  = drainageResults?.map(n => n[stepIdx] ?? n[0]) ?? [];
  const overloadedNodes = drainageAtStep.filter(n => n.overloaded).length;
  const totalNodes      = drainageAtStep.length;

  // ── Risk breakdown (cells) ────────────────────────────────
  const riskBreakdown = { SAFE: 0, WATCH: 0, FLOODED: 0, SEVERE: 0, CRITICAL: 0 };
  floodStep.forEach(c => { riskBreakdown[c.risk_key] = (riskBreakdown[c.risk_key] ?? 0) + 1; });

  // ── Zone analysis ─────────────────────────────────────────
  const zones = IMPACT_ZONES.map(z => {
    const zoneCells     = floodStep.filter(c => c.lat >= z.minLat && c.lat <= z.maxLat && c.lon >= z.minLon && c.lon <= z.maxLon);
    const zoneAffected  = zoneCells.filter(c => c.depth_cm > 5);
    const zoneArea      = +(zoneAffected.length * CELL_AREA_KM2).toFixed(2);
    const zoneMaxDepth  = zoneCells.length ? +Math.max(...zoneCells.map(c => c.depth_cm)).toFixed(1) : 0;
    const zonePop       = Math.round(zoneArea * z.density);
    const zoneRisk      = riskFromDepth(zoneMaxDepth);
    return { ...z, affectedArea: zoneArea, maxDepth: zoneMaxDepth, populationExposed: zonePop, risk: zoneRisk };
  });

  // ── Infrastructure type (synthetic ratios) ────────────────
  const infra = {
    residentialBuildings:  Math.round(affectedBuildings * 0.68),
    commercialBuildings:   Math.round(affectedBuildings * 0.15),
    schools:               Math.round(affectedBuildings * 0.04),
    hospitalsClinicss:     Math.round(affectedBuildings * 0.02),
    majorRoads:            floodRiskRoads,
    bridgesFlyovers:       Math.round(floodRiskRoads * 0.12),
    substations:           Math.round(affectedBuildings * 0.01),
  };

  return {
    affectedArea,
    maxDepth,
    avgDepth,
    populationExposed,
    totalBuildings,
    affectedBuildings,
    severeBuildings,
    criticalBuildings,
    totalRoads,
    floodRiskRoads,
    severeRoads,
    criticalRoads,
    overloadedNodes,
    totalNodes,
    riskBreakdown,
    zones,
    infra,
  };
}

/** Build the 0–3 hour trend for the timeline chart */
export function buildTrend(floodResults, drainageResults) {
  if (!floodResults?.length) return [];
  const TIMES = ['T+0','T+30','T+60','T+90','T+120','T+150','T+180'];
  return floodResults.map((step, i) => {
    const affected = step.filter(c => c.depth_cm > 5);
    const maxD     = step.length ? +Math.max(...step.map(c => c.depth_cm)).toFixed(1) : 0;
    const area     = +(affected.length * CELL_AREA_KM2).toFixed(2);
    const pop      = Math.round(area * POP_DENSITY / 1000);
    const overload = drainageResults?.map(n => n[i] ?? n[0]).filter(n => n.overloaded).length ?? 0;
    return { time: TIMES[i] ?? `T+${i*30}`, area, maxDepth: maxD, pop, overloadedNodes: overload };
  });
}

/** Generate key findings from all steps */
export function generateFindings(trend, impact, step) {
  const findings = [];
  if (!trend?.length || !impact) return findings;

  const curr = trend[step];
  const prev = step > 0 ? trend[step - 1] : null;

  if (impact.maxDepth > 50)
    findings.push({ level: 'critical', text: `Critical flood depth of ${impact.maxDepth} cm predicted — emergency response recommended.` });
  if (impact.overloadedNodes > 0)
    findings.push({ level: 'warning', text: `Drainage capacity exceeded at ${impact.overloadedNodes} of ${impact.totalNodes} nodes — surcharge risk.` });
  if (prev && curr.area > prev.area)
    findings.push({ level: 'info', text: `Flood extent increased by ${(curr.area - prev.area).toFixed(2)} km² since ${trend[step-1].time}.` });
  if (impact.severeRoads > 0)
    findings.push({ level: 'warning', text: `${impact.severeRoads} roads at SEVERE risk and ${impact.criticalRoads} at CRITICAL — evacuation routes may be compromised.` });
  if (impact.affectedBuildings > 0)
    findings.push({ level: 'info', text: `Approximately ${impact.affectedBuildings.toLocaleString()} buildings in the flood-affected area — ${impact.severeBuildings} severely exposed.` });
  if (impact.populationExposed > 0)
    findings.push({ level: 'info', text: `Estimated ${impact.populationExposed.toLocaleString()} people in affected zone (prototype density estimate).` });

  return findings;
}
