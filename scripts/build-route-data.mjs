#!/usr/bin/env node
/**
 * Regenerates src/data/tokaido-route.json from OpenStreetMap.
 *
 * Source: OSM relation 5263977 ("東海道新幹線", route=railway, operator=東海旅客鉄道).
 *         https://www.openstreetmap.org/relation/5263977
 *         Data © OpenStreetMap contributors, licensed under the ODbL.
 *
 * The relation contains every track of the line (both directions plus station
 * throats and sidings), so a single running alignment is recovered by taking the
 * shortest path through the way graph from 東京 to 新大阪. The result comes out at
 * 515.2 km, which matches the published 実キロ of 515.4 km.
 *
 * Usage: pnpm data:route
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const RELATION_ID = 5263977;
const OVERPASS_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'dynamic-spoof-geolocation/2.0 (route data build script)';

/** Stations of the 東海道新幹線, in 下り (Tokyo → Shin-Osaka) order. */
const STATIONS = [
  ['東京', 'Tokyo'],
  ['品川', 'Shinagawa'],
  ['新横浜', 'Shin-Yokohama'],
  ['小田原', 'Odawara'],
  ['熱海', 'Atami'],
  ['三島', 'Mishima'],
  ['新富士', 'Shin-Fuji'],
  ['静岡', 'Shizuoka'],
  ['掛川', 'Kakegawa'],
  ['浜松', 'Hamamatsu'],
  ['豊橋', 'Toyohashi'],
  ['三河安城', 'Mikawa-Anjo'],
  ['名古屋', 'Nagoya'],
  ['岐阜羽島', 'Gifu-Hashima'],
  ['米原', 'Maibara'],
  ['京都', 'Kyoto'],
  ['新大阪', 'Shin-Osaka'],
];

/** Rough anchors used only to pick the graph endpoints for the shortest path. */
const TOKYO_ANCHOR = [35.680963, 139.767986];
const SHIN_OSAKA_ANCHOR = [34.733539, 135.500189];

/** Douglas–Peucker tolerance, in metres. 1 m is far below GPS noise. */
const SIMPLIFY_TOLERANCE_M = 1;

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg) => (deg * Math.PI) / 180;

function haversine(a, b) {
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLat = lat2 - lat1;
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

async function overpass(query) {
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.startsWith('{')) throw new Error(text.slice(0, 200));
      console.log(`  fetched from ${endpoint}`);
      return JSON.parse(text);
    } catch (err) {
      lastError = err;
      console.warn(`  ${endpoint} failed: ${err.message}`);
    }
  }
  throw lastError;
}

/** Shortest path through the relation's way graph, as a list of [lat, lon]. */
function buildAlignment(relation) {
  const ways = relation.members.filter(
    (m) => m.type === 'way' && !m.role && m.geometry?.length >= 2,
  );
  const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const graph = new Map();
  const addEdge = (from, to, length, geometry) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push({ to, length, geometry });
  };

  for (const way of ways) {
    const geometry = way.geometry.map((p) => [p.lat, p.lon]);
    let length = 0;
    for (let i = 0; i < geometry.length - 1; i++) {
      length += haversine(geometry[i], geometry[i + 1]);
    }
    const a = key(way.geometry[0]);
    const b = key(way.geometry.at(-1));
    addEdge(a, b, length, geometry);
    addEdge(b, a, length, [...geometry].reverse());
  }

  const nodes = [...graph.keys()];
  const coordOf = (k) => k.split(',').map(Number);
  const nearest = (target) =>
    nodes.reduce((best, k) =>
      haversine(coordOf(k), target) < haversine(coordOf(best), target) ? k : best,
    );

  const source = nearest(TOKYO_ANCHOR);
  const target = nearest(SHIN_OSAKA_ANCHOR);

  // Dijkstra with a simple binary heap keyed on distance.
  const dist = new Map([[source, 0]]);
  const prev = new Map();
  const heap = [[0, source]];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l;
        if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  };

  while (heap.length) {
    const [d, u] = pop();
    if (d > (dist.get(u) ?? Infinity) + 1e-9) continue;
    if (u === target) break;
    for (const edge of graph.get(u) ?? []) {
      const next = d + edge.length;
      if (next < (dist.get(edge.to) ?? Infinity) - 1e-9) {
        dist.set(edge.to, next);
        prev.set(edge.to, { from: u, geometry: edge.geometry });
        push([next, edge.to]);
      }
    }
  }
  if (!prev.has(target)) throw new Error('no path between 東京 and 新大阪');

  const chain = [];
  for (let cursor = target; cursor !== source; ) {
    const step = prev.get(cursor);
    chain.push(step.geometry);
    cursor = step.from;
  }
  chain.reverse();

  const points = [chain[0][0]];
  for (const geometry of chain) {
    for (const p of geometry.slice(1)) {
      const last = points.at(-1);
      if (p[0] !== last[0] || p[1] !== last[1]) points.push(p);
    }
  }
  return points;
}

