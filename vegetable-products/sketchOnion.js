// 洋葱 · 新版：每一层改为纯色 (去掉层内明暗渐变)，层间靠边缘淡出柔和过渡

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

let timeSlider;
let playBtn;
let isPlaying = false;
let noiseTexture;

// 同心鳞层 (从外到内绘制)，每层一个气象变量；scale 为相对最外层的缩放
let layerDefs = [
    {scale: 1.00, key: 'T', min: 17.4, max: 20.7}, // 最外层 - 温度
    {scale: 0.80, key: 'H', min: 68,   max: 91},   // 第二层 - 湿度
    {scale: 0.60, key: 'P', min: 1021, max: 1023}, // 第三层 - 气压
    {scale: 0.42, key: 'W', min: 3,    max: 11},   // 第四层 - 风速
    {scale: 0.26, key: 'M', min: 19,   max: 30}    // 最内核 - 水分
];

// 纯色区间：数值低 -> 深紫红，数值高 -> 浅粉白
let ONION_LOW  = [120, 30, 80];
let ONION_HIGH = [240, 198, 218];

let R0 = 215; // 最外层洋葱半径

function setup() {
    let canvas = createCanvas(700, 700);
    canvas.parent('canvas-container');

    timeSlider = document.getElementById('time-slider');
    playBtn = document.getElementById('play-btn');

    playBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        playBtn.innerText = isPlaying ? 'Pause' : 'Play';
    });

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

    if (isPlaying) {
        let t = parseFloat(timeSlider.value) + 0.03;
        if (t >= 24) t = 0;
        timeSlider.value = t;
    }

    let currentTime = parseFloat(timeSlider.value);
    let hour = Math.floor(currentTime);
    let mins = Math.floor((currentTime - hour) * 60);
    document.getElementById('time-display').innerText = nf(hour, 2) + ':' + nf(mins, 2);

    let h1 = Math.floor(currentTime);
    let h2 = (h1 + 1) % 24;
    let amt = currentTime - h1;
    let cur = {
        T: lerp(data[h1].T, data[h2].T, amt),
        H: lerp(data[h1].H, data[h2].H, amt),
        P: lerp(data[h1].P, data[h2].P, amt),
        W: lerp(data[h1].W, data[h2].W, amt),
        M: lerp(data[h1].M, data[h2].M, amt)
    };

    let cx = width / 2;
    let cy = height / 2 + 10;

    push();

    // 整体轻轻摇摆，以顶部为支点
    let pivotY = cy - R0 * 1.12;
    translate(cx, pivotY);
    let swingAngle = sin(frameCount * 0.03) * map(cur.W, 3, 11, 0.02, 0.07);
    rotate(swingAngle);
    translate(-cx, -pivotY);

    noStroke();

    // 同心纯色鳞层：从外到内，每层单一纯色 + 边缘淡出 (层间柔和过渡)
    for (let layer of layerDefs) {
        let R = R0 * layer.scale;
        let norm = constrain(map(cur[layer.key], layer.min, layer.max, 0, 1), 0, 1);
        let col = mixArr(ONION_LOW, ONION_HIGH, norm);
        drawOnionLayer(cx, cy, R, col);
    }

    // 顶部的梗 (横着的长方形，一起摇摆)
    drawStem(cx, cy - R0 * 1.05);

    pop();

    // 噪点
    blendMode(MULTIPLY);
    image(noiseTexture, 0, 0);
    blendMode(BLEND);
}

// 洋葱轮廓路径：底部圆润、顶部收窄成尖 (鳞茎形)
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

// 单层鳞片：整层同一纯色、硬边 (层与层界限清晰，像洋葱横切的同心环)
function drawOnionLayer(cx, cy, R, col) {
    drawingContext.fillStyle = rgbaStr(col, 1);
    onionPath(cx, cy, R);
    drawingContext.fill();
}

// 顶部的梗 (简化为一个横着的长方形)
function drawStem(x, y) {
    push();
    noStroke();
    rectMode(CENTER);
    fill(120, 135, 70);
    rect(x, y, 60, 20);
    pop();
}

// 在两组 RGB 之间按 t 插值，返回 [r, g, b]
function mixArr(a, b, t) {
    return [
        Math.round(lerp(a[0], b[0], t)),
        Math.round(lerp(a[1], b[1], t)),
        Math.round(lerp(a[2], b[2], t))
    ];
}

// 由 [r,g,b] 与透明度生成 'rgba(...)' 字符串
function rgbaStr(c, al) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al + ')';
}
