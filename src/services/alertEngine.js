// ============================================================
//  Alert Engine — Generates early warning alerts from simulation results
//  Called by HazardAlertsPage — zero static backend required
// ============================================================

const TIMESTEPS = ['T+0', 'T+30', 'T+60', 'T+90', 'T+120', 'T+150', 'T+180'];

export function generateAlerts(simulationResults, datasets, stepFilter = 'ALL') {
  if (!simulationResults || !simulationResults.floodResults) {
    return [];
  }

  const { floodResults, drainageResults, roadRiskResults } = simulationResults;
  const alerts = [];
  let alertId = 1;

  // Determine steps to scan
  const stepsToScan = stepFilter === 'ALL'
    ? [0, 1, 2, 3, 4, 5, 6]
    : [typeof stepFilter === 'number' ? stepFilter : 0];

  stepsToScan.forEach(stepIdx => {
    const tLabel = TIMESTEPS[stepIdx] ?? `T+${stepIdx * 30}`;
    const cells = floodResults[stepIdx] ?? [];
    const prevCells = stepIdx > 0 ? (floodResults[stepIdx - 1] ?? []) : [];

    // 1. FLOOD DEPTH ALERTS (From DEM flood grid)
    const severeCells = cells.filter(c => c.depth_cm > 15);
    if (severeCells.length > 0) {
      // Find peak cell
      const maxCell = severeCells.reduce((m, c) => c.depth_cm > m.depth_cm ? c : m, severeCells[0]);

      let severity = 'WARNING';
      if (maxCell.depth_cm > 50) severity = 'CRITICAL';
      else if (maxCell.depth_cm > 30) severity = 'SEVERE';

      alerts.push({
        id: `ALT-FD-${alertId++}`,
        title: `${severity === 'CRITICAL' ? 'Critical' : severity === 'SEVERE' ? 'Severe' : 'Moderate'} Surface Inundation`,
        category: 'FLOOD_DEPTH',
        severity,
        location: `Chennai Zone (${maxCell.lat.toFixed(3)}°N, ${maxCell.lon.toFixed(3)}°E)`,
        lat: maxCell.lat,
        lng: maxCell.lon,
        depth_cm: maxCell.depth_cm,
        timestep: tLabel,
        stepIdx,
        triggerCondition: `Predicted water depth reached ${(maxCell.depth_cm / 100).toFixed(2)}m (${maxCell.depth_cm} cm)`,
        operatorAttention: `Monitor surface runoff accumulation and inspect low-lying roadway subways in this sector.`,
        status: 'ACTIVE',
      });
    }

    // 2. RAPID FLOOD RISE ALERTS
    if (stepIdx > 0 && prevCells.length > 0 && cells.length > 0) {
      // Check for rapid increase between timesteps
      let maxDiff = 0;
      let diffCell = null;

      cells.forEach((c, idx) => {
        const prev = prevCells[idx];
        if (prev) {
          const diff = c.depth_cm - prev.depth_cm;
          if (diff > maxDiff) {
            maxDiff = diff;
            diffCell = c;
          }
        }
      });

      if (maxDiff >= 15 && diffCell) {
        alerts.push({
          id: `ALT-RR-${alertId++}`,
          title: `Rapid Water Level Surge (+${maxDiff.toFixed(0)} cm / 30m)`,
          category: 'RAPID_RISE',
          severity: 'CRITICAL',
          location: `Runoff Corridor (${diffCell.lat.toFixed(3)}°N, ${diffCell.lon.toFixed(3)}°E)`,
          lat: diffCell.lat,
          lng: diffCell.lon,
          depth_cm: diffCell.depth_cm,
          timestep: tLabel,
          stepIdx,
          triggerCondition: `Water level rising rapidly by ${maxDiff.toFixed(0)} cm within a 30-minute interval.`,
          operatorAttention: `Issue rapid inundation warning for ground-level facilities in the immediate runoff flow path.`,
          status: 'ACTIVE',
        });
      }
    }

    // 3. DRAINAGE SURCHARGE / OVERLOAD ALERTS
    if (drainageResults && drainageResults.length > 0) {
      drainageResults.forEach((nodeTimeline, nodeIdx) => {
        const nodeState = nodeTimeline[stepIdx];
        if (!nodeState) return;

        const dNode = datasets?.drainageNodes?.[nodeIdx];
        const lat = dNode?.latitude ?? nodeState.lat ?? 13.04;
        const lng = dNode?.longitude ?? nodeState.lon ?? 80.23;
        const utilPct = nodeState.util_pct ?? nodeState.utilization_pct ?? 0;
        const capLps = nodeState.capacity_lps ?? dNode?.capacity_lps ?? 300;
        const loadLps = nodeState.load_lps ?? 0;

        if (utilPct >= 100 || nodeState.overloaded) {
          alerts.push({
            id: `ALT-DR-${alertId++}`,
            title: `Drainage System Surcharge at Node ${nodeState.node_id}`,
            category: 'DRAINAGE',
            severity: 'CRITICAL',
            location: `Drainage Node ${nodeState.node_id}`,
            node_id: nodeState.node_id,
            lat,
            lng,
            timestep: tLabel,
            stepIdx,
            utilization_pct: utilPct,
            capacity_lps: capLps,
            load_lps: loadLps,
            surcharge_lps: nodeState.surcharge_lps ?? Math.round((loadLps - capLps) * 0.5),
            triggerCondition: `Drainage capacity exceeded (${utilPct}% utilization, simulated load ${loadLps} L/s vs design capacity ${capLps} L/s).`,
            operatorAttention: `Inspect trunk outfall channel for backflow or hydraulic bottlenecking near node ${nodeState.node_id}.`,
            status: 'ACTIVE',
          });
        } else if (utilPct >= 85) {
          alerts.push({
            id: `ALT-DR-${alertId++}`,
            title: `High Drainage Capacity Strain — Node ${nodeState.node_id}`,
            category: 'DRAINAGE',
            severity: 'WARNING',
            location: `Drainage Node ${nodeState.node_id}`,
            node_id: nodeState.node_id,
            lat,
            lng,
            timestep: tLabel,
            stepIdx,
            utilization_pct: utilPct,
            capacity_lps: capLps,
            load_lps: loadLps,
            surcharge_lps: 0,
            triggerCondition: `Drainage node operating at ${utilPct}% design capacity (${loadLps} L/s flow).`,
            operatorAttention: `Monitor downstream culverts and clear potential debris around outfall grates.`,
            status: 'ACTIVE',
          });
        }
      });
    }

    // 4. ROAD FLOODING ALERTS
    if (roadRiskResults && roadRiskResults.length > 0) {
      roadRiskResults.forEach(r => {
        const depthCm = r.depth_cm ?? Math.round((r.depth_m ?? 0.2) * 100);
        if (depthCm > 30) {
          alerts.push({
            id: `ALT-RD-${alertId++}`,
            title: `Severe Road Inundation: ${r.name || r.road_id}`,
            category: 'ROAD_RISK',
            severity: 'SEVERE',
            location: r.name || r.road_id,
            lat: r.lat ?? 13.04,
            lng: r.lon ?? 80.22,
            depth_cm: depthCm,
            timestep: tLabel,
            stepIdx,
            triggerCondition: `Roadway water depth is ${depthCm} cm (exceeds 30 cm safe vehicle threshold).`,
            operatorAttention: `Advise traffic management and reroute transit along designated safe elevated corridors.`,
            status: 'ACTIVE',
          });
        } else if (depthCm > 15) {
          alerts.push({
            id: `ALT-RD-${alertId++}`,
            title: `Roadway Water Caution: ${r.name || r.road_id}`,
            category: 'ROAD_RISK',
            severity: 'WARNING',
            location: r.name || r.road_id,
            lat: r.lat ?? 13.04,
            lng: r.lon ?? 80.22,
            depth_cm: depthCm,
            timestep: tLabel,
            stepIdx,
            triggerCondition: `Roadway water accumulation is ${depthCm} cm.`,
            operatorAttention: `Post electronic caution advisories for light motor vehicles.`,
            status: 'ACTIVE',
          });
        }
      });
    }
  });

  return alerts;
}

export function computeAlertSummary(alerts) {
  const critical = alerts.filter(a => a.severity === 'CRITICAL').length;
  const severe   = alerts.filter(a => a.severity === 'SEVERE').length;
  const warning  = alerts.filter(a => a.severity === 'WARNING').length;
  const info     = alerts.filter(a => a.severity === 'INFO').length;

  return {
    total: alerts.length,
    critical,
    severe,
    warning,
    info,
  };
}
