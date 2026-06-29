const canvas = document.getElementById("poster");
const ctx = canvas.getContext("2d");

const rawCsv = `hour,T,H,P,W,M
0,17.8,82,1023,6,24
1,18.8,77,1022,8,26
2,19.7,72,1022,10,28
3,20.7,68,1022,11,30
4,20.7,69,1022,10,29
5,20.6,69,1021,10,27
6,20.5,70,1021,9,25
7,19.9,75,1022,7,23
8,19.4,80,1022,5,22
9,18.8,84,1022,4,21
10,18.9,81,1022,6,20
11,19.0,80,1022,7,19
12,19.0,78,1022,8,20
13,18.9,77,1022,7,21
14,18.9,76,1021,6,22
15,18.9,76,1021,6,23
16,18.7,79,1021,6,24
17,18.4,83,1021,6,25
18,18.0,87,1021,5,26
19,17.4,91,1022,4,27
20,17.6,89,1022,4,28
21,17.5,88,1022,3,28
22,17.5,86,1022,3,27
23,17.5,86,1022,3,26`;

const rows = parseCsv(rawCsv);
const stats = summarize(rows);
const groups = chunkRows(rows, 6);

const palette = {
  paper: "#fffdf8",
  blue: "#39b9ff",
  paleBlue: "#d7f1ff",
  yellow: "#f2d61f",
  magenta: "#d82a91",
  magentaDeep: "#651145",
  pinkWash: "rgba(247, 186, 220, 0.18)",
  line: "rgba(225, 133, 180, 0.42)",
};

const poster = {
  size: 900,
  grid: 22,
  gridOriginX: 10,
  gridOriginY: 10,
  timeline: {
    secondsPerDay: 18,
  },
  body: {
    x: 388,
    y: 194,
    rx: 214,
    ry: 162,
  },
};

const limbAnchors = [
  { x: 248, y: 292, side: -1.16, spreadBias: -0.38, scale: 0.92 },
  { x: 308, y: 294, side: -0.78, spreadBias: -0.22, scale: 0.98 },
  { x: 370, y: 296, side: -0.22, spreadBias: -0.05, scale: 1.04 },
  { x: 434, y: 294, side: 0.2, spreadBias: 0.05, scale: 1.08 },
  { x: 504, y: 286, side: 0.82, spreadBias: 0.2, scale: 1.02 },
  { x: 574, y: 268, side: 1.44, spreadBias: 0.38, scale: 0.9 },
];

const limbData = groups.map((group, index) => deriveLimb(group, index));
const gridCells = buildGridCells();

function animate(now) {
  const time = now * 0.001;
  const state = getDataState(time);
  const model = buildModel(time, state);
  drawScene(model, time, state);
  requestAnimationFrame(animate);
}

function buildGridCells() {
  const cells = [];
  const cols = Math.ceil((canvas.width - poster.gridOriginX) / poster.grid) + 1;
  const rowsCount = Math.ceil((canvas.height - poster.gridOriginY) / poster.grid) + 1;

  for (let row = 0; row < rowsCount; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        key: `${col}:${row}`,
        col,
        row,
        x: poster.gridOriginX + col * poster.grid,
        y: poster.gridOriginY + row * poster.grid,
      });
    }
  }

  return cells;
}

function buildModel(time, state) {
  const octopusCells = new Map();

  fillBodyCells(octopusCells, time, state);
  const limbs = fillLimbCells(octopusCells, time, state);

  return { octopusCells, limbs };
}

function deriveLimb(group, index) {
  const tNorm = normalizeValue(average(group, "T"), stats.minT, stats.maxT);
  const hNorm = normalizeValue(average(group, "H"), stats.minH, stats.maxH);
  const pNorm = normalizeValue(average(group, "P"), stats.minP, stats.maxP);
  const wNorm = normalizeValue(average(group, "W"), stats.minW, stats.maxW);
  const mNorm = normalizeValue(average(group, "M"), stats.minM, stats.maxM);
  const anchor = limbAnchors[index];

  return {
    group,
    anchor,
    phase: index * 0.82,
    count: group.length + 18,
    maxRadius: lerp(14, 20, tNorm) * anchor.scale,
    minRadius: lerp(6, 9, hNorm) * anchor.scale,
    sway: lerp(0.12, 0.26, wNorm),
    spread: lerp(34, 126, pNorm) * anchor.scale,
    length: lerp(320, 650, mNorm) * anchor.scale,
    hook: lerp(24, 82, mNorm) * anchor.scale,
  };
}