/** Iterative Douglas–Peucker in a locally flat projection. */
function simplify(points, toleranceM) {
  const scale = Math.cos(toRad(points[0][0]));
  const projected = points.map(([lat, lon]) => [
    toRad(lon) * scale * EARTH_RADIUS_M,
    toRad(lat) * EARTH_RADIUS_M,
  ]);
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    if (j <= i + 1) continue;
    const [ax, ay] = projected[i];
    const [bx, by] = projected[j];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let worstIndex = -1;
    for (let m = i + 1; m < j; m++) {
      const [px, py] = projected[m];
      const d =
        len === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * (px - ax) - dx * (py - ay)) / len;
      if (d > worst) {
        worst = d;
        worstIndex = m;
      }
    }
    if (worst > toleranceM) {
      keep[worstIndex] = true;
      stack.push([i, worstIndex], [worstIndex, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Perpendicular projection of a point onto the polyline. */
function snapToPath(points, cumulative, lat, lon) {
  const scale = Math.cos(toRad(lat));
  let best = { offsetM: Infinity, alongM: 0, lat, lon };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(a[0] - lat) > 0.05 || Math.abs(a[1] - lon) > 0.05) continue;
    const ax = (a[1] - lon) * scale;
    const ay = a[0] - lat;
    const bx = (b[1] - lon) * scale;
    const by = b[0] - lat;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
    const offsetM = Math.hypot(ax + t * dx, ay + t * dy) * toRad(1) * EARTH_RADIUS_M;
    if (offsetM < best.offsetM) {
      best = {
        offsetM,
        alongM: cumulative[i] + t * (cumulative[i + 1] - cumulative[i]),
        lat: a[0] + t * (b[0] - a[0]),
        lon: a[1] + t * (b[1] - a[1]),
      };
    }
  }
  return best;
}

async function main() {
  console.log(`Fetching relation ${RELATION_ID} geometry…`);
  const routeData = await overpass(
    `[out:json][timeout:300];rel(${RELATION_ID});out geom;`,
  );
  const relation = routeData.elements[0];
  if (!relation) throw new Error('relation not found');

  console.log('Fetching station nodes along the line…');
  const stationData = await overpass(
    `[out:json][timeout:300];rel(${RELATION_ID});node(around:250)["railway"="station"];out;`,
  );

  console.log('Recovering a single alignment…');
  const full = buildAlignment(relation);
  const points = simplify(full, SIMPLIFY_TOLERANCE_M);

  const cumulative = [0];
  for (let i = 0; i < points.length - 1; i++) {
    cumulative.push(cumulative[i] + haversine(points[i], points[i + 1]));
  }
  const totalM = cumulative.at(-1);
  console.log(
    `  ${full.length} → ${points.length} points, ${(totalM / 1000).toFixed(3)} km`,
  );

  console.log('Snapping stations…');
  const stations = STATIONS.map(([name, nameEn]) => {
    const candidates = stationData.elements.filter((e) => e.tags?.name === name);
    if (!candidates.length) throw new Error(`no OSM node for ${name}`);
    const best = candidates
      .map((e) => ({ node: e, snapped: snapToPath(points, cumulative, e.lat, e.lon) }))
      .sort((a, b) => a.snapped.offsetM - b.snapped.offsetM)[0];
    console.log(
      `  ${name.padEnd(5, '　')} node=${best.node.id} ` +
        `offset=${best.snapped.offsetM.toFixed(1)}m ` +
        `km=${(best.snapped.alongM / 1000).toFixed(3)}`,
    );
    return {
      name,
      nameEn,
      osmNodeId: best.node.id,
      lat: Number(best.snapped.lat.toFixed(6)),
      lon: Number(best.snapped.lon.toFixed(6)),
      km: Number((best.snapped.alongM / 1000).toFixed(3)),
    };
  });

  for (let i = 1; i < stations.length; i++) {
    if (stations[i].km <= stations[i - 1].km) {
      throw new Error(`stations out of order at ${stations[i].name}`);
    }
  }

  const output = {
    $comment:
      'Generated by scripts/build-route-data.mjs. Do not edit by hand. ' +
      'Geometry derived from OpenStreetMap relation 5263977, © OpenStreetMap ' +
      'contributors, licensed under the ODbL (https://www.openstreetmap.org/copyright).',
    source: {
      name: 'OpenStreetMap',
      relation: RELATION_ID,
      url: `https://www.openstreetmap.org/relation/${RELATION_ID}`,
      license: 'ODbL 1.0',
      retrieved: new Date().toISOString().slice(0, 10),
      osmTimestamp: routeData.osm3s?.timestamp_osm_base ?? null,
    },
    simplifyToleranceM: SIMPLIFY_TOLERANCE_M,
    lengthKm: Number((totalM / 1000).toFixed(3)),
    stations,
    // Flat [lat, lon, lat, lon, …] so the JSON stays compact.
    path: points.flatMap(([lat, lon]) => [
      Number(lat.toFixed(6)),
      Number(lon.toFixed(6)),
    ]),
  };

  const outPath = fileURLToPath(new URL('../src/data/tokaido-route.json', import.meta.url));
  await writeFile(outPath, `${JSON.stringify(output)}\n`);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
