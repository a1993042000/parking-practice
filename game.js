// ===== 停車練習 Parking Practice — top-down kinematic parking sim =====
(() => {
  "use strict";

  // ---- World / rendering ----
  const WORLD = { w: 1000, h: 680 };
  const SCALE = 13;            // pixels (world units) per meter
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let view = { scale: 1, ox: 0, oy: 0 }; // canvas px = world * scale + offset

  function resize() {
    const cssW = canvas.clientWidth;
    const cssH = Math.round(cssW * WORLD.h / WORLD.w);
    canvas.style.height = cssH + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    view.scale = canvas.width / WORLD.w;
    view.ox = 0; view.oy = 0;
  }
  window.addEventListener("resize", resize);

  // ---- Geometry helpers ----
  function rectCorners(cx, cy, len, wid, ang) {
    // len along heading, wid perpendicular
    const c = Math.cos(ang), s = Math.sin(ang);
    const fx = c, fy = s;        // forward unit
    const rx = -s, ry = c;       // right unit
    const hl = len / 2, hw = wid / 2;
    return [
      { x: cx + fx*hl + rx*hw, y: cy + fy*hl + ry*hw },
      { x: cx + fx*hl - rx*hw, y: cy + fy*hl - ry*hw },
      { x: cx - fx*hl - rx*hw, y: cy - fy*hl - ry*hw },
      { x: cx - fx*hl + rx*hw, y: cy - fy*hl + ry*hw },
    ];
  }
  function aabbCorners(r) {
    return [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
    ];
  }
  // Separating Axis Theorem for two convex polygons
  function polyOverlap(a, b) {
    const polys = [a, b];
    for (let p = 0; p < 2; p++) {
      const poly = polys[p];
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        const nx = -(poly[j].y - poly[i].y);
        const ny =  (poly[j].x - poly[i].x);
        let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
        for (const v of a) { const d = v.x*nx + v.y*ny; if (d<minA)minA=d; if (d>maxA)maxA=d; }
        for (const v of b) { const d = v.x*nx + v.y*ny; if (d<minB)minB=d; if (d>maxB)maxB=d; }
        if (maxA < minB || maxB < minA) return false; // separating axis found
      }
    }
    return true;
  }

  // ---- Levels ----
  const D = Math.PI / 180;
  // helpers to build a perpendicular spot flanked by parked cars
  function levels() {
    const border = 14;
    const W = WORLD.w, H = WORLD.h;
    const L = [];

    // 1. Warm up — open lot, drive into a top spot
    L.push({
      name: "暖身：開進車位", diff: 1,
      desc: "開放停車場。把車往上開進綠色車位並對正。",
      start: { x: 500, y: 560, a: -90*D },
      spot:  { x: 500, y: 150, a: -90*D, len: 78, wid: 40 },
      walls: [], cars: [],
    });

    // 2. Perpendicular reverse between two cars
    L.push({
      name: "垂直停車（夾縫）", diff: 2,
      desc: "兩車中間的垂直車位。倒車或前進入位皆可，注意左右車輛。",
      start: { x: 500, y: 520, a: -90*D },
      spot:  { x: 500, y: 150, a: -90*D, len: 80, wid: 42 },
      walls: [ { x: 80, y: 96, w: W-160, h: 8 } ], // top kerb line
      cars: [
        { x: 446, y: 150, a: -90*D, len: 74, wid: 26 },
        { x: 554, y: 150, a: -90*D, len: 74, wid: 26 },
      ],
    });

    // 3. Parallel parking at the kerb
    L.push({
      name: "路邊平行停車", diff: 3,
      desc: "沿著下方路緣，倒車進入兩車之間的平行車位。",
      start: { x: 300, y: 470, a: 0 },
      spot:  { x: 500, y: 566, a: 0, len: 96, wid: 38 },
      walls: [ { x: 80, y: 600, w: W-160, h: 40 } ], // kerb
      cars: [
        { x: 392, y: 566, a: 0, len: 70, wid: 28 },
        { x: 612, y: 566, a: 0, len: 70, wid: 28 },
      ],
    });

    // 4. Reverse into a narrow garage (U-shaped walls)
    L.push({
      name: "窄車庫倒車", diff: 3,
      desc: "倒車進入上方的窄車庫，三面是牆，開口很窄。",
      start: { x: 500, y: 520, a: -90*D },
      spot:  { x: 500, y: 150, a: -90*D, len: 80, wid: 40 },
      walls: [
        { x: 452, y: 96, w: 10, h: 130 },   // left wall
        { x: 538, y: 96, w: 10, h: 130 },   // right wall
        { x: 452, y: 96, w: 96, h: 10 },    // back wall
      ],
      cars: [],
    });

    // 5. S-bend narrow alley to a spot (verified slalom: weave R-L-R up to the spot)
    L.push({
      name: "S 型窄巷", diff: 4,
      desc: "由下往上穿過 S 型窄巷（右-左-右），最後停進巷底車位。慢慢轉別刮牆。",
      start: { x: 500, y: 610, a: -90*D },
      spot:  { x: 500, y: 120, a: -90*D, len: 80, wid: 42 },
      walls: [
        // stage 1 — gap on right-centre (x 534..720)
        { x: 14,  y: 500, w: 520, h: 16 },
        { x: 720, y: 500, w: 266, h: 16 },
        // stage 2 — gap on left-centre (x 134..280)
        { x: 14,  y: 340, w: 120, h: 16 },
        { x: 280, y: 340, w: 706, h: 16 },
        // stage 3 — gap on right-centre (x 534..720)
        { x: 14,  y: 180, w: 520, h: 16 },
        { x: 720, y: 180, w: 266, h: 16 },
      ],
      cars: [],
    });

    // 6. Tight parallel parking (hard)
    L.push({
      name: "緊密平行停車", diff: 5,
      desc: "高難度：兩車之間只有一點點空間，精準操作才停得進去。",
      start: { x: 300, y: 470, a: 0 },
      spot:  { x: 500, y: 566, a: 0, len: 80, wid: 34 },
      walls: [ { x: 80, y: 600, w: W-160, h: 40 } ],
      cars: [
        { x: 404, y: 566, a: 0, len: 72, wid: 28 },
        { x: 596, y: 566, a: 0, len: 72, wid: 28 },
      ],
    });

    // attach border walls to every level
    for (const lv of L) {
      lv.walls = lv.walls.concat([
        { x: 0, y: 0, w: W, h: border },
        { x: 0, y: H-border, w: W, h: border },
        { x: 0, y: 0, w: border, h: H },
        { x: W-border, y: 0, w: border, h: H },
      ]);
    }
    return L;
  }
  const LEVELS = levels();

  // ---- Game state ----
  const state = {
    li: 0,
    car: { x: 0, y: 0, a: 0, v: 0, steer: 0 },
    carLen: 4.6 * SCALE,
    carWid: 1.9 * SCALE,
    bumps: 0,
    bumpCool: 0,
    time: 0,
    won: false,
    running: true,
  };

  const input = { up: false, down: false, left: false, right: false, brake: false };

  function loadLevel(i) {
    state.li = (i + LEVELS.length) % LEVELS.length;
    const lv = LEVELS[state.li];
    state.car.x = lv.start.x;
    state.car.y = lv.start.y;
    state.car.a = lv.start.a;
    state.car.v = 0;
    state.car.steer = 0;
    state.bumps = 0;
    state.time = 0;
    state.won = false;
    state.bumpCool = 0;
    document.getElementById("banner").classList.add("hidden");
    document.getElementById("levelLabel").textContent =
      `${state.li + 1}/${LEVELS.length}  ${lv.name}`;
    document.getElementById("hudLevel").textContent = state.li + 1;
    document.getElementById("hudDiff").textContent = "★".repeat(lv.diff);
    document.getElementById("desc").textContent = "本關：" + lv.desc;
    updateHud();
  }

  function updateHud() {
    document.getElementById("hudBumps").textContent = state.bumps;
    document.getElementById("hudTime").textContent = state.time.toFixed(1) + "s";
  }

  // ---- Obstacle polygons for current level ----
  function obstaclePolys() {
    const lv = LEVELS[state.li];
    const polys = [];
    for (const w of lv.walls) polys.push({ poly: aabbCorners(w), kind: "wall" });
    for (const c of lv.cars) polys.push({ poly: rectCorners(c.x, c.y, c.len, c.wid, c.a), kind: "car" });
    return polys;
  }

  function carPolyAt(x, y, a) {
    return rectCorners(x, y, state.carLen, state.carWid, a);
  }

  function collides(x, y, a) {
    const cp = carPolyAt(x, y, a);
    for (const o of obstaclePolys()) {
      if (polyOverlap(cp, o.poly)) return true;
    }
    return false;
  }

  // ---- Win check: car fully inside spot & aligned & stopped ----
  function checkWin() {
    const sp = LEVELS[state.li].spot;
    const cs = carPolyAt(state.car.x, state.car.y, state.car.a);
    const c = Math.cos(-sp.a), s = Math.sin(-sp.a);
    const hl = sp.len / 2, hw = sp.wid / 2;
    const tol = 3;
    for (const v of cs) {
      const dx = v.x - sp.x, dy = v.y - sp.y;
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      if (Math.abs(lx) > hl + tol || Math.abs(ly) > hw + tol) return false;
    }
    // heading aligned (mod 180°)
    let da = (state.car.a - sp.a) % Math.PI;
    if (da > Math.PI / 2) da -= Math.PI;
    if (da < -Math.PI / 2) da += Math.PI;
    if (Math.abs(da) > 14 * D) return false;
    // nearly stopped
    if (Math.abs(state.car.v) > 4) return false;
    return true;
  }

  // ---- Physics (kinematic bicycle) ----
  const MAX_FWD = 115, MAX_REV = 72;
  const ACCEL = 175, BRAKE = 230, ROLL = 70;
  const MAX_STEER = 36 * D, STEER_RATE = 130 * D, STEER_RETURN = 170 * D;

  function update(dt) {
    if (!state.running) return;
    if (state.won) return;
    state.time += dt;
    state.bumpCool = Math.max(0, state.bumpCool - dt);

    const car = state.car;
    // steering
    if (input.left && !input.right) {
      car.steer = Math.max(-MAX_STEER, car.steer - STEER_RATE * dt);
    } else if (input.right && !input.left) {
      car.steer = Math.min(MAX_STEER, car.steer + STEER_RATE * dt);
    } else {
      if (car.steer > 0) car.steer = Math.max(0, car.steer - STEER_RETURN * dt);
      else car.steer = Math.min(0, car.steer + STEER_RETURN * dt);
    }
    // longitudinal
    if (input.brake) {
      if (car.v > 0) car.v = Math.max(0, car.v - BRAKE * dt);
      else car.v = Math.min(0, car.v + BRAKE * dt);
    } else if (input.up && !input.down) {
      car.v += ACCEL * dt;
    } else if (input.down && !input.up) {
      car.v -= ACCEL * dt;
    } else {
      // rolling resistance
      if (car.v > 0) car.v = Math.max(0, car.v - ROLL * dt);
      else car.v = Math.min(0, car.v + ROLL * dt);
    }
    car.v = Math.max(-MAX_REV, Math.min(MAX_FWD, car.v));

    // integrate bicycle model
    const wb = state.carLen * 0.58;
    const nx = car.x + car.v * Math.cos(car.a) * dt;
    const ny = car.y + car.v * Math.sin(car.a) * dt;
    const na = car.a + (car.v / wb) * Math.tan(car.steer) * dt;

    if (collides(nx, ny, na)) {
      // blocked — register a bump, stop
      if (state.bumpCool <= 0 && Math.abs(car.v) > 12) {
        state.bumps++;
        state.bumpCool = 0.4;
        flashBump();
      }
      car.v = 0;
      // do not commit position (prevents overlap; reversing next frame can escape)
    } else {
      car.x = nx; car.y = ny; car.a = na;
    }

    if (checkWin()) win();
    updateHud();
  }

  let bumpFlash = 0;
  function flashBump() { bumpFlash = 0.25; }

  function win() {
    state.won = true;
    const b = document.getElementById("banner");
    const lv = LEVELS[state.li];
    const last = state.li === LEVELS.length - 1;
    b.innerHTML =
      `<div>✅ 停好了！</div>
       <div style="font-size:15px;color:#b9c4d0">用時 ${state.time.toFixed(1)}s ・ 碰撞 ${state.bumps} 次</div>
       <button id="nextBtn">${last ? "🎉 全部完成！再玩一次" : "下一關 ▶"}</button>`;
    b.classList.remove("hidden");
    document.getElementById("nextBtn").addEventListener("click", () => {
      loadLevel(last ? 0 : state.li + 1);
    });
  }

  // ---- Render ----
  function W2S(p) { return { x: p.x * view.scale, y: p.y * view.scale }; }
  function drawPoly(corners, fill, stroke, dash) {
    ctx.beginPath();
    corners.forEach((p, i) => {
      const s = W2S(p);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.closePath();
    if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.setLineDash([]);
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // asphalt
    ctx.fillStyle = "#3a424c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const lv = LEVELS[state.li];

    // spot
    const sp = lv.spot;
    const spCorners = rectCorners(sp.x, sp.y, sp.len, sp.wid, sp.a);
    const aligned = state.won;
    drawPoly(spCorners, aligned ? "rgba(54,201,139,0.35)" : "rgba(54,201,139,0.14)",
             "rgba(54,201,139,0.95)", [10, 7]);
    // 'P' marker
    const sc = W2S(sp);
    ctx.fillStyle = "rgba(54,201,139,0.9)";
    ctx.font = `bold ${Math.round(20 * view.scale / 1)}px system-ui`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("P", sc.x, sc.y);

    // walls
    for (const w of lv.walls) {
      drawPoly(aabbCorners(w), "#20262d", "#11151a", null);
    }
    // parked cars
    for (const c of lv.cars) {
      drawPoly(rectCorners(c.x, c.y, c.len, c.wid, c.a), "#6b7682", "#4a525c", null);
      // windshield hint
    }

    // player car
    const carCorners = carPolyAt(state.car.x, state.car.y, state.car.a);
    const body = bumpFlash > 0 ? "#ff5d52" : "#4aa3ff";
    drawPoly(carCorners, body, "#0d2236", null);
    // front marker (heading)
    const c = Math.cos(state.car.a), s = Math.sin(state.car.a);
    const nose = W2S({ x: state.car.x + c * state.carLen * 0.5, y: state.car.y + s * state.carLen * 0.5 });
    const mid  = W2S({ x: state.car.x + c * state.carLen * 0.18, y: state.car.y + s * state.carLen * 0.18 });
    ctx.strokeStyle = "#cde6ff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(mid.x, mid.y); ctx.lineTo(nose.x, nose.y); ctx.stroke();

    if (bumpFlash > 0) bumpFlash = Math.max(0, bumpFlash - 0.016);
  }

  // ---- Main loop ----
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---- Input wiring ----
  const keymap = {
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    Space: "brake",
  };
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyR") { loadLevel(state.li); return; }
    const k = keymap[e.code];
    if (k) { input[k] = true; e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => {
    const k = keymap[e.code];
    if (k) { input[k] = false; e.preventDefault(); }
  });

  // touch / mouse dpad
  document.querySelectorAll(".dpad").forEach((btn) => {
    const act = btn.getAttribute("data-act");
    const on = (e) => { e.preventDefault(); input[act] = true; btn.classList.add("on"); };
    const off = (e) => { e.preventDefault(); input[act] = false; btn.classList.remove("on"); };
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointerleave", off);
    btn.addEventListener("pointercancel", off);
  });

  // sliders
  const lenS = document.getElementById("carLen");
  const widS = document.getElementById("carWid");
  function applyDims() {
    state.carLen = parseFloat(lenS.value) * SCALE;
    state.carWid = parseFloat(widS.value) * SCALE;
    document.getElementById("lenVal").textContent = parseFloat(lenS.value).toFixed(1);
    document.getElementById("widVal").textContent = parseFloat(widS.value).toFixed(1);
  }
  lenS.addEventListener("input", applyDims);
  widS.addEventListener("input", applyDims);

  document.getElementById("resetBtn").addEventListener("click", () => loadLevel(state.li));
  document.getElementById("prevLevel").addEventListener("click", () => loadLevel(state.li - 1));
  document.getElementById("nextLevel").addEventListener("click", () => loadLevel(state.li + 1));

  // ---- Boot ----
  resize();
  applyDims();
  loadLevel(0);
  requestAnimationFrame(loop);
})();
