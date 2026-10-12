// First-person stripbaan, volledig getekend met Canvas. De camera volgt jou.
const INK = "#102d39",
  TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function shape(c, points, fill, stroke = INK, width = 3) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
  }
}
function ellipse(c, x, y, rx, ry, fill, stroke = INK, width = 3) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
  }
}
function line(c, points, color = INK, width = 3) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}

// Draaipunt is het handvat. Snaren blijven binnen de gekantelde racketkop.
export function drawRacket(
  c,
  x,
  y,
  size = 1,
  pose = {},
  swing = 0,
  hand = true,
) {
  const roll = pose.roll || 0,
    yaw = pose.yaw || 0,
    pitch = pose.pitch || 0;
  c.save();
  c.translate(
    x - swing * 260 - (roll + yaw * 0.42) * 2.0 * size,
    y - pitch * 1.2 * size - swing * 60,
  );
  c.rotate(-0.29 + ((roll + yaw * 0.42) * Math.PI) / 180 - swing * 1.1);
  c.scale(size, size);
  if (hand) {
    shape(
      c,
      [
        [9, 37],
        [73, 9],
        [279, 249],
        [153, 270],
      ],
      "#f5b58c",
      INK,
      5,
    );
    shape(
      c,
      [
        [79, 82],
        [114, 58],
        [205, 170],
        [168, 199],
      ],
      "#e78871",
      null,
    );
    shape(
      c,
      [
        [56, 35],
        [103, 9],
        [139, 52],
        [91, 89],
      ],
      "#fbf6dc",
      INK,
      5,
    );
    shape(
      c,
      [
        [72, 52],
        [117, 26],
        [130, 42],
        [84, 68],
      ],
      "#54cbd6",
      INK,
      3,
    );
  }
  shape(
    c,
    [
      [-19, -78],
      [-59, -220],
      [-43, -230],
      [0, -109],
      [43, -230],
      [59, -220],
      [19, -78],
    ],
    "#bddce3",
    INK,
    5,
  );
  shape(
    c,
    [
      [-20, -84],
      [20, -84],
      [22, 81],
      [-20, 85],
    ],
    "#e5ef50",
    INK,
    5,
  );
  for (let i = -70; i < 70; i += 20)
    line(
      c,
      [
        [-18, i],
        [20, i + 13],
      ],
      "#fb913e",
      10,
    );
  line(
    c,
    [
      [-19, -84],
      [-19, 81],
      [20, 81],
      [20, -84],
    ],
    INK,
    4,
  );
  ellipse(c, 0, 85, 23, 8, "#e5f4e6", INK, 4);
  c.save();
  c.translate(0, -310 - pitch * 0.36);
  c.scale(Math.max(0.2, Math.cos((yaw * Math.PI) / 180)), 1 - pitch * 0.002);
  ellipse(c, 5, 4, 105, 145, "#386073", INK, 6);
  ellipse(c, 0, 0, 103, 145, "#c3e1e7", INK, 5);
  ellipse(c, 0, 0, 89, 130, "#0b657922", INK, 4);
  c.save();
  c.beginPath();
  c.ellipse(0, 0, 88, 129, 0, 0, TAU);
  c.clip();
  for (let i = -130; i <= 130; i += 13) {
    line(
      c,
      [
        [i, -142],
        [i, 142],
      ],
      INK,
      4,
    );
    line(
      c,
      [
        [i, -142],
        [i, 142],
      ],
      "#fffbe8",
      1.8,
    );
    line(
      c,
      [
        [-96, i],
        [96, i],
      ],
      INK,
      4,
    );
    line(
      c,
      [
        [-96, i],
        [96, i],
      ],
      "#fffbe8",
      1.8,
    );
  }
  c.restore();
  c.beginPath();
  c.ellipse(0, 0, 98, 139, 0, 3.55, 5.2);
  c.strokeStyle = "#f5fcf5";
  c.lineWidth = 4;
  c.stroke();
  c.restore();
  if (hand) {
    c.beginPath();
    c.moveTo(31, 44);
    c.bezierCurveTo(41, 14, 35, -27, 13, -28);
    c.bezierCurveTo(3, -46, -24, -43, -33, -27);
    c.bezierCurveTo(-46, -14, -35, 0, -20, -3);
    c.bezierCurveTo(-40, 1, -41, 20, -25, 25);
    c.bezierCurveTo(-40, 30, -35, 50, -18, 53);
    c.bezierCurveTo(-30, 69, -12, 80, 4, 74);
    c.closePath();
    c.fillStyle = "#ffc49a";
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.stroke();
    line(
      c,
      [
        [-23, -2],
        [4, 3],
      ],
      "#a95447",
      3,
    );
    line(
      c,
      [
        [-25, 23],
        [3, 30],
      ],
      "#a95447",
      3,
    );
    line(
      c,
      [
        [-17, 52],
        [7, 56],
      ],
      "#a95447",
      3,
    );
    line(
      c,
      [
        [-17, -23],
        [3, -28],
        [15, -17],
      ],
      "#ffe0ac",
      5,
    );
  }
  c.restore();
}