function fillBodyCells(octopusCells, time, state) {
  const pressureNorm = normalizeValue(state.P, stats.minP, stats.maxP);
  const tempNorm = normalizeValue(state.T, stats.minT, stats.maxT);
  const humidNorm = normalizeValue(state.H, stats.minH, stats.maxH);
  const drift = time * lerp(0.25, 0.72, pressureNorm);

  for (const cell of gridCells) {
    const dx = (cell.x - poster.body.x) / poster.body.rx;
    const dy = (cell.y - poster.body.y) / poster.body.ry;
    const inside = dx * dx + dy * dy;
    if (inside > 1.04) continue;

    const fieldA = Math.sin(cell.col * 0.66 + drift);
    const fieldB = Math.cos(cell.row * 0.74 - drift * 0.85);
    const fieldC = Math.sin((cell.col + cell.row) * 0.35 + drift * 0.58);
    const field = (fieldA + fieldB + fieldC) / 3;
    const fieldNorm = field * 0.5 + 0.5;
    const edge = 1 - Math.min(1, inside);
    const verticalBias = clamp((dy + 1) * 0.5, 0, 1);
    const radius =
      lerp(11, 23, edge) *
      lerp(0.76, 1.32, fieldNorm) *
      lerp(0.96, 1.08, tempNorm) *
      lerp(0.94, 1.14, verticalBias);

    const ring = mixHex(
      palette.magentaDeep,
      palette.magenta,
      clamp(0.22 + verticalBias * 0.46 + fieldNorm * 0.24, 0, 1)
    );
    const hole = mixHex("#fffdf8", "#ffe97b", humidNorm * 0.74);
    const core =
      fieldNorm > 0.75 && edge > 0.18
        ? mixHex(palette.yellow, palette.magentaDeep, 0.16 + edge * 0.12)
        : null;

    octopusCells.set(cell.key, {
      kind: "body",
      x: cell.x,
      y: cell.y,
      r: Math.min(radius, poster.grid * 0.57),
      ring,
      hole,
      core,
      alpha: lerp(0.84, 1, edge),
      row: cell.row,
      col: cell.col,
    });
  }
}

function fillLimbCells(octopusCells, time, state) {
  const limbPaths = [];
  for (let i = 0; i < limbData.length; i += 1) {
    const limb = limbData[i];
    const spine = sampleSpine(limb, i, time, state);
    const snappedControls = compactNodes(spine.map((p) => snapToGrid(p)), poster.grid * 0.18);
    const snapped = traceGridPath(snappedControls);
    const renderedNodes = [];

    snapped.forEach((point, nodeIndex) => {
      const key = gridKeyFromPoint(point);
      const t = nodeIndex / Math.max(1, snapped.length - 1);
      const ring = mixHex(
        palette.magentaDeep,
        palette.magenta,
        clamp(i / (limbData.length - 1) * 0.42 + t * 0.28 + 0.18, 0, 1)
      );
      const hole = mixHex("#fffdf8", "#ffe97b", 0.48 - t * 0.14);
      const node = {
        kind: "limb",
        x: point.x,
        y: point.y,
        r: lerp(limb.maxRadius, limb.minRadius, t),
        ring,
        hole,
        core: null,
        alpha: 1,
        row: point.row,
        col: point.col,
      };

      const existing = octopusCells.get(key);
      if (!existing || existing.kind !== "body") {
        octopusCells.set(key, node);
        renderedNodes.push(node);
      }
    });
    limbPaths.push({ nodes: renderedNodes });
  }
  return limbPaths;
}

