// ===== 停車練習 Parking Practice — top-down rear-axle bicycle model =====
// Physics reference point = REAR AXLE. Only the front wheels steer; the rear
// wheels are fixed. This makes the rear axle follow a tighter arc than the
// front during turns — i.e. real off-tracking / 內輪差 — which is exactly what
// matters when practising parking.
(() => {
  "use strict";

  const WORLD = { w: 1300, h: 500 };   // 更寬扁（2.6:1），高度更低
  const SCALE = 13;            // world units (px) per metre
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const view = { scale: 1 };

  function resize() {
    const cssW = canvas.clientWidth;          // 用滿可用寬度，不縮小寬度
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
    const SX = W / 2;            // 車位永遠水平置中，靠下擺放
    // 台灣車格尺寸：寬約 2.1m、長約 5~6m（SCALE=13px/m）。全部為中高難度。
    const L = [];

    // 1. 垂直夾縫
    L.push({ name: "垂直夾縫", diff: 3,
      desc: "從上方開下來，停進兩車中間的窄垂直車位，左右只有幾公分縫隙。",
      start: { x: SX, y: 90, a: 90*D },
      spot:  { x: SX, y: 360, a: 90*D, len: 66, wid: 28 },
      walls: [ { x: 250, y: 418, w: W-500, h: 12 } ],
      cars: [ { x: SX-31, y: 360, a: 90*D, len: 70, wid: 26 },
              { x: SX+31, y: 360, a: 90*D, len: 70, wid: 26 } ] });

    // 2. 窄車庫倒車
    L.push({ name: "窄車庫倒車", diff: 4,
      desc: "倒車進入中間靠下的窄車庫，三面是牆、開口朝上，左右幾乎沒餘裕。",
      start: { x: SX, y: 110, a: -90*D },
      spot:  { x: SX, y: 362, a: 90*D, len: 64, wid: 28 },
      walls: [ { x: 622, y: 300, w: 10, h: 130 },
               { x: 668, y: 300, w: 10, h: 130 },
               { x: 622, y: 430, w: 56, h: 10 } ],
      cars: [] });

    // 3. S 型窄巷
    L.push({ name: "S 型窄巷", diff: 4,
      desc: "由上往下穿過 S 型窄巷（先右、再左），最後停進中間靠下的車位。",
      start: { x: 980, y: 70, a: 90*D },
      spot:  { x: SX, y: 388, a: 90*D, len: 64, wid: 30 },
      walls: [ { x: 14, y: 160, w: 800, h: 16 },
               { x: 486, y: 270, w: W-500, h: 16 } ],
      cars: [] });

    // 4. 偏移夾縫：先繞過上方擋牆，再切回中央窄縫
    L.push({ name: "偏移夾縫", diff: 4,
      desc: "上方擋牆只留右側通道，先往下繞過再切回中間，停進兩車間的窄縫。",
      start: { x: 980, y: 95, a: 90*D },
      spot:  { x: SX, y: 378, a: 90*D, len: 64, wid: 28 },
      walls: [ { x: 14, y: 250, w: 720, h: 16 },
               { x: 250, y: 440, w: W-500, h: 12 } ],
      cars: [ { x: SX-31, y: 378, a: 90*D, len: 70, wid: 26 },
              { x: SX+31, y: 378, a: 90*D, len: 70, wid: 26 } ] });

    // 5. 緊密平行停車
    L.push({ name: "緊密平行停車", diff: 5,
      desc: "前後兩車之間只剩一台車多一點的空間，善用後輪內輪差才停得進去。",
      start: { x: 250, y: 320, a: 0 },
      spot:  { x: SX, y: 374, a: 0, len: 72, wid: 28 },
      walls: [ { x: 80, y: 414, w: W-160, h: 40 } ],
      cars: [ { x: SX-72, y: 374, a: 0, len: 72, wid: 28 },
              { x: SX+72, y: 374, a: 0, len: 72, wid: 28 } ] });

    // 6. 雙彎進垂直：連續兩道擋牆（S 型）後立刻入窄縫
    L.push({ name: "雙彎進垂直", diff: 5,
      desc: "連續兩道擋牆（先右、後左）穿過後，立刻切進中央兩車間的窄垂直車位。",
      start: { x: 1030, y: 70, a: 90*D },
      spot:  { x: SX, y: 400, a: 90*D, len: 58, wid: 28 },
      walls: [ { x: 14, y: 168, w: 840, h: 16 },
               { x: 440, y: 275, w: W-454, h: 16 } ],
      cars: [ { x: SX-31, y: 400, a: 90*D, len: 62, wid: 26 },
              { x: SX+31, y: 400, a: 90*D, len: 62, wid: 26 } ] });

    // 7. 淺窄夾縫：後牆極近，需精準煞停
    L.push({ name: "淺窄夾縫", diff: 5,
      desc: "車格又窄又淺，後方緊貼牆面、左右又是車，前後左右都只有幾公分。",
      start: { x: SX, y: 90, a: 90*D },
      spot:  { x: SX, y: 372, a: 90*D, len: 58, wid: 27 },
      walls: [ { x: 250, y: 408, w: W-500, h: 14 } ],
      cars: [ { x: SX-30, y: 372, a: 90*D, len: 72, wid: 26 },
              { x: SX+30, y: 372, a: 90*D, len: 72, wid: 26 } ] });

    // 8. 窄路平行：對向有牆、迴旋空間極小
    L.push({ name: "窄路平行", diff: 5,
      desc: "馬路窄、對向就是牆，迴旋空間很小，還要倒車塞進前後夾縫。",
      start: { x: 250, y: 348, a: 0 },
      spot:  { x: SX, y: 382, a: 0, len: 68, wid: 28 },
      walls: [ { x: 80, y: 422, w: W-160, h: 30 },
               { x: 80, y: 308, w: W-160, h: 12 } ],
      cars: [ { x: SX-72, y: 382, a: 0, len: 72, wid: 28 },
              { x: SX+72, y: 382, a: 0, len: 72, wid: 28 } ] });

    // ===== 實際情況的複雜場景 =====

    // 9. 倒車入庫（兩側有車）：在停滿車的場子，沿車道開過去再倒車入庫
    L.push({ name: "倒車入庫（兩側有車）", diff: 4,
      desc: "沿著上方車道把車開過去，再倒車進中央空位。兩側都是車，後方有輪擋。",
      start: { x: 180, y: 312, a: 0 },
      spot:  { x: SX, y: 398, a: 90*D, len: 62, wid: 28 },
      walls: [ { x: SX-18, y: 438, w: 36, h: 6 } ],          // 輪擋
      cars: [ { x: SX-33, y: 398, a: 90*D, len: 62, wid: 26 }, { x: SX+33, y: 398, a: 90*D, len: 62, wid: 26 },
              { x: SX-99, y: 398, a: 90*D, len: 62, wid: 26 }, { x: SX+99, y: 398, a: 90*D, len: 62, wid: 26 },
              { x: SX-165, y: 398, a: 90*D, len: 62, wid: 26 }, { x: SX+165, y: 398, a: 90*D, len: 62, wid: 26 },
              { x: SX-99, y: 224, a: 90*D, len: 62, wid: 26 }, { x: SX-33, y: 224, a: 90*D, len: 62, wid: 26 },
              { x: SX+33, y: 224, a: 90*D, len: 62, wid: 26 }, { x: SX+99, y: 224, a: 90*D, len: 62, wid: 26 } ] });

    // 10. 立柱旁倒庫：地下停車場常見，車位一角有柱子
    L.push({ name: "立柱旁倒庫", diff: 4,
      desc: "倒車入庫，左前角有根柱子卡住迴轉空間，右邊還有一台車，別擦到。",
      start: { x: 180, y: 312, a: 0 },
      spot:  { x: SX, y: 398, a: 90*D, len: 62, wid: 28 },
      walls: [ { x: SX-46, y: 330, w: 18, h: 46 } ],         // 柱子
      cars: [ { x: SX+33, y: 398, a: 90*D, len: 62, wid: 26 },
              { x: SX-99, y: 398, a: 90*D, len: 62, wid: 26 }, { x: SX+99, y: 398, a: 90*D, len: 62, wid: 26 },
              { x: SX-99, y: 224, a: 90*D, len: 62, wid: 26 }, { x: SX+33, y: 224, a: 90*D, len: 62, wid: 26 },
              { x: SX+99, y: 224, a: 90*D, len: 62, wid: 26 } ] });

    // 11. 側方受阻（右打滿后退）：入口被斜出的車擋住的側方停車
    L.push({ name: "側方受阻", diff: 5,
      desc: "側方停車，入口被上方突出的車擋住一半，要先繞、再右打滿倒車塞進去。",
      start: { x: 250, y: 345, a: 0 },
      spot:  { x: SX, y: 382, a: 0, len: 72, wid: 28 },
      walls: [ { x: 80, y: 420, w: W-160, h: 30 } ],
      cars: [ { x: SX-74, y: 382, a: 0, len: 72, wid: 28 }, { x: SX+74, y: 382, a: 0, len: 72, wid: 28 },
              { x: SX-95, y: 330, a: 90*D, len: 64, wid: 26 } ] });

    // 12. 雙向窄道倒庫：對向就是牆/車，車道很窄，要分幾次進退
    L.push({ name: "雙向窄道倒庫", diff: 5,
      desc: "車道很窄、對向就是牆，迴旋空間不夠，多半要前後修正好幾次才倒得進去。",
      start: { x: 180, y: 335, a: 0 },
      spot:  { x: SX, y: 408, a: 90*D, len: 58, wid: 28 },
      walls: [ { x: 80, y: 293, w: W-160, h: 14 } ],         // 對向牆
      cars: [ { x: SX-33, y: 408, a: 90*D, len: 58, wid: 26 },
              { x: SX+33, y: 408, a: 90*D, len: 58, wid: 26 } ] });

    // 13. 斜角（斜向）停車：賣場/路邊常見的傾斜車格
    L.push({ name: "斜角停車", diff: 4,
      desc: "賣場、路邊常見的斜向車格，沿車道過去再順著角度斜斜開進去並對正。",
      start: { x: 200, y: 300, a: 0 },
      spot:  { x: SX, y: 378, a: 55*D, len: 64, wid: 28 },
      walls: [],
      cars: [ { x: SX-34, y: 378, a: 55*D, len: 64, wid: 26 }, { x: SX+34, y: 378, a: 55*D, len: 64, wid: 26 },
              { x: SX-68, y: 378, a: 55*D, len: 64, wid: 26 }, { x: SX+68, y: 378, a: 55*D, len: 64, wid: 26 } ] });

    // 14. 死巷窄道倒庫：前方到底、對向是牆，幾乎要原地倒進去
    L.push({ name: "死巷窄道倒庫", diff: 5,
      desc: "死巷裡的窄車道，前方很快到底、對向又是牆，幾乎要原地倒車入庫，得多次前後修正。",
      start: { x: 180, y: 330, a: 0 },
      spot:  { x: SX, y: 400, a: 90*D, len: 60, wid: 28 },
      walls: [ { x: 80, y: 270, w: W-160, h: 12 },           // 對向牆
               { x: 760, y: 270, w: 16, h: 130 } ],          // 死巷底
      cars: [ { x: SX-33, y: 400, a: 90*D, len: 60, wid: 26 },
              { x: SX+33, y: 400, a: 90*D, len: 60, wid: 26 } ] });

    // 15. 柱間超窄格：兩側是水泥柱，最容易擦輪圈
    L.push({ name: "柱間超窄格", diff: 5,
      desc: "車格兩側是水泥柱（不是車），左右各只剩幾公分，最容易擦到輪圈和鈑金。",
      start: { x: 180, y: 300, a: 0 },
      spot:  { x: SX, y: 398, a: 90*D, len: 62, wid: 27 },
      walls: [ { x: SX-33, y: 340, w: 16, h: 80 },           // 左柱
               { x: SX+17, y: 340, w: 16, h: 80 } ],         // 右柱
      cars: [ { x: SX-92, y: 398, a: 90*D, len: 62, wid: 26 }, { x: SX+92, y: 398, a: 90*D, len: 62, wid: 26 },
              { x: SX-92, y: 224, a: 90*D, len: 62, wid: 26 }, { x: SX-26, y: 224, a: 90*D, len: 62, wid: 26 },
              { x: SX+26, y: 224, a: 90*D, len: 62, wid: 26 }, { x: SX+92, y: 224, a: 90*D, len: 62, wid: 26 } ] });

    // 16. 滿場倒車入庫（對面也停了車）：四周都是車，正前方被擋，要右打滿斜倒進去
    L.push({ name: "滿場倒庫（對面有車）", diff: 5,
      desc: "整個停滿，正對面也停了一台車擋住，沒法直直退，要繞角度右打滿倒進中央空位。",
      start: { x: 180, y: 326, a: 0 },
      spot:  { x: SX, y: 400, a: 90*D, len: 62, wid: 28 },
      walls: [ { x: SX-18, y: 438, w: 36, h: 6 } ],          // 輪擋
      cars: [ { x: SX-33, y: 400, a: 90*D, len: 62, wid: 26 }, { x: SX+33, y: 400, a: 90*D, len: 62, wid: 26 },
              { x: SX-99, y: 400, a: 90*D, len: 62, wid: 26 }, { x: SX+99, y: 400, a: 90*D, len: 62, wid: 26 },
              { x: SX-66, y: 252, a: 90*D, len: 62, wid: 26 }, { x: SX, y: 252, a: 90*D, len: 62, wid: 26 },
              { x: SX+66, y: 252, a: 90*D, len: 62, wid: 26 },
              { x: SX-132, y: 252, a: 90*D, len: 62, wid: 26 }, { x: SX+132, y: 252, a: 90*D, len: 62, wid: 26 } ] });

    // 17. 車頭朝裡前進入庫：沿車道過去後，車頭朝裡開進去（前進入庫），底是牆
    L.push({ name: "車頭朝裡入庫", diff: 4,
      desc: "沿車道開過去後，車頭朝裡「前進」開進中央空位，底部就是牆，停太前會頂到。",
      start: { x: 180, y: 300, a: 0 },
      spot:  { x: SX, y: 398, a: 90*D, len: 60, wid: 28 },
      walls: [ { x: 260, y: 436, w: W-520, h: 12 } ],        // 庫底牆
      cars: [ { x: SX-33, y: 398, a: 90*D, len: 60, wid: 26 }, { x: SX+33, y: 398, a: 90*D, len: 60, wid: 26 },
              { x: SX-99, y: 398, a: 90*D, len: 60, wid: 26 }, { x: SX+99, y: 398, a: 90*D, len: 60, wid: 26 },
              { x: SX-99, y: 224, a: 90*D, len: 62, wid: 26 }, { x: SX-33, y: 224, a: 90*D, len: 62, wid: 26 },
              { x: SX+33, y: 224, a: 90*D, len: 62, wid: 26 }, { x: SX+99, y: 224, a: 90*D, len: 62, wid: 26 } ] });

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
  const MAX_FWD = 150, MAX_REV = 96, ACCEL = 215, BRAKE = 230, ROLL = 70;
  const MAX_STEER = 36*D, STEER_RATE = 130*D, STEER_RETURN = 170*D;
  let bumpFlash = 0;
  let trackAccum = 0;

  function update(dt) {
    if (state.won) return;
    state.time += dt;
    state.bumpCool = Math.max(0, state.bumpCool - dt);

    // 左右方向鍵轉動方向盤；放開後保持角度，不自動回正
    if (input.left && !input.right) car.steer = Math.max(-MAX_STEER, car.steer - STEER_RATE*dt);
    else if (input.right && !input.left) car.steer = Math.min(MAX_STEER, car.steer + STEER_RATE*dt);

    // 油門：有壓上/下鍵車才前進/後退；放開立刻停止，不滑行
    if (input.up && !input.down) car.v += ACCEL*dt;
    else if (input.down && !input.up) car.v -= ACCEL*dt;
    else car.v = 0;
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

    // 下方方向盤 UI：依目前轉向角同步旋轉
    if (wheelRotEl) {
      const deg = (car.steer / MAX_STEER) * 140;   // 滿舵 = 視覺上轉 140°
      wheelRotEl.setAttribute("transform", `rotate(${deg.toFixed(1)})`);
    }
    if (wheelAngleEl) {
      const pct = Math.round(car.steer / MAX_STEER * 100);
      wheelAngleEl.textContent = pct === 0 ? "回正" : (pct < 0 ? `左 ${-pct}%` : `右 ${pct}%`);
    }
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
                   ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right" };
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyR") { loadLevel(state.li); return; }
    if (e.code === "Space") { car.steer = 0; e.preventDefault(); return; }  // 空白鍵回正方向盤
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

  // steering wheel widget
  const wheelRotEl = document.getElementById("wheelRot");
  const wheelAngleEl = document.getElementById("wheelAngle");
  const wheelCenterBtn = document.getElementById("wheelCenter");
  if (wheelCenterBtn) wheelCenterBtn.addEventListener("click", () => { car.steer = 0; });

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
