const canvas = document.getElementById("poster");
const ctx = canvas.getContext("2d");

const DESIGN_W = 1440;
const DESIGN_H = 360;
const DPR_LIMIT = 2;

const orangePalette = [
  "#f5a95e",
  "#f08408",
  "#f35c05",
  "#c57550",
];

let rows = [];
let normalized = [];
let startTime = performance.now();
let lastCsvText = "";
let displayedColorTn = 0.5;
let colorInitialized = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return headers.reduce((record, header, index) => {
      record[header] = Number(values[index]);
      return record;
    }, {});
  });
}

function normalizeData(data) {
  const keys = ["T", "H", "P", "W", "M"];
  const extents = Object.fromEntries(
    keys.map((key) => {
      const values = data.map((row) => row[key]);
      return [key, [Math.min(...values), Math.max(...values)]];
    }),
  );

  return data.map((row) => {
    const record = { ...row };
    keys.forEach((key) => {
      const [min, max] = extents[key];
      record[`${key}n`] = max === min ? 0.5 : (row[key] - min) / (max - min);
    });
    return record;
  });
}

async function loadData() {
  try {
    const response = await fetch("shanghai_24h.csv", { cache: "no-store" });
    const text = await response.text();
    if (text === lastCsvText && normalized.length) return;
    lastCsvText = text;
    rows = parseCSV(text);
  } catch {
    if (normalized.length) return;
    rows = [
      { hour: 0, T: 17.8, H: 82, P: 1023, W: 6, M: 24 },
      { hour: 12, T: 19, H: 78, P: 1022, W: 8, M: 20 },
      { hour: 23, T: 17.5, H: 86, P: 1022, W: 3, M: 26 },
    ];
  }
  normalized = normalizeData(rows);
}

function currentFrame(now) {
  if (!normalized.length) return null;
  const cycleSeconds = 36;
  const elapsed = (now - startTime) / 1000;
  const progress = ((now - startTime) / 1000 / cycleSeconds) % 1;
  const exact = progress * normalized.length;
  const index = Math.floor(exact) % normalized.length;
  const next = (index + 1) % normalized.length;
  const t = exact - index;
  const keys = ["T", "H", "P", "W", "M", "Tn", "Hn", "Pn", "Wn", "Mn"];
  const mixed = { hour: lerp(normalized[index].hour, normalized[next].hour, t) };
  keys.forEach((key) => {
    mixed[key] = lerp(normalized[index][key], normalized[next][key], t);
  });
  mixed.phase = progress * Math.PI * 2;
  mixed.elapsed = elapsed;
  return mixed;
}

function seeded(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function colorCounts(total, tempNorm) {
  const coolWeights = [0.46, 0.26, 0.1, 0.18];
  const warmWeights = [0.1, 0.24, 0.52, 0.14];
  const weights = coolWeights.map((cool, index) => lerp(cool, warmWeights[index], tempNorm));
  const raw = weights.map((weight) => weight * total);
  const counts = raw.map(Math.floor);
  let remaining = total - counts.reduce((sum, count) => sum + count, 0);

  raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => {
      if (remaining > 0) {
        counts[index] += 1;
        remaining -= 1;
      }
    });

  return counts;
}

function colorPlan(total, tempNorm) {
  const plan = new Array(total);
  const rankedSlots = Array.from({ length: total }, (_, index) => index).sort(
    (a, b) => seeded(a, 14) - seeded(b, 14),
  );
  let cursor = 0;

  colorCounts(total, tempNorm).forEach((count, paletteIndex) => {
    for (let i = 0; i < count; i += 1) {
      plan[rankedSlots[cursor]] = paletteIndex;
      cursor += 1;
    }
  });

  return plan;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.setTransform(
    (canvas.width / DESIGN_W),
    0,
    0,
    (canvas.height / DESIGN_H),
    0,
    0,
  );
}

