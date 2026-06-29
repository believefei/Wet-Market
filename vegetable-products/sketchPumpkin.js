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

// 南瓜的瓣块定义 (从外到内排列，最后画中间瓣使其叠在最上层)
// dx: 横向偏移单位; w: 瓣宽; hf: 高度系数 (外侧瓣略矮，形成透视收拢)
// 每一瓣承载一个气象变量：瓣的颜色随该数值在橙黄区间里深浅变化
let lobeDefs = [
    {dx: -1.95, w: 150, hf: 0.84, key: 'T', min: 17.4, max: 20.7}, // 最外左 - 温度
    {dx:  1.95, w: 150, hf: 0.84, key: 'M', min: 19,   max: 30},   // 最外右 - 水分
    {dx: -1.00, w: 210, hf: 0.95, key: 'H', min: 68,   max: 91},   // 内左 - 湿度
    {dx:  1.00, w: 210, hf: 0.95, key: 'W', min: 3,    max: 11},   // 内右 - 风速
    {dx:  0.00, w: 250, hf: 1.00, key: 'P', min: 1021, max: 1023}  // 中间 - 气压
];

// 黄绿配色：低值瓣 = 绿，高值瓣 = 黄；交叠处绿黄混合成渐变 (纯色用的是 mid)
let LOBE_LOW  = { hi: [120, 190, 90], mid: [84, 156, 62],  edge: [54, 110, 40]  };
let LOBE_HIGH = { hi: [255, 246, 150], mid: [244, 222, 78], edge: [205, 178, 42] };

function setup() {
    let canvas = createCanvas(700, 700);
    canvas.parent('canvas-container');

    // 绑定 DOM 控件
    timeSlider = document.getElementById('time-slider');
    playBtn = document.getElementById('play-btn');

    playBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        playBtn.innerText = isPlaying ? 'Pause' : 'Play';
    });

    // 创建噪点纹理
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

    // 处理动画播放
    if (isPlaying) {
        let t = parseFloat(timeSlider.value) + 0.03; // 放慢一点点速度使其更平滑
        if (t >= 24) t = 0;
        timeSlider.value = t;
    }

    let currentTime = parseFloat(timeSlider.value);

    // 更新时间显示
    let hour = Math.floor(currentTime);
    let mins = Math.floor((currentTime - hour) * 60);
    document.getElementById('time-display').innerText =
        nf(hour, 2) + ':' + nf(mins, 2);

    // 插值获取当前数据
    let h1 = Math.floor(currentTime);
    let h2 = (h1 + 1) % 24;
    let amt = currentTime - h1;

    let currentData = {
        T: lerp(data[h1].T, data[h2].T, amt),
        H: lerp(data[h1].H, data[h2].H, amt),
        P: lerp(data[h1].P, data[h2].P, amt),
        W: lerp(data[h1].W, data[h2].W, amt),
        M: lerp(data[h1].M, data[h2].M, amt)
    };

    let cx = width / 2;
    let cy = height / 2 + 15; // 南瓜主体中心略微下移，给顶部果茎留空间

    // T: 17.4-20.7, H: 68-91, P: 1021-1023, W: 3-11, M: 19-30
    let H = 360; // 南瓜整体高度
    let unit = 78; // 瓣块横向间距单位

    // --- 绘制南瓜主体逻辑 (数据直接长在南瓜的瓣块上) ---
    push();

    // 整体轻轻摇摆，幅度受风速 W 影响；以顶部果茎为支点
    let pivotY = cy - H / 2 - 50;
    translate(cx, pivotY);
    let swingAngle = sin(frameCount * 0.03) * map(currentData.W, 3, 11, 0.02, 0.07);
    rotate(swingAngle);
    translate(-cx, -pivotY);

    noStroke();

    // 1. 南瓜瓣块主体 - 逐瓣绘制：每瓣的橙黄深浅 + 大小都由其对应的气象数值决定
    for (let lobe of lobeDefs) {
        let norm = constrain(map(currentData[lobe.key], lobe.min, lobe.max, 0, 1), 0, 1);
        let sizeF = lerp(0.9, 1.1, norm); // 数值越大，这一瓣稍微更饱满 (±10% 轻微变化)
        let lx = cx + lobe.dx * unit;
        let lw = lobe.w * sizeF;
        let lh = H * lobe.hf * sizeF;
        drawLobe(lx, cy, lw, lh, norm);
    }

    // 2. 整体柔和光泽 (非数据，仅增加南瓜的油亮感，不做高光点)
    let sheen = drawingContext.createRadialGradient(
        cx - 70, cy - 90, 10, cx - 70, cy - 90, 200
    );
    sheen.addColorStop(0, 'rgba(255, 240, 200, 0.28)');
    sheen.addColorStop(1, 'rgba(255, 240, 200, 0)');
    drawingContext.fillStyle = sheen;
    ellipse(cx - 60, cy - 70, 320, 360);

    // 3. 顶部的果茎 (一起摇摆)
    drawStem(cx, cy - H / 2 + 8);

    pop(); // 结束整体摇摆

    // 叠加噪点
    blendMode(MULTIPLY);
    image(noiseTexture, 0, 0);
    blendMode(BLEND);
}

// 绘制单个南瓜瓣块：竖向椭圆 + 带高光的径向渐变，叠加后自然形成瓣槽
// norm (0~1) 为该瓣对应数据的归一化值：越大颜色越明亮金黄，越小越深沉
function drawLobe(lx, ly, lw, lh, norm) {
    let r = max(lw, lh) * 0.62;
    let col = mixArr(LOBE_LOW.mid, LOBE_HIGH.mid, norm); // 该瓣的单一纯色 (橙 ~ 奶白)
    let g = drawingContext.createRadialGradient(
        lx, ly, lw * 0.10,
        lx, ly, r
    );
    // 整片同一纯色、无明暗立体；仅最边缘淡出，用于相邻瓣交叠处的橙白融合
    g.addColorStop(0,    rgbaStr(col, 0.82));
    g.addColorStop(0.78, rgbaStr(col, 0.82));
    g.addColorStop(1,    rgbaStr(col, 0));
    drawingContext.fillStyle = g;
    ellipse(lx, ly, lw, lh);
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

// 顶部的果茎 (简化为一个长方形)
function drawStem(x, y) {
    push();
    noStroke();
    rectMode(CENTER);
    fill(120, 135, 70);
    rect(x, y - 28, 20, 60);
    pop();
}
