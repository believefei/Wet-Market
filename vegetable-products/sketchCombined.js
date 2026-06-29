// 合集 · 番茄 / 南瓜 / 洋葱 三联画 (3×1)
// 单一画布并排绘制三种蔬菜，无播放控件，由内部时钟自动随数据驱动播放

let data = [
    {hour: 0, T: 17.8, H: 82, P: 1023, W: 6, M: 24},
    {hour: 1, T: 18.8, H: 77, P: 1022, W: 8, M: 26},
    {hour: 2, T: 19.7, H: 72, P: 1022, W: 10, M: 28},
    {hour: 3, T: 20.7, H: 68, P: 1022, W: 11, M: 30},
    {hour: 4, T: 20.7, H: 69, P: 1022, W: 10, M: 29},
    {hour: 5, T: 20.6, H: 69, P: 1021, W: 10, M: 27},
    {hour: 6, T: 20.5, H: 70, P: 1021, W: 9, M: 25},
    {hour: 7, T: 19.9, H: 75, P: 1022, W: 7, M: 23},
    {hour: 8, T: 19.4, H: 80, P: 1022, W: 5, M: 22},
    {hour: 9, T: 18.8, H: 84, P: 1022, W: 4, M: 21},
    {hour: 10, T: 18.9, H: 81, P: 1022, W: 6, M: 20},
    {hour: 11, T: 19.0, H: 80, P: 1022, W: 7, M: 19},
    {hour: 12, T: 19.0, H: 78, P: 1022, W: 8, M: 20},
    {hour: 13, T: 18.9, H: 77, P: 1022, W: 7, M: 21},
    {hour: 14, T: 18.9, H: 76, P: 1021, W: 6, M: 22},
    {hour: 15, T: 18.9, H: 76, P: 1021, W: 6, M: 23},
    {hour: 16, T: 18.7, H: 79, P: 1021, W: 6, M: 24},
    {hour: 17, T: 18.4, H: 83, P: 1021, W: 6, M: 25},
    {hour: 18, T: 18.0, H: 87, P: 1021, W: 5, M: 26},
    {hour: 19, T: 17.4, H: 91, P: 1022, W: 4, M: 27},
    {hour: 20, T: 17.6, H: 89, P: 1022, W: 4, M: 28},
    {hour: 21, T: 17.5, H: 88, P: 1022, W: 3, M: 28},
    {hour: 22, T: 17.5, H: 86, P: 1022, W: 3, M: 27},
    {hour: 23, T: 17.5, H: 86, P: 1022, W: 3, M: 26}
];

const PANEL = 700;       // 每一格的边长
const NUM = 3;           // 三联
let clock = 0;           // 内部时钟 (0~24)，自动推进
let noiseTexture;

// ---------- 番茄：5 个叠加纯色圆 ----------
let tomatoBlobs = [
    {dx:  0.00, dy:  0.00, r: 168, key: 'P', min: 1021, max: 1023}, // 中心 - 气压
    {dx: -0.62, dy: -0.46, r: 140, key: 'T', min: 17.4, max: 20.7}, // 左上 - 温度
    {dx:  0.62, dy: -0.46, r: 140, key: 'H', min: 68,   max: 91},   // 右上 - 湿度
    {dx: -0.54, dy:  0.56, r: 140, key: 'W', min: 3,    max: 11},   // 左下 - 风速
    {dx:  0.54, dy:  0.56, r: 140, key: 'M', min: 19,   max: 30}    // 右下 - 水分
];
let TOM_LOW  = [202, 24, 12];
let TOM_HIGH = [255, 208, 60];
let TOM_UNIT = 96;

// ---------- 南瓜：5 个瓣块 ----------
let pumpkinLobes = [
    {dx: -1.95, w: 150, hf: 0.84, key: 'T', min: 17.4, max: 20.7}, // 最外左 - 温度
    {dx:  1.95, w: 150, hf: 0.84, key: 'M', min: 19,   max: 30},   // 最外右 - 水分
    {dx: -1.00, w: 210, hf: 0.95, key: 'H', min: 68,   max: 91},   // 内左 - 湿度
    {dx:  1.00, w: 210, hf: 0.95, key: 'W', min: 3,    max: 11},   // 内右 - 风速
    {dx:  0.00, w: 250, hf: 1.00, key: 'P', min: 1021, max: 1023}  // 中间 - 气压
];
let LOBE_LOW  = { mid: [84, 156, 62] };
let LOBE_HIGH = { mid: [244, 222, 78] };

