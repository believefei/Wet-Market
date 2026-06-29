const canvas = document.getElementById("poster");
const ctx = canvas.getContext("2d");

const DESIGN_W = 1440;
const DESIGN_H = 360;
const DPR_LIMIT = 2;

const pearSources = ["梨子2.png", "梨子1.png", "梨子3.png"];
const bagSource = "梨子袋子.png";

let rows = [];
let normalized = [];
let startTime = performance.now();
let lastCsvText = "";
let displayedTypeTn = 0.5;
let typeInitialized = false;
let assetsReady = false;

const pears = pearSources.map(loadImage);
const bagImage = loadImage(bagSource);

Promise.all([...pears, bagImage].map((image) => image.decode())).then(() => {
  assetsReady = true;
});

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixHex(a, b, t) {
  const ah = a.replace("#", "");
  const bh = b.replace("#", "");
  const ar = parseInt(ah.slice(0, 2), 16);
  const ag = parseInt(ah.slice(2, 4), 16);
  const ab = parseInt(ah.slice(4, 6), 16);
  const br = parseInt(bh.slice(0, 2), 16);
  const bg = parseInt(bh.slice(2, 4), 16);
  const bb = parseInt(bh.slice(4, 6), 16);
  const toHex = (value) => Math.round(value).toString(16).padStart(2, "0");
  return `#${toHex(lerp(ar, br, t))}${toHex(lerp(ag, bg, t))}${toHex(lerp(ab, bb, t))}`;
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
  const progress = (elapsed / cycleSeconds) % 1;
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

function typeCounts(total, tempNorm) {
  const coolWeights = [0.42, 0.18, 0.4];
  const warmWeights = [0.18, 0.46, 0.36];
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

function typePlan(total, tempNorm) {
  const plan = new Array(total);
  const rankedSlots = Array.from({ length: total }, (_, index) => index).sort(
    (a, b) => seeded(a, 22) - seeded(b, 22),
  );
  let cursor = 0;

  typeCounts(total, tempNorm).forEach((count, typeIndex) => {
    for (let i = 0; i < count; i += 1) {
      plan[rankedSlots[cursor]] = typeIndex;
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

  ctx.setTransform(canvas.width / DESIGN_W, 0, 0, canvas.height / DESIGN_H, 0, 0);
}

function drawImageCentered(image, x, y, width, height, angle, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function drawBackground(frame) {
  ctx.fillStyle = mixHex("#0f6fd3", "#0864c6", frame.Pn);
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  const gap = lerp(62, 50, frame.Pn);
  const baseSize = gap * 0.24;
  const waveStrength = lerp(0.16, 0.34, frame.Wn);
  const pressureStrength = lerp(0.08, 0.2, frame.Pn);

  ctx.save();
  ctx.fillStyle = "#ffffff";
  for (let y = 14; y < DESIGN_H + gap; y += gap) {
    for (let x = 18; x < DESIGN_W + gap; x += gap) {
      const horizontalWave = Math.sin(x * 0.017 + frame.phase * 1.25);
      const diagonalWave = Math.sin((x + y * 2.1) * 0.012 - frame.phase * 0.85);
      const verticalWave = Math.sin(y * 0.058 + frame.phase * 1.1);
      const wave = horizontalWave * waveStrength + diagonalWave * pressureStrength + verticalWave * 0.07;
      const size = baseSize * clamp(1 + wave, 0.5, 1.55);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }
  ctx.restore();
}

function pearLayout(index) {
  const anchors = [
    [520, 70],
    [845, 78],
    [430, 174],
    [620, 180],
    [782, 194],
    [1018, 196],
    [600, 290],
    [860, 286],
    [290, 214],
    [1120, 118],
    [1060, 288],
    [710, 92],
    [504, 256],
    [934, 136],
    [360, 94],
    [1180, 250],
  ];
  const [baseX, baseY] = anchors[index % anchors.length];
  const lane = Math.floor(index / anchors.length);
  return {
    x: baseX + lane * 40 + (seeded(index, 3) - 0.5) * 30,
    y: baseY + (seeded(index, 4) - 0.5) * 30,
  };
}

function drawPears(frame) {
  const total = Math.round(lerp(5, 16, frame.Mn));
  const bagCount = Math.round(lerp(1, Math.min(6, total), frame.Hn));
  const typeSlots = typePlan(total, frame.typeTn);
  const bagSlots = Array.from({ length: total }, (_, index) => index)
    .sort((a, b) => seeded(a, 31) - seeded(b, 31))
    .slice(0, bagCount);

  for (let i = 0; i < total; i += 1) {
    const { x: targetX, y: targetY } = pearLayout(i);
    const image = pears[typeSlots[i]];
    const baseWidth = lerp(104, 148, seeded(i, 7));
    const aspect = image.height / image.width;
    const width = baseWidth * lerp(0.92, 1.08, seeded(i, 8));
    const height = width * aspect;
    const startY = -height * lerp(0.72, 1.35, seeded(i, 9));
    const cycle = (frame.elapsed * 0.15 + seeded(i, 10) + frame.Mn * 0.14) % 1;
    const drop = clamp(cycle / 0.36, 0, 1);
    const gravity = drop * drop;
    const bounceT = clamp((cycle - 0.36) / 0.64, 0, 1);
    const bounce = Math.sin(bounceT * Math.PI * 3) * (1 - bounceT) * lerp(5, 18, frame.Wn);
    const sway = Math.sin(frame.elapsed * 1.25 + i * 1.4) * lerp(3, 15, frame.Wn);
    const x = targetX + sway;
    const y = lerp(startY, targetY, gravity) - bounce;
    const baseAngle = lerp(-0.36, 0.36, seeded(i, 11));
    const wobble = Math.sin(frame.elapsed * 1.45 + i * 1.6) * lerp(0.035, 0.12, frame.Wn) * drop;
    const impactWobble = Math.sin(bounceT * Math.PI * 4) * (1 - bounceT) * 0.15;
    const angle = baseAngle + wobble + impactWobble;

    if (drop > 0.42) {
      const shadowGrow = clamp((drop - 0.42) / 0.58, 0, 1);
      ctx.save();
      ctx.globalAlpha = lerp(0.07, 0.24, shadowGrow);
      ctx.fillStyle = "#083b78";
      ctx.beginPath();
      ctx.ellipse(
        x,
        targetY + height * 0.42,
        width * lerp(0.18, 0.4, shadowGrow),
        height * lerp(0.04, 0.1, shadowGrow),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    drawImageCentered(image, x, y, width, height, angle);

    if (bagSlots.includes(i)) {
      const bagWidth = width * lerp(0.72, 0.9, seeded(i, 13));
      const bagHeight = bagWidth * (bagImage.height / bagImage.width);
      const bagX = x - width * lerp(0.02, 0.11, seeded(i, 14));
      const bagY = y + height * lerp(0.18, 0.32, seeded(i, 15));
      const bagAngle = angle + lerp(-0.12, 0.12, seeded(i, 16));
      drawImageCentered(bagImage, bagX, bagY, bagWidth, bagHeight, bagAngle, 0.86);
    }
  }
}

function render(now) {
  resizeCanvas();
  const frame = currentFrame(now);
  if (frame && assetsReady) {
    if (!typeInitialized) {
      displayedTypeTn = frame.Tn;
      typeInitialized = true;
    }
    displayedTypeTn = lerp(displayedTypeTn, frame.Tn, 0.012);
    frame.typeTn = displayedTypeTn;
    drawBackground(frame);
    drawPears(frame);
  }
  requestAnimationFrame(render);
}

loadData().then(() => {
  setInterval(loadData, 3000);
  requestAnimationFrame(render);
});
