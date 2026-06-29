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
const bodyGroups = chunkRows(rows, 7);

const palette = {
  paper: "#fffdf8",
  blue: "#39b9ff",
  paleBlue: "#d7f1ff",
  yellow: "#f2d61f",
  head: "#f6a044",
  shell: "#f85b12",
  shellDeep: "#cc3c07",
};

const poster = {
  grid: 22,
  originX: 10,
  originY: 10,
  timeline: {
    secondsPerDay: 18,
  },
  shrimp: {
    headX: 316,
    headY: 248,
    headRx: 184,
    headRy: 94,
    arcCx: 500,
    arcCy: 490,
    arcRadius: 246,
    arcStart: -1.5,
    arcEnd: 2.3,
    tailX: 392,
    tailY: 756,
  },
};

const gridCells = buildGridCells();

function animate(now) {
  const time = now * 0.001;
  const state = getDataState(time);
  const model = buildModel(state, time);
  drawScene(model, state, time);
  requestAnimationFrame(animate);
}

function buildGridCells() {
  const cells = [];
  const cols = Math.ceil((canvas.width - poster.originX) / poster.grid) + 1;
  const rowsCount = Math.ceil((canvas.height - poster.originY) / poster.grid) + 1;

  for (let row = 0; row < rowsCount; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        key: `${col}:${row}`,
        col,
        row,
        x: poster.originX + col * poster.grid,
        y: poster.originY + row * poster.grid,
      });
    }
  }

  return cells;
}

function buildModel(state, time) {
  const cells = new Map();
  const tempNorm = normalizeValue(state.T, stats.minT, stats.maxT);
  const humidNorm = normalizeValue(state.H, stats.minH, stats.maxH);
  const pressureNorm = normalizeValue(state.P, stats.minP, stats.maxP);
  const windNorm = normalizeValue(state.W, stats.minW, stats.maxW);
  const motionNorm = normalizeValue(state.M, stats.minM, stats.maxM);
  const profiles = deriveProfiles(time);

  const headStretch = 1 + Math.sin(time * 0.9) * lerp(0.01, 0.05, tempNorm);
  const curlWave = Math.sin(time * lerp(0.7, 1.4, windNorm));
  const curlShift = curlWave * lerp(8, 24, windNorm);
  const curlBend = curlWave * lerp(0.06, 0.22, motionNorm);
  const segmentLift = Math.cos(time * lerp(0.45, 0.9, pressureNorm)) * lerp(2, 10, motionNorm);

  for (const cell of gridCells) {
    const dx = cell.x - poster.shrimp.headX;
    const dy = cell.y - poster.shrimp.headY;
    const localHead =
      (dx * dx) / ((poster.shrimp.headRx * headStretch) ** 2) +
      (dy * dy) / ((poster.shrimp.headRy * 0.94) ** 2);

    if (localHead < 1.02 && dx < poster.shrimp.headRx * 0.98) {
      const taper = 1 - clamp((dx + poster.shrimp.headRx) / (poster.shrimp.headRx * 1.92), 0, 1);
      const notch = dy > 10 && dx > 42;
      if (!notch) {
        const snoutCut = dx < -poster.shrimp.headRx * 0.66 && Math.abs(dy) > poster.shrimp.headRy * 0.36;
        if (snoutCut) continue;
        const ringScale = lerp(1.08, 0.78, taper) * lerp(0.94, 1.06, humidNorm);
        cells.set(
          cell.key,
          makeCell(cell, {
            role: "head",
            color: palette.head,
            holeRatio: lerp(0.22, 0.34, humidNorm),
            ringScale,
          })
        );
        continue;
      }
    }

    const bodyHit = hitShrimpBody(
      cell.x,
      cell.y + segmentLift,
      curlShift,
      curlBend,
      profiles,
      tempNorm,
      humidNorm,
      pressureNorm,
      windNorm
    );
    if (bodyHit) {
      cells.set(cell.key, bodyHit);
      continue;
    }

    const tailHit = hitShrimpTail(cell.x, cell.y, state, time);
    if (tailHit) {
      cells.set(cell.key, tailHit);
    }
  }

  return { cells };
}