export class CourtRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cameraX = 0;
    this.pose = { roll: 0, pitch: 0, yaw: 0 };
    this.lastTime = 0;
  }
  draw(state, viewer = 0, idle = false, motion = {}) {
    const canvas = this.canvas,
      c = this.ctx;
    const width = canvas.clientWidth || 1600,
      height = canvas.clientHeight || 900;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    // Eén schaalfactor: ballen blijven rond op elk schermformaat.
    const scale = height / 900,
      W = width / scale,
      H = 900;
    c.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    c.lineJoin = "round";
    c.lineCap = "round";
    const now = performance.now(),
      dt = Math.min((now - this.lastTime) / 1000, 0.06);
    this.lastTime = now;
    const smooth = 1 - Math.exp(-dt * 17),
      side = viewer === 1 ? -1 : 1;
    this.cameraX += (state.players[viewer].x * side - this.cameraX) * smooth;
    for (const key of ["roll", "pitch", "yaw"])
      this.pose[key] += ((motion.pose?.[key] || 0) - this.pose[key]) * smooth;
    const localSwing = Math.max(
      state.players[viewer].swing || 0,
      motion.swing || 0,
    );
    const swing =
      localSwing > 0
        ? Math.sin(clamp(1 - localSwing / 0.3, 0, 1) * Math.PI)
        : 0;
    const P = (x, z, y = 0) => {
      const d = Math.max(0.7, 3 + (10 - z * side) * 0.5);
      return [
        W / 2 + ((x * side - this.cameraX) * 1000) / d,
        282 + ((2 - y) * 1000) / d,
        1000 / d,
      ];
    };
    const ground = (x1, z1, x2, z2, color) =>
      shape(c, [P(x1, z1), P(x2, z1), P(x2, z2), P(x1, z2)], color, null);
    const stripe = (x1, z1, x2, z2) => {
      const a = P(x1, z1),
        b = P(x2, z2);
      line(c, [a, b], INK, Math.max(4, Math.min(a[2], b[2]) * 0.035));
      line(c, [a, b], "#fff9e5", Math.max(2.5, Math.min(a[2], b[2]) * 0.02));
    };
    const sky = c.createLinearGradient(0, 0, 0, 470);
    sky.addColorStop(0, "#32bdeb");
    sky.addColorStop(1, "#bcf2ec");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    const cloud = (x, y, s) => {
      c.save();
      c.translate(x, y);
      c.scale(s, s);
      c.beginPath();
      c.moveTo(-135, 30);
      c.bezierCurveTo(-160, 5, -97, 2, -73, 5);
      c.bezierCurveTo(-99, -38, -45, -63, -15, -35);
      c.bezierCurveTo(-3, -102, 99, -106, 102, -26);
      c.bezierCurveTo(159, -67, 208, 0, 188, 21);
      c.bezierCurveTo(275, 24, 223, 46, 168, 42);
      c.bezierCurveTo(95, 63, 13, 53, -4, 37);
      c.bezierCurveTo(-60, 54, -85, 33, -135, 30);
      c.fillStyle = "#fffdf2";
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = "#6595a8";
      c.stroke();
      c.restore();
    };
    cloud(W * 0.19, 107, 1);
    cloud(W * 0.64, 85, 0.73);
    cloud(W * 0.95, 172, 0.54);
    for (let i = 0; i < Math.ceil(W / 66) + 2; i++) {
      const x = i * 66 - 30,
        y = 315 + Math.sin(i * 4.7) * 18;
      ellipse(c, x, y, 63, 69, i % 3 === 0 ? "#53a539" : "#78ba46", INK, 3);
      ellipse(c, x - 17, y + 23, 40, 46, "#397f39", null);
    }
    for (const x of [W * 0.12, W * 0.89]) {
      shape(
        c,
        [
          [x, 343],
          [x - 5, 65],
          [x + 2, 65],
          [x + 8, 343],
        ],
        "#bed5d8",
        INK,
        3,
      );
      shape(
        c,
        [
          [x - 24, 61],
          [x + 25, 61],
          [x + 23, 78],
          [x - 23, 78],
        ],
        "#edf3d8",
        INK,
        3,
      );
      for (let a = -15; a <= 15; a += 15)
        ellipse(c, x + a, 70, 4, 5, "#f5e789", INK, 1);
    }
    c.fillStyle = "#81c551";
    c.fillRect(0, 360, W, H - 360);
    // Tribunes en deterministisch publiek: geen willekeurig flikkeren per frame.
    for (const mirror of [false, true]) {
      c.save();
      if (mirror) {
        c.translate(W, 0);
        c.scale(-1, 1);
      }
      const edge = W * 0.25;
      shape(
        c,
        [
          [-40, 223],
          [edge, 351],
          [edge, 456],
          [-40, 538],
        ],
        "#acc0c5",
        INK,
        4,
      );
      for (let row = 0; row < 3; row++) {
        line(
          c,
          [
            [0, 255 + row * 78],
            [edge, 361 + row * 25],
          ],
          "#f3f4df",
          5,
        );
        for (let j = 0; j < 10; j++) {
          const t = j / 10,
            x = t * edge,
            z = 1 - t * 0.54,
            y = 265 + row * 74 + t * (87 - row * 42);
          c.save();
          c.translate(x, y);
          c.scale(z, z);
          shape(
            c,
            [
              [-16, 16],
              [-17, -6],
              [-9, -18],
              [8, -18],
              [18, -6],
              [20, 16],
            ],
            ["#ffcb48", "#f68477", "#88ccd7", "#416b9b", "#8ebc66"][
              (j + row * 3 + (mirror ? 2 : 0)) % 5
            ],
            INK,
            2.5,
          );
          ellipse(
            c,
            0,
            -25,
            9,
            13,
            ["#f9bf92", "#d89368", "#8e5944"][(j + row) % 3],
            INK,
            2,
          );
          c.beginPath();
          c.arc(0, -28, 10, Math.PI, TAU);
          c.fillStyle = "#483833";
          c.fill();
          c.restore();
        }
      }
      shape(
        c,
        [
          [-30, 465],
          [edge, 408],
          [edge, 472],
          [-30, 563],
        ],
        "#24759b",
        INK,
        4,
      );
      line(
        c,
        [
          [0, 479],
          [edge, 424],
        ],
        "#b2ebdf",
        3,
      );
      c.restore();
    }
    const left = W * 0.245,
      right = W * 0.755;
    shape(
      c,
      [
        [left, 332],
        [right, 332],
        [right, 408],
        [left, 408],
      ],
      "#57adb2",
      INK,
      3,
    );
    c.save();
    c.beginPath();
    c.rect(left, 332, right - left, 76);
    c.clip();
    for (let x = left - 80; x < right + 80; x += 16) {
      line(
        c,
        [
          [x, 332],
          [x + 76, 408],
        ],
        "#204c5280",
        1.7,
      );
      line(
        c,
        [
          [x, 332],
          [x - 76, 408],
        ],
        "#204c5280",
        1.7,
      );
    }
    c.restore();
    shape(
      c,
      [
        [left - 20, 383],
        [right + 20, 383],
        [right + 35, 454],
        [left - 35, 454],
      ],
      "#246d92",
      INK,
      3,
    );
    c.fillStyle = "#a3dae0";
    c.textAlign = "center";
    c.font = "italic 900 20px system-ui";
    c.fillText("P E N N I S", W / 2, 425);
    ground(-6, -12, 6, 13, "#42a4c1");
    ground(-4, -10, 4, 10, "#2c8fb5");
    ground(-3.3, -10, 3.3, 10, "#319bbc");
    ground(-3.3, -5.5, 3.3, 0, "#369fbb");
    stripe(-4, -10, 4, -10);
    stripe(-4, 10, 4, 10);
    stripe(-4, -10, -4, 10);
    stripe(4, -10, 4, 10);
    stripe(-3.3, -10, -3.3, 10);
    stripe(3.3, -10, 3.3, 10);
    stripe(-3.3, -5.5, 3.3, -5.5);
    stripe(-3.3, 5.5, 3.3, 5.5);
    stripe(0, -5.5, 0, 5.5);
    // Alleen de tegenstander is zichtbaar als speler op de baan.
    const other = state.players[1 - viewer],
      op = P(other.x, other.z);
    c.save();
    c.translate(op[0], op[1]);
    c.scale(op[2] / 92, op[2] / 92);
    ellipse(c, 0, 1, 33, 7, "#123c4740", null);
    const bounce = idle
      ? Math.sin(now / 370) * 2
      : Math.sin(state.time * 13) * Math.min(Math.abs(other.x), 1) * 3;
    c.translate(0, bounce);
    line(
      c,
      [
        [-9, -40],
        [-19, -19],
        [-21, -4],
      ],
      INK,
      14,
    );
    line(
      c,
      [
        [10, -40],
        [20, -24],
        [28, -5],
      ],
      INK,
      14,
    );
    line(
      c,
      [
        [-9, -40],
        [-19, -19],
        [-21, -4],
      ],
      "#efb18a",
      9,
    );
    line(
      c,
      [
        [10, -40],
        [20, -24],
        [28, -5],
      ],
      "#efb18a",
      9,
    );
    line(
      c,
      [
        [-26, -3],
        [-16, -3],
      ],
      "#f8f4dc",
      9,
    );
    line(
      c,
      [
        [23, -3],
        [34, -3],
      ],
      "#f8f4dc",
      9,
    );
    shape(
      c,
      [
        [-16, -53],
        [16, -53],
        [23, -32],
        [3, -31],
        [0, -39],
        [-6, -31],
        [-24, -33],
      ],
      "#27485b",
      INK,
      3,
    );
    shape(
      c,
      [
        [-13, -94],
        [10, -94],
        [24, -79],
        [16, -52],
        [-17, -52],
        [-24, -79],
      ],
      "#fff8dc",
      INK,
      3,
    );
    const arm = other.swing > 0 ? Math.sin(other.swing * 13) * 25 : 0;
    line(
      c,
      [
        [-21, -80],
        [-35, -63],
        [-50 + arm, -74 - arm],
      ],
      INK,
      10,
    );
    line(
      c,
      [
        [-21, -80],
        [-35, -63],
        [-50 + arm, -74 - arm],
      ],
      "#efb18a",
      6,
    );
    line(
      c,
      [
        [21, -79],
        [32, -62],
        [42, -60],
      ],
      INK,
      10,
    );
    line(
      c,
      [
        [21, -79],
        [32, -62],
        [42, -60],
      ],
      "#efb18a",
      6,
    );
    c.save();
    c.translate(-54 + arm, -77 - arm);
    c.rotate(-0.6 + arm / 50);
    line(
      c,
      [
        [0, 2],
        [0, -18],
      ],
      INK,
      5,
    );
    ellipse(c, 0, -34, 13, 19, "#8ab3aa66", "#d7f168", 3);
    for (let i = -8; i <= 8; i += 4)
      line(
        c,
        [
          [i, -47],
          [i, -21],
        ],
        "#dff7d5",
        0.7,
      );
    c.restore();
    ellipse(c, 0, -107, 12, 16, "#efb18a", INK, 2.5);
    shape(
      c,
      [
        [-13, -115],
        [-9, -124],
        [6, -126],
        [14, -118],
        [16, -112],
        [-15, -111],
      ],
      "#ff995f",
      INK,
      2.5,
    );
    line(
      c,
      [
        [-15, -111],
        [18, -111],
      ],
      "#f8ead4",
      4,
    );
    line(
      c,
      [
        [-5, -104],
        [-3, -104],
      ],
      INK,
      2,
    );
    line(
      c,
      [
        [5, -104],
        [7, -104],
      ],
      INK,
      2,
    );
    c.restore();
    const ball = () => {
      const b = state.ball,
        p = P(b.x, b.z, b.y),
        floor = P(b.x, b.z),
        r = Math.max(6, p[2] * 0.17);
      if (p[1] < -150 || p[1] > H + 180) return;
      ellipse(c, floor[0], floor[1] + 2, r * 0.95, r * 0.23, "#164f5350", null);
      if (state.phase === "rally") {
        const t = P(b.x - b.vx * 0.055, b.z - b.vz * 0.055, b.y - b.vy * 0.055);
        line(
          c,
          [
            [t[0], t[1]],
            [p[0], p[1]],
          ],
          "#fffbe5aa",
          r * 0.75,
        );
      }
      ellipse(c, p[0], p[1], r, r, "#e4fa43", INK, Math.max(2, r * 0.07));
      c.save();
      c.translate(p[0], p[1]);
      c.rotate(now / 260);
      c.beginPath();
      c.arc(-r * 0.65, 0, r * 0.87, -1.03, 1.03);
      c.strokeStyle = "#8c9c27";
      c.lineWidth = Math.max(3, r * 0.16);
      c.stroke();
      c.strokeStyle = "#fffbd5";
      c.lineWidth = Math.max(2, r * 0.11);
      c.stroke();
      c.beginPath();
      c.arc(r * 0.67, 0, r * 0.87, Math.PI - 1.03, Math.PI + 1.03);
      c.stroke();
      c.restore();
    };
    if (state.ball.z * side < 0) ball();
    const a = P(-4.65, 0, 1.1),
      b = P(4.65, 0, 1.1),
      af = P(-4.65, 0),
      bf = P(4.65, 0);
    shape(c, [a, b, bf, af], "#122e4528", INK, 3);
    for (let x = -4.65; x <= 4.65; x += 0.15)
      line(c, [P(x, 0), P(x, 0, 1.1)], "#143440cc", 1.8);
    for (let y = 0.08; y < 1.1; y += 0.105)
      line(c, [P(-4.65, 0, y), P(4.65, 0, y)], "#143440cc", 1.8);
    line(c, [a, b], INK, 12);
    line(c, [a, b], "#fffbea", 7);
    line(c, [af, bf], INK, 5);
    for (const x of [-4.72, 4.72]) {
      line(c, [P(x, 0, -0.04), P(x, 0, 1.23)], INK, 14);
      line(c, [P(x, 0, -0.04), P(x, 0, 1.23)], "#74be64", 8);
    }
    if (state.ball.z * side >= 0) ball();
    for (let i = 0; i < 5; i++) {
      line(
        c,
        [
          [i * 23, H],
          [W * 0.2 + i * 16, H - 180 - i * 24],
        ],
        "#143a5055",
        2,
      );
      line(
        c,
        [
          [W - i * 23, H],
          [W * 0.82 - i * 17, H - 150 - i * 23],
        ],
        "#143a5055",
        2,
      );
    }
    const pose =
      idle && !motion.pose
        ? { roll: Math.sin(now / 1800) * 3, pitch: 0, yaw: 0 }
        : this.pose;
    drawRacket(c, W * 0.81, H * 0.78, 1.32, pose, swing, true);
    c.save();
    c.translate(W * 0.25, H + 25);
    c.rotate(-0.18 + swing * 0.08);
    c.beginPath();
    c.moveTo(-45, 20);
    c.lineTo(6, -118);
    c.bezierCurveTo(9, -142, 24, -166, 42, -177);
    c.bezierCurveTo(66, -191, 76, -175, 57, -160);
    c.lineTo(43, -141);
    c.bezierCurveTo(73, -161, 91, -161, 91, -145);
    c.lineTo(51, -115);
    c.bezierCurveTo(98, -135, 115, -115, 88, -101);
    c.lineTo(49, -83);
    c.bezierCurveTo(86, -90, 99, -75, 71, -61);
    c.lineTo(42, -47);
    c.lineTo(30, 18);
    c.closePath();
    c.fillStyle = "#ffc295";
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 4;
    c.stroke();
    line(
      c,
      [
        [17, -116],
        [29, -97],
        [42, -88],
      ],
      "#c77561",
      4,
    );
    c.restore();
  }
}
