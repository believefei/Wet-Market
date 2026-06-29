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
const bodyGroups = chunkRows(rows, 6);

const palette = {
  paper: "#fffdf8",
  blue: "#39b9ff",
  paleBlue: "#d7f1ff",
  yellow: "#f2d61f",
  left: "#1762d1",
  right: "#76d0d8",
  top: "#f8760f",
  stripe: "rgba(240, 231, 214, 0.26)",
};

const poster = {
  grid: 22,
  originX: 10,
  originY: 10,
  timeline: {
    secondsPerDay: 18,
    scaleCycle: 7.5,
  },
  fish: {
    cx: canvas.width * 0.5,
    cy: canvas.height * 0.5,
    topY: 92,
    bodyTop: 206,
    bodyBottom: 676,
    tailStart: 698,
    tailEnd: 854,
    maxHalfCols: 9,
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
  const bodyCells = [];
  const tempNorm = normalizeValue(state.T, stats.minT, stats.maxT);
  const humidNorm = normalizeValue(state.H, stats.minH, stats.maxH);
  const pressureNorm = normalizeValue(state.P, stats.minP, stats.maxP);
  const windNorm = normalizeValue(state.W, stats.minW, stats.maxW);
  const motionNorm = normalizeValue(state.M, stats.minM, stats.maxM);

  const centerCol = Math.round((poster.fish.cx - poster.originX) / poster.grid);
  const tailSwing = Math.sin(time * lerp(0.6, 1.15, windNorm)) * lerp(0.12, 0.34, windNorm);
  const bodyPulse = Math.sin(time * lerp(0.4, 0.8, pressureNorm)) * 0.18;
  const halfCols = poster.fish.maxHalfCols + Math.round(lerp(-1, 1, tempNorm) + bodyPulse);
  const holeRatio = lerp(0.26, 0.38, humidNorm);
  const leftBias = lerp(-0.2, 0.2, pressureNorm);
  const tailOpen = lerp(1.7, 3.2, motionNorm);
  const globalBreath = 1 + Math.sin(time * lerp(0.8, 1.6, windNorm)) * lerp(0.02, 0.08, tempNorm);
  const bodyProfiles = deriveBodyProfiles(time);

  for (const cell of gridCells) {
    const localX = (cell.x - poster.fish.cx) / poster.grid;
    const localY = cell.y;

    const topInfo = topCapAt(localY, halfCols);
    if (topInfo && Math.abs(localX) <= topInfo.halfCols) {
      cells.set(
        cell.key,
        makeCell(cell, {
          role: "top",
          color: palette.top,
          holeRatio: holeRatio * 0.88,
          ringScale: 1,
        })
      );
      continue;
    }

    const bodyInfo = bodyAt(localY, halfCols, leftBias);
    if (bodyInfo && Math.abs(localX) <= bodyInfo.halfCols) {
      const edgeRatio = Math.abs(localX) / Math.max(1, bodyInfo.halfCols);
      const yNorm = normalizeValue(localY, poster.fish.bodyTop, poster.fish.bodyBottom);
      const bodyIndex = clamp(Math.floor(yNorm * bodyProfiles.length), 0, bodyProfiles.length - 1);
      const profile = bodyProfiles[bodyIndex];
      const fieldA = Math.sin(cell.col * 0.58 + time * profile.speed + profile.phase);
      const fieldB = Math.cos(cell.row * 0.46 - time * (0.52 + windNorm * 0.9));
      const fieldC = Math.sin((cell.col + cell.row) * 0.24 + time * 0.35 + profile.phase * 0.6);
      const fieldNorm = ((fieldA + fieldB + fieldC) / 3) * 0.5 + 0.5;
      const ringScale =
        lerp(0.82, 1.26, fieldNorm) *
        lerp(1.08, 0.84, edgeRatio) *
        lerp(0.94, 1.12, profile.tempNorm) *
        lerp(0.94, 1.08, pressureNorm) *
        globalBreath;
      cells.set(
        cell.key,
        makeCell(cell, {
          role: "body",
          color: palette.left,
          targetColor: palette.right,
          holeRatio: holeRatio * lerp(0.92, 1.08, profile.humidNorm),
          ringScale,
        })
      );
      bodyCells.push(cells.get(cell.key));
      continue;
    }

    const tailInfo = tailAt(localY, tailOpen, tailSwing);
    if (tailInfo && isOnTail(localX, tailInfo)) {
      const side = localX <= 0 ? "left" : "right";
      const color = side === "left" ? palette.left : palette.right;
      const t = normalizeValue(localY, poster.fish.tailStart, poster.fish.tailEnd);
      const tailWave = Math.sin(time * 1.2 + t * 5.8 + (side === "left" ? 0 : 1.4)) * 0.5 + 0.5;
      cells.set(
        cell.key,
        makeCell(cell, {
          role: "tail",
          color,
          holeRatio: holeRatio * 0.92,
          ringScale:
            lerp(0.84, 1.02, tailWave) *
            lerp(0.96, 0.78, t) *
            lerp(0.96, 1.06, motionNorm),
        })
      );
    }
  }

  bodyCells
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .forEach((cell, index) => {
      cell.sweepIndex = index;
    });

  return { cells, bodyCount: bodyCells.length };
}

function topCapAt(y, halfCols) {
  if (y < poster.fish.topY || y > poster.fish.bodyTop - poster.grid * 0.65) return null;
  const t = normalizeValue(y, poster.fish.topY, poster.fish.bodyTop - poster.grid * 0.65);
  return {
    halfCols: Math.max(0, Math.round(lerp(0, halfCols * 0.68, t))),
  };
}

function bodyAt(y, halfCols, leftBias) {
  if (y < poster.fish.bodyTop || y > poster.fish.bodyBottom) return null;
  const t = normalizeValue(y, poster.fish.bodyTop, poster.fish.bodyBottom);

  let width;
  if (t < 0.18) {
    width = lerp(halfCols * 0.78, halfCols, t / 0.18);
  } else if (t < 0.72) {
    width = lerp(halfCols, halfCols * 0.94, (t - 0.18) / 0.54);
  } else {
    width = lerp(halfCols * 0.94, halfCols * 0.34, (t - 0.72) / 0.28);
  }

  const wobble = Math.sin(t * 8.4) * 0.22;
  return {
    halfCols: Math.max(1, Math.round(width + wobble)),
    splitBias: leftBias,
  };
}

function tailAt(y, tailOpen, tailSwing) {
  if (y < poster.fish.tailStart || y > poster.fish.tailEnd) return null;
  const t = normalizeValue(y, poster.fish.tailStart, poster.fish.tailEnd);
  return {
    leftX: lerp(-0.9, -tailOpen, t) - tailSwing * t,
    rightX: lerp(0.9, tailOpen, t) - tailSwing * t,
    thickness: lerp(0.9, 0.25, t),
  };
}

function isOnTail(localX, tailInfo) {
  const onLeft = Math.abs(localX - tailInfo.leftX) <= tailInfo.thickness;
  const onRight = Math.abs(localX - tailInfo.rightX) <= tailInfo.thickness;
  return onLeft || onRight;
}

function makeCell(cell, config) {
  const {
    role,
    color,
    targetColor = null,
    holeRatio,
    ringScale,
  } = config;
  const radius = poster.grid * 0.34 * ringScale;
  return {
    x: cell.x,
    y: cell.y,
    radius,
    hole: radius * holeRatio,
    color,
    targetColor,
    role,
    sweepIndex: -1,
  };
}

function deriveBodyProfiles(time) {
  return bodyGroups.map((group, index) => {
    const tempNorm = normalizeValue(average(group, "T"), stats.minT, stats.maxT);
    const humidNorm = normalizeValue(average(group, "H"), stats.minH, stats.maxH);
    const pressureNorm = normalizeValue(average(group, "P"), stats.minP, stats.maxP);
    return {
      tempNorm,
      humidNorm,
      pressureNorm,
      phase: index * 0.84 + time * 0.06,
      speed: lerp(0.32, 0.96, pressureNorm),
    };
  });
}

function drawScene(model, state, time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPaper();
  drawBackgroundPattern(state, time, model.cells);
  drawFish(model.cells, model.bodyCount, time);
}

function drawPaper() {
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawBackgroundPattern(state, time, fishCells) {
  const humidNorm = normalizeValue(state.H, stats.minH, stats.maxH);
  const pressureNorm = normalizeValue(state.P, stats.minP, stats.maxP);
  const drift = time * lerp(0.04, 0.1, pressureNorm);

  for (const cell of gridCells) {
    if (fishCells.has(cell.key)) continue;
    drawBackgroundUnit(cell.x, cell.y, humidNorm, drift);
  }
}

function drawBackgroundUnit(x, y, humidNorm, drift) {
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

  ctx.translate(x, y);
  ctx.rotate(Math.PI * 0.25 + drift * 0.1);
  ctx.strokeStyle = palette.yellow;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-poster.grid * 0.18, 0);
  ctx.lineTo(poster.grid * 0.18, 0);
  ctx.moveTo(0, -poster.grid * 0.18);
  ctx.lineTo(0, poster.grid * 0.18);
  ctx.stroke();
  ctx.restore();
}

function drawFish(cellsMap, bodyCount, time) {
  const cells = [...cellsMap.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  const cycleT = ((time % poster.timeline.scaleCycle) + poster.timeline.scaleCycle) % poster.timeline.scaleCycle / poster.timeline.scaleCycle;
  const stepped = cycleT * Math.max(1, bodyCount);
  const activeIndex = Math.floor(stepped);
  const localT = stepped - activeIndex;

  for (const cell of cells) {
    if (cell.role === "body") {
      let blend = 0;
      if (cell.sweepIndex < activeIndex) {
        blend = 1;
      } else if (cell.sweepIndex === activeIndex) {
        blend = easeInOut(localT);
      }
      const ringColor = mixHex(cell.color, cell.targetColor, blend);
      const holeScale = lerp(1, 0.8, blend);
      const radiusScale = lerp(1, 0.95, blend);
      drawRingDot(cell.x, cell.y, cell.radius * radiusScale, ringColor, cell.hole * holeScale);
      continue;
    }

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

function easeInOut(t) {
  return t * t * (3 - 2 * t);
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