function sampleSpine(limb, index, time, state) {
  const moistureNorm = normalizeValue(state.M, stats.minM, stats.maxM);
  const pressureNorm = normalizeValue(state.P, stats.minP, stats.maxP);
  const points = [];
  const spreadBias = limb.anchor.spreadBias;

  for (let i = 0; i < limb.count; i += 1) {
    const t = i / (limb.count - 1);
    const crownPull = Math.sin(t * Math.PI * (1.1 + pressureNorm) + limb.phase) * spreadBias * 140;
    const sway = Math.sin(time * 0.8 + limb.phase + t * 5) * limb.sway * 26;
    const release = clamp((t - 0.08) / 0.92, 0, 1);
    const p = cubicPoint(
      { x: limb.anchor.x, y: limb.anchor.y },
      {
        x: limb.anchor.x + limb.anchor.side * 20 + crownPull * 0.16,
        y: limb.anchor.y + 60,
      },
      {
        x: limb.anchor.x + limb.anchor.side * limb.spread + crownPull,
        y: limb.anchor.y + limb.length * 0.38,
      },
      {
        x:
          limb.anchor.x +
          limb.anchor.side * (limb.spread + 44) +
          crownPull +
          sway * 0.6 +
          spreadBias * 120 * release,
        y: limb.anchor.y + limb.length * 0.98,
      },
      t
    );

    const hookT = clamp((t - 0.56) / 0.44, 0, 1);
    points.push({
      x:
        p.x +
        Math.sin(hookT * Math.PI * 1.8 + limb.phase + time * 0.32) *
          limb.hook *
          0.24 *
          hookT +
        sway +
        Math.sin(time * 0.42 + index * 0.6 + t * 4.4) * 16 * release,
      y:
        p.y +
        Math.cos(hookT * Math.PI * 1.25 + limb.phase) * limb.hook * 0.08 * hookT -
        hookT * moistureNorm * 18 -
        Math.sin(release * Math.PI) * 14 * spreadBias,
    });
  }

  return points;
}

function drawScene(model, time, state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawBackgroundPattern(time, state, model.octopusCells);
  drawWash();
  drawConnectors(model.limbs);
  drawOctopusCells(model.octopusCells);
}

function drawBackgroundPattern(time, state, octopusCells) {
  const pressureNorm = normalizeValue(state.P, stats.minP, stats.maxP);
  const humidNorm = normalizeValue(state.H, stats.minH, stats.maxH);
  const drift = time * lerp(0.08, 0.18, pressureNorm);

  for (const cell of gridCells) {
    if (octopusCells.has(cell.key)) continue;
    drawBackgroundSquare(cell.x, cell.y, humidNorm);
    drawBackgroundCross(cell.x, cell.y, drift);
  }
}

function drawBackgroundSquare(x, y, humidNorm) {
  const size = lerp(8, 10, humidNorm);
  ctx.save();
  ctx.strokeStyle = palette.blue;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  roundedRect(ctx, x - size, y - size, size * 2, size * 2, 4);
  ctx.stroke();

  ctx.fillStyle = palette.paleBlue;
  ctx.beginPath();
  roundedRect(ctx, x - size * 0.36, y - size * 0.36, size * 0.72, size * 0.72, 2);
  ctx.fill();
  ctx.restore();
}

function drawBackgroundCross(x, y, drift) {
  const r = poster.grid * 0.18;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI * 0.25 + drift * 0.1);
  ctx.strokeStyle = palette.yellow;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();
  ctx.restore();
}

