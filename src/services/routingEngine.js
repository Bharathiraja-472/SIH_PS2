// ============================================================
//  Routing Engine — Flood-aware shortest path (Dijkstra / A*)
//  Constructs connected road graph from GeoJSON and calculates safe routes
// ============================================================

import { ROUTING_OBJECTIVES } from '../config/routingConfig.js';

// ── Haversine Distance in Kilometers ────────────────────────────
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Key Helper to Snap Nearby Intersections into Shared Graph Nodes ──
function makeNodeId(lat, lon) {
  const snappedLat = (Math.round(lat * 250) / 250).toFixed(4);
  const snappedLon = (Math.round(lon * 250) / 250).toFixed(4);
  return `${snappedLat},${snappedLon}`;
}

// ── Build Connected Road Graph from GeoJSON ───────────────────────
export function buildRoadGraph(roadsGeoJSON, roadRiskResults = []) {
  const nodes = {};
  const edges = [];
  const roadRiskMap = {};

  // Index road risks by road_id or index
  roadRiskResults.forEach((r, idx) => {
    const key = r.road_id ?? `R${idx + 1}`;
    roadRiskMap[key] = r;
  });

  const features = roadsGeoJSON?.features ?? [];

  features.forEach((feat, featIdx) => {
    const roadId = feat.properties?.road_id ?? feat.id ?? `R${featIdx + 1}`;
    const roadName = feat.properties?.road_name ?? feat.properties?.name ?? `Road ${featIdx + 1}`;
    const coords = feat.geometry?.coordinates ?? [];

    if (coords.length < 2) return;

    const riskInfo = roadRiskMap[roadId] ?? {
      depth_cm: 0,
      risk_key: 'SAFE',
    };

    for (let i = 0; i < coords.length; i++) {
      const [lon, lat] = coords[i];
      const nodeId = makeNodeId(lat, lon);

      if (!nodes[nodeId]) {
        nodes[nodeId] = { id: nodeId, lat, lon, neighbors: [] };
      }

      if (i > 0) {
        const [prevLon, prevLat] = coords[i - 1];
        const prevNodeId = makeNodeId(prevLat, prevLon);
        const distKm = Math.max(0.1, haversineDistance(prevLat, prevLon, lat, lon));

        const edgeObj = {
          roadId,
          roadName,
          from: prevNodeId,
          to: nodeId,
          distanceKm: distKm,
          depth_cm: riskInfo.depth_cm ?? 0,
          risk_key: riskInfo.risk_key ?? 'SAFE',
          coords: [[prevLon, prevLat], [lon, lat]],
        };

        edges.push(edgeObj);
        nodes[prevNodeId].neighbors.push({ target: nodeId, edge: edgeObj });
        nodes[nodeId].neighbors.push({ target: prevNodeId, edge: edgeObj });
      }
    }
  });

  // Cross-connect close graph nodes to ensure 100% graph connectivity
  const nodeList = Object.values(nodes);
  for (let i = 0; i < nodeList.length; i++) {
    for (let j = i + 1; j < nodeList.length; j++) {
      const n1 = nodeList[i];
      const n2 = nodeList[j];
      const dist = haversineDistance(n1.lat, n1.lon, n2.lat, n2.lon);

      if (dist <= 1.8) {
        // Connect if not already connected
        const alreadyConnected = n1.neighbors.some(nb => nb.target === n2.id);
        if (!alreadyConnected) {
          const connectorEdge = {
            roadId: `CONN-${n1.id}-${n2.id}`,
            roadName: `Connecting Street Corridor`,
            from: n1.id,
            to: n2.id,
            distanceKm: Math.max(0.15, dist),
            depth_cm: 0,
            risk_key: 'SAFE',
            coords: [[n1.lon, n1.lat], [n2.lon, n2.lat]],
          };
          edges.push(connectorEdge);
          n1.neighbors.push({ target: n2.id, edge: connectorEdge });
          n2.neighbors.push({ target: n1.id, edge: connectorEdge });
        }
      }
    }
  }

  return { nodes, edges, roadRiskMap };
}

// ── Find Nearest Graph Node to a Location ─────────────────────
export function findNearestNode(nodes, lat, lng) {
  let nearest = null;
  let minDist = Infinity;

  Object.values(nodes).forEach(n => {
    const d = haversineDistance(lat, lng, n.lat, n.lon);
    if (d < minDist) {
      minDist = d;
      nearest = n;
    }
  });

  return nearest;
}

// ── Dijkstra's Algorithm for Shortest / Least-Risk Path ───────
export function dijkstraRoute(graph, startNodeId, destNodeId, objectiveKey = 'FLOOD_SAFETY') {
  const { nodes } = graph;
  const objective = ROUTING_OBJECTIVES[objectiveKey] ?? ROUTING_OBJECTIVES.FLOOD_SAFETY;
  const multipliers = objective.multipliers;

  if (!nodes[startNodeId] || !nodes[destNodeId]) {
    return null;
  }

  const distances = {};
  const previous = {};
  const unvisited = new Set();

  Object.keys(nodes).forEach(id => {
    distances[id] = Infinity;
    previous[id] = null;
    unvisited.add(id);
  });

  distances[startNodeId] = 0;

  while (unvisited.size > 0) {
    let currentNodeId = null;
    let minD = Infinity;

    unvisited.forEach(id => {
      if (distances[id] < minD) {
        minD = distances[id];
        currentNodeId = id;
      }
    });

    if (currentNodeId === null || distances[currentNodeId] === Infinity) {
      break;
    }

    if (currentNodeId === destNodeId) {
      break;
    }

    unvisited.delete(currentNodeId);

    const currNode = nodes[currentNodeId];
    currNode.neighbors.forEach(({ target, edge }) => {
      if (!unvisited.has(target)) return;

      const riskMult = multipliers[edge.risk_key] ?? 1.0;
      const weight = edge.distanceKm * riskMult;

      const alt = distances[currentNodeId] + weight;
      if (alt < distances[target]) {
        distances[target] = alt;
        previous[target] = { nodeId: currentNodeId, edge };
      }
    });
  }

  if (distances[destNodeId] === Infinity) {
    return null;
  }

  const pathEdges = [];
  const pathCoords = [];
  let curr = destNodeId;

  while (previous[curr]) {
    const prev = previous[curr];
    pathEdges.unshift(prev.edge);
    const nodeObj = nodes[curr];
    pathCoords.unshift([nodeObj.lon, nodeObj.lat]);
    curr = prev.nodeId;
  }

  const startNodeObj = nodes[startNodeId];
  pathCoords.unshift([startNodeObj.lon, startNodeObj.lat]);

  return {
    edges: pathEdges,
    coords: pathCoords,
    totalWeightedCost: distances[destNodeId],
  };
}

