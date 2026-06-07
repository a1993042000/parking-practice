// ===== 停車練習 Parking Practice — top-down rear-axle bicycle model =====
// Physics reference point = REAR AXLE. Only the front wheels steer; the rear
// wheels are fixed. This makes the rear axle follow a tighter arc than the
// front during turns — i.e. real off-tracking / 內輪差 — which is exactly what
// matters when practising parking.
(() => {
  "use strict";

  const WORLD = { w: 1000, h: 680 };
  const SCALE = 13;            // world units (px) per metre
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const view = { scale: 1 };

  function resize() {
    const cssW = canvas.clientWidth;
    const cssH = Math.round(cssW * WORLD.h / WORLD.w);
    canvas.style.height = cssH + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    view.scale = canvas.width / WORLD.w;
  }
  window.addEventListener("resize", resize);

  // ---- geometry helpers ----
  function rectCorners(cx, cy, len, wid, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const fx = c, fy = s, rx = -s, ry = c;
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
      { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
    ];
  }
  function polyOverlap(a, b) {
    for (const poly of [a, b]) {
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        const nx = -(poly[j].y - poly[i].y);
        const ny =  (poly[j].x - poly[i].x);
        let minA=Infinity,maxA=-Infinity,minB=Infinity,maxB=-Infinity;
        for (const v of a){const d=v.x*nx+v.y*ny; if(d<minA)minA=d; if(d>maxA)maxA=d;}
        for (const v of b){const d=v.x*nx+v.y*ny; if(d<minB)minB=d; if(d>maxB)maxB=d;}
        if (maxA < minB || maxB < minA) return false;
      }
    }
    return true;
  }

  // ---- levels ----
  const D = Math.PI / 180;
  function buildLevels() {
    const W = WORLD.w, H = WORLD.h, border = 14;
    const L = [];
    L.push({ name: "暖身：開進車位", diff: 1,
      desc: "開放停車場。把車往上開進綠色車位並對正。",
      start: { x: 500, y: 560, a: -90*D },
      spot:  { x: 500, y: 150, a: -90*D, len: 80, wid: 42 },
      walls: [], cars: [] });
    L.push({ name: "垂直停車（夾縫）", diff: 2,
      desc: "兩車中間的垂直車位。前進或倒車入位皆可，注意左右車輛與內輪差。",
      start: { x: 500, y: 520, a: -90*D },
      spot:  { x: 500, y: 150, a: -90*D, len: 80, wid: 44 },
      walls: [ { x: 80, y: 96, w: W-160, h: 8 } ],
      cars: [ { x: 444, y: 150, a: -90*D, len: 74, wid: 26 },
              { x: 556, y: 150, a: -90*D, len: 74, wid: 26 } ] });
    L.push({ name: "路邊平行停車", diff: 3,
      desc: "沿著下方路緣，倒車進入兩車之間的平行車位。倒車打方向時注意後輪內切。",
      start: { x: 300, y: 470, a: 0 },
      spot:  { x: 500, y: 566, a: 0, len: 98, wid: 40 },
      walls: [ { x: 80, y: 600, w: W-160, h: 40 } ],
      cars: [ { x: 392, y: 566, a: 0, len: 70, wid: 28 },
              { x: 612, y: 566, a: 0, len: 70, wid: 28 } ] });
    L.push({ name: "窄車庫倒車", diff: 3,
      desc: "倒車進入上方的窄車庫，三面是牆、開口很窄。",
      start: { x: 500, y: 520, a: -90*D },
      spot:  { x: 500, y: 152, a: -90*D, len: 78, wid: 42 },
      walls: [ { x: 450, y: 96, w: 10, h: 132 },
               { x: 540, y: 96, w: 10, h: 132 },
               { x: 450, y: 96, w: 100, h: 10 } ],
      cars: [] });
    L.push({ name: "S 型窄巷", diff: 4,
      desc: "由下往上穿過 S 型窄巷（右-左-右），最後停進巷底車位。慢慢轉別刮牆。",
      start: { x: 500, y: 610, a: -90*D },
      spot:  { x: 500, y: 120, a: -90*D, len: 82, wid: 44 },
      walls: [ { x: 14, y: 500, w: 520, h: 16 }, { x: 720, y: 500, w: 266, h: 16 },
               { x: 14, y: 340, w: 120, h: 16 }, { x: 280, y: 340, w: 706, h: 16 },
               { x: 14, y: 180, w: 520, h: 16 }, { x: 720, y: 180, w: 266, h: 16 } ],
      cars: [] });
    L.push({ name: "緊密平行停車", diff: 5,
      desc: "高難度：兩車之間只有一點點空間，必須善用後輪內輪差才停得進去。",
      start: { x: 300, y: 470, a: 0 },
      spot:  { x: 500, y: 566, a: 0, len: 82, wid: 36 },
      walls: [ { x: 80, y: 600, w: W-160, h: 40 } ],
      cars: [ { x: 402, y: 566, a: 0, len: 72, wid: 28 },
              { x: 598, y: 566, a: 0, len: 72, wid: 28 } ] });
    for (const lv of L) {
      lv.walls = lv.walls.concat([
        { x: 0, y: 0, w: W, h: border }, { x: 0, y: H-border, w: W, h: border },
        { x: 0, y: 0, w: border, h: H }, { x: W-border, y: 0, w: border, h: H },
      ]);
    }
    return L;
  }
  const LEVELS = buildLevels();

  // ---- car: dimensions in pixels ----
  const dims = { len: 4.6*SCALE, wid: 1.9*SCALE, wb: 2.7*SCALE };
  function overhangs() {
    const total = Math.max(0.6*SCALE, dims.len - dims.wb); // keep some overhang
    return { rear: total * 0.45, front: total * 0.55 };
  }
  // body centre offset from rear axle, measured along heading
  function bodyOffset() {
    const o = overhangs();
    return dims.wb / 2 + (o.front - o.rear) / 2;
  }

  // state stored at the REAR AXLE
  const car = { rx: 0, ry: 0, a: 0, v: 0, steer: 0 };
  const state = { li: 0, bumps: 0, bumpCool: 0, time: 0, won: false };
  const input = { up:false, down:false, left:false, right:false, brake:false };
  let tracks = [];   // {rl,rr,fl,fr} wheel centres for the trail
  let showTracks = true;

  function fwdRight(a) {
    return { fx: Math.cos(a), fy: Math.sin(a), rx: -Math.sin(a), ry: Math.cos(a) };
  }
  function axlePositions(rxp, ryp, a) {
    const v = fwdRight(a);
    const rear = { x: rxp, y: ryp };
    const front = { x: rxp + v.fx*dims.wb, y: ryp + v.fy*dims.wb };
    const ht = dims.wid * 0.42; // half track width for wheels
    return {
      rear, front, v, ht,
      rl: { x: rear.x  - v.rx*ht, y: rear.y  - v.ry*ht },
      rr: { x: rear.x  + v.rx*ht, y: rear.y  + v.ry*ht },
      fl: { x: front.x - v.rx*ht, y: front.y - v.ry*ht },
      fr: { x: front.x + v.rx*ht, y: front.y + v.ry*ht },
    };
  }
  function bodyCenter(rxp, ryp, a) {
    const v = fwdRight(a); const off = bodyOffset();
    return { x: rxp + v.fx*off, y: ryp + v.fy*off };
  }
  function bodyCornersAt(rxp, ryp, a) {
    const c = bodyCenter(rxp, ryp, a);
    return rectCorners(c.x, c.y, dims.len, dims.wid, a);
  }

  function obstaclePolys() {
    const lv = LEVELS[state.li];
    const polys = [];
    for (const w of lv.walls) polys.push(aabbCorners(w));
    for (const c of lv.cars) polys.push(rectCorners(c.x, c.y, c.len, c.wid, c.a));
    return polys;
  }
  function collides(rxp, ryp, a) {
    const cp = bodyCornersAt(rxp, ryp, a);
    for (const o of obstaclePolys()) if (polyOverlap(cp, o)) return true;
    return false;
  }

  function checkWin() {
    const sp = LEVELS[state.li].spot;
    const cs = bodyCornersAt(car.rx, car.ry, car.a);
    const c = Math.cos(-sp.a), s = Math.sin(-sp.a);
    const hl = sp.len/2, hw = sp.wid/2, tol = 3;
    for (const p of cs) {
      const dx = p.x - sp.x, dy = p.y - sp.y;
      const lx = dx*c - dy*s, ly = dx*s + dy*c;
      if (Math.abs(lx) > hl+tol || Math.abs(ly) > hw+tol) return false;
    }
    let da = (car.a - sp.a) % Math.PI;
    if (da > Math.PI/2) da -= Math.PI;
    if (da < -Math.PI/2) da += Math.PI;
    if (Math.abs(da) > 14*D) return false;
    if (Math.abs(car.v) > 4) return false;
    return true;
  }

  function loadLevel(i) {
    state.li = (i + LEVELS.length) % LEVELS.length;
    const lv = LEVELS[state.li];
    // level start is the intended BODY centre; derive rear-axle position
    const v = fwdRight(lv.start.a), off = bodyOffset();
    car.rx = lv.start.x - v.fx*off;
    car.ry = lv.start.y - v.fy*off;
    car.a = lv.start.a; car.v = 0; car.steer = 0;
    state.bumps = 0; state.time = 0; state.won = false; state.bumpCool = 0;
    tracks = [];
    document.getElementById("banner").classList.add("hidden");
    document.getElementById("levelLabel").textContent = `${state.li+1}/${LEVELS.length}  ${lv.name}`;
    document.getElementById("hudLevel").textContent = state.li + 1;
    document.getElementById("hudDiff").textContent = "★".repeat(lv.diff);
    document.getElementById("desc").textContent = "本關：" + lv.desc;
    updateHud();
  }
  function updateHud() {
    document.getElementById("hudBumps").textContent = state.bumps;
    document.getElementById("hudTime").textContent = state.time.toFixed(1) + "s";
  }

  // ---- physics ----
  const MAX_FWD = 115, MAX_REV = 72, ACCEL = 175, BRAKE = 230, ROLL = 70;
  const MAX_STEER = 36*D, STEER_RATE = 130*D, STEER_RETURN = 170*D;
  let bumpFlash = 0;
  let trackAccum = 0;

  function update(dt) {
    if (state.won) return;
    state.time += dt;
    state.bumpCool = Math.max(0, state.bumpCool - dt);

    if (input.left && !input.right) car.steer = Math.max(-MAX_STEER, car.steer - STEER_RATE*dt);
    else if (input.right && !input.left) car.steer = Math.min(MAX_STEER, car.steer + STEER_RATE*dt);
    else if (car.steer > 0) car.steer = Math.max(0, car.steer - STEER_RETURN*dt);
    else car.steer = Math.min(0, car.steer + STEER_RETURN*dt);

    if (input.brake) {
      if (car.v > 0) car.v = Math.max(0, car.v - BRAKE*dt); else car.v = Math.min(0, car.v + BRAKE*dt);
    } else if (input.up && !input.down) car.v += ACCEL*dt;
    else if (input.down && !input.up) car.v -= ACCEL*dt;
    else if (car.v > 0) car.v = Math.max(0, car.v - ROLL*dt); else car.v = Math.min(0, car.v + ROLL*dt);
    car.v = Math.max(-MAX_REV, Math.min(MAX_FWD, car.v));

    // rear-axle kinematic bicycle model
    const nrx = car.rx + car.v*Math.cos(car.a)*dt;
    const nry = car.ry + car.v*Math.sin(car.a)*dt;
    const na  = car.a + (car.v / dims.wb) * Math.tan(car.steer) * dt;

    if (collides(nrx, nry, na)) {
      if (state.bumpCool <= 0 && Math.abs(car.v) > 12) {
        state.bumps++; state.bumpCool = 0.4; bumpFlash = 0.25;
      }
      car.v = 0; // blocked; reversing next frame can escape
    } else {
      car.rx = nrx; car.ry = nry; car.a = na;
    }

    // record wheel tracks
    trackAccum += Math.abs(car.v) * dt;
    if (showTracks && trackAccum > 3) {
      trackAccum = 0;
      const ax = axlePositions(car.rx, car.ry, car.a);
      tracks.push({ rl: ax.rl, rr: ax.rr, fl: ax.fl, fr: ax.fr });
      if (tracks.length > 1400) tracks.shift();
    }

    if (checkWin()) win();
    updateHud();
  }

  function win() {
    state.won = true;
    const b = document.getElementById("banner");
    const last = state.li === LEVELS.length - 1;
    b.innerHTML =
      `<div>✅ 停好了！</div>
       <div style="font-size:15px;color:#b9c4d0">用時 ${state.time.toFixed(1)}s ・ 碰撞 ${state.bumps} 次</div>
       <button id="nextBtn">${last ? "🎉 全部完成！再玩一次" : "下一關 ▶"}</button>`;
    b.classList.remove("hidden");
    document.getElementById("nextBtn").addEventListener("click", () => loadLevel(last ? 0 : state.li + 1));
  }

  // ---- render ----
  function S(p) { return { x: p.x * view.scale, y: p.y * view.scale }; }
  function drawPoly(corners, fill, stroke, dash, lw) {
    ctx.beginPath();
    corners.forEach((p, i) => { const q = S(p); i ? ctx.lineTo(q.x,q.y) : ctx.moveTo(q.x,q.y); });
    ctx.closePath();
    ctx.setLineDash(dash || []);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
    ctx.setLineDash([]);
  }
  function dot(p, r, color) {
    const q = S(p); ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fill();
  }

  function render() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#3a424c"; ctx.fillRect(0,0,canvas.width,canvas.height);
    const lv = LEVELS[state.li];

    // tire tracks (rear = orange, front = cyan → the gap shows 內輪差)
    if (showTracks) {
      for (const t of tracks) {
        dot(t.fl, 1.3, "rgba(120,200,255,0.30)");
        dot(t.fr, 1.3, "rgba(120,200,255,0.30)");
        dot(t.rl, 1.5, "rgba(255,170,70,0.42)");
        dot(t.rr, 1.5, "rgba(255,170,70,0.42)");
      }
    }

    // spot
    const sp = lv.spot;
    drawPoly(rectCorners(sp.x, sp.y, sp.len, sp.wid, sp.a),
      state.won ? "rgba(54,201,139,0.35)" : "rgba(54,201,139,0.14)",
      "rgba(54,201,139,0.95)", [10,7]);
    const sc = S(sp);
    ctx.fillStyle = "rgba(54,201,139,0.9)";
    ctx.font = `bold ${Math.round(20*view.scale)}px system-ui`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("P", sc.x, sc.y);

    // walls + parked cars
    for (const w of lv.walls) drawPoly(aabbCorners(w), "#20262d", "#11151a");
    for (const c of lv.cars) drawPoly(rectCorners(c.x,c.y,c.len,c.wid,c.a), "#6b7682", "#4a525c");

    // player car body
    drawPoly(bodyCornersAt(car.rx, car.ry, car.a), bumpFlash>0 ? "#ff5d52" : "#4aa3ff", "#0d2236");
    // front-end indicator
    const bc = bodyCenter(car.rx, car.ry, car.a), v = fwdRight(car.a);
    const nose = S({ x: bc.x + v.fx*dims.len*0.32, y: bc.y + v.fy*dims.len*0.32 });
    const mid  = S({ x: bc.x + v.fx*dims.len*0.05, y: bc.y + v.fy*dims.len*0.05 });
    ctx.strokeStyle = "#cde6ff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(mid.x,mid.y); ctx.lineTo(nose.x,nose.y); ctx.stroke();

    // wheels — fronts turned by steer, rears fixed
    const ax = axlePositions(car.rx, car.ry, car.a);
    const wl = dims.len*0.16, ww = dims.wid*0.13;
    const drawWheel = (center, ang) => drawPoly(rectCorners(center.x, center.y, wl, ww, ang), "#11161b", "#000", null, 1);
    drawWheel(ax.rl, car.a); drawWheel(ax.rr, car.a);
    drawWheel(ax.fl, car.a + car.steer); drawWheel(ax.fr, car.a + car.steer);

    if (bumpFlash > 0) bumpFlash = Math.max(0, bumpFlash - 0.016);
  }

  // ---- loop ----
  let last = performance.now();
  function loop(now) {
    let dt = (now - last)/1000; last = now;
    if (dt > 0.05) dt = 0.05;
    update(dt); render();
    requestAnimationFrame(loop);
  }

  // ---- input ----
  const keymap = { ArrowUp:"up",KeyW:"up",ArrowDown:"down",KeyS:"down",
                   ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right",Space:"brake" };
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyR") { loadLevel(state.li); return; }
    const k = keymap[e.code]; if (k) { input[k] = true; e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => { const k = keymap[e.code]; if (k){ input[k]=false; e.preventDefault(); } });
  document.querySelectorAll(".dpad").forEach((btn) => {
    const act = btn.getAttribute("data-act");
    const on = (e)=>{ e.preventDefault(); input[act]=true; btn.classList.add("on"); };
    const off = (e)=>{ e.preventDefault(); input[act]=false; btn.classList.remove("on"); };
    btn.addEventListener("pointerdown", on); btn.addEventListener("pointerup", off);
    btn.addEventListener("pointerleave", off); btn.addEventListener("pointercancel", off);
  });

  // sliders
  const lenS = document.getElementById("carLen");
  const widS = document.getElementById("carWid");
  const wbS  = document.getElementById("carWb");
  const tracksChk = document.getElementById("showTracks");
  function applyDims() {
    const lenM = parseFloat(lenS.value);
    const widM = parseFloat(widS.value);
    let wbM = parseFloat(wbS.value);
    const maxWb = lenM - 1.0;          // keep >=1.0m total overhang
    if (wbM > maxWb) { wbM = maxWb; wbS.value = wbM.toFixed(2); }
    dims.len = lenM*SCALE; dims.wid = widM*SCALE; dims.wb = wbM*SCALE;
    document.getElementById("lenVal").textContent = lenM.toFixed(1);
    document.getElementById("widVal").textContent = widM.toFixed(1);
    document.getElementById("wbVal").textContent = wbM.toFixed(2);
  }
  lenS.addEventListener("input", applyDims);
  widS.addEventListener("input", applyDims);
  wbS.addEventListener("input", applyDims);
  tracksChk.addEventListener("change", () => { showTracks = tracksChk.checked; if (!showTracks) tracks = []; });

  document.getElementById("resetBtn").addEventListener("click", () => loadLevel(state.li));
  document.getElementById("prevLevel").addEventListener("click", () => loadLevel(state.li - 1));
  document.getElementById("nextLevel").addEventListener("click", () => loadLevel(state.li + 1));

  // ---- boot ----
  resize(); applyDims(); loadLevel(0);
  requestAnimationFrame(loop);
})();