function drawWash() {
  ctx.save();
  ctx.fillStyle = palette.pinkWash;
  ctx.beginPath();
  ctx.ellipse(396, 328, 194, 114, -0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(786, 678, 220, 142, -0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawConnectors(limbs) {
  ctx.save();
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1.8;
  for (const limb of limbs) {
    if (!limb.nodes.length) continue;
    ctx.beginPath();
    limb.nodes.forEach((cell, index) => {
      if (index === 0) ctx.moveTo(cell.x, cell.y);
      else ctx.lineTo(cell.x, cell.y);
    });
    ctx.stroke();
  }

  ctx.restore();
}

function drawOctopusCells(octopusCells) {
  const cells = [...octopusCells.values()].sort((a, b) => a.y - b.y);
  for (const cell of cells) {
    drawRingDot(cell.x, cell.y, cell.r, cell.ring, cell.hole, cell.r * 0.3, cell.core, cell.alpha);
  }
}

function drawRingDot(x, y, r, ringColor, holeColor, holeR, coreColor = null, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(84, 16, 62, 0.08)";
  ctx.beginPath();
  ctx.arc(x + 1.2, y + 1.8, r * 1.02, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ringColor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = holeColor;
  ctx.beginPath();
  ctx.arc(x, y, holeR, 0, Math.PI * 2);
  ctx.fill();

  if (coreColor) {
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(x, y, holeR * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function roundedRect(context, x, y, width, height, radius) {
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function snapToGrid(point) {
  const col = Math.round((point.x - poster.gridOriginX) / poster.grid);
  const row = Math.round((point.y - poster.gridOriginY) / poster.grid);
  return {
    x: poster.gridOriginX + col * poster.grid,
    y: poster.gridOriginY + row * poster.grid,
    col,
    row,
  };
}

function gridKeyFromPoint(point) {
  return `${point.col}:${point.row}`;
}

function compactNodes(points, minDist) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) >= minDist) {
      out.push(p);
    }
  }
  return out;
}

function traceGridPath(points) {
  if (!points.length) return [];
  const out = [points[0]];

  for (let i = 1; i < points.length; i += 1) {
    const seg = rasterizeGridSegment(out[out.length - 1], points[i]);
    for (let j = 1; j < seg.length; j += 1) {
      const prev = out[out.length - 1];
      const cur = seg[j];
      if (prev.col !== cur.col || prev.row !== cur.row) {
        out.push(cur);
      }
    }
  }

  return out;
}

function rasterizeGridSegment(a, b) {
  const points = [];
  let col = a.col;
  let row = a.row;
  points.push(a);

  while (col !== b.col || row !== b.row) {
    const dCol = b.col - col;
    const dRow = b.row - row;
    if (dCol !== 0) col += Math.sign(dCol);
    if (dRow !== 0) row += Math.sign(dRow);
    points.push({
      col,
      row,
      x: poster.gridOriginX + col * poster.grid,
      y: poster.gridOriginY + row * poster.grid,
    });
  }

  return points;
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = Number(values[index]);
    });
    return row;
  });
}

function getDataState(time) {
  const cycle = poster.timeline.secondsPerDay;
  const normalized = ((time % cycle) + cycle) % cycle / cycle;
  const exactIndex = normalized * rows.length;
  const i0 = Math.floor(exactIndex) % rows.length;
  const i1 = (i0 + 1) % rows.length;
  const t = exactIndex - Math.floor(exactIndex);
  const a = rows[i0];
  const b = rows[i1];
  return {
    hour: lerp(a.hour, b.hour, t),
    T: lerp(a.T, b.T, t),
    H: lerp(a.H, b.H, t),
    P: lerp(a.P, b.P, t),
    W: lerp(a.W, b.W, t),
    M: lerp(a.M, b.M, t),
  };
}

function summarize(data) {
  return {
    minT: minOf(data, "T"),
    maxT: maxOf(data, "T"),
    minH: minOf(data, "H"),
    maxH: maxOf(data, "H"),
    minP: minOf(data, "P"),
    maxP: maxOf(data, "P"),
    minW: minOf(data, "W"),
    maxW: maxOf(data, "W"),
    minM: minOf(data, "M"),
    maxM: maxOf(data, "M"),
  };
}

function chunkRows(data, groupCount) {
  const out = [];
  const size = Math.ceil(data.length / groupCount);
  for (let i = 0; i < groupCount; i += 1) {
    const start = i * size;
    const end = Math.min(data.length, start + size);
    if (start < end) out.push(data.slice(start, end));
  }
  return out;
}

function average(data, key) {
  return data.reduce((sum, row) => sum + row[key], 0) / data.length;
}

function minOf(data, key) {
  return Math.min(...data.map((row) => row[key]));
}

function maxOf(data, key) {
  return Math.max(...data.map((row) => row[key]));
}

function normalizeValue(value, min, max) {
  return max === min ? 0.5 : (value - min) / (max - min);
}

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x:
      p0.x * mt2 * mt +
      3 * p1.x * mt2 * t +
      3 * p2.x * mt * t2 +
      p3.x * t2 * t,
    y:
      p0.y * mt2 * mt +
      3 * p1.y * mt2 * t +
      3 * p2.y * mt * t2 +
      p3.y * t2 * t,
  };
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    Math.round(lerp(ca.r, cb.r, t)),
    Math.round(lerp(ca.g, cb.g, t)),
    Math.round(lerp(ca.b, cb.b, t))
  );
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

requestAnimationFrame(animate);