// ── Calculate Route Summary Metrics ───────────────────────────
export function computeRouteMetrics(routeResult, graph, startName, destName) {
  if (!routeResult || !routeResult.edges || routeResult.edges.length === 0) {
    return null;
  }

  const edges = routeResult.edges;
  let totalDistanceKm = 0;
  let maxDepthCm = 0;
  let floodedCount = 0;
  let severeCount = 0;
  let criticalCount = 0;

  const riskDist = { SAFE: 0, WATCH: 0, FLOODED: 0, SEVERE: 0, CRITICAL: 0 };
  const avoidedRoads = [];
  const usedRoadIds = new Set(edges.map(e => e.roadId));

  edges.forEach((e) => {
    totalDistanceKm += e.distanceKm;
    if (e.depth_cm > maxDepthCm) maxDepthCm = e.depth_cm;

    riskDist[e.risk_key] = (riskDist[e.risk_key] ?? 0) + e.distanceKm;

    if (e.risk_key === 'FLOODED') floodedCount++;
    if (e.risk_key === 'SEVERE') severeCount++;
    if (e.risk_key === 'CRITICAL') criticalCount++;
  });

  // Calculate Avoided High-Risk Road Segments
  Object.values(graph.roadRiskMap || {}).forEach((r, idx) => {
    if (!usedRoadIds.has(r.road_id) && (r.risk_key === 'SEVERE' || r.risk_key === 'CRITICAL' || r.risk_key === 'FLOODED')) {
      avoidedRoads.push({
        id: idx + 1,
        name: r.name ?? r.road_id,
        reason: r.risk_key === 'CRITICAL' ? 'Flooded / Blocked' : `${r.risk_key} Risk`,
        depthCm: r.depth_cm,
        riskKey: r.risk_key,
      });
    }
  });

  // Estimated Travel Time (urban base speed 30 km/h + 2 min delay per flooded edge)
  const baseMinutes = (totalDistanceKm / 30) * 60;
  const delayMinutes = (floodedCount * 1.5) + (severeCount * 3.0) + (criticalCount * 6.0);
  const estimatedTimeMin = Math.round(baseMinutes + delayMinutes);

  // Route Risk Classification
  let overallRisk = 'LOW';
  if (criticalCount > 0 || maxDepthCm > 50) overallRisk = 'CRITICAL';
  else if (severeCount > 0 || maxDepthCm > 30) overallRisk = 'HIGH';
  else if (floodedCount > 0 || maxDepthCm > 15) overallRisk = 'MODERATE';

  return {
    totalDistanceKm: +totalDistanceKm.toFixed(2),
    estimatedTimeMin: Math.max(3, estimatedTimeMin),
    maxDepthCm,
    floodedCount,
    severeCount,
    criticalCount,
    overallRisk,
    riskDist,
    avoidedRoads: avoidedRoads.slice(0, 5),
    geoJsonFeature: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: routeResult.coords,
      },
      properties: {
        distanceKm: +totalDistanceKm.toFixed(2),
        overallRisk,
      },
    },
  };
}

// ── Master Calculate Function ─────────────────────────────────
export function calculateFloodAwareRoutes(roadsGeoJSON, roadRiskResults, startCoord, destCoord, objectiveKey = 'FLOOD_SAFETY') {
  if (!roadsGeoJSON || !startCoord || !destCoord) {
    return { safeRoute: null, normalRoute: null, graph: null };
  }

  const graph = buildRoadGraph(roadsGeoJSON, roadRiskResults);
  const startNode = findNearestNode(graph.nodes, startCoord.lat ?? startCoord.lng, startCoord.lng ?? startCoord.lon);
  const destNode = findNearestNode(graph.nodes, destCoord.lat ?? destCoord.lng, destCoord.lng ?? destCoord.lon);

  if (!startNode || !destNode) {
    return { safeRoute: null, normalRoute: null, graph };
  }

  // 1. Calculate Recommended Flood-Safe Route
  const safePath = dijkstraRoute(graph, startNode.id, destNode.id, objectiveKey);
  const safeMetrics = computeRouteMetrics(safePath, graph, startCoord.name || 'Start', destCoord.name || 'Destination');

  // 2. Calculate Normal / Shortest Route (ignoring flood penalties)
  const normalPath = dijkstraRoute(graph, startNode.id, destNode.id, 'SHORTEST');
  const normalMetrics = computeRouteMetrics(normalPath, graph, startCoord.name || 'Start', destCoord.name || 'Destination');

  return {
    safeRoute: safeMetrics,
    normalRoute: normalMetrics,
    graph,
    startNode,
    destNode,
  };
}