// ---------- 洋葱：同心鳞层 ----------
let onionLayers = [
    {scale: 1.00, key: 'T', min: 17.4, max: 20.7}, // 最外层 - 温度
    {scale: 0.80, key: 'H', min: 68,   max: 91},   // 第二层 - 湿度
    {scale: 0.60, key: 'P', min: 1021, max: 1023}, // 第三层 - 气压
    {scale: 0.42, key: 'W', min: 3,    max: 11},   // 第四层 - 风速
    {scale: 0.26, key: 'M', min: 19,   max: 30}    // 最内核 - 水分
];
let ONION_LOW  = [120, 30, 80];
let ONION_HIGH = [240, 198, 218];
let ONION_R0 = 215;

function setup() {
    let canvas = createCanvas(PANEL * NUM, PANEL);
    canvas.parent('canvas-container');

    // 噪点纹理 (整张画布)
    noiseTexture = createGraphics(width, height);
    noiseTexture.noStroke();
    for (let i = 0; i < width; i += 2) {
        for (let j = 0; j < height; j += 2) {
            if (random(1) > 0.5) {
                noiseTexture.fill(0, 0, 0, 15);
                noiseTexture.rect(i, j, 2, 2);
            }
        }
    }
}

function draw() {
    background(255);

    // 内部时钟自动推进，循环 24 小时
    clock += 0.03;
    if (clock >= 24) clock = 0;

    // 插值取当前数据 (三格共用)
    let h1 = Math.floor(clock);
    let h2 = (h1 + 1) % 24;
    let amt = clock - h1;
    let cur = {
        T: lerp(data[h1].T, data[h2].T, amt),
        H: lerp(data[h1].H, data[h2].H, amt),
        P: lerp(data[h1].P, data[h2].P, amt),
        W: lerp(data[h1].W, data[h2].W, amt),
        M: lerp(data[h1].M, data[h2].M, amt)
    };

    // 三格并排：番茄 / 南瓜 / 洋葱
    push(); translate(PANEL * 0, 0); drawTomato(cur);  pop();
    push(); translate(PANEL * 1, 0); drawPumpkin(cur); pop();
    push(); translate(PANEL * 2, 0); drawOnion(cur);   pop();

    // 噪点叠加 (整张)
    blendMode(MULTIPLY);
    image(noiseTexture, 0, 0);
    blendMode(BLEND);
}

// ============ 番茄 ============
function drawTomato(cur) {
    let cx = PANEL / 2;
    let cy = PANEL / 2 + 10;

    push();
    let pivotY = cy - 210;
    translate(cx, pivotY);
    let swingAngle = sin(frameCount * 0.03) * map(cur.W, 3, 11, 0.02, 0.07);
    rotate(swingAngle);
    translate(-cx, -pivotY);

    noStroke();
    drawStemRect(cx, cy - 175, 50, 16);

    for (let b of tomatoBlobs) {
        let norm = constrain(map(cur[b.key], b.min, b.max, 0, 1), 0, 1);
        let col = mixArr(TOM_LOW, TOM_HIGH, norm);
        drawingContext.fillStyle = rgbaStr(col, 0.82);
        circle(cx + b.dx * TOM_UNIT, cy + b.dy * TOM_UNIT, b.r * 2);
    }
    pop();
}