function softEllipse(x, y, rx, ry, color, alpha, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function plasticRect(x, y, w, h, color, alpha, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawBackground(frame) {
  ctx.fillStyle = "#fffbf1";
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  const cellW = lerp(116, 86, frame.Pn);
  const rowH = cellW * 0.62;
  const stroke = lerp(3.4, 5.8, frame.Pn);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ec4b2e";
  ctx.lineWidth = stroke;
  ctx.globalAlpha = 0.94;

  for (let row = -2; row < Math.ceil(DESIGN_H / rowH) + 3; row += 1) {
    const y1 = row * rowH;
    const y2 = (row + 1) * rowH;
    const offset = row % 2 === 0 ? 0 : cellW / 2;

    for (let x = -cellW * 2; x < DESIGN_W + cellW * 2; x += cellW) {
      const px = x + offset;
      ctx.beginPath();
      ctx.moveTo(px, y1);
      ctx.lineTo(px - cellW / 2, y2);
      ctx.moveTo(px, y1);
      ctx.lineTo(px + cellW / 2, y2);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#ec4b2e";
  for (let row = -2; row < Math.ceil(DESIGN_H / rowH) + 3; row += 1) {
    const y = row * rowH;
    const offset = row % 2 === 0 ? 0 : cellW / 2;

    for (let x = -cellW * 2; x < DESIGN_W + cellW * 2; x += cellW) {
      ctx.beginPath();
      ctx.arc(x + offset, y, stroke * 1.04, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawPlastic(frame) {
  const humidity = frame.Hn;
  const wind = frame.Wn;
  const bagAlpha = lerp(0.08, 0.22, humidity);
  const paleRose = "#bd9080";
  const coolGrey = "#a19d9c";
  const clay = "#9d7a6e";
  const pool = [
    [420, 74, 118, 50, paleRose, bagAlpha * 0.78, -0.06],
    [845, 84, 58, 124, paleRose, bagAlpha, 0.24],
    [328, 162, 96, 60, coolGrey, bagAlpha * 0.65, -0.23],
    [760, 148, 112, 66, clay, bagAlpha * 0.88, 0.48],
    [262, 250, 128, 70, paleRose, bagAlpha * 0.75, 0.03],
    [980, 128, 118, 64, coolGrey, bagAlpha * 0.7, -0.17],
    [794, 286, 116, 68, clay, bagAlpha * 0.68, -0.1],
    [1118, 282, 110, 72, paleRose, bagAlpha * 0.86, 0.2],
    [560, 94, 96, 52, coolGrey, bagAlpha * 0.74, 0.08],
    [1048, 228, 132, 64, clay, bagAlpha * 0.64, -0.32],
    [695, 276, 80, 120, paleRose, bagAlpha * 0.78, 0.34],
    [1220, 128, 112, 70, coolGrey, bagAlpha * 0.58, 0.12],
  ];
  const bagCount = Math.round(lerp(3, pool.length, humidity));

  pool.slice(0, bagCount).forEach(([x, y, rx, ry, color, alpha, rotation], index) => {
    const float = Math.sin(frame.phase * 1.6 + index * 1.7) * lerp(6, 24, wind);
    const breathe = 1 + Math.sin(frame.phase * 1.2 + index) * 0.045;
    softEllipse(x + float, y - float * 0.45, rx * breathe, ry * breathe, color, alpha, rotation);
  });

  if (bagCount > 5) {
    plasticRect(604, 192 + Math.sin(frame.phase) * 14, 74, 130, paleRose, bagAlpha * 1.05, -0.24);
  }
  if (bagCount > 8) {
    plasticRect(918, 206 + Math.cos(frame.phase * 0.9) * 16, 78, 124, coolGrey, bagAlpha * 0.72, 0.31);
  }
}

function drawOrange(x, y, radius, color, angle, frame, index) {
  const squash = lerp(0.82, 0.96, (index % 3) / 2);
  const dotCount = 10 + (index % 5);
  const sway = Math.sin(frame.elapsed * 1.35 + index) * lerp(6, 22, frame.Wn);

  ctx.save();
  ctx.translate(x + sway, y);
  ctx.rotate(angle + Math.sin(frame.elapsed * 1.7 + index) * lerp(0.03, 0.11, frame.Wn));
  ctx.scale(1, squash);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.1, radius, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#d74a00";
  ctx.beginPath();
  ctx.ellipse(radius * 0.06, radius * 0.42, radius * 0.86, radius * 0.24, -0.12, Math.PI * 1.02, Math.PI * 1.92);
  ctx.fill();
  ctx.globalAlpha = 1;

  const blemish = "#9b3d2d";
  ctx.fillStyle = blemish;
  for (let i = 0; i < dotCount; i += 1) {
    const u = (i * 37 + index * 19) % 100;
    const v = (i * 53 + index * 11) % 100;
    const px = ((u / 100) - 0.5) * radius * 1.42;
    const py = ((v / 100) - 0.5) * radius * 0.7 + radius * 0.1;
    const rr = radius * lerp(0.035, 0.095, ((i + index) % 5) / 4);
    ctx.globalAlpha = lerp(0.58, 0.9, (i % 3) / 2);
    ctx.beginPath();
    ctx.ellipse(px, py, rr * 1.65, rr, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  const shineY = -radius * 0.32;
  [
    [-0.08, -0.04, 0.11],
    [0.42, -0.14, 0.045],
    [0.66, 0.04, 0.035],
  ].forEach(([sx, sy, size]) => {
    ctx.beginPath();
    ctx.ellipse(radius * sx, shineY + radius * sy, radius * size * 1.7, radius * size, -0.12, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawOranges(frame) {
  const total = Math.round(lerp(5, 20, frame.Mn));
  const colors = colorPlan(total, frame.colorTn);
  const humiditySpread = lerp(0.86, 1.2, frame.Hn);

  for (let i = 0; i < total; i += 1) {
    const column = i % 10;
    const row = Math.floor(i / 10);
    const targetX = 382 + column * 74 + row * 38 + seeded(i, 2) * 42;
    const targetY = 102 + row * 80 + seeded(i, 3) * 150;
    const fallLength = 270 + seeded(i, 4) * 210;
    const cycle = (frame.elapsed * 0.16 + seeded(i, 5) + frame.Mn * 0.18) % 1;
    const drop = clamp(cycle / 0.34, 0, 1);
    const gravity = drop * drop;
    const bounceT = clamp((cycle - 0.34) / 0.66, 0, 1);
    const bounce = Math.sin(bounceT * Math.PI * 3) * (1 - bounceT) * lerp(8, 28, frame.Wn);
    const x = targetX + Math.sin(frame.phase * 1.15 + i) * 22 * humiditySpread;
    const y = targetY - fallLength * (1 - gravity) - bounce;
    const radius = lerp(32, 58, seeded(i, 6));
    const paletteIndex = colors[i];
    const baseAngle = lerp(-0.62, 0.62, seeded(i, 9));
    const landedWobble = Math.sin(frame.elapsed * lerp(1.25, 2.2, frame.Wn) + i * 1.8) * lerp(0.08, 0.28, frame.Wn) * drop;
    const impactWobble = Math.sin(bounceT * Math.PI * 4) * (1 - bounceT) * 0.22;
    const angle = baseAngle + landedWobble + impactWobble;
    ctx.save();
    ctx.globalAlpha = 0.1 + drop * 0.18;
    ctx.fillStyle = "#9d7a6e";
    ctx.beginPath();
    ctx.ellipse(x, targetY + radius * 0.72, radius * 0.82, radius * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawOrange(x, y, radius, orangePalette[paletteIndex], angle, frame, i);
  }
}

function render(now) {
  resizeCanvas();
  const frame = currentFrame(now);
  if (frame) {
    if (!colorInitialized) {
      displayedColorTn = frame.Tn;
      colorInitialized = true;
    }
    displayedColorTn = lerp(displayedColorTn, frame.Tn, 0.012);
    frame.colorTn = displayedColorTn;
    drawBackground(frame);
    drawPlastic(frame);
    drawOranges(frame);
  }
  requestAnimationFrame(render);
}

loadData().then(() => {
  setInterval(loadData, 3000);
  requestAnimationFrame(render);
});
