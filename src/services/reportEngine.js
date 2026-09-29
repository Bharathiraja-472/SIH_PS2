// ============================================================
//  Report Engine — Aggregates simulation data and handles client exports
// ============================================================

import { computeImpact } from './impactEngine.js';
import { generateAlerts, computeAlertSummary } from './alertEngine.js';

const TIMESTEPS = ['T+0', 'T+30', 'T+60', 'T+90', 'T+120', 'T+150', 'T+180'];

export function generateReportData(simulationResults, datasets, stepIdx = 4, title = 'Urban Flood Nowcast Report') {
  if (!simulationResults || !simulationResults.floodResults) {
    return null;
  }

  const { floodResults, drainageResults, roadRiskResults, scenario, kpis } = simulationResults;
  const tLabel = TIMESTEPS[stepIdx] ?? `T+${stepIdx * 30}`;

  // 1. Impact metrics
  const impact = computeImpact(floodResults, drainageResults, roadRiskResults, datasets?.buildings, stepIdx);

  // 2. Alert metrics
  const alerts = generateAlerts(simulationResults, datasets, stepIdx);
  const alertSummary = computeAlertSummary(alerts);

  // 3. Drainage summary
  const drainageAtStep = drainageResults?.map(n => n[stepIdx] ?? n[0]) ?? [];
  const overloadedCount = drainageAtStep.filter(n => n.overloaded).length;
  const avgUtil = drainageAtStep.length
    ? +(drainageAtStep.reduce((s, n) => s + (n.utilization_pct ?? 0), 0) / drainageAtStep.length).toFixed(1)
    : 0;

  // 4. Dynamic Executive Summary
  const execSummary = `The simulation for ${tLabel} indicates significant urban flooding in low-lying areas of Chennai metropolitan region. A total of ${impact.affectedArea} km² is predicted to be affected with a maximum flood depth of ${impact.maxDepth} cm. About ${impact.populationExposed.toLocaleString()} people may be exposed to flood inundation across ${impact.affectedBuildings} structures. Critical action is required in ${alertSummary.critical} high-risk sectors.`;

  // 5. Key Findings
  const keyFindings = [
    `Flooding concentrated in low-lying sectors: T. Nagar, Perambur, and Velachery.`,
    `Drainage network operating at ${avgUtil}% average utilization with ${overloadedCount} nodes overloaded (>100% capacity).`,
    `${impact.floodRiskRoads} major roads predicted to experience inundation > 15 cm depth.`,
    `~${impact.affectedBuildings.toLocaleString()} buildings and ~${impact.populationExposed.toLocaleString()} residents exposed to surface runoff.`,
    `Peak flood extent predicted to reach maximum intensity by T+120 minutes.`,
  ];

  return {
    meta: {
      title,
      region: 'Chennai Metropolitan Region',
      forecastTime: tLabel,
      stepIdx,
      generatedAt: new Date().toLocaleString('en-IN'),
      version: 'Prototype v1.0',
      system: 'UrbanFlood-X Nowcasting System',
      problem: 'SIH 26085',
      dataset: 'Prototype / Synthetic',
    },
    kpis: {
      affectedAreaKm2: impact.affectedArea,
      populationExposed: impact.populationExposed,
      maxDepthCm: impact.maxDepth,
      affectedBuildings: impact.affectedBuildings,
      floodRiskRoads: impact.floodRiskRoads,
      overloadedNodes: overloadedCount,
      totalNodes: drainageAtStep.length,
      criticalAlerts: alertSummary.critical,
      totalAlerts: alerts.length,
    },
    execSummary,
    keyFindings,
    alerts,
    impact,
  };
}

// ── Export CSV Utilities ───────────────────────────────────────
export function exportCSV(simulationResults, filename = 'UrbanFloodX_Simulation_Results.csv') {
  if (!simulationResults || !simulationResults.floodResults) return;

  const rows = [];
  rows.push(['Timestep', 'Cell_ID', 'Latitude', 'Longitude', 'Depth_CM', 'Risk_Level']);

  simulationResults.floodResults.forEach((stepCells, stepIdx) => {
    const tLabel = TIMESTEPS[stepIdx] ?? `T+${stepIdx * 30}`;
    stepCells.forEach(c => {
      rows.push([tLabel, c.cell_id, c.lat, c.lon, c.depth_cm, c.risk_key]);
    });
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Export GeoJSON Utilities ──────────────────────────────────
export function exportGeoJSON(simulationResults, stepIdx = 4, filename = 'UrbanFloodX_Flood_Extent.geojson') {
  if (!simulationResults || !simulationResults.floodResults) return;

  const cells = simulationResults.floodResults[stepIdx] ?? [];
  const geojson = {
    type: 'FeatureCollection',
    features: cells.map(c => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      properties: {
        cell_id: c.cell_id,
        depth_cm: c.depth_cm,
        risk_key: c.risk_key,
      },
    })),
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(geojson, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Export PDF / Print ────────────────────────────────────────
export function exportPDF() {
  window.print();
}