// ============ 南瓜 ============
function drawPumpkin(cur) {
    let cx = PANEL / 2;
    let cy = PANEL / 2 + 15;
    let H = 360;
    let unit = 78;

    push();
    let pivotY = cy - H / 2 - 50;
    translate(cx, pivotY);
    let swingAngle = sin(frameCount * 0.03) * map(cur.W, 3, 11, 0.02, 0.07);
    rotate(swingAngle);
    translate(-cx, -pivotY);

    noStroke();

    for (let lobe of pumpkinLobes) {
        let norm = constrain(map(cur[lobe.key], lobe.min, lobe.max, 0, 1), 0, 1);
        let sizeF = lerp(0.9, 1.1, norm);
        let lx = cx + lobe.dx * unit;
        let lw = lobe.w * sizeF;
        let lh = H * lobe.hf * sizeF;
        drawLobe(lx, cy, lw, lh, norm);
    }

    // 柔和光泽
    let sheen = drawingContext.createRadialGradient(
        cx - 70, cy - 90, 10, cx - 70, cy - 90, 200
    );
    sheen.addColorStop(0, 'rgba(255, 240, 200, 0.28)');
    sheen.addColorStop(1, 'rgba(255, 240, 200, 0)');
    drawingContext.fillStyle = sheen;
    ellipse(cx - 60, cy - 70, 320, 360);

    // 果茎
    drawStemRect(cx, cy - H / 2 + 8 - 28, 20, 60);

    pop();
}

function drawLobe(lx, ly, lw, lh, norm) {
    let r = max(lw, lh) * 0.62;
    let col = mixArr(LOBE_LOW.mid, LOBE_HIGH.mid, norm);
    let g = drawingContext.createRadialGradient(
        lx, ly, lw * 0.10,
        lx, ly, r
    );
    g.addColorStop(0,    rgbaStr(col, 0.82));
    g.addColorStop(0.78, rgbaStr(col, 0.82));
    g.addColorStop(1,    rgbaStr(col, 0));
    drawingContext.fillStyle = g;
    ellipse(lx, ly, lw, lh);
}

// ============ 洋葱 ============
function drawOnion(cur) {
    let cx = PANEL / 2;
    let cy = PANEL / 2 + 10;

    push();
    let pivotY = cy - ONION_R0 * 1.12;
    translate(cx, pivotY);
    let swingAngle = sin(frameCount * 0.03) * map(cur.W, 3, 11, 0.02, 0.07);
    rotate(swingAngle);
    translate(-cx, -pivotY);

    noStroke();

    for (let layer of onionLayers) {
        let R = ONION_R0 * layer.scale;
        let norm = constrain(map(cur[layer.key], layer.min, layer.max, 0, 1), 0, 1);
        let col = mixArr(ONION_LOW, ONION_HIGH, norm);
        drawingContext.fillStyle = rgbaStr(col, 1);
        onionPath(cx, cy, R);
        drawingContext.fill();
    }

    drawStemRect(cx, cy - ONION_R0 * 1.05, 60, 20);

    pop();
}

function onionPath(cx, cy, R) {
    let topY = R * 1.08;
    let botY = R * 0.98;
    drawingContext.beginPath();
    drawingContext.moveTo(cx, cy - topY);
    drawingContext.bezierCurveTo(cx + R * 0.55, cy - topY, cx + R, cy - R * 0.45, cx + R, cy + R * 0.05);
    drawingContext.bezierCurveTo(cx + R, cy + R * 0.62, cx + R * 0.58, cy + botY, cx, cy + botY);
    drawingContext.bezierCurveTo(cx - R * 0.58, cy + botY, cx - R, cy + R * 0.62, cx - R, cy + R * 0.05);
    drawingContext.bezierCurveTo(cx - R, cy - R * 0.45, cx - R * 0.55, cy - topY, cx, cy - topY);
    drawingContext.closePath();
}

// ============ 公共工具 ============
// 顶部的梗 (居中长方形)
function drawStemRect(x, y, w, h) {
    push();
    noStroke();
    rectMode(CENTER);
    fill(120, 135, 70);
    rect(x, y, w, h);
    pop();
}

function mixArr(a, b, t) {
    return [
        Math.round(lerp(a[0], b[0], t)),
        Math.round(lerp(a[1], b[1], t)),
        Math.round(lerp(a[2], b[2], t))
    ];
}

function rgbaStr(c, al) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al + ')';
}