function hitShrimpBody(x, y, curlShift, curlBend, profiles, tempNorm, humidNorm, pressureNorm, windNorm) {
  const { arcCx, arcCy, arcRadius, arcStart, arcEnd } = poster.shrimp;
  const pivotX = arcCx + Math.sin((y - arcCy) * 0.008) * curlShift * 0.4;
  const pivotY = arcCy + Math.cos((x - arcCx) * 0.006) * curlShift * 0.18;
  const angle = Math.atan2(y - pivotY, x - pivotX);
  const dist = Math.hypot(x - pivotX, y - pivotY);
  const wrappedAngle = angle < arcStart ? angle + Math.PI * 2 : angle;

  if (wrappedAngle < arcStart || wrappedAngle > arcEnd) return null;

  const t = clamp((wrappedAngle - arcStart) / (arcEnd - arcStart), 0, 1);
  const segIndex = clamp(Math.floor(t * profiles.length), 0, profiles.length - 1);
  const profile = profiles[segIndex];
  const centerRadius =
    arcRadius +
    Math.sin(t * Math.PI * 2.1 + curlShift * 0.015) * lerp(4, 14, windNorm) +
    Math.sin(t * Math.PI * 1.2 + profile.phase) * curlBend * 62;
  const bandHalf = lerp(76, 40, t) * lerp(0.94, 1.12, profile.tempNorm);
  const delta = Math.abs(dist - centerRadius);
  const segmentWave = Math.sin(t * Math.PI * (profiles.length + 0.8) + profile.phase);
  const segmentGap = Math.abs(segmentWave) < lerp(0.16, 0.3, profile.pressureNorm);

  if (delta > bandHalf || segmentGap) return null;

  const edge = 1 - delta / bandHalf;
  const field =
    (Math.sin(x * 0.04 + profile.phase) +
      Math.cos(y * 0.045 - profile.phase * 0.8) +
      Math.sin((x + y) * 0.022 + profile.phase * 1.2)) /
    3;
  const fieldNorm = field * 0.5 + 0.5;
  const ringScale =
    lerp(0.74, 1.18, fieldNorm) *
    lerp(0.92, 1.08, edge) *
    lerp(0.94, 1.08, tempNorm) *
    lerp(0.96, 1.08, pressureNorm);
  const color = mixHex(palette.shellDeep, palette.shell, clamp(t * 0.72 + fieldNorm * 0.22, 0, 1));

  return makeCell(
    { x, y },
    {
      role: "body",
      color,
      holeRatio: lerp(0.22, 0.34, humidNorm) * lerp(0.96, 1.08, profile.humidNorm),
      ringScale,
    }
  );
}

function hitShrimpTail(x, y, state, time) {
  const tempNorm = normalizeValue(state.T, stats.minT, stats.maxT);
  const humidNorm = normalizeValue(state.H, stats.minH, stats.maxH);
  const windNorm = normalizeValue(state.W, stats.minW, stats.maxW);
  const sway = Math.sin(time * lerp(0.8, 1.3, windNorm)) * lerp(4, 12, windNorm);
  const localX = x - poster.shrimp.tailX;
  const localY = y - poster.shrimp.tailY;

  const leftWing =
    localX < 0 &&
    localY > -12 &&
    localY < 104 &&
    Math.abs(localX) < lerp(110, 64, clamp(localY / 104, 0, 1));
  const rightWing =
    localX > 0 &&
    localY > -18 &&
    localY < 50 &&
    Math.abs(localX) < lerp(124, 36, clamp((localY + 18) / 68, 0, 1));
  const tailStem =
    localY > 24 &&
    localY < 128 &&
    Math.abs(localX + sway * 0.2) < lerp(44, 20, clamp((localY - 24) / 104, 0, 1));

  if (!(leftWing || rightWing || tailStem)) return null;

  const branch = leftWing ? 0.2 : rightWing ? 0.75 : 0.52;
  const color = mixHex(palette.shellDeep, palette.shell, branch);
  return makeCell(
    { x, y },
    {
      role: "tail",
      color,
      holeRatio: lerp(0.22, 0.34, humidNorm) * 0.92,
      ringScale: lerp(0.9, 1.12, tempNorm),
    }
  );
}

function deriveProfiles(time) {
  return bodyGroups.map((group, index) => {
    const tempNorm = normalizeValue(average(group, "T"), stats.minT, stats.maxT);
    const humidNorm = normalizeValue(average(group, "H"), stats.minH, stats.maxH);
    const pressureNorm = normalizeValue(average(group, "P"), stats.minP, stats.maxP);
    return {
      tempNorm,
      humidNorm,
      pressureNorm,
      phase: index * 0.92 + time * 0.08,
    };
  });
}

function makeCell(cell, config) {
  const { role, color, holeRatio, ringScale } = config;
  const radius = poster.grid * 0.34 * ringScale;
  return {
    x: cell.x,
    y: cell.y,
    radius,
    hole: radius * holeRatio,
    color,
    role,
  };
}

function drawScene(model, state, time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawBackgroundPattern(state, time, model.cells);
  drawShrimp(model.cells);
}

function drawBackgroundPattern(state, time, shrimpCells) {
  const pressureNorm = normalizeValue(state.P, stats.minP, stats.maxP);
  const humidNorm = normalizeValue(state.H, stats.minH, stats.maxH);
  const drift = time * lerp(0.08, 0.18, pressureNorm);

  for (const cell of gridCells) {
    if (shrimpCells.has(cell.key)) continue;
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

function drawShrimp(cellsMap) {
  const cells = [...cellsMap.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const cell of cells) {
    drawRingDot(cell.x, cell.y, cell.radius, cell.color, cell.hole);
  }
}

function drawRingDot(x, y, radius, ringColor, holeRadius) {
  ctx.save();
  ctx.fillStyle = ringColor;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.paper;
  ctx.beginPath();
  ctx.arc(x, y, holeRadius, 0, Math.PI * 2);
  ctx.fill();
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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

requestAnimationFrame(animate);
