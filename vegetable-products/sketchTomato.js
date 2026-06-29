// 番茄 · 新版：像南瓜那样，用纯色半透明色块叠加，边缘融合出渐变
// 5 个变量 = 5 个叠在一起的纯色圆 (番茄红 ~ 金黄，由数据决定)

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

// 5 个叠加的纯色圆：圆心 1 个 + 四周 4 个，彼此重叠融合
// dx/dy 为相对中心的偏移 (乘以 unit)，每个圆承载一个气象变量
let blobDefs = [
    {dx:  0.00, dy:  0.00, r: 168, key: 'P', min: 1021, max: 1023}, // 中心 - 气压
    {dx: -0.62, dy: -0.46, r: 140, key: 'T', min: 17.4, max: 20.7}, // 左上 - 温度
    {dx:  0.62, dy: -0.46, r: 140, key: 'H', min: 68,   max: 91},   // 右上 - 湿度
    {dx: -0.54, dy:  0.56, r: 140, key: 'W', min: 3,    max: 11},   // 左下 - 风速
    {dx:  0.54, dy:  0.56, r: 140, key: 'M', min: 19,   max: 30}    // 右下 - 水分
];

// 纯色区间：数值低 -> 深番茄红，数值高 -> 明亮金黄 (中段经过橙)
let TOM_LOW  = [202, 24, 12];
let TOM_HIGH = [255, 208, 60];

let unit = 96; // 各圆中心的偏移尺度

function setup() {
    let canvas = createCanvas(700, 700);
    canvas.parent('canvas-container');

    timeSlider = document.getElementById('time-slider');
    playBtn = document.getElementById('play-btn');

    playBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        playBtn.innerText = isPlaying ? 'Pause' : 'Play';
    });

    // 噪点纹理
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

    // 整体轻轻摇摆 (受风速影响)，以顶部为支点
    let pivotY = cy - 210;
    translate(cx, pivotY);
    let swingAngle = sin(frameCount * 0.03) * map(cur.W, 3, 11, 0.02, 0.07);
    rotate(swingAngle);
    translate(-cx, -pivotY);

    noStroke();

    // 顶部的梗 (一个小短横)
    drawStem(cx, cy - 175);

    // 5 个纯色圆叠加：每圆单一纯色 + 边缘淡出，重叠处红/橙/黄融合成渐变
    for (let b of blobDefs) {
        let norm = constrain(map(cur[b.key], b.min, b.max, 0, 1), 0, 1);
        let col = mixArr(TOM_LOW, TOM_HIGH, norm);
        drawBlob(cx + b.dx * unit, cy + b.dy * unit, b.r, col);
    }

    pop();

    // 噪点
    blendMode(MULTIPLY);
    image(noiseTexture, 0, 0);
    blendMode(BLEND);
}

// 单个纯色圆：整片同一纯色、硬边 (边界清晰)；半透明，重叠处仍透叠融合
function drawBlob(x, y, r, col) {
    drawingContext.fillStyle = rgbaStr(col, 0.82);
    circle(x, y, r * 2);
}

// 顶部的梗 (简化为一个小短横)
function drawStem(x, y) {
    push();
    noStroke();
    rectMode(CENTER);
    fill(120, 135, 70);
    rect(x, y, 50, 16);
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
