(function () {
  "use strict";
  // ============================================================
  // Couple Garden 情侶花園：帳號、情侶配對、自訂任務、紀念日、異地倒數
  // ============================================================
  var cfg = window.GARDEN_CONFIG || {};
  var REQ_PER_DAY = 3, REDEEM_COST = 3;
  var TEMPLATES = [
    { title: "好好吃飯", per_day: 3 }, { title: "早點睡", per_day: 1 }, { title: "多喝水", per_day: 1 },
    { title: "運動", per_day: 1 }, { title: "陪對方聊天", per_day: 1 }
  ];
  var TZS = [
    ["Asia/Taipei", "台北"], ["Asia/Tokyo", "東京"], ["Asia/Shanghai", "上海"], ["Asia/Hong_Kong", "香港"],
    ["Asia/Singapore", "新加坡"], ["Australia/Sydney", "雪梨"], ["Europe/London", "倫敦"], ["Europe/Paris", "巴黎"],
    ["America/New_York", "紐約"], ["America/Los_Angeles", "洛杉磯"], ["America/Vancouver", "溫哥華"]
  ];
  var ATLAS = { red: "", blue: " blue", black: " black" };
  var ASSETS = {
    full: { video: "", front: "front.webp", glass: "glass.webp", start: "bowl.jpg", end: "bowl.jpg", w: 1376, h: 768, orb: { cx: 0.4982, cy: 0.6081, rx: 0.1857, ry: 0.3229 } },
    mobile: { video: "", front: "front-m.webp", glass: "glass-m.webp", start: "bowl-m.jpg", end: "bowl-m.jpg", w: 768, h: 1376, orb: { cx: 0.4974, cy: 0.5193, rx: 0.3177, ry: 0.1755 } }
  };
  var ASSET = (window.innerWidth <= 700 && window.innerHeight > window.innerWidth) ? ASSETS.mobile : ASSETS.full;
  var VID = { w: ASSET.w, h: ASSET.h }, ORB = ASSET.orb;

  var sb = null, me = null, partner = null, couple = null, tasks = [], entries = [], dates = [], pings = [], rewards = [], claims = [];
  var view = "me", dockPage = 0, busy = false, loaded = false, poller = null, connText = "";
  var sheetOnClose = null, cardQueue = [], seen = {}, shown = {}, animated = {}, cardShown = {}, entered = false;

  // ---------- 小工具 ----------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, kids) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { return dateKey(new Date()); }
  function shortDate(k) { var p = String(k).split("-"); return +p[1] + "/" + +p[2]; }
  function parseDay(k) { var p = String(k).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b) { return Math.round((parseDay(dateKey(b)) - parseDay(dateKey(a))) / 86400000); }
  function seeded(i) { var x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  function toast(t) {
    var r = document.getElementById("toast-root");
    r.textContent = "";
    var n = el("div", { class: "toast", role: "status", text: t });
    r.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 2600);
  }
  function setConn(t) { connText = t; var n = document.querySelector(".conn"); if (n) n.textContent = t; }
  function haptic() { try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) {} }
  function sheetOpen() { return !!document.getElementById("sheet-root").firstChild; }
  function nick(p) { return (p && p.nickname) || "對方"; }
  function tzName(tz) { for (var i = 0; i < TZS.length; i++) if (TZS[i][0] === tz) return TZS[i][1]; return tz; }
  function clockText(p) {
    var t = localTime(p.tz), h = parseInt(t, 10);
    return (p === me ? "我" : nick(p)) + "・" + tzName(p.tz) + " " + t + " " + (h >= 6 && h < 18 ? "☀︎" : "☾");
  }
  function localTime(tz) { try { return new Intl.DateTimeFormat("zh-TW", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); } catch (e) { return ""; } }
  function errText(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login/i.test(m)) return "Email 或密碼不對";
    if (/already registered|already exists/i.test(m)) return "這個 Email 已經註冊過了，請直接登入";
    if (/Password should be/i.test(m)) return "密碼至少要 6 個字";
    if (/code not found/i.test(m)) return "找不到這個邀請碼";
    if (/couple full/i.test(m)) return "這個花園已經有兩個人了";
    if (/already paired/i.test(m)) return "你已經在一個花園裡了";
    return "沒有成功：" + m;
  }

  // ---------- 面板 ----------
  function queueCard(fn) { if (sheetOpen()) cardQueue.push(fn); else fn(); }
  function closeSheet() {
    document.getElementById("sheet-root").textContent = "";
    if (sheetOnClose) { var f = sheetOnClose; sheetOnClose = null; f(); }
    if (cardQueue.length) { var nx = cardQueue.shift(); setTimeout(nx, 350); }
  }
  function openPanel(kids) {
    sheetOnClose = null;
    var root = document.getElementById("sheet-root");
    root.textContent = "";
    var wrap = el("div", { class: "sheet-wrap", onclick: function (e) { if (e.target === wrap) closeSheet(); } }, [el("div", { class: "sheet", role: "dialog" }, kids)]);
    root.appendChild(wrap);
  }
  function openInput(title, placeholder, okLabel, onOk, required) {
    var input = el("input", { type: "text", id: "sheet-input", placeholder: placeholder, maxlength: "80", "aria-label": placeholder });
    openPanel([
      el("h2", { text: title }), input,
      el("div", { class: "row" }, [
        el("button", { class: "btn primary", text: okLabel, onclick: function () { var v = input.value.trim(); if (required && !v) { toast("寫一句原因吧"); return; } closeSheet(); onOk(v); } }),
        el("button", { class: "btn ghost", text: "取消", onclick: closeSheet })
      ])
    ]);
    input.focus();
  }
  function confirmPanel(title, text, okLabel, onOk) {
    openPanel([
      el("h2", { text: title }), el("p", { class: "legend", style: "font-size:15px;color:var(--ink-soft)", text: text }),
      el("div", { class: "row" }, [
        el("button", { class: "btn primary", text: okLabel, onclick: function () { closeSheet(); onOk(); } }),
        el("button", { class: "btn ghost", text: "取消", onclick: closeSheet })
      ])
    ]);
  }

  // ---------- 背景與玻璃球 ----------
  var DOCK_GAP = 106 + (window.matchMedia && matchMedia("(display-mode: standalone)").matches ? 6 : 0);   // 主畫面全螢幕時工具列貼近下緣；瓶子多留一點空間，不被工具列擋到
  function vidLayout() {
    var stage = document.getElementById("stage");
    var vw = stage.clientWidth, vh = stage.clientHeight;
    var target = Math.min(vw * 0.82, vh * 0.42);
    if (ASSET === ASSETS.full) {
      var hero = document.querySelector("#ui .hero"), heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
      var scHero = (vh - DOCK_GAP - heroBottom - 20) / (VID.h * (1 - ORB.cy + ORB.ry));
      var scD = Math.max(0.12, Math.min(target / (2 * ORB.rx * VID.w), scHero));
      return { s: scD, left: vw / 2 - ORB.cx * VID.w * scD, top: vh - DOCK_GAP - VID.h * scD };
    }
    var sc = Math.max(target / (2 * ORB.rx * VID.w), vw / VID.w);
    var left = vw / 2 - ORB.cx * VID.w * sc;
    left = Math.min(0, Math.max(vw - VID.w * sc, left));
    var top = vh - DOCK_GAP - 6 - (ORB.cy + ORB.ry) * VID.h * sc;  // 魚缸底部貼著工具列上緣
    // 手機：文字區太高時，玻璃球最多往下讓 40px（下緣會藏到工具列後面）
    var heroM = document.querySelector("#ui .hero"), hb = heroM ? heroM.getBoundingClientRect().bottom : 0;
    var orbTop = top + (ORB.cy - ORB.ry) * VID.h * sc;
    if (hb && orbTop < hb + 8) top += Math.min(40, hb + 8 - orbTop);
    return { s: sc, left: left, top: top };
  }
  function layoutVideo() {
    var L = vidLayout();
    ["bg", "still"].forEach(function (id) {
      var v = document.getElementById(id);
      v.style.left = L.left + "px"; v.style.top = L.top + "px";
      v.style.width = (VID.w * L.s) + "px"; v.style.height = (VID.h * L.s) + "px";
    });
  }
  function orbGeom() {
    var L = vidLayout();
    return { cx: L.left + ORB.cx * VID.w * L.s, cy: L.top + ORB.cy * VID.h * L.s, rx: ORB.rx * VID.w * L.s, ry: ORB.ry * VID.h * L.s };
  }
  // 一朵玫瑰（含莖和葉）。每朵用編號決定左右翻轉、歪斜和高矮，看起來才不會一模一樣
  function photoFlower(i, isNew, S, atlas) {
    var flip = seeded(i * 5 + 2) > 0.5 ? -1 : 1, tilt = (seeded(i * 7 + 3) - 0.5) * 18, k = 0.85 + seeded(i * 13 + 5) * 0.3;
    var w = S * 0.72 * k, H = w * 360 / 365;
    var f = el("div", { class: "pf" + atlas + (isNew ? " new" : ""), "aria-hidden": "true" });
    f.style.width = w + "px"; f.style.height = H + "px";
    var rose = el("div", { class: "rose" });
    rose.style.transform = "scaleX(" + flip + ") rotate(" + tilt.toFixed(1) + "deg)";
    f.appendChild(rose);
    f._H = H; f._W = w;
    return f;
  }
  function renderOrb(list, fresh, owner) {
    var layer = document.getElementById("orb-layer");
    layer.textContent = "";
    var o = orbGeom(), n = list.length;
    var fb = el("div", { id: "orb-fb" });
    fb.style.left = (o.cx - o.rx) + "px"; fb.style.top = (o.cy - o.ry) + "px"; fb.style.width = (o.rx * 2) + "px"; fb.style.height = (o.ry * 2) + "px";
    layer.appendChild(fb);
    var dim = el("div", { id: "orb-dim" });
    dim.style.left = (o.cx - o.rx * 0.97) + "px"; dim.style.top = (o.cy - o.ry * 0.97) + "px"; dim.style.width = (o.rx * 1.94) + "px"; dim.style.height = (o.ry * 1.94) + "px";
    var bx = o.cx, by = o.cy + 0.39 * o.ry, hw = 0.8 * o.rx, hh = 0.26 * o.ry;
    if (!n) {
      addPet(layer, bx, by, o);
      layer.appendChild(el("div", { class: "orb-hint", style: "left:" + o.cx + "px;top:" + (o.cy - 0.12 * o.ry) + "px", text: "第一朵花，等著被種下" }));
      addFront(layer, o);
      return;
    }
    var hF = Math.max(o.ry * 0.34, Math.min(o.ry * 0.6, o.ry * 0.6 * Math.sqrt(10 / Math.max(n, 10))));
    var S0 = o.ry * 0.62 * Math.max(0.6, Math.min(1, Math.sqrt(14 / Math.max(n, 14))));
    var M = 40, items = [], bloomIdx = 0, seedOff = owner && partner && owner.id === partner.id ? 500 : 0;
    var color = gardenColor(owner);
    list.forEach(function (d, i) {
      var k = i % M, wrap = Math.floor(i / M);
      var it = { i: i, d: d, r: (0.4 + 0.6 * Math.sqrt((k + 0.5) / M)) * (wrap ? 0.92 : 1),   // 中間留給小精靈
        a: i * 2.39996 + wrap * 0.7,
        jx: (seeded(i + 90) - 0.5) * hF * 0.5, jy: wrap * 3 + (seeded(i + 91) - 0.5) * hF * 0.3 };
      var isNew = !!(fresh && fresh[d.id]);
      var f = photoFlower(i + seedOff, isNew, S0, ATLAS[d.kind === "black" ? "black" : color]);
      if (isNew) { f.style.animationDelay = (bloomIdx++ * 0.25) + "s"; animated[d.id] = 1; setTimeout(pokePet, 1400); }
      f.addEventListener("click", function () {
        if (spin.moved) return;
        f.classList.add("picked"); setTimeout(function () { f.classList.remove("picked"); }, 900); openEntry(d, i + 1);
      });
      it.f = f; items.push(it);
      layer.appendChild(f);
    });
    // 花繞著苔蘚的中心轉：角度改變時重新算位置、遠近大小與前後順序
    spin.place = function () {
      items.forEach(function (it) {
        var ang = it.a + spin.theta;
        var x = bx + Math.cos(ang) * hw * it.r + it.jx, y = by + Math.sin(ang) * hh * it.r + it.jy;
        var dp = Math.max(0, Math.min(1, (y - (by - hh)) / (2 * hh)));
        it.f.style.left = (x - it.f._W / 2) + "px"; it.f.style.top = (y - it.f._H) + "px";
        it.f.style.scale = (0.86 + 0.28 * dp).toFixed(3);
        it.f.style.opacity = "1";
        it.f.style.filter = "brightness(" + (0.55 + 0.4 * dp).toFixed(2) + ")" + (dp < 0.45 ? " blur(" + ((0.45 - dp) * 2.2).toFixed(2) + "px)" : "");   // 後排比較暗、比較糊（景深）
        it.f.style.zIndex = String(Math.round(y));
        if (it.f.classList.contains("new")) it.f.style.setProperty("--drop", Math.round((o.cy - o.ry * 0.9) - y) + "px");
      });
    };
    spin.place();
    grow(layer, o, list.filter(function (d) { return d.kind !== "black"; }).length, bx, by, hw, hh, S0, color);
    addPet(layer, bx, by, o);
    var grab = el("div", { class: "orb-grab", "aria-hidden": "true" });
    grab.style.left = (o.cx - o.rx) + "px"; grab.style.top = (o.cy - o.ry) + "px"; grab.style.width = (o.rx * 2) + "px"; grab.style.height = (o.ry * 2) + "px";
    layer.insertBefore(grab, layer.firstChild);
    spin.bind(layer, o.rx);
    addFront(layer, o);
  }
  // 苔蘚小精靈：坐在瓶子中間的土上。待機會呼吸、晃小芽，放著不管會睡著，點一下就醒來跳一下
  var PET = { w: 151, h: 180, idle: 25, sleep: 30 };
  var pet = { el: null, mode: "idle", f: 0, dir: 1, idleSince: Date.now(), timer: null };
  function addPet(layer, bx, by, o) {
    var H = Math.round(o.ry * 0.6), W = Math.round(H * PET.w / PET.h);
    var p = el("div", { class: "pet", role: "button", "aria-label": "苔蘚小精靈" });
    p.style.width = W + "px"; p.style.height = H + "px";
    var footY = by + (o.ry * 0.26) * 0.45;   // 坐在苔蘚前半部，大部分的花在牠後面
    var px = bx + o.rx * 0.09;   // 照片裡的土坑在瓶子正中央偏右一點，讓牠坐在土坑正中間
    p.style.left = (px - W / 2) + "px"; p.style.top = (footY + H * 0.06 - H) + "px";
    p.style.zIndex = String(Math.round(footY));
    var shadow = el("div", { class: "pet-shadow", "aria-hidden": "true" });   // 腳下的影子，讓牠坐在苔蘚上而不是浮著
    shadow.style.left = (px - W * 0.42) + "px"; shadow.style.top = (footY - H * 0.07) + "px";
    shadow.style.width = (W * 0.84) + "px"; shadow.style.height = (H * 0.16) + "px";
    shadow.style.zIndex = String(Math.round(footY) - 1);
    layer.appendChild(shadow);
    p.addEventListener("click", function () { if (!spin.moved) pokePet(); });
    layer.appendChild(p);
    pet.el = p; drawPet();
    if (!pet.timer) pet.timer = setInterval(tickPet, 110);
  }
  function drawPet() {
    if (!pet.el) return;
    var sheet = (pet.mode === "idle" ? "pet-idle.webp" : "pet-sleep.webp") + "?v=25", n = pet.mode === "idle" ? PET.idle : PET.sleep;
    pet.el.style.backgroundImage = "url(" + sheet + ")";
    pet.el.style.backgroundSize = (n * 100) + "% 100%";
    pet.el.style.backgroundPosition = (pet.f / (n - 1) * 100) + "% 0";
  }
  function tickPet() {
    if (!pet.el || !document.body.contains(pet.el) || document.hidden) return;
    if (pet.mode === "idle") {
      pet.f += pet.dir;
      if (pet.f >= PET.idle - 1 || pet.f <= 0) pet.dir = -pet.dir;   // 來回播，接得很順
      if (Date.now() - pet.idleSince > 25000) { pet.mode = "falling"; pet.f = 0; }
    } else if (pet.mode === "falling") {
      if (pet.f < PET.sleep - 1) pet.f++; else pet.mode = "asleep";
    } else if (pet.mode === "waking") {
      if (pet.f > 0) pet.f -= 2; else { pet.f = 0; pet.mode = "idle"; pet.idleSince = Date.now(); hopPet(); }
      pet.f = Math.max(0, pet.f);
    }
    drawPet();
  }
  function hopPet() {
    if (!pet.el) return;
    pet.el.classList.remove("hop"); void pet.el.offsetWidth; pet.el.classList.add("hop");
  }
  function pokePet() {
    if (pet.mode === "asleep" || pet.mode === "falling") pet.mode = "waking";
    else { pet.idleSince = Date.now(); hopPet(); }
  }
  // 瓶子隨花朵數量長大：10 朵起瓶裡有螢火蟲、30 朵苔蘚發光、50 朵中間開一朵大花
  function grow(layer, o, n, bx, by, hw, hh, S0, color) {
    if (n >= 30) {
      var aura = el("div", { class: "orb-aura", "aria-hidden": "true" });
      aura.style.left = (bx - hw * 1.1) + "px"; aura.style.top = (by - hh * 2.2) + "px";
      aura.style.width = (hw * 2.2) + "px"; aura.style.height = (hh * 3.4) + "px";
      layer.appendChild(aura);
    }
    if (n >= 10) {
      var flies = Math.min(9, Math.floor(n / 10) + 1);
      for (var i = 0; i < flies; i++) {
        var f = el("div", { class: "orb-fly", "aria-hidden": "true" });
        var ang = seeded(i + 300) * Math.PI * 2, rr = 0.25 + seeded(i + 301) * 0.55;
        f.style.left = (o.cx + Math.cos(ang) * o.rx * rr * 0.8) + "px";
        f.style.top = (o.cy - o.ry * 0.15 + Math.sin(ang) * o.ry * rr * 0.45) + "px";
        f.style.animationDelay = (-seeded(i + 302) * 6).toFixed(2) + "s";
        f.style.animationDuration = (5 + seeded(i + 303) * 4).toFixed(2) + "s";
        layer.appendChild(f);
      }
    }
    if (n >= 50) {
      var big = photoFlower(777, false, S0 * 2.1, ATLAS[color]);
      big.classList.add("bigbloom");
      big.style.left = (bx + hw * 0.45 - big._W / 2) + "px"; big.style.top = (by - hh * 0.55 - big._H) + "px";   // 開在小精靈的右後方
      big.style.zIndex = String(Math.round(by - hh * 0.55));
      big.style.pointerEvents = "none";
      layer.appendChild(big);
    }
  }
  // 左右拖動玻璃缸：花跟著水平旋轉，放手後慢慢停下
  var spin = { theta: 0, vel: 0, moved: false, place: null, bound: null, k: 0.01,
    bind: function (layer, rx) {
      spin.k = Math.PI / Math.max(80, rx * 1.6);
      if (spin.bound === layer) return;
      spin.bound = layer;
      var down = null, lastX = 0, lastT = 0;
      layer.addEventListener("pointerdown", function (e) {
        if (!e.target.closest(".pf, .orb-grab")) return;
        down = e.clientX; lastX = e.clientX; lastT = performance.now(); spin.vel = 0; spin.moved = false;
      });
      window.addEventListener("pointermove", function (e) {
        if (down === null) return;
        var dx = e.clientX - lastX, now = performance.now();
        if (Math.abs(e.clientX - down) > 6) spin.moved = true;
        spin.theta -= dx * spin.k; spin.vel = -dx * spin.k / Math.max(8, now - lastT) * 16;
        lastX = e.clientX; lastT = now;
        if (spin.place) spin.place();
      });
      window.addEventListener("pointerup", function () {
        if (down === null) return;
        down = null;
        requestAnimationFrame(function coast() {
          if (Math.abs(spin.vel) < 0.0005 || !spin.place) { setTimeout(function () { spin.moved = false; }, 0); return; }
          spin.theta += spin.vel; spin.vel *= 0.94; spin.place();
          requestAnimationFrame(coast);
        });
      });
    }
  };
  // 前排青苔遮罩：花長在青苔裡，而不是貼在畫面上
  function addFront(layer, o) {
    var box = function (n) {
      n.style.left = (o.cx - o.rx) + "px"; n.style.top = (o.cy - o.ry) + "px";
      n.style.width = (o.rx * 2) + "px"; n.style.height = (o.ry * 2) + "px";
      layer.appendChild(n);
    };
    box(el("img", { class: "orb-front", src: ASSET.front, alt: "", "aria-hidden": "true" }));
    box(el("div", { class: "orb-haze", "aria-hidden": "true" }));      // 瓶子裡的頂光和底部陰影
    box(el("img", { class: "orb-glass", src: ASSET.glass + "?v=28", alt: "", "aria-hidden": "true" }));   // 玻璃反光蓋在最上面：花和小精靈才會在玻璃後面
  }

  function glowOrb(black) {
    var o = orbGeom(), n = el("div", { class: "orb-glow" + (black ? " blue" : "") });
    n.style.left = (o.cx - o.rx) + "px"; n.style.top = (o.cy - o.ry) + "px"; n.style.width = (o.rx * 2) + "px"; n.style.height = (o.ry * 2) + "px";
    document.getElementById("stage").appendChild(n);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 3000);
  }

  // ---------- 資料讀取 ----------
  async function loadAll() {
    var uid = me.id;
    var pr = await sb.from("cg_profiles").select("*").eq("id", uid).maybeSingle();
    if (pr.error) throw pr.error;
    me = pr.data;
    if (!me.couple_id) { partner = null; couple = null; tasks = []; entries = []; dates = []; return; }
    var res = await Promise.all([
      sb.from("cg_couples").select("*").eq("id", me.couple_id).maybeSingle(),
      sb.from("cg_profiles").select("*").eq("couple_id", me.couple_id),
      sb.from("cg_tasks").select("*").eq("couple_id", me.couple_id).order("sort").order("created_at"),
      sb.from("cg_entries").select("*").eq("couple_id", me.couple_id).order("ts", { ascending: false }).limit(2000),
      sb.from("cg_dates").select("*").eq("couple_id", me.couple_id).order("day"),
      sb.from("cg_pings").select("*").eq("couple_id", me.couple_id).order("ts", { ascending: false }).limit(20),
      sb.from("cg_rewards").select("*").eq("couple_id", me.couple_id).eq("active", true).order("cost"),
      sb.from("cg_reward_claims").select("*").eq("couple_id", me.couple_id).order("ts", { ascending: false }).limit(200)
    ]);
    pings = res[5].error ? [] : (res[5].data || []);   // 還沒建 cg_pings 表時就當作沒有
    rewards = res[6].error ? [] : (res[6].data || []);
    claims = res[7].error ? [] : (res[7].data || []);
    res.slice(0, 5).forEach(function (r) { if (r.error) throw r.error; });
    couple = res[0].data;
    partner = (res[1].data || []).filter(function (p) { return p.id !== uid; })[0] || null;
    tasks = res[2].data || []; entries = res[3].data || []; dates = res[4].data || [];
  }
  async function refresh() {
    if (!me) return;
    try { await loadAll(); loaded = true; setConn(""); route(); }
    catch (e) { setConn(navigator.onLine === false ? "沒有網路" : "連線不穩，稍後重試"); }
  }
  async function act(fn, okMsg) {
    if (busy) return;
    busy = true; setConn("傳送中…");
    try { var r = await fn(); if (r && r.error) throw r.error; if (okMsg) { toast(okMsg); haptic(); } }
    catch (e) { toast(errText(e)); }
    busy = false;
    await refresh();
  }

  // ---------- 規則 ----------
  // 某人花園裡「有效的花」：確認過的任務花、送的花、申請通過的花；扣掉贖回用掉的最舊幾朵
  function garden(owner) {
    if (!owner) return { flowers: [], blacks: [], inOrb: [], count: 0, week: 0, maxTs: 0 };
    var mine = entries.filter(function (e) { return e.owner === owner.id; });
    var byTs = function (a, b) { return a.ts - b.ts; };
    var flowers = mine.filter(function (e) { return e.kind !== "black" && e.status === "confirmed"; }).sort(byTs);
    var blacks = mine.filter(function (e) { return e.kind === "black" && (e.status === "confirmed" || e.status === "appeal"); }).sort(byTs);
    var redeemed = mine.filter(function (e) { return e.kind === "black" && e.status === "redeemed"; }).length;
    var avail = flowers.slice(Math.min(flowers.length, redeemed * REDEEM_COST));
    var inOrb = avail.concat(blacks).sort(byTs);
    var t = new Date(), mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    var from = dateKey(mon), week = 0;
    flowers.forEach(function (e) { if (e.day >= from) week++; });
    return { flowers: avail, blacks: blacks, inOrb: inOrb, count: avail.length, week: week, maxTs: inOrb.length ? inOrb[inOrb.length - 1].ts : 0 };
  }
  // 我要處理的：對方送來等確認的任務／申請，以及對方對我給的小黑花提出的申訴
  function myPending() {
    if (!partner) return [];
    return entries.filter(function (e) {
      return (e.owner === partner.id && e.status === "pending" && (e.kind === "task" || e.kind === "request")) ||
        (e.kind === "black" && e.status === "appeal" && e.created_by === me.id);
    }).concat(claims.filter(function (c) { return c.owner === partner.id && c.status === "pending"; }).map(function (c) { return Object.assign({ _claim: true }, c); }))
      .sort(function (a, b) { return a.ts - b.ts; });
  }
  // 可用朵數：瓶子裡的花不會被扣，兌換只扣這個數字（等確認中的也先扣住）
  function points(owner) {
    if (!owner) return 0;
    var used = claims.filter(function (c) { return c.owner === owner.id && c.status !== "rejected"; }).reduce(function (t, c) { return t + c.cost; }, 0);
    return Math.max(0, garden(owner).count - used);
  }
  function taskToday(t) {
    var d = today();
    return entries.filter(function (e) { return e.task_id === t.id && e.day === d && e.status !== "rejected"; });
  }
  function reqsToday() { var d = today(); return entries.filter(function (e) { return e.kind === "request" && e.owner === me.id && e.day === d; }); }
  function viewOwner() { return view === "me" ? me : partner; }
  // 一對情侶兩種花色：花的顏色 = 送花那個人選的顏色。兩人選一樣時，id 比較大的那位自動換成另一色
  function giverColor(p) {
    if (!p) return "red";
    var o = p === me ? partner : me, c = p.color === "blue" ? "blue" : "red";
    if (o && (o.color === "blue" ? "blue" : "red") === c && p.id > o.id) c = c === "red" ? "blue" : "red";
    return c;
  }
  function gardenColor(owner) { return giverColor(owner === me ? partner : me); }
  function taskName(e) {
    if (e.kind === "gift") return "送的花";
    if (e.kind === "request") return "申請的花";
    if (e.kind === "black") return "小黑花";
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === e.task_id) return tasks[i].title;
    return "任務";
  }
  function byId(id) { return id === me.id ? me : partner; }

  // ---------- 寫入 ----------
  function insertEntry(o) {
    return sb.from("cg_entries").insert({ couple_id: couple.id, owner: o.owner, created_by: me.id, task_id: o.task_id || null, kind: o.kind, status: o.status, day: today(), note: o.note || "", reply: "", ts: Date.now() });
  }
  function updateEntry(e, patch) { return sb.from("cg_entries").update(patch).eq("id", e.id); }
  function claimTask(t, note) {
    var mineTask = t.doer === me.id;
    if (taskToday(t).length >= t.per_day) { toast("今天的「" + t.title + "」已經滿了"); return; }
    act(function () { return insertEntry({ owner: t.doer, task_id: t.id, kind: "task", status: mineTask ? "pending" : "confirmed", note: note }); },
      mineTask ? "已送出，等" + nick(partner) + "確認" : "已幫" + nick(partner) + "記上一朵");
  }
  function requestFlower(reason) {
    if (reqsToday().length >= REQ_PER_DAY) { toast("今天已經申請 " + REQ_PER_DAY + " 次了，明天再來"); return; }
    act(function () { return insertEntry({ owner: me.id, kind: "request", status: "pending", note: reason }); }, "已送出，等" + nick(partner) + "確認");
  }
  function giveFlower(reason) { act(function () { return insertEntry({ owner: partner.id, kind: "gift", status: "confirmed", note: reason }); }, "送出了，" + nick(partner) + "的瓶子長出一朵"); }
  function sendMiss() {
    if (!partner) { toast("等對方加入後才能傳"); return; }
    var last = +(lsGet("cg-miss-sent") || 0);
    if (Date.now() - last < 60000) { toast("剛剛傳過了，對方會看到的"); return; }
    lsSet("cg-miss-sent", Date.now());
    act(function () { return sb.from("cg_pings").insert({ couple_id: couple.id, from_id: me.id, ts: Date.now() }); }, "已經把想念傳給" + nick(partner));
  }
  // 對方按了「想你」：打開時瓶子亮一下
  function checkMiss() {
    if (!partner) return;
    var key = "cg-miss-seen-" + me.id, seen = lsGet(key);
    var got = pings.filter(function (x) { return x.from_id === partner.id; });
    if (!got.length) return;
    if (seen === null) { lsSet(key, got[0].ts); return; }
    var fresh = got.filter(function (x) { return x.ts > +seen; });
    lsSet(key, got[0].ts);
    if (!fresh.length) return;
    setTimeout(function () { glowOrb(false); toast(nick(partner) + "想你了" + (fresh.length > 1 ? "（" + fresh.length + " 次）" : "")); }, 1200);
  }
  function giveBlack(reason) { act(function () { return insertEntry({ owner: partner.id, kind: "black", status: "confirmed", note: reason }); }, "已給" + nick(partner) + "一朵小黑花"); }
  function confirmEntry(e, reply) { act(function () { return updateEntry(e, { status: "confirmed", reply: reply || "", ts: Date.now() }); }, "已確認，" + nick(partner) + "的瓶子長出一朵"); }
  function rejectEntry(e, reply) { act(function () { return updateEntry(e, { status: "rejected", reply: reply || "" }); }, "已退回"); }
  function appealBlack(e, text) { act(function () { return updateEntry(e, { status: "appeal", reply: text }); }, "已送出申訴，等" + nick(partner) + "決定"); }
  function decideAppeal(e, revoke) { act(function () { return updateEntry(e, { status: revoke ? "revoked" : "confirmed" }); }, revoke ? "已撤銷這朵小黑花" : "已駁回申訴"); }
  function redeemBlack(e) {
    if (garden(me).count < REDEEM_COST) { toast("花不夠 " + REDEEM_COST + " 朵，還不能贖回"); return; }
    act(function () { return updateEntry(e, { status: "redeemed" }); }, "用 " + REDEEM_COST + " 朵花換掉了一朵小黑花");
  }

  // ---------- 面板：花、待處理、紀錄 ----------
  var INTRO = [
    ["每一朵花，都有它的意義", "做了一件想讓對方知道的事，就到「種花」頁申請一朵，寫下這朵花的意義。"],
    ["對方確認，花才會種下", "申請會出現在對方的「待處理」。對方確認後，花就會從瓶口落下，長在你的苔蘚上。"],
    ["拖動瓶子，點開每一朵花", "左右拖動瓶子可以轉動裡面的花，點一朵就能看到那天寫下的話。也可以互相給小黑花、按「想你」。"]
  ];
  function showIntro(i) {
    var last = i === INTRO.length - 1;
    openPanel([
      el("p", { class: "eyebrow", text: (i + 1) + " / " + INTRO.length }),
      el("h2", { text: INTRO[i][0] }),
      el("p", { class: "legend", style: "font-size:15px;line-height:1.7;color:var(--ink-soft)", text: INTRO[i][1] }),
      el("div", { class: "row" }, [
        last ? null : el("button", { class: "btn ghost", text: "跳過", onclick: closeSheet }),
        el("button", { class: "btn primary", text: last ? "開始種花" : "下一步", onclick: function () { if (last) closeSheet(); else showIntro(i + 1); } })
      ])
    ]);
  }
  // ---------- 推播通知 ----------
  var swReg = null;
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").then(function (r) { swReg = r; }).catch(function () {});
  function pushReady() { return !!(swReg && window.PushManager && window.Notification && cfg.VAPID_PUBLIC_KEY); }
  function pushHint() {
    var ios = /iPhone|iPad/.test(navigator.userAgent), standalone = window.navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    if (ios && !standalone) return "iPhone 要先按分享 → 加入主畫面，從主畫面打開後才能開啟通知（iOS 16.4 以上）。";
    if (!pushReady()) return "這個瀏覽器不支援通知。";
    if (Notification.permission === "denied") return "通知被封鎖了，要到手機或瀏覽器的設定裡允許。";
    if (Notification.permission === "granted") return "已開啟：對方申請花、送花、給小黑花、按「想你」時，你會收到通知。";
    return "開啟後，對方申請花、送花、給小黑花、按「想你」時，你會收到通知。";
  }
  function b64u(str) {
    var pad = "=".repeat((4 - str.length % 4) % 4), raw = atob((str + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out;
  }
  async function enablePush() {
    try {
      var perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("沒有允許通知"); return; }
      var sub = await swReg.pushManager.getSubscription() || await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(cfg.VAPID_PUBLIC_KEY) });
      var j = sub.toJSON();
      closeSheet();
      act(function () { return sb.from("cg_push_subs").upsert({ user_id: me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" }); }, "通知已開啟");
    } catch (e) { toast("開啟失敗：" + (e.message || e)); }
  }
  function openEntry(e, nth) {
    var by = byId(e.created_by), owner = byId(e.owner), black = e.kind === "black";
    var d = parseDay(e.day), wk = "日一二三四五六"[d.getDay()];
    var how = black ? nick(by) + "給的小黑花"
      : e.kind === "gift" ? nick(by) + "送給" + nick(owner)
      : e.kind === "request" ? nick(owner) + "申請，" + nick(owner === me ? partner : me) + "確認"
      : nick(owner) + "完成「" + taskName(e) + "」";
    var col = black ? "black" : gardenColor(owner);
    var bloom = el("div", { class: "fc-bloom " + col, "aria-hidden": "true" });
    var card = el("div", { class: "fcard" + (black ? " black" : "") }, [
      bloom,
      el("div", { class: "fc-no", text: black ? "小黑花" : "No. " + nth }),
      el("div", { class: "fc-date", text: d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + "　星期" + wk }),
      el("div", { class: "fc-how", text: how }),
      e.note ? el("blockquote", { class: "fc-note", text: e.note }) : el("p", { class: "fc-empty", text: "這朵花沒有留言，但它記得那天的事。" }),
      e.reply ? el("div", { class: "fc-reply" }, [el("small", { text: black ? nick(owner) + "的申訴" : nick(e.created_by === me.id ? partner : me) + "的回覆" }), el("p", { text: e.reply })]) : null,
      black && e.status === "appeal" ? el("p", { class: "fc-empty", text: "申訴中" }) : null
    ]);
    var kids = [card];
    if (black) kids.push(el("div", { class: "row" }, blackActions(e)));
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "收起來", onclick: closeSheet })]));
    openPanel(kids);
  }
  function blackActions(e) {
    var btns = [];
    if (e.owner === me.id && e.status === "confirmed") {
      if (!e.reply) btns.push(el("button", { class: "btn", text: "申訴", onclick: function () { openInput("申訴這朵小黑花", "寫下你的理由（只能申訴一次）", "送出申訴", function (v) { appealBlack(e, v); }, true); } }));
      btns.push(el("button", { class: "btn primary", text: "用 " + REDEEM_COST + " 朵花贖回", onclick: function () {
        var c = garden(me).count;
        if (c < REDEEM_COST) { toast("花不夠 " + REDEEM_COST + " 朵，還不能贖回"); return; }
        confirmPanel("用 " + REDEEM_COST + " 朵花換掉它？", "你現在有 " + c + " 朵花，換掉後剩 " + (c - REDEEM_COST) + " 朵。最舊的幾朵會離開瓶子，紀錄還留著。", "換掉", function () { redeemBlack(e); });
      } }));
    }
    if (e.created_by === me.id && e.status === "appeal") {
      btns.push(el("button", { class: "btn primary", text: "撤銷這朵", onclick: function () { closeSheet(); decideAppeal(e, true); } }));
      btns.push(el("button", { class: "btn", text: "駁回", onclick: function () { closeSheet(); decideAppeal(e, false); } }));
    }
    return btns;
  }
  function openPending() {
    var list = myPending();
    var kids = [el("h2", { text: "待處理" })];
    if (!list.length) kids.push(el("p", { class: "legend", text: "目前沒有要你處理的。" }));
    list.forEach(function (e) {
      if (e._claim) {
        kids.push(el("div", { class: "pitem reward" }, [
          el("div", { class: "who", text: nick(partner) + "想兌換獎勵" }),
          el("p", { class: "quote", text: "🎁 " + e.title + "（" + e.cost + " 朵）" }),
          el("div", { class: "row" }, [
            el("button", { class: "btn primary", text: "確認兌換", onclick: function () { decideClaim(e, true); } }),
            el("button", { class: "btn", text: "先不要", onclick: function () { openInput("跟" + nick(partner) + "說明原因", "例如：等見面再兌現（可留空）", "退回", function (v) { decideClaim(e, false, v); }); } })
          ])
        ]));
        return;
      }
      if (e.kind === "black") {
        kids.push(el("div", { class: "pitem black" }, [
          el("div", { class: "who", text: shortDate(e.day) + " " + nick(partner) + "申訴一朵小黑花" }),
          el("p", { class: "quote", text: "你給的原因：" + e.note }),
          el("p", { class: "quote", text: nick(partner) + "說：" + e.reply }),
          el("div", { class: "row" }, blackActions(e))
        ]));
        return;
      }
      kids.push(el("div", { class: "pitem" }, [
        el("div", { class: "who", text: shortDate(e.day) + " " + nick(partner) + (e.kind === "request" ? "申請一朵花" : "完成了「" + taskName(e) + "」") }),
        e.note ? el("p", { class: "quote", text: nick(partner) + "說：" + e.note }) : null,
        el("div", { class: "row" }, [
          el("button", { class: "btn primary", text: "確認，給一朵", onclick: function () { openInput("想對" + nick(partner) + "說什麼？", "例如：今天好棒（可留空）", "確認", function (v) { confirmEntry(e, v); }); } }),
          el("button", { class: "btn", text: "退回", onclick: function () { openInput("退回原因", "例如：還沒做完喔（可留空）", "退回", function (v) { rejectEntry(e, v); }); } })
        ])
      ]));
    });
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
  }
  // ---------- 獎勵 ----------
  // 獎勵頁分兩區：上面是對方開給我、我可以兌換的；下面是我開給對方的，可以新增、移除
  function openRewards() {
    var pts = points(me), kids = [el("h2", { text: "獎勵" })];
    var row = function (r, btn) {
      return el("div", { class: "rwrow" }, [el("div", { class: "rwcost" }, [el("b", { text: String(r.cost) }), el("span", { text: "朵" })]), el("div", { class: "rwtitle", text: r.title }), btn]);
    };
    kids.push(el("h3", { text: "我可以兌換的" }));
    kids.push(el("div", { class: "pts" }, [el("b", { text: String(pts) }), el("span", { text: "可用朵數" })]));
    var forMe = rewards.filter(function (r) { return r.owner === me.id; });
    if (!forMe.length) kids.push(el("p", { class: "legend", text: partner ? "還沒有，" + nick(partner) + "可以幫你設定。" : "等對方加入後，就能互相設定獎勵。" }));
    forMe.forEach(function (r) {
      var waiting = claims.some(function (c) { return c.reward_id === r.id && c.status === "pending"; });
      var ok = pts >= r.cost && !waiting;
      var btn = el("button", { class: "btn" + (ok ? " primary" : ""), text: waiting ? "等確認" : pts >= r.cost ? "兌換" : "還差 " + (r.cost - pts) + " 朵", onclick: function () {
        if (!ok) return;
        confirmPanel("兌換「" + r.title + "」？", "會用掉 " + r.cost + " 朵可用朵數，" + nick(partner) + "確認後就成立。瓶子裡的花不會少。", "兌換", function () { claimReward(r); });
      } });
      if (!ok) btn.setAttribute("disabled", "");
      kids.push(row(r, btn));
    });
    if (partner) {
      kids.push(el("h3", { text: "我開給" + nick(partner) + "的" }));
      var forThem = rewards.filter(function (r) { return r.owner === partner.id; });
      kids.push(el("p", { class: "legend", text: nick(partner) + "目前可用 " + points(partner) + " 朵。兌換後會到你的「待處理」等你確認。" }));
      forThem.forEach(function (r) {
        kids.push(row(r, el("button", { class: "btn ghost", text: "移除", onclick: function () {
          confirmPanel("移除「" + r.title + "」？", "已經兌換過的紀錄會保留。", "移除", function () { act(function () { return sb.from("cg_rewards").update({ active: false }).eq("id", r.id); }, "已移除"); });
        } })));
      });
      kids.push(el("button", { class: "btn primary", text: "＋ 新增獎勵給" + nick(partner), onclick: openAddReward }));
    }
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
  }
  function openAddReward() {
    var title = el("input", { type: "text", id: "rw-title", placeholder: "獎勵內容，例如：見面請你吃大餐", maxlength: "40" });
    var cost = el("input", { type: "number", id: "rw-cost", placeholder: "需要幾朵，例如 20", min: "1", max: "9999", inputmode: "numeric" });
    openPanel([
      el("h2", { text: "幫" + nick(partner) + "新增獎勵" }),
      el("label", { class: "field" }, [el("span", { text: "獎勵" }), title]),
      el("label", { class: "field" }, [el("span", { text: "朵數" }), cost]),
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "取消", onclick: openRewards }),
        el("button", { class: "btn primary", text: "新增", onclick: function () {
          var t = title.value.trim(), c = parseInt(cost.value, 10);
          if (!t) { toast("寫一下獎勵內容"); return; }
          if (!(c >= 1 && c <= 9999)) { toast("朵數要是 1 到 9999"); return; }
          closeSheet();
          act(function () { return sb.from("cg_rewards").insert({ couple_id: couple.id, owner: partner.id, created_by: me.id, title: t, cost: c }); }, "已新增獎勵");
        } })
      ])
    ]);
  }
  function claimReward(r) {
    act(function () { return sb.from("cg_reward_claims").insert({ couple_id: couple.id, reward_id: r.id, owner: me.id, title: r.title, cost: r.cost, ts: Date.now() }); }, "已送出兌換，等" + nick(partner) + "確認");
  }
  function decideClaim(c, ok, reply) {
    closeSheet();
    act(function () { return sb.from("cg_reward_claims").update({ status: ok ? "confirmed" : "rejected", reply: reply || "" }).eq("id", c.id); }, ok ? "兌換成立 🎁" : "已退回");
  }
  function openRecords() {
    var owner = viewOwner();
    var list = entries.filter(function (e) { return owner && e.owner === owner.id; })
      .concat(claims.filter(function (c) { return owner && c.owner === owner.id; }).map(function (c) { return Object.assign({ _claim: true, day: dateKey(new Date(c.ts)) }, c); }))
      .sort(function (a, b) { return b.ts - a.ts; }).slice(0, 80);
    var log = el("ul", { class: "log" });
    if (!list.length) log.appendChild(el("li", {}, [el("span", { class: "when" }), el("span", { class: "what", text: "還沒有紀錄。" })]));
    var tagText = { pending: "等確認", rejected: "已退回", appeal: "申訴中", revoked: "已撤銷", redeemed: "已贖回" };
    list.forEach(function (e) {
      if (e._claim) {
        var ct = { pending: "等確認", rejected: "沒有兌換" }[e.status];
        log.appendChild(el("li", { class: "claim" }, [el("span", { class: "when", text: shortDate(e.day) }), el("div", { class: "what" }, [
          el("div", {}, [el("b", { text: "🎁 兌換：" + e.title + "（" + e.cost + " 朵）" }), ct ? el("span", { class: "tag" + (e.status === "pending" ? "" : " no"), text: ct }) : null]),
          e.reply ? el("p", { class: "reply", text: nick(e.owner === me.id ? partner : me) + "：" + e.reply }) : null
        ])]));
        return;
      }
      var t = tagText[e.status];
      var tag = t ? el("span", { class: "tag" + (e.status === "pending" || e.status === "appeal" ? "" : " no"), text: t }) : null;
      log.appendChild(el("li", { class: e.kind === "black" ? "black" : "" }, [el("span", { class: "when", text: shortDate(e.day) }), el("div", { class: "what" }, [
        el("div", {}, [el("b", { text: taskName(e) }), tag]),
        e.note ? el("p", { class: "note", text: nick(byId(e.created_by)) + "：" + e.note }) : null,
        e.reply ? el("p", { class: "reply", text: (e.kind === "black" ? nick(byId(e.owner)) + "（申訴）" : nick(e.created_by === me.id ? partner : me)) + "：" + e.reply }) : null,
        e.kind === "black" && blackActions(e).length ? el("div", { class: "row" }, blackActions(e)) : null
      ])]));
    });
    openPanel([el("h2", { text: nick(owner) + "的紀錄" }), log, el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })])]);
  }

  function showNewCard(list, maxTs) {
    var nb = list.filter(function (e) { return e.kind === "black"; }).length, nf = list.length - nb;
    var kids = [el("h2", { text: nb && nf ? "你收到 " + nf + " 朵花、" + nb + " 朵小黑花" : nb ? nick(partner) + "給你 " + nb + " 朵小黑花" : "有 " + nf + " 朵新花開了" })];
    list.slice(-3).reverse().forEach(function (e) {
      var line = e.kind === "black" ? e.note : (e.reply || e.note || nick(partner) + "確認了你的花");
      kids.push(el("div", { class: "msgcard" }, [el("small", { text: shortDate(e.day) + " " + taskName(e) }), el("p", { text: line })]));
    });
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn primary", text: "收下", onclick: closeSheet })]));
    openPanel(kids);
    sheetOnClose = function () { setSeen(maxTs); };
  }
  function showMilestone(ms) {
    openPanel([
      el("h2", { text: "第 " + ms + " 朵花" }),
      el("p", { class: "legend", style: "font-size:15px;color:var(--ink-soft)", text: "你的瓶子裡已經有 " + ms + " 朵花了。" }),
      el("div", { class: "row" }, [el("button", { class: "btn primary", text: "好", onclick: closeSheet })])
    ]);
  }
  function seenKey() { return "cg-seen-" + me.id; }
  function getSeen(maxTs) { if (seen.v == null) { var v = lsGet(seenKey()); if (v === null) { seen.v = maxTs; lsSet(seenKey(), maxTs); } else seen.v = +v; } return seen.v; }
  function setSeen(t) { seen.v = t; lsSet(seenKey(), t); }

  // ---------- 面板：我們（紀念日、天數、見面倒數） ----------
  function nextOccurrence(d) {
    var base = parseDay(d.day), now = parseDay(today());
    if (!d.yearly) return base;
    var n = new Date(now.getFullYear(), base.getMonth(), base.getDate());
    if (n < now) n = new Date(now.getFullYear() + 1, base.getMonth(), base.getDate());
    return n;
  }
  // 天數頁可以顯示的日子。key：meet 見面倒數、started 在一起、met 認識、d:<id> 自己新增的紀念日
  function dayItems(now) {
    var out = [];
    if (couple.next_meet) { var left = daysBetween(now, parseDay(couple.next_meet)); if (left >= 0) out.push({ key: "meet", name: "見面倒數", n: left === 0 ? "今天" : String(left), label: left === 0 ? "見面" : "見面倒數", cls: " meet" }); }
    if (couple.started_on) out.push({ key: "started", name: "在一起天數", n: String(daysBetween(parseDay(couple.started_on), now) + 1), label: "在一起・天" });
    if (couple.met_on) out.push({ key: "met", name: "認識天數", n: String(daysBetween(parseDay(couple.met_on), now) + 1), label: "認識・天" });
    dates.forEach(function (d) {
      var left = daysBetween(now, nextOccurrence(d));
      if (left >= 0) out.push({ key: "d:" + d.id, name: d.title + "（倒數）", n: left === 0 ? "今天" : String(left), label: d.title.slice(0, 5) + (left === 0 ? "" : "・倒數"), cls: " anniv", left: left });
    });
    return out;
  }
  function dayStats(now) {
    var items = dayItems(now), picks = Array.isArray(me.day_picks) ? me.day_picks : null;
    if (!picks) {   // 沒設定過：見面、在一起、認識，加上最近的一個紀念日
      var base = items.filter(function (x) { return !x.left && x.left !== 0; });
      var near = items.filter(function (x) { return x.left >= 0; }).sort(function (a, b) { return a.left - b.left; })[0];
      return base.concat(near ? [near] : []).slice(0, 4);
    }
    return picks.map(function (k) { return items.filter(function (x) { return x.key === k; })[0]; }).filter(Boolean).slice(0, 4);
  }
  function pickBox(now) {
    var items = dayItems(now), cur = dayStats(now).map(function (x) { return x.key; });
    var box = el("div", { class: "picks" });
    if (!items.length) box.appendChild(el("p", { class: "legend", text: "先在上面填日期或新增紀念日，就能選。" }));
    items.forEach(function (x) {
      var cb = el("input", { type: "checkbox" }); if (cur.indexOf(x.key) >= 0) cb.checked = true;
      cb.addEventListener("change", function () {
        var on = [].slice.call(box.querySelectorAll("input")).filter(function (c) { return c.checked; });
        if (on.length > 4) { cb.checked = false; toast("最多選 4 個"); return; }
      });
      cb._key = x.key;
      box.appendChild(el("label", { class: "check" }, [cb, el("span", { text: x.name })]));
    });
    if (items.length) box.appendChild(el("button", { class: "btn", text: "儲存顯示設定", onclick: function () {
      var keys = [].slice.call(box.querySelectorAll("input")).filter(function (c) { return c.checked; }).map(function (c) { return c._key; });
      closeSheet();
      act(function () { return sb.from("cg_profiles").update({ day_picks: keys }).eq("id", me.id); }, "天數頁已更新");
    } }));
    return box;
  }
  function openUs() {
    var started = el("input", { type: "date", id: "us-started", value: couple.started_on || "" });
    var met = el("input", { type: "date", id: "us-met", value: couple.met_on || "" });
    var meet = el("input", { type: "date", id: "us-meet", value: couple.next_meet || "" });
    var now = new Date();
    var list = el("ul", { class: "log" });
    var sorted = dates.slice().sort(function (a, b) { return nextOccurrence(a) - nextOccurrence(b); });
    if (!sorted.length) list.appendChild(el("li", {}, [el("span", { class: "when" }), el("span", { class: "what", text: "還沒有紀念日，按下面新增。" })]));
    sorted.forEach(function (d) {
      var n = nextOccurrence(d), left = daysBetween(now, n);
      list.appendChild(el("li", {}, [el("span", { class: "when", text: shortDate(dateKey(n)) }), el("div", { class: "what" }, [
        el("div", {}, [el("b", { text: d.title }), el("span", { class: "tag", text: left === 0 ? "就是今天" : left > 0 ? "還有 " + left + " 天" : "已過 " + (-left) + " 天" })]),
        el("button", { class: "btn ghost", style: "min-height:32px;padding:4px 10px;font-size:13px", text: "刪除", onclick: function () {
          confirmPanel("刪除「" + d.title + "」？", "刪除後就不會再提醒。", "刪除", function () { act(function () { return sb.from("cg_dates").delete().eq("id", d.id); }, "已刪除"); });
        } })
      ])]));
    });
    var title = el("input", { type: "text", id: "date-title", placeholder: "例如：對方的生日、交往紀念日", maxlength: "40" });
    var day = el("input", { type: "date", id: "date-day" });
    var yearly = el("input", { type: "checkbox", id: "date-yearly", checked: "" });
    openPanel([
      el("h2", { text: "我們" }),
      el("p", { class: "legend", text: "這裡的日子會變成天數頁的數字：在一起幾天、認識幾天、還有幾天見面。下面的紀念日（生日、交往紀念日…）會自動倒數，最近的一個也會出現在天數頁。" }),
      el("label", { class: "field" }, [el("span", { text: "在一起的日子" }), started]),
      el("label", { class: "field" }, [el("span", { text: "認識的日子" }), met]),
      el("label", { class: "field" }, [el("span", { text: "下次見面" }), meet]),
      el("div", { class: "row" }, [el("button", { class: "btn primary", text: "儲存", onclick: function () {
        var patch = { started_on: started.value || null, met_on: met.value || null, next_meet: meet.value || null };
        closeSheet(); act(function () { return sb.from("cg_couples").update(patch).eq("id", couple.id); }, "已儲存");
      } })]),
      el("h3", { text: "天數頁要顯示的（最多 4 個，只影響你自己）" }), pickBox(now),
      el("h3", { text: "紀念日倒數" }), list,
      el("h3", { text: "新增紀念日" }), title, day,
      el("label", { class: "check" }, [yearly, el("span", { text: "每年重複" })]),
      el("div", { class: "row" }, [
        el("button", { class: "btn primary", text: "新增", onclick: function () {
          if (!title.value.trim() || !day.value) { toast("請填名稱和日期"); return; }
          var row = { couple_id: couple.id, title: title.value.trim(), day: day.value, yearly: yearly.checked };
          closeSheet(); act(function () { return sb.from("cg_dates").insert(row); }, "已新增");
        } }),
        el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })
      ])
    ]);
  }

  // ---------- 面板：設定（暱稱、時區、花色、任務、邀請碼、登出） ----------
  function openSettings() {
    var nickIn = el("input", { type: "text", id: "set-nick", value: me.nickname || "", maxlength: "20" });
    var tzSel = el("select", { id: "set-tz" }, TZS.map(function (z) { return el("option", { value: z[0], text: z[1] }); }));
    if (!TZS.some(function (z) { return z[0] === me.tz; })) tzSel.appendChild(el("option", { value: me.tz, text: me.tz }));
    tzSel.value = me.tz;
    var colorSel = el("select", { id: "set-color" }, [el("option", { value: "red", text: "紅色" }), el("option", { value: "blue", text: "藍色" })]);
    colorSel.value = giverColor(me);
    var kids = [
      el("h2", { text: "設定" }),
      el("label", { class: "field" }, [el("span", { text: "我的暱稱" }), nickIn]),
      el("label", { class: "field" }, [el("span", { text: "我在哪個時區" }), tzSel]),
      el("label", { class: "field" }, [el("span", { text: "我送出的花色" }), colorSel]),
      el("div", { class: "row" }, [el("button", { class: "btn primary", text: "儲存", onclick: function () {
        var patch = { nickname: nickIn.value.trim() || me.nickname, tz: tzSel.value, color: colorSel.value };
        closeSheet(); act(function () { return sb.from("cg_profiles").update(patch).eq("id", me.id); }, "已儲存");
      } })])
    ];
    kids.push(el("h3", { text: "通知" }));
    kids.push(el("p", { class: "legend", text: pushHint() }));
    if (pushReady()) kids.push(el("button", { class: "btn", text: Notification.permission === "granted" ? "重新開啟這支手機的通知" : "開啟通知", onclick: enablePush }));
    kids.push(el("h3", { text: "我們的花園" }));
    kids.push(el("p", { class: "legend", text: "邀請碼：" + (couple ? couple.invite_code : "") + (partner ? "（已配對）" : "（把這組碼給對方）") }));
    kids.push(el("div", { class: "row" }, [
      el("button", { class: "btn ghost", text: "登出", onclick: function () { closeSheet(); signOut(); } }),
      el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })
    ]));
    openPanel(kids);
  }
  function openAddTask(p) {
    var titleIn = el("input", { type: "text", id: "task-title", placeholder: "任務名稱，例如：早點睡", maxlength: "20" });
    var perSel = el("select", { id: "task-per" }, [1, 2, 3, 4, 5].map(function (n) { return el("option", { value: String(n), text: "一天 " + n + " 次" }); }));
    var chips = el("div", { class: "chips-pick" }, TEMPLATES.map(function (t) {
      return el("button", { class: "pick", text: t.title, onclick: function () { titleIn.value = t.title; perSel.value = String(t.per_day); } });
    }));
    openPanel([
      el("h2", { text: "幫" + nick(p) + "新增任務" }),
      el("p", { class: "legend", text: "常用範本（點一下帶入，可以再改）" }), chips,
      titleIn, perSel,
      el("div", { class: "row" }, [
        el("button", { class: "btn primary", text: "新增", onclick: function () {
          var title = titleIn.value.trim();
          if (!title) { toast("請填任務名稱"); return; }
          var row = { couple_id: couple.id, doer: p.id, title: title, per_day: +perSel.value, sort: tasks.length };
          closeSheet(); act(function () { return sb.from("cg_tasks").insert(row); }, "已新增「" + title + "」");
        } }),
        el("button", { class: "btn ghost", text: "取消", onclick: closeSheet })
      ])
    ]);
  }

  // ---------- 畫面：登入／註冊 ----------
  function renderAuth(mode) {
    var ui = document.getElementById("ui");
    ui.textContent = "";
    var email = el("input", { type: "email", id: "auth-email", placeholder: "Email", autocomplete: "email" });
    var pass = el("input", { type: "password", id: "auth-pass", placeholder: "密碼（至少 6 個字）", autocomplete: mode === "up" ? "new-password" : "current-password" });
    var nickIn = el("input", { type: "text", id: "auth-nick", placeholder: "你的暱稱", maxlength: "20" });
    var submit = el("button", { class: "btn primary wideb", text: mode === "up" ? "註冊" : "登入", onclick: async function () {
      if (!email.value || !pass.value) { toast("請填 Email 和密碼"); return; }
      if (mode === "up" && !nickIn.value.trim()) { toast("請填暱稱"); return; }
      submit.disabled = true;
      try {
        var r = mode === "up"
          ? await sb.auth.signUp({ email: email.value.trim(), password: pass.value, options: { data: { nickname: nickIn.value.trim() } } })
          : await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
        if (r.error) throw r.error;
        if (!r.data.session) { toast("註冊成功，但需要先到信箱確認（請通知管理者關閉 Email 驗證）"); submit.disabled = false; return; }
        await afterSignIn(r.data.session, mode === "up" ? nickIn.value.trim() : "");
      } catch (e) { toast(errText(e)); submit.disabled = false; }
    } });
    ui.appendChild(el("div", { class: "auth" }, [
      el("p", { class: "eyebrow", text: "COUPLE GARDEN" }),
      el("h1", { class: "auth-title", text: "情侶花園" }),
      el("p", { class: "legend", text: "把彼此照顧好，瓶子裡就會長出花。" }),
      mode === "up" ? nickIn : null, email, pass, submit,
      el("button", { class: "linkbtn", text: mode === "up" ? "已經有帳號？登入" : "第一次來？註冊", onclick: function () { renderAuth(mode === "up" ? "in" : "up"); } })
    ]));
  }
  async function afterSignIn(session, nickname) {
    var uid = session.user.id;
    var pr = await sb.from("cg_profiles").select("*").eq("id", uid).maybeSingle();
    if (!pr.data) {
      var tz = "Asia/Taipei"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) {}
      var nn = nickname || (session.user.user_metadata && session.user.user_metadata.nickname) || session.user.email.split("@")[0];
      var ins = await sb.from("cg_profiles").insert({ id: uid, nickname: nn, tz: tz });
      if (ins.error) throw ins.error;
    }
    me = { id: uid };
    await refresh();
    if (!poller) poller = setInterval(function () { if (!busy && document.visibilityState === "visible" && !sheetOpen()) refresh(); }, 8000);
  }
  async function signOut() {
    await sb.auth.signOut();
    me = null; partner = null; couple = null; loaded = false; seen = {}; shown = {}; cardShown = {}; animated = {};
    view = "me"; dockPage = 0; cardQueue = [];
    if (poller) { clearInterval(poller); poller = null; }
    document.getElementById("orb-layer").textContent = "";
    var bnx = document.getElementById("bignum"); if (bnx) bnx.parentNode.removeChild(bnx);
    entered = false;
    renderAuth("in");
  }

  // ---------- 畫面：配對 ----------
  function renderPair() {
    var ui = document.getElementById("ui");
    ui.textContent = "";
    var code = el("input", { type: "text", id: "pair-code", placeholder: "對方給你的 6 碼邀請碼", maxlength: "6", style: "text-transform:uppercase;letter-spacing:.3em;text-align:center" });
    ui.appendChild(el("div", { class: "auth" }, [
      el("p", { class: "eyebrow", text: "嗨，" + nick(me) }),
      el("h1", { class: "auth-title", text: "跟另一半配對" }),
      el("p", { class: "legend", text: "一個人建立花園，把邀請碼傳給對方；另一個人輸入邀請碼加入。" }),
      el("button", { class: "btn primary wideb", text: "建立我們的花園", onclick: function () {
        act(function () { return sb.rpc("cg_create_couple"); }, "花園建好了，把邀請碼傳給對方");
      } }),
      el("p", { class: "legend", style: "margin-top:8px", text: "或" }),
      code,
      el("button", { class: "btn wideb", text: "用邀請碼加入", onclick: function () {
        var c = code.value.trim();
        if (c.length < 6) { toast("請輸入 6 碼邀請碼"); return; }
        act(function () { return sb.rpc("cg_join_couple", { code: c }); }, "配對成功");
      } }),
      el("button", { class: "linkbtn", text: "登出", onclick: signOut })
    ]));
  }

  // ---------- 畫面：花園主頁 ----------
  function route() {
    if (!me) { renderAuth("in"); return; }
    if (!me.couple_id || !couple) { renderPair(); return; }
    if (!partner && view === "partner") view = "me";
    renderGarden();
  }
  function renderGarden() {
    var ui = document.getElementById("ui");
    ui.textContent = "";
    var owner = viewOwner(), g = garden(owner), mineView = view === "me";
    var pend = myPending();

    // 新花卡片與里程碑（只看自己的花園）
    var fresh = {}, freshCount = 0;
    var myG = mineView ? g : garden(me);
    if (loaded) {
      checkMiss();
      if (partner && lsGet("cg-intro-" + me.id) === null) { lsSet("cg-intro-" + me.id, 1); setTimeout(function () { queueCard(function () { showIntro(0); }); }, 900); }
      var s = getSeen(myG.maxTs);
      // 我的玻璃球裡每一朵都是對方確認或送來的，所以只要比「上次看過」新就算新花
      var newOnes = myG.inOrb.filter(function (e) { return e.ts > s; });
      if (mineView) newOnes.forEach(function (e) { if (!animated[e.id]) { fresh[e.id] = 1; if (e.kind !== "black") freshCount++; } });
      if (newOnes.length && !cardShown.v) { cardShown.v = true; setTimeout(function () { queueCard(function () { showNewCard(newOnes, myG.maxTs); }); }, 1500); }
      else if (!newOnes.length && myG.maxTs > s) setSeen(myG.maxTs);
      var msKey = "cg-ms-" + me.id, ms = Math.floor(myG.count / 10) * 10, stored = lsGet(msKey);
      if (stored === null) lsSet(msKey, ms);
      else if (ms >= 10 && ms > +stored) { lsSet(msKey, ms); setTimeout(function () { if (view === "me") glowOrb(false); queueCard(function () { showMilestone(ms); }); }, 2200); }
    }
    if (!mineView && partner) {
      var ps = lsGet("cg-pseen-" + me.id);
      g.inOrb.forEach(function (e) { if (ps !== null && e.ts > +ps && !animated[e.id]) fresh[e.id] = 1; });
      lsSet("cg-pseen-" + me.id, g.maxTs);
    }

    ui.appendChild(el("div", { class: "top" }, [
      el("div", { class: "brand" }, ["Couple Garden", el("small", { text: nick(me) })]),
      el("div", { class: "topr" }, [
        el("span", { class: "conn", text: connText }),
        needTiltPermission() && !lsGet("cg-tilt") ? el("button", { class: "tiltbtn", onclick: askTilt }, ["✦ 開啟景深"]) : null
      ])
    ]));

    // 天數、見面倒數、兩地時間
    // 天數卡片：見面倒數、在一起、認識（最多 3 張）
    var now = new Date(), stats = dayStats(now);
    var statRow = stats.length
      ? el("div", { class: "stats" }, stats.map(function (x) { return el("button", { class: "stat" + (x.cls || ""), onclick: openUs }, [el("b", { text: x.n }), el("span", { text: x.label })]); }))
      : el("div", { class: "stats" }, [el("button", { class: "stat setup", onclick: openUs }, [el("b", { text: "＋" }), el("span", { text: "設定紀念日" })])]);
    var tzLine = partner && partner.tz && partner.tz !== me.tz ? clockText(me) + "　·　" + clockText(partner) : "";

    var tabs = el("div", { class: "gtabs", role: "tablist" }, [["me", me], ["partner", partner]].map(function (pair) {
      var key = pair[0], p = pair[1];
      var dot = key === "partner" && pend.length ? el("span", { class: "gdot amber" }) : null;
      return el("button", { class: "gtab" + (view === key ? " on" : "") + (p && gardenColor(p) === "blue" ? " blue" : ""), role: "tab", "aria-selected": view === key ? "true" : "false", disabled: p ? false : "", onclick: function () { switchView(key); } }, [p ? nick(p) : "等待加入", dot]);
    }));
    var unit = owner && gardenColor(owner) === "blue" ? "朵小藍花" : "朵小紅花";
    var bn = bigNum(), numEl = bn.querySelector(".bn-num");
    bn.querySelector(".bn-unit").textContent = unit;
    numEl.textContent = String(g.count);
    if (loaded) {
      var from = shown[view] == null ? (mineView ? g.count - freshCount : g.count) : shown[view];
      if (from !== g.count) animateNum(numEl, from, g.count, shown[view] == null ? 900 : 150);
      shown[view] = g.count;
    }
    ui.appendChild(el("div", { class: "hero" }, [
      tabs,
      el("div", { class: "chips" }, [
        el("span", {}, ["共 ", el("b", { text: String(g.count) }), " 朵"]),
        el("span", {}, ["本週 ", el("b", { text: String(g.week) }), " 朵"]),
        el("span", { class: "blk" }, ["小黑花 ", el("b", { text: String(g.blacks.length) }), " 朵"])
      ]),
      tzLine ? el("p", { class: "caption", text: tzLine }) : null,
      !partner ? el("p", { class: "caption", text: "邀請碼 " + couple.invite_code + "，傳給對方就能配對" }) : null
    ]));

    // 工具列第二頁：種一朵花。沒有固定任務，每一朵都由兩人寫下它的意義
    var page1 = el("div", { class: "page" });
    if (mineView) {
      var leftReq = REQ_PER_DAY - reqsToday().length;
      page1.appendChild(el("button", { class: "mbtn wide", onclick: function () {
        if (!partner) { toast("等對方加入後才能申請"); return; }
        if (leftReq <= 0) { toast("今天已經申請 " + REQ_PER_DAY + " 次了，明天再來"); return; }
        openInput("申請一朵花", "這朵花的意義，例如：今天有好好吃三餐", "送出申請", requestFlower, true);
      } }, [el("span", { class: "name", text: "申請一朵花" }), el("span", { class: "state", text: partner ? nick(partner) + "確認後種下" : "等對方加入" })]));
    } else {
      page1.appendChild(el("button", { class: "mbtn wide", onclick: function () {
        if (!partner) return;
        openInput("送" + nick(partner) + "一朵花", "這朵花的意義，例如：謝謝你今天陪我", "送出", giveFlower, true);
      } }, [el("span", { class: "name", text: "送" + (partner ? nick(partner) : "對方") + "一朵花" }), el("span", { class: "state", text: "直接種進對方的瓶子" })]));
    }
    page1.appendChild(el("button", { class: "mbtn wide blackbtn", onclick: function () {
      if (!partner) { toast("等對方加入後才能給"); return; }
      openInput("給" + nick(partner) + "一朵小黑花", "原因，例如：又熬夜不睡", "給", giveBlack, true);
    } }, [el("span", { class: "name", text: "給" + (partner ? nick(partner) : "對方") + "小黑花" }), el("span", { class: "state", text: "對方可以申訴或用花贖回" })]));

    // 第二頁：互動
    var ico = function (d) { return svg("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, [svg("path", { d: d })]); };
    var page2 = el("div", { class: "page" });
    page2.appendChild(el("button", { class: "tab", onclick: openPending }, [ico("M5 12.5l4.5 4.5L19 7.5"), "待處理", pend.length ? el("span", { class: "badge", text: String(pend.length) }) : null]));
    page2.appendChild(el("button", { class: "tab", onclick: openRewards }, [ico("M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"), "獎勵"]));
    page2.appendChild(el("button", { class: "tab", onclick: sendMiss }, [ico("M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"), "想你"]));
    page2.appendChild(el("button", { class: "tab", onclick: openRecords }, [ico("M8 6.5h11M8 12h11M8 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"), "紀錄"]));

    // 第三頁：我們、設定
    var page3 = el("div", { class: "page" });
    page3.appendChild(el("button", { class: "tab", onclick: openUs }, [ico("M7 3v3M17 3v3M4 8h16M5 5h14v15H5z"), "紀念日"]));
    page3.appendChild(el("button", { class: "tab", onclick: openSettings }, [ico("M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M4 12h2M18 12h2M12 4v2M12 18v2"), "設定"]));

    var page0 = el("div", { class: "page" }, [statRow]);
    var pages = el("div", { class: "pages" }, [page0, page1, page2, page3]);
    var dots = el("div", { class: "dots2" });
    var dotEls = [0, 1, 2, 3].map(function (n) {
      var d = el("button", { class: "dot2" + (n === dockPage ? " on" : "") + (n === 2 && pend.length ? " alert" : ""), "aria-label": ["天數", "種花", "互動", "我們"][n], onclick: function () { pages.scrollTo({ left: n * pages.clientWidth, behavior: "smooth" }); } });
      dots.appendChild(d); return d;
    });
    pages.addEventListener("scroll", function () {
      var n = Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth));
      if (n !== dockPage) { dockPage = n; dotEls.forEach(function (d, k) { d.classList.toggle("on", k === n); }); }
    }, { passive: true });
    ui.appendChild(el("div", { class: "dock liquid-glass" }, [pages, dots]));
    pages.scrollLeft = dockPage * pages.clientWidth;

    layoutVideo();
    renderOrb(g.inOrb, fresh, owner);
    placeBigNum();
    if (loaded && !entered) {
      entered = true;
      ui.classList.add("enter"); bn.classList.add("enter");
      setTimeout(function () { ui.classList.remove("enter"); bn.classList.remove("enter"); }, 2200);
    }
  }
  // 大字花數：超大斜體數字，下半部躲在玻璃球後面（球內只透出一點點）
  function bigNum() {
    var b = document.getElementById("bignum");
    if (!b) {
      b = el("div", { id: "bignum", "aria-hidden": "true" }, [el("span", { class: "bn-num" }), el("span", { class: "bn-unit" })]);
      var st = document.getElementById("stage");
      st.insertBefore(b, document.getElementById("orb-layer"));
    }
    return b;
  }
  function placeBigNum() {
    var b = document.getElementById("bignum");
    if (!b || !couple) return;
    var o = orbGeom(), num = b.querySelector(".bn-num"), unit = b.querySelector(".bn-unit");
    var hero = document.querySelector("#ui .hero"), hb = hero ? hero.getBoundingClientRect().bottom : 0;
    var base = (o.cy - o.ry) - 4;                                  // 數字底部停在魚缸口上方，整個露出來
    var fs = Math.max(56, Math.min(window.innerWidth * 0.4, 220, (base - hb - 8) / 0.86));
    num.style.fontSize = fs + "px";
    num.style.left = o.cx + "px";
    num.style.top = (base - fs * 0.86) + "px";
    var w = num.getBoundingClientRect().width || fs;
    unit.style.left = (o.cx + w / 2 + 6) + "px";
    unit.style.top = (base - fs * 0.86 + fs * 0.12) + "px";
  }
  function animateNum(node, from, to, delay) {
    var t0 = null, dur = 900;
    node.textContent = String(from);
    function step(ts) {
      if (!document.body.contains(node)) return;
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.textContent = String(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step); else { node.classList.remove("pop"); void node.offsetWidth; node.classList.add("pop"); }
    }
    setTimeout(function () { requestAnimationFrame(step); }, delay || 0);
  }
  function switchView(v) {
    if (v === view || (v === "partner" && !partner)) return;
    view = v;
    var layer = document.getElementById("orb-layer");
    layer.classList.add("swap"); renderGarden();
    setTimeout(function () { layer.classList.remove("swap"); }, 30);
  }

  // 左右滑切換（工具列以外）
  var swp = null;
  document.addEventListener("touchstart", function (e) {
    if (!couple || sheetOpen() || !e.touches || e.touches.length !== 1 || (e.target.closest && e.target.closest(".dock"))) { swp = null; return; }
    swp = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (!swp || !e.changedTouches || !e.changedTouches.length) return;
    var dx = e.changedTouches[0].clientX - swp.x, dy = e.changedTouches[0].clientY - swp.y, dt = Date.now() - swp.t;
    swp = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && dt < 700) switchView(dx < 0 ? "partner" : "me");
  }, { passive: true });

  // ---------- 螢火蟲與視差 ----------
  // 背景（影片、玻璃球、花）移最少、大字中間、螢火蟲最多，做出前後景深
  var par = { tx: 0, ty: 0, x: 0, y: 0, base: null, on: false };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function onTilt(e) {
    if (e.gamma == null || e.beta == null) return;
    if (par.base === null) par.base = e.beta;
    par.tx = Math.max(-1, Math.min(1, e.gamma / 25));
    par.ty = Math.max(-1, Math.min(1, (e.beta - par.base) / 25));
  }
  function startTilt() { if (!par.on) { par.on = true; window.addEventListener("deviceorientation", onTilt); } }
  function needTiltPermission() { return typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function"; }
  function askTilt() {
    DeviceOrientationEvent.requestPermission().then(function (st) { lsSet("cg-tilt", st); if (st === "granted") startTilt(); route(); }).catch(function () { lsSet("cg-tilt", "denied"); route(); });
  }
  if (!needTiltPermission() || lsGet("cg-tilt") === "granted") startTilt();
  window.addEventListener("mousemove", function (e) {
    par.tx = (e.clientX / window.innerWidth - 0.5) * 2; par.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
  var fx = document.createElement("canvas"); fx.id = "fx";
  document.getElementById("stage").insertBefore(fx, document.getElementById("ui"));
  var fxCtx = fx.getContext("2d"), flies = [], dpr = Math.min(1.5, window.devicePixelRatio || 1);
  var glow = document.createElement("canvas"); glow.width = glow.height = 48;
  (function () { var c = glow.getContext("2d"), gr = c.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, "rgba(255,246,200,1)"); gr.addColorStop(0.18, "rgba(255,236,150,.9)"); gr.addColorStop(0.45, "rgba(214,232,120,.25)"); gr.addColorStop(1, "rgba(214,232,120,0)");
    c.fillStyle = gr; c.fillRect(0, 0, 48, 48); })();
  function sizeFx() {
    var w = window.innerWidth, h = window.innerHeight;
    fx.width = w * dpr; fx.height = h * dpr; fx.style.width = w + "px"; fx.style.height = h + "px";
    var n = reduceMotion ? 0 : (w < 700 ? 16 : 26);
    flies = [];
    for (var i = 0; i < n; i++) flies.push({ x: Math.random() * w, y: h * (0.35 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.18, z: 0.4 + Math.random() * 0.6, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.2 });
  }
  sizeFx();
  window.addEventListener("resize", sizeFx);
  var bgEls = ["bg", "still", "orb-layer"].map(function (id) { return document.getElementById(id); });
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    par.x += (par.tx - par.x) * 0.06; par.y += (par.ty - par.y) * 0.06;
    var bx = (-par.x * 6).toFixed(2), by = (-par.y * 6).toFixed(2);
    bgEls.forEach(function (n) { if (n) n.style.transform = "translate(" + bx + "px," + by + "px)"; });
    var b = document.getElementById("bignum"); if (b) b.style.transform = "translate(" + (-par.x * 12).toFixed(2) + "px," + (-par.y * 12).toFixed(2) + "px)";
    var w = window.innerWidth, h = window.innerHeight;
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0); fxCtx.clearRect(0, 0, w, h);
    if (!couple) return;
    for (var i = 0; i < flies.length; i++) {
      var f = flies[i];
      f.x += f.vx + Math.sin(t / 1700 + f.ph) * 0.12; f.y += f.vy + Math.cos(t / 2100 + f.ph) * 0.1;
      if (f.x < -20) f.x = w + 20; if (f.x > w + 20) f.x = -20; if (f.y < h * 0.3) f.vy = Math.abs(f.vy); if (f.y > h - 20) f.vy = -Math.abs(f.vy);
      var a = 0.25 + 0.75 * Math.pow((Math.sin(t / 1000 * f.sp + f.ph) + 1) / 2, 2.2);
      var size = 10 + 16 * f.z;
      fxCtx.globalAlpha = a * (0.55 + 0.45 * f.z);
      fxCtx.drawImage(glow, f.x - par.x * 18 * f.z - size / 2, f.y - par.y * 18 * f.z - size / 2, size, size);
    }
    fxCtx.globalAlpha = 1;
  }
  requestAnimationFrame(frame);

  // ---------- 背景影片 ----------
  (function () {
    var v = document.getElementById("bg"), still = document.getElementById("still"), stage = document.getElementById("stage");
    if (ASSET === ASSETS.full) stage.classList.add("desk");
    layoutVideo();
    v.muted = true; v.defaultMuted = true; v.loop = true;
    v.poster = ASSET.start;
    still.addEventListener("error", function () { stage.classList.add("novideo"); });
    still.src = ASSET.end;
    if (ASSET.video) v.src = ASSET.video; else stage.classList.add("still-on");
    function showStill() { stage.classList.add("still-on"); }
    v.addEventListener("ended", showStill);
    v.addEventListener("playing", function () { stage.classList.remove("still-on"); });
    v.addEventListener("error", showStill);
    if (ASSET.video) { var p = v.play(); if (p && p.catch) p.catch(showStill); }
    setTimeout(function () { if (!v.ended && (v.paused || v.readyState < 2)) showStill(); }, 2500);
    document.addEventListener("touchstart", function () { if (v.paused && !v.ended) { var q = v.play(); if (q && q.catch) q.catch(function () {}); } }, { once: true, passive: true });
  })();
  window.addEventListener("error", function (e) {
    var d = document.getElementById("err");
    if (!d) { d = document.createElement("div"); d.id = "err"; document.body.appendChild(d); }
    d.textContent = "出錯了：" + (e.message || "未知") + (e.lineno ? " (行 " + e.lineno + ")" : "");
  });
  function checkUpdate() {
    var cur = document.querySelector('meta[name="app-version"]');
    if (!cur || !window.fetch) return;
    fetch(location.pathname + "?_=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {
      var m = t.match(/name="app-version" content="(\d+)"/);
      if (m && m[1] !== cur.content && location.search.indexOf("v=" + m[1]) === -1 && !sheetOpen()) location.replace(location.pathname + "?v=" + m[1]);
    }).catch(function () {});
  }
  setTimeout(checkUpdate, 1500);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { checkUpdate(); if (me) refresh(); } });
  window.addEventListener("resize", function () { layoutVideo(); if (couple && me) { renderOrb(garden(viewOwner()).inOrb, null, viewOwner()); placeBigNum(); } });
  window.addEventListener("offline", function () { setConn("沒有網路"); });
  window.addEventListener("online", function () { setConn(""); if (me) refresh(); });

  // ---------- 啟動 ----------
  (async function boot() {
    var ui = document.getElementById("ui");
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_KEY || !window.supabase) { ui.appendChild(el("p", { class: "msg", text: "還沒設定資料庫，請填好 config.js。" })); return; }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "cg-auth" } });
    var s = await sb.auth.getSession();
    if (s.data && s.data.session) {
      try { await afterSignIn(s.data.session, ""); } catch (e) { toast(errText(e)); renderAuth("in"); }
    } else renderAuth("in");
  })();
})();
