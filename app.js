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

  var sb = null, me = null, partner = null, couple = null, tasks = [], entries = [], dates = [], pings = [], rewards = [], claims = [], checkins = [], angers = [], coaxes = [], inbox = { blessings: [], guest: [], sent_today: [] }, bouquets = [], wishes = [];
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
  // 某個人「當地的今天」，例如 2026-10-28（報平安用各自的時區算）
  function localDay(tz, d) {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(d || new Date()); } catch (e) { return dateKey(d || new Date()); }
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
    if (hubOn !== "home") setHub("home");
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
  // 把花的 id（uuid）變成固定的數字，當作亂數種子
  function idSeed(id) { var h = 0, s = String(id); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003; return h; }
  // 花頭比較大的花種縮小一點，跟玫瑰看起來差不多大
  var STYLE_SIZE = { tulip: 0.82, camellia: 0.84, sunflower: 0.88, daisy: 0.9, cherry: 0.94 };
  // 花的圖檔（給遠近暗影的遮罩用，要跟 CSS 的背景圖一致）
  function atlasImg(atlas) {
    var c = (atlas || "").trim();
    if (c === "blue") return "rose-blue-b.png"; if (c === "black") return "rose-black-b.png";
    if (c.indexOf("fl-") === 0) return "flower-" + c.slice(3) + ".png";
    return "rose-red-b.png";
  }
  function photoFlower(i, isNew, S, atlas) {
    // 每朵高矮不同（0.8～1.15 倍），左右翻轉、歪斜也不同，看起來才像自然長出來的
    var flip = seeded(i * 5 + 2) > 0.5 ? -1 : 1, tilt = (seeded(i * 7 + 3) - 0.5) * 18, k = 0.8 + seeded(i * 13 + 5) * 0.35;
    var w = S * 0.72 * k, H = w * 360 / 365;
    var f = el("div", { class: "pf" + atlas + (isNew ? " new" : ""), "aria-hidden": "true" });
    f.style.width = w + "px"; f.style.height = H + "px";
    var rose = el("div", { class: "rose" });
    rose.style.transform = "scaleX(" + flip + ") rotate(" + tilt.toFixed(1) + "deg)";
    // 遠近暗影：用花本身的形狀當遮罩疊一層暗色，後排的花比較暗（不用 CSS 濾鏡，iPhone 才畫得出來）
    var url = "url(" + atlasImg(atlas) + ")", shade = el("div", { class: "pf-shade" });
    shade.style.webkitMaskImage = url; shade.style.maskImage = url;
    rose.appendChild(shade);
    f.appendChild(rose);
    f._H = H; f._W = w; f._shade = shade;
    return f;
  }
  var orbSig = "";
  function renderOrb(list, fresh, owner) {
    var layer = document.getElementById("orb-layer");
    var o = orbGeom(), n = list.length;
    // 每 8 秒會重新抓資料；花和尺寸都沒變就不重畫，不然小精靈和花會一閃一閃
    var lit = owner ? claims.filter(function (c) { return c.owner === owner.id && c.status === "done"; }).length : 0;
    var rain = rainOver(owner); petSulk = !!rain;
    var sig = (owner ? owner.id + gardenColor(owner) : "") + "|" + lit + "|p" + potCount() + "|" + (rain ? rain.id + rain.level : "") + (rainbowNext ? "r" : "") + (calmSig() ? "c" : "") + "|" + list.map(function (d) { return d.id + d.status + (d.style || ""); }).join(",") + "|" + [o.cx, o.cy, o.rx, o.ry].map(Math.round).join(",");
    var hasNew = fresh && Object.keys(fresh).length;
    if (sig === orbSig && !hasNew && layer.childNodes.length) return;
    orbSig = sig;
    layer.textContent = "";
    var fb = el("div", { id: "orb-fb" });
    fb.style.left = (o.cx - o.rx) + "px"; fb.style.top = (o.cy - o.ry) + "px"; fb.style.width = (o.rx * 2) + "px"; fb.style.height = (o.ry * 2) + "px";
    layer.appendChild(fb);
    var dim = el("div", { id: "orb-dim" });
    dim.style.left = (o.cx - o.rx * 0.97) + "px"; dim.style.top = (o.cy - o.ry * 0.97) + "px"; dim.style.width = (o.rx * 1.94) + "px"; dim.style.height = (o.ry * 1.94) + "px";
    var bx = o.cx, by = o.cy + 0.39 * o.ry, hw = 0.8 * o.rx, hh = 0.26 * o.ry;
    addLanterns(layer, o, owner, bx, by, hw, hh);
    if (rain) addRain(layer, o, rain);
    var calmed = owner && owner.id === me.id && partner ? angers.filter(function (a) { return a.from_id === partner.id && a.status === "calm" && a.calm_ts && Date.now() - a.calm_ts < 864e5; })[0] : null;
    if (calmed && lsGet("cg-calm-" + calmed.id) === null) { lsSet("cg-calm-" + calmed.id, 1); rainbowNext = true; }   // 對方消氣後，我第一次打開也看得到彩虹
    if (rainbowNext) { rainbowNext = false; addRainbow(layer, o); }
    if (!n) {
      addPet(layer, bx, by, o);
      layer.appendChild(el("div", { class: "orb-hint", style: "left:" + o.cx + "px;top:" + (o.cy - 0.12 * o.ry) + "px", text: "第一朵花，等著被種下" }));
      addFront(layer, o); addPot(layer, o); addWell(layer, o);
      return;
    }
    var hF = Math.max(o.ry * 0.34, Math.min(o.ry * 0.6, o.ry * 0.6 * Math.sqrt(10 / Math.max(n, 10))));
    var S0 = o.ry * 0.8 * Math.max(0.6, Math.min(1, Math.sqrt(14 / Math.max(n, 14))));
    var M = 40, items = [], bloomIdx = 0, seedOff = owner && partner && owner.id === partner.id ? 500 : 0;
    var color = gardenColor(owner);
    // 花位：照向日葵籽的排法（黃金角）排出固定的格子，前後排自然錯開、彼此保持間距
    var SLOTS = Math.max(28, n + 8), used = {}, pb0 = petBox(o, bx, by);
    for (var k0 = 0; k0 < SLOTS; k0++) {   // 小精靈前後的格子都不用：花不會擋住牠，也不會全被推到兩側擠成一團
      var r0 = 0.42 + 0.43 * Math.sqrt((k0 + 0.5) / SLOTS);
      if (Math.abs(bx + Math.cos(k0 * 2.39996) * hw * r0 - pb0.x) < pb0.w * 0.45) used[k0] = 1;
    }
    if (SLOTS - Object.keys(used).length < n) used = {};   // 空格不夠就全部開放，不會卡住
    list.forEach(function (d, i) {
      // 每朵花用自己的編號挑格子，被佔了就往下一格；舊的花先挑，加花或包花束時其他花不會跟著換位置
      var h = idSeed(d.id), k = Math.floor(seeded(h + 11) * SLOTS);
      while (used[k]) k = (k + 1) % SLOTS;
      used[k] = 1;
      var it = { i: i, d: d, r: 0.42 + 0.43 * Math.sqrt((k + 0.5) / SLOTS),   // 0.42～0.85 倍半徑，不會貼著玻璃；擋在小精靈後面的花另外推開
        a: k * 2.39996,
        jx: (seeded(h + 90) - 0.5) * hF * 0.15, jy: (seeded(h + 91) - 0.5) * hF * 0.1 };
      var isNew = !!(fresh && fresh[d.id]);
      var f = photoFlower(h + seedOff, isNew, S0 * (STYLE_SIZE[d.style] || 1), flowerClass(d, color));
      if (isNew) { f.style.animationDelay = (bloomIdx++ * 0.25) + "s"; animated[d.id] = 1; setTimeout(pokePet, 1400); }
      f.addEventListener("click", function () {
        if (spin.moved) return;
        f.classList.add("picked"); setTimeout(function () { f.classList.remove("picked"); }, 900); openEntry(d, i + 1);
      });
      it.f = f; items.push(it);
      it.sh = el("div", { class: "pf-sh", "aria-hidden": "true" });   // 腳下的陰影，讓花插在苔蘚裡
      layer.appendChild(it.sh);
      layer.appendChild(f);
    });
    // 依位置算遠近大小與前後順序
    spin.place = function () {
      items.forEach(function (it) {
        var ang = it.a + spin.theta;
        var x = bx + Math.cos(ang) * hw * it.r + it.jx, sn = Math.sin(ang), y = by + (sn < 0 ? sn * 0.85 : sn * 0.9) * hh * it.r + it.jy;   // 前後拉開，才有遠近層次
        // 在小精靈後面、又被牠擋住寬度的花，往旁邊推出去
        var pb = petBox(o, bx, by), gap = pb.w * 0.5 + it.f._W * 0.3;
        if (y < pb.foot && Math.abs(x - pb.x) < gap) x = pb.x + (x >= pb.x ? gap : -gap);
        var dp = Math.max(0, Math.min(1, (y - (by - hh)) / (2 * hh)));
        var sc = 0.8 + 0.2 * dp;                                    // 近大遠小（後排不縮太多，才看得到）
        var lift = it.f._H * sc * 0.3 * (1 - dp);                   // 後排莖比較高，花頭從前排上面冒出來
        it.f.style.left = (x - it.f._W / 2) + "px"; it.f.style.top = (y - lift - it.f._H) + "px";
        it.f.style.scale = sc.toFixed(3);
        it.f.style.opacity = (0.9 + 0.1 * dp).toFixed(2);
        it.f._shade.style.opacity = (0.62 * (1 - dp) + 0.05).toFixed(2);   // 後排比較暗
        it.f.style.zIndex = String(Math.round(y));
        var sw = it.f._W * 0.62 * sc, shh = it.f._W * 0.16 * sc;
        it.sh.style.left = (x - sw / 2) + "px"; it.sh.style.top = (y - shh * 0.55) + "px";
        it.sh.style.width = sw + "px"; it.sh.style.height = shh + "px"; it.sh.style.zIndex = String(Math.round(y) - 1);
        it.sh.style.opacity = (0.45 + 0.35 * dp).toFixed(2);
        if (it.f.classList.contains("new")) it.f.style.setProperty("--drop", Math.round((o.cy - o.ry * 0.9) - y) + "px");
      });
    };
    spin.place();
    grow(layer, o, list.filter(function (d) { return d.kind !== "black"; }).length, bx, by, hw, hh, S0, color);
    addPet(layer, bx, by, o);
    addFront(layer, o); addPot(layer, o); addWell(layer, o);
  }
  // 苔蘚小精靈：坐在瓶子中間的土上。待機會呼吸、晃小芽，放著不管會睡著，點一下就醒來跳一下
  var PET = { w: 150, h: 180, idle: 25, sleep: 30 };
  var pet = { el: null, mode: "idle", f: 0, dir: 1, idleSince: Date.now(), timer: null };
  function petBox(o, bx, by) {
    var H = Math.round(o.ry * 0.6);
    return { h: H, w: Math.round(H * PET.w / PET.h), x: bx + o.rx * 0.09, foot: by + (o.ry * 0.26) * 0.45 };
  }
  function addPet(layer, bx, by, o) {
    var B = petBox(o, bx, by), H = B.h, W = B.w;
    var p = el("canvas", { class: "pet", role: "button", "aria-label": "苔蘚小精靈" });
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    p.width = Math.round(W * dpr); p.height = Math.round(H * dpr);
    p.style.width = W + "px"; p.style.height = H + "px";
    var footY = B.foot;   // 坐在苔蘚前半部，大部分的花在牠後面
    var px = B.x;   // 照片裡的土坑在瓶子正中央偏右一點，讓牠坐在土坑正中間
    p.style.left = (px - W / 2) + "px"; p.style.top = (footY + H * 0.06 - H) + "px";
    p.style.zIndex = String(Math.round(footY));
    var shadow = el("div", { class: "pet-shadow", "aria-hidden": "true" });   // 腳下的影子，讓牠坐在苔蘚上而不是浮著
    shadow.style.left = (px - W * 0.42) + "px"; shadow.style.top = (footY - H * 0.07) + "px";
    shadow.style.width = (W * 0.84) + "px"; shadow.style.height = (H * 0.16) + "px";
    shadow.style.zIndex = String(Math.round(footY) - 1);
    layer.appendChild(shadow);
    p.addEventListener("click", function () { if (!spin.moved) pokePet(); });
    layer.appendChild(p);
    if (petSulk) p.classList.add("sulk");   // 瓶子在下雨時，小精靈縮成一團
    pet.el = p; drawPet();
    if (!pet.timer) pet.timer = setInterval(tickPet, 140);
  }
  // 兩組動畫圖只載入一次；每一格用畫布畫，不用移動背景位置（iPhone 換背景位置會閃一下空白）
  var PET_IMG = { idle: new Image(), sleep: new Image() };
  PET_IMG.idle.src = "pet-idle.webp?v=63"; PET_IMG.sleep.src = "pet-sleep.webp?v=63";
  PET_IMG.idle.onload = PET_IMG.sleep.onload = function () { drawPet(); };
  function drawPet() {
    if (!pet.el || !pet.el.getContext) return;
    var img = pet.mode === "idle" ? PET_IMG.idle : PET_IMG.sleep;
    if (!img.complete || !img.naturalWidth) return;   // 還沒載好就保留上一格，不畫空白
    var n = pet.mode === "idle" ? PET.idle : PET.sleep, fw = img.naturalWidth / n, f = Math.max(0, Math.min(n - 1, Math.round(pet.f)));
    var ctx = pet.el.getContext("2d"), c = pet.el;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, f * fw, 0, fw, img.naturalHeight, 0, 0, c.width, c.height);
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
  // 花的位置（原本可以拖動旋轉，已拿掉；角度固定為 0）
  var spin = { theta: 0, moved: false, place: null };

  // 前排青苔遮罩：花長在青苔裡，而不是貼在畫面上
  function addFront(layer, o) {
    var box = function (n) {
      n.style.left = (o.cx - o.rx) + "px"; n.style.top = (o.cy - o.ry) + "px";
      n.style.width = (o.rx * 2) + "px"; n.style.height = (o.ry * 2) + "px";
      layer.appendChild(n);
    };
    var front = el("img", { class: "orb-front", src: ASSET.front, alt: "", "aria-hidden": "true" });
    box(front);
    front.style.zIndex = String(Math.round(o.cy + o.ry * 0.1));   // 花和小精靈都畫在苔蘚上面；原本只讓前排在上面，後排的花會整朵被苔蘚蓋掉
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
      sb.from("cg_reward_claims").select("*").eq("couple_id", me.couple_id).order("ts", { ascending: false }).limit(200),
      sb.from("cg_checkins").select("*").eq("couple_id", me.couple_id).order("day", { ascending: false }).limit(800),
      sb.from("cg_angers").select("*").eq("couple_id", me.couple_id).order("ts", { ascending: false }).limit(200),
      sb.from("cg_coaxes").select("*").eq("couple_id", me.couple_id).order("ts", { ascending: false }).limit(500),
      sb.rpc("cg_inbox"),
      sb.from("cg_bouquets").select("*").eq("couple_id", me.couple_id).order("ts"),
      sb.from("cg_wishes").select("*").eq("couple_id", me.couple_id).order("ts", { ascending: false }).limit(200)
    ]);
    wishes = res[13].error ? [] : (res[13].data || []);
    bouquets = res[12].error ? [] : (res[12].data || []);
    inbox = (!res[11].error && res[11].data) || { blessings: [], guest: [], sent_today: [] };
    angers = res[9].error ? [] : (res[9].data || []);   // 還沒建表時就當作沒有
    coaxes = res[10].error ? [] : (res[10].data || []);
    checkins = res[8].error ? [] : (res[8].data || []);
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
    var inOrb = avail.filter(function (e) { return !e.bouquet_id; }).concat(blacks).sort(byTs);   // 包成花束的花放在展示廳，不畫在瓶子裡
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
    return sb.from("cg_entries").insert({ couple_id: couple.id, owner: o.owner, created_by: me.id, task_id: o.task_id || null, kind: o.kind, status: o.status, day: today(), note: o.note || "", reply: "", ts: Date.now(), style: o.style || null });
  }
  function updateEntry(e, patch) { return sb.from("cg_entries").update(patch).eq("id", e.id); }
  function claimTask(t, note) {
    var mineTask = t.doer === me.id;
    if (taskToday(t).length >= t.per_day) { toast("今天的「" + t.title + "」已經滿了"); return; }
    act(function () { return insertEntry({ owner: t.doer, task_id: t.id, kind: "task", status: mineTask ? "pending" : "confirmed", note: note }); },
      mineTask ? "已送出，等" + nick(partner) + "確認" : "已幫" + nick(partner) + "記上一朵");
  }
  function requestFlower(reason, style) {
    if (reqsToday().length >= REQ_PER_DAY) { toast("今天已經申請 " + REQ_PER_DAY + " 次了，明天再來"); return; }
    act(function () { return insertEntry({ owner: me.id, kind: "request", status: "pending", note: reason, style: style }); }, "已送出，等" + nick(partner) + "確認");
  }
  function giveFlower(reason, style) { act(function () { return insertEntry({ owner: partner.id, kind: "gift", status: "confirmed", note: reason, style: style }); }, "送出了，" + nick(partner) + "的瓶子長出一朵" + flowerOf(style).name); }
  // ---------- 花的種類 ----------
  // 送花（或申請）的人選花的種類，每種有花語；一部分要靠徽章解鎖。舊的花沒有種類，照舊用紅／藍玫瑰
  var FLOWERS = [
    { id: "rose", name: "玫瑰", lang: "愛", img: "rose-red-b.png" },
    { id: "tulip", name: "鬱金香", lang: "體貼、真誠", img: "flower-tulip.png" },
    { id: "daisy", name: "雛菊", lang: "藏在心底的愛", img: "flower-daisy.png" },
    { id: "cherry", name: "櫻花", lang: "珍惜當下", img: "flower-cherry.png", unlock: "f10" },
    { id: "sunflower", name: "向日葵", lang: "只看著你", img: "flower-sunflower.png", unlock: "s7" },
    { id: "lavender", name: "薰衣草", lang: "等待愛情", img: "flower-lavender.png", unlock: "a1" },
    { id: "camellia", name: "山茶花", lang: "理想的愛", img: "flower-camellia.png", unlock: "d1" },
    { id: "lily", name: "鈴蘭", lang: "幸福歸來", img: "flower-lily.png", unlock: "s30" }
  ];
  function flowerOf(id) { return FLOWERS.filter(function (f) { return f.id === id; })[0] || FLOWERS[0]; }
  function flowerClass(d, color) {
    if (d.kind === "black") return ATLAS.black;
    if (d.style && d.style !== "rose") return " fl-" + d.style;
    return d.style === "rose" ? ATLAS.red : ATLAS[color];
  }
  function flowerUnlocked(f) { return !f.unlock || earnedBadges().indexOf(f.unlock) >= 0; }
  function badgeName(id) { var b = BADGES.filter(function (x) { return x.id === id; })[0]; return b ? b.icon + " " + b.name : ""; }
  function myFlower() { var f = flowerOf(me.flower); return flowerUnlocked(f) ? f.id : "rose"; }
  // 選花：上方是瓶子裡的預覽，下方一排花；input 為 null 時只選花（設定招牌花用）
  function flowerPicker(cur, onPick) {
    var prev = el("div", { class: "fpv" }), img = el("div", { class: "fpv-f" }), cap = el("div", { class: "fpv-cap" });
    prev.appendChild(img); prev.appendChild(cap);
    var row = el("div", { class: "fpick" });
    function show(id) {
      var f = flowerOf(id); cur = id;
      img.style.backgroundImage = "url(" + f.img + ")";
      img.classList.remove("grow"); void img.offsetWidth; img.classList.add("grow");
      cap.textContent = f.name + "・" + f.lang;
      [].forEach.call(row.children, function (c) { c.classList.toggle("on", c._id === id); });
      onPick(id);
    }
    FLOWERS.forEach(function (f) {
      var ok = flowerUnlocked(f);
      var b = el("button", { class: "fchip" + (ok ? "" : " locked"), "aria-label": f.name }, [el("span", { class: "fc-img", style: "background-image:url(" + f.img + ")" }), el("span", { class: "fc-n", text: ok ? f.name : "🔒 " + f.name })]);
      b._id = f.id;
      b.addEventListener("click", function () { if (!ok) { toast("解鎖「" + badgeName(f.unlock) + "」徽章就能用" + f.name); return; } show(f.id); });
      row.appendChild(b);
    });
    setTimeout(function () { show(cur); }, 0);
    return el("div", {}, [prev, row]);
  }
  function openFlowerInput(title, placeholder, okLabel, onOk) {
    var style = myFlower();
    var input = el("input", { type: "text", id: "sheet-input", placeholder: placeholder, maxlength: "80", "aria-label": placeholder });
    openPanel([
      el("h2", { text: title }),
      flowerPicker(style, function (id) { style = id; }),
      input,
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "取消", onclick: closeSheet }),
        el("button", { class: "btn primary", text: okLabel, onclick: function () { var v = input.value.trim(); if (!v) { toast("寫一句這朵花的意義吧"); return; } closeSheet(); onOk(v, style); } })
      ])
    ]);
  }
  function openSignature() {
    var style = myFlower();
    openPanel([
      el("h2", { text: "🌸 我的招牌花" }),
      el("p", { class: "legend", text: "送花或申請花時預設用這種，送的時候還是可以換。還沒解鎖的花，拿到對應的徽章就能用。" }),
      flowerPicker(style, function (id) { style = id; }),
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "取消", onclick: closeSheet }),
        el("button", { class: "btn primary", text: "設為招牌花", onclick: function () {
          closeSheet(); me.flower = style;
          act(function () { return sb.from("cg_profiles").update({ flower: style }).eq("id", me.id); }, "招牌花換成" + flowerOf(style).name);
        } })
      ])
    ]);
  }
  function sendMiss() {
    if (!partner) { toast("等對方加入後才能傳"); return; }
    var last = +(lsGet("cg-miss-sent") || 0);
    if (Date.now() - last < 60000) { toast("剛剛傳過了，對方會看到的"); return; }
    lsSet("cg-miss-sent", Date.now());
    act(function () { return sb.from("cg_pings").insert({ couple_id: couple.id, from_id: me.id, ts: Date.now() }); }, "已經把想念傳給" + nick(partner));
  }
  // ---------- 生氣 ----------
  // 生氣的人按下去，被生氣的那個人瓶子上方會一直下雨；對方可以哄，生氣的人按「消氣了」雨才停、出彩虹
  var ANGER = [null, { t: "有點不開心", e: "😕" }, { t: "生氣", e: "😤" }, { t: "超生氣", e: "😡" }];
  function angerOn(fromId) { return angers.filter(function (a) { return a.from_id === fromId && a.status === "angry"; })[0] || null; }
  function rainOver(owner) { var other = owner && partner && owner.id === me.id ? partner : me; return owner ? angerOn(other.id) : null; }   // 誰生氣，雨就下在另一個人的瓶子
  function coaxOf(a) { return coaxes.filter(function (c) { return c.anger_id === a.id; }).sort(function (x, y) { return x.ts - y.ts; }); }
  function startAnger() {
    if (!partner) { toast("等對方加入後才能用"); return; }
    var mine = angerOn(me.id);
    if (mine) { openAnger(mine); return; }
    var lv = 2, reason = el("input", { type: "text", id: "ag-reason", placeholder: "為什麼生氣？（可不填）", maxlength: "60" });
    var pick = el("div", { class: "aglv" }, [1, 2, 3].map(function (n) {
      return el("button", { class: "aglvbtn" + (n === lv ? " on" : ""), onclick: function () { lv = n; [].forEach.call(pick.children, function (b, k) { b.classList.toggle("on", k + 1 === n); }); } }, [el("span", { class: "e", text: ANGER[n].e }), el("span", { text: ANGER[n].t })]);
    }));
    openPanel([
      el("h2", { text: "跟" + nick(partner) + "說你生氣了" }),
      el("p", { class: "legend", text: nick(partner) + "的瓶子會開始下雨，直到你按「消氣了」。越生氣，雨越大。" }),
      pick,
      el("label", { class: "field" }, [el("span", { text: "原因" }), reason]),
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "算了", onclick: closeSheet }),
        el("button", { class: "btn primary", text: "送出", onclick: function () {
          closeSheet();
          act(function () { return sb.from("cg_angers").insert({ couple_id: couple.id, from_id: me.id, level: lv, reason: reason.value.trim(), ts: Date.now() }); }, "☁️ " + nick(partner) + "那邊開始下雨了");
        } })
      ])
    ]);
  }
  var COAX = ["對不起，是我不好", "抱抱你", "我請你吃好吃的", "我錯了，下次不會了", "不要生氣了好不好"];
  function openAnger(a) {
    if (visitGuard()) return;
    var mine = a.from_id === me.id, list = coaxOf(a), lv = ANGER[a.level] || ANGER[2];
    var kids = [el("h2", { text: lv.e + " " + (mine ? "你在" + lv.t : nick(partner) + "在" + lv.t) }),
      el("p", { class: "legend", text: (mine ? "從 " : nick(partner) + "從 ") + shortDate(dateKey(new Date(a.ts))) + " " + pad(new Date(a.ts).getHours()) + ":" + pad(new Date(a.ts).getMinutes()) + " 開始" }),
      a.reason ? el("p", { class: "note", text: "「" + a.reason + "」" }) : null];
    if (list.length) kids.push(el("ul", { class: "coaxlist" }, list.map(function (c) { return el("li", {}, [el("b", { text: c.from_id === me.id ? "我" : nick(partner) }), el("span", { text: c.text })]); })));
    if (mine) {
      kids.push(el("p", { class: "legend", text: list.length ? nick(partner) + "已經哄了 " + list.length + " 次。氣消了就按下面，雨會停、出彩虹。" : nick(partner) + "還沒來哄你。氣消了就按下面，雨會停。" }));
      kids.push(el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "還在氣", onclick: closeSheet }),
        el("button", { class: "btn primary", text: "🌈 消氣了", onclick: function () {
          closeSheet(); rainbowNext = true;
          act(function () { return sb.from("cg_angers").update({ status: "calm", calm_ts: Date.now() }).eq("id", a.id); }, "🌈 雨停了");
        } })
      ]));
    } else {
      var input = el("input", { type: "text", id: "coax-text", placeholder: "說點什麼哄" + nick(partner), maxlength: "60" });
      kids.push(el("div", { class: "coaxchips" }, COAX.map(function (t) { return el("button", { class: "chip", text: t, onclick: function () { input.value = t; } }); })));
      kids.push(input);
      kids.push(el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet }),
        el("button", { class: "btn primary", text: "🫶 哄你", onclick: function () {
          var t = input.value.trim(); if (!t) { toast("選一句或寫一句吧"); return; }
          closeSheet();
          act(function () { return sb.from("cg_coaxes").insert({ couple_id: couple.id, anger_id: a.id, from_id: me.id, text: t, ts: Date.now() }); }, "已經哄了，等" + nick(partner) + "消氣");
        } })
      ]));
    }
    openPanel(kids);
  }
  var rainbowNext = false, petSulk = false;
  function calmSig() { return partner && angers.some(function (a) { return a.from_id === partner.id && a.status === "calm" && a.calm_ts && lsGet("cg-calm-" + a.id) === null && Date.now() - a.calm_ts < 864e5; }); }
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
  // 新手導覽：每一步說明一個功能，並讓下方工具列對應的分頁亮起來（tab：act 互動、mem 回憶、mine 我的）
  var INTRO = [
    { icon: "🌱", t: "歡迎來到你們的花園", d: "這是兩個人一起照顧的瓶子。每當對方為你做了一件事、或你做到一件想讓對方知道的事，就種下一朵花，寫下它的意義。花會一朵一朵長滿瓶子，變成你們的回憶。" },
    { icon: "📌", t: "上方的「今天」小卡", d: "瓶子上方的小卡會提醒你現在最該做的一件事：有東西等你確認、今天還沒報平安、對方欠你的獎勵券。點它就會直接帶你過去。都做完了，它就顯示兩個人今天的報平安。" },
    { icon: "🌹", t: "申請一朵花", tab: "act", d: "下方工具列點「互動」，按「申請一朵花」，寫下這朵花的意義，例如「今天有好好吃三餐」。對方確認後，花會從瓶口落下，種進你的瓶子。一天最多申請 3 次。" },
    { icon: "💐", t: "送花、確認、想你", tab: "act", d: "同樣在「互動」：可以直接送對方一朵花（不用確認）、在「待處理」確認對方的申請、按「想你」讓對方的瓶子亮一下。有東西等你確認時，「互動」上會出現數字。" },
    { icon: "🎁", t: "獎勵與小燈", tab: "act", d: "「互動」裡的「獎勵」可以幫對方開獎勵，例如「20 朵：見面請你吃大餐」。對方兌換、你確認後會變成一張券；真的做到後按「收到了」，瓶子裡會點亮一盞小燈。" },
    { icon: "🖤", t: "小黑花", tab: "act", d: "對方做了不太好的事（例如又熬夜），可以在「互動」最下面給一朵小黑花。收到的人可以申訴一次，或用花把它贖回。" },
    { icon: "📖", t: "回憶", tab: "mem", d: "工具列的「回憶」收著花花圖書館（每一朵花和它的話）、紀念日和報平安紀錄。點瓶子裡的任何一朵花，也能看到那天寫下的內容。" },
    { icon: "⚙️", t: "我的", tab: "mine", d: "暱稱、時區、花色、通知、首頁要顯示哪些天數，都在「我的」。這份使用說明也在這裡，隨時可以再看一次。" },
    { icon: "🫧", t: "看對方的瓶子", d: "點最上面對方的名字，就能看對方的瓶子。瓶子中間的苔蘚小精靈放著會睡著，點牠就會醒來。iPhone 把網站「加入主畫面」後，到「我的 → 設定」開啟通知，就不會錯過對方的花。" }
  ];
  function introPage(tab) { setHub(tab || "home"); }
  function showIntro(i) {
    var last = i === INTRO.length - 1, st = INTRO[i];
    introPage(st.tab);
    openPanel([
      el("div", { class: "introbar" }, INTRO.map(function (_, k) { return el("span", { class: k <= i ? "on" : "" }); })),
      el("div", { class: "introicon", text: st.icon }),
      el("h2", { text: st.t }),
      el("p", { class: "legend", style: "font-size:15px;line-height:1.75;color:var(--ink-soft)", text: st.d }),
      el("div", { class: "row" }, [
        i > 0 ? el("button", { class: "btn ghost", text: "上一步", onclick: function () { showIntro(i - 1); } }) : el("button", { class: "btn ghost", text: "跳過", onclick: closeSheet }),
        el("button", { class: "btn primary", text: last ? "開始種花" : "下一步（" + (i + 2) + "/" + INTRO.length + "）", onclick: function () { if (last) closeSheet(); else showIntro(i + 1); } })
      ])
    ]);
  }
  // 登入前：這是什麼、怎麼開始
  function openAbout() {
    var steps = [
      ["註冊", "兩個人各自用 Email 註冊一個帳號。"],
      ["配對", "其中一人建立花園，把 6 碼邀請碼傳給另一半；另一半輸入邀請碼加入。"],
      ["種花", "做到一件想讓對方知道的事，就申請一朵花、寫下它的意義；對方確認後花就種進你的瓶子。也可以直接送花給對方。"],
      ["累積回憶", "花會一朵朵長滿瓶子，收進花花圖書館，還能用來換對方開的獎勵。"]
    ];
    openPanel([
      el("h2", { text: "情侶花園是什麼？" }),
      el("p", { class: "legend", style: "font-size:15px;line-height:1.7;color:var(--ink-soft)", text: "給兩個人一起用的小儀式，特別適合遠距離情侶。每一朵花，都是對方為你做的一件事。" }),
      el("ol", { class: "steps" }, steps.map(function (x) { return el("li", {}, [el("b", { text: x[0] }), el("span", { text: x[1] })]); })),
      el("div", { class: "row" }, [el("button", { class: "btn primary", text: "知道了", onclick: closeSheet })])
    ]);
  }
  // 分享邀請碼
  function shareCode() {
    var text = "來跟我一起種花吧！打開 " + location.origin + location.pathname + " 註冊後，輸入邀請碼：" + couple.invite_code;
    if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
    try { navigator.clipboard.writeText(text).then(function () { toast("已複製邀請訊息，貼給對方吧"); }); } catch (e) { toast("邀請碼：" + couple.invite_code); }
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
    if (visitGuard()) return;
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
  // ---------- 許願池 ----------
  // 說出想要的，交給對方決定：設成獎勵（對方定朵數）、直接答應，或先留著。沒有拒絕鍵；好友看不到
  function wishFor(p) { return p && partner ? wishes.filter(function (w) { return w.status === "open" && w.owner !== p.id; }) : []; }
  var WISH_ST = { open: "還在池子裡", reward: "變成獎勵了", granted: "答應了，等實現", done: "實現了 ✨" };
  function addWell(layer, o) {
    if (visit || !partner) return;
    var W = o.rx * 0.34, glow = wishFor(me).length;
    var box = el("div", { class: "well" + (glow ? " glow" : ""), role: "button", "aria-label": "許願池" + (glow ? "：有 " + glow + " 個新願望" : "") });
    box.style.left = (o.cx - o.rx * 0.8 - W / 2) + "px"; box.style.top = (o.cy + o.ry * 1.08 - W * 0.62) + "px";
    box.style.width = W + "px"; box.style.height = (W * 0.62) + "px";
    box.appendChild(el("div", { class: "well-water" }));
    box.appendChild(el("div", { class: "well-rim" }));
    if (glow) box.appendChild(el("span", { class: "pot-n", text: String(glow) }));
    box.addEventListener("click", openWishes);
    layer.appendChild(box);
  }
  function wishRow(w, btns) {
    return el("div", { class: "wish" + (w.status === "done" ? " done" : "") }, [
      el("div", { class: "wish-t", text: w.text }),
      el("div", { class: "wish-s", text: (w.status === "reward" ? "變成獎勵・" + w.cost + " 朵" : WISH_ST[w.status]) + (w.reply ? "・「" + w.reply + "」" : "") }),
      btns && btns.length ? el("div", { class: "row" }, btns) : null
    ]);
  }
  function openWishes() {
    var pn = nick(partner), kids = [el("h2", { text: "🌠 許願池" }), el("p", { class: "legend", text: "說出想要的，讓" + pn + "決定：設成獎勵、直接答應，或先留著。" })];
    var theirs = wishes.filter(function (w) { return w.owner === partner.id; }), mine = wishes.filter(function (w) { return w.owner === me.id; });
    kids.push(el("h3", { text: pn + "的願望" }));
    if (!theirs.length) kids.push(el("p", { class: "legend", text: "還沒有。" }));
    theirs.forEach(function (w) {
      kids.push(wishRow(w, w.status === "open" ? [
        el("button", { class: "btn ghost", text: "直接答應", onclick: function () { openWishAnswer(w, "grant"); } }),
        el("button", { class: "btn primary", text: "設成獎勵", onclick: function () { openWishAnswer(w, "reward"); } })
      ] : null));
    });
    kids.push(el("h3", { text: "我的願望" }));
    if (!mine.length) kids.push(el("p", { class: "legend", text: "還沒有，許一個吧。" }));
    mine.forEach(function (w) {
      var b = [];
      if (w.status === "open") b.push(el("button", { class: "btn ghost", text: "收回", onclick: function () {
        confirmPanel("收回這個願望？", w.text, "收回", function () { act(function () { return sb.from("cg_wishes").delete().eq("id", w.id); }, "已收回"); });
      } }));
      if (w.status === "granted") b.push(el("button", { class: "btn primary", text: "實現了", onclick: function () {
        closeSheet(); act(function () { return sb.rpc("cg_wish_answer", { wid: w.id, act: "done" }); }, "願望實現了 ✨");
      } }));
      if (w.status === "reward") b.push(el("button", { class: "btn ghost", text: "去兌換", onclick: openRewards }));
      kids.push(wishRow(w, b));
    });
    kids.push(el("button", { class: "btn primary", text: "＋ 許一個願望", onclick: openMakeWish }));
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
  }
  function openMakeWish() {
    var t = el("input", { type: "text", placeholder: "例如：想一起去看海", maxlength: "60" });
    openPanel([
      el("h2", { text: "許一個願望" }),
      el("label", { class: "field" }, [el("span", { text: "願望" }), t]),
      el("p", { class: "legend", text: nick(partner) + "會收到通知，決定要不要設成獎勵。" }),
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "取消", onclick: openWishes }),
        el("button", { class: "btn primary", text: "丟進池子", onclick: function () {
          var v = t.value.trim(); if (!v) { toast("寫一下願望"); return; }
          closeSheet();
          act(function () { return sb.from("cg_wishes").insert({ couple_id: couple.id, owner: me.id, text: v, ts: Date.now() }); }, "願望丟進池子了 🌠");
        } })
      ])
    ]);
  }
  function openWishAnswer(w, kind) {
    var reward = kind === "reward";
    var cost = el("input", { type: "number", placeholder: "需要幾朵，例如 20", min: "1", max: "9999", inputmode: "numeric" });
    var msg = el("input", { type: "text", placeholder: "想說的話（可不填）", maxlength: "60" });
    openPanel([
      el("h2", { text: reward ? "設成獎勵" : "直接答應" }),
      el("p", { class: "legend", text: "「" + w.text + "」" + (reward ? "：存夠朵數後，" + nick(partner) + "就能兌換。" : "：不用花，等實現後" + nick(partner) + "會按「實現了」。") }),
      reward ? el("label", { class: "field" }, [el("span", { text: "朵數" }), cost]) : null,
      el("label", { class: "field" }, [el("span", { text: "一句話" }), msg]),
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "先留著", onclick: openWishes }),
        el("button", { class: "btn primary", text: reward ? "設成獎勵" : "答應", onclick: function () {
          var c = parseInt(cost.value, 10);
          if (reward && !(c >= 1 && c <= 9999)) { toast("朵數要是 1 到 9999"); return; }
          closeSheet();
          act(function () { return sb.rpc("cg_wish_answer", { wid: w.id, act: reward ? "reward" : "grant", n: reward ? c : null, msg: msg.value.trim() || null }); }, reward ? "已變成獎勵 🎁" : "答應了 🌠");
        } })
      ])
    ]);
  }
  // ---------- 工具列的三個功能清單 ----------
  // 每個功能只放一個地方：互動＝跟對方一起做的事、回憶＝看過去、我的＝設定與說明
  var hubOn = "home";
  function hubBtn(icon, title, desc, onclick, badge, cls) {
    return el("button", { class: "hubbtn" + (cls ? " " + cls : ""), onclick: onclick }, [
      el("span", { class: "hb-ico", text: icon }),
      el("span", { class: "hb-t" }, [el("b", { text: title }), el("span", { text: desc })]),
      badge ? el("span", { class: "badge", text: String(badge) }) : null
    ]);
  }
  function startRequest() {
    if (!partner) { toast("等對方加入後才能申請"); return; }
    if (REQ_PER_DAY - reqsToday().length <= 0) { toast("今天已經申請 " + REQ_PER_DAY + " 次了，明天再來"); return; }
    openFlowerInput("申請一朵花", "這朵花的意義，例如：今天有好好吃三餐", "送出申請", requestFlower);
  }
  function startGive() {
    if (!partner) { toast("等對方加入後才能送"); return; }
    openFlowerInput("送" + nick(partner) + "一朵花", "這朵花的意義，例如：謝謝你今天陪我", "送出", giveFlower);
  }
  function startBlack() {
    if (!partner) { toast("等對方加入後才能給"); return; }
    openInput("給" + nick(partner) + "一朵小黑花", "原因，例如：又熬夜不睡", "給", giveBlack, true);
  }
  function openHub(key) {
    var pn = partner ? nick(partner) : "對方", kids;
    if (key === "act") {
      var pend = myPending(), owed = tickets().filter(function (c) { return c.owner === me.id; }).length, left = Math.max(0, REQ_PER_DAY - reqsToday().length);
      // 一個畫面放得下，不用上下滑：上排兩個大按鈕（種花），下面兩欄小格
      kids = [el("h2", { text: "互動" }),
        el("div", { class: "hubgrid two" }, [
          hubBtn("🌹", "申請一朵花", "今天還能 " + left + " 次", startRequest, 0, "big tile"),
          hubBtn("💐", "送" + pn + "一朵花", "直接種進對方瓶子", startGive, 0, "big tile")
        ]),
        el("div", { class: "hubgrid two" }, [
          hubBtn("✅", "待處理", pend.length ? pend.length + " 件等你確認" : "沒有要確認的", openPending, pend.length, "tile"),
          hubBtn("💗", "想你", "讓對方瓶子亮一下", function () { closeSheet(); sendMiss(); }, 0, "tile"),
          hubBtn("🎁", "獎勵", "用花換獎勵", openRewards, 0, "tile"),
          hubBtn("🌠", "許願池", wishFor(me).length ? nick(partner) + "有 " + wishFor(me).length + " 個願望" : "說出想要的，讓對方決定", openWishes, wishFor(me).length, "tile"),
          hubBtn(angerOn(me.id) ? "🌧️" : "😤", angerOn(me.id) ? "你在生氣" : "生氣", angerOn(me.id) ? "看哄的話・消氣" : "讓對方瓶子下雨", startAnger, 0, "tile"),
          tickets().length ? hubBtn("🎟️", "待兌現的券", owed ? pn + "欠你 " + owed + " 張" : "你欠" + pn + "的", openTickets, 0, "tile") : null,
          hubBtn("💐", "包成花束", "把瓶子裡最舊的 10 朵包起來", openMakeBouquet, 0, "tile"),
          hubBtn("🖤", "小黑花", "給" + pn + "，可申訴或贖回", startBlack, 0, "tile dim")
        ])];
    } else if (key === "mem") {
      var st = dayStats(new Date());
      kids = [el("h2", { text: "回憶" }),
        st.length ? el("div", { class: "stats hubstats" }, st.map(function (x) { return el("button", { class: "stat" + (x.cls || ""), onclick: openUs }, [el("b", { text: x.n }), el("span", { text: x.label })]); })) : null,
        el("div", { class: "hubgrid" }, [
          hubBtn("🏛️", "展示廳", bouquets.length ? "已經有 " + bouquets.length + " 束花" : "瓶子超過 15 朵時，可以把 10 朵包成一束放這裡", function () { openShowcase(); }),
          hubBtn("📖", "花花圖書館", "每一朵花和它的話，依月份收好", function () { libTab = "in"; openLibrary(); }),
          hubBtn("📅", "紀念日", "在一起、認識、生日、下次見面", openUs),
          hubBtn("📝", "留言簿與祝福花", "好友送的祝福花 " + (inbox.blessings || []).length + " 朵・留言 " + (inbox.guest || []).length + " 則", openGuestbook, inboxNew()),
          partner ? hubBtn("💌", "報平安紀錄", "今天和最近 7 天", openCheckinView) : null
        ])];
    } else {
      kids = [el("h2", { text: "我的" }),
        el("div", { class: "hubgrid" }, [
          hubBtn("⚙️", "設定", "暱稱、時區、花色、通知、配對", openSettings),
          hubBtn("🔢", "首頁要顯示的天數", "選要在首頁看到哪些天數", openUs),
          hubBtn("🌸", "我的招牌花", "現在是" + flowerOf(myFlower()).name + "，送花時預設用這種", openSignature),
          hubBtn("🏅", "徽章", "已解鎖 " + earnedBadges().length + "／" + BADGES.length + "，看看還能挑戰什麼", function () { openBadges(); }),
          hubBtn("👫", "好友", "加好友、去好友家串門子", openFriends),
          hubBtn("🧭", "使用說明", "重新看一次所有功能怎麼用", function () { showIntro(0); }),
          needTiltPermission() && !lsGet("cg-tilt") ? hubBtn("✦", "開啟景深", "傾斜手機時，瓶子和螢火蟲會有前後層次", function () { closeSheet(); askTilt(); }) : null
        ])];
    }
    openPanel(kids);
    setHub(key);
  }
  function setHub(key) {
    hubOn = key;
    [].forEach.call(document.querySelectorAll(".dock [data-hub]"), function (b) { b.classList.toggle("on", b.getAttribute("data-hub") === key); });
  }
  // 主畫面的「今天」小卡：一次只提醒最該做的一件事，沒事就顯示兩個人今天的報平安
  function todayCard(pend) {
    var owed = tickets().filter(function (c) { return c.owner === me.id; }).length, a = myCheckin();
    var todo = [], hisAnger = angerOn(partner.id), myAnger = angerOn(me.id);
    if (hisAnger) todo.push({ t: "☁️ " + nick(partner) + "在" + (ANGER[hisAnger.level] || ANGER[2]).t + "，去哄哄", go: function () { openAnger(hisAnger); } });
    if (myAnger) todo.push({ t: "🌧️ 你在生氣中" + (coaxOf(myAnger).length ? "・" + nick(partner) + "哄了 " + coaxOf(myAnger).length + " 次" : ""), go: function () { openAnger(myAnger); } });
    if (pend.length) todo.push({ t: "🔔 " + pend.length + " 件等你確認", go: openPending });
    if (!a) todo.push({ t: "💌 今天還沒報平安，點我", go: openCheckin });
    if (wishFor(me).length) todo.push({ t: "🌠 " + nick(partner) + "許了 " + wishFor(me).length + " 個願望", go: openWishes });
    if (owed) todo.push({ t: "🎟️ " + nick(partner) + "欠你 " + owed + " 張券", go: openTickets });
    var loose = entries.filter(function (e) { return e.owner === me.id && e.kind !== "black" && e.status === "confirmed" && !e.bouquet_id; }).length;
    if (loose > BOWL_MAX) todo.push({ t: "💐 瓶子快滿了，把最舊的 10 朵包成花束", go: openMakeBouquet });
    if (inboxNew()) todo.push({ t: "🤍 好友來串門子了，看看他們留下什麼", go: openBlessings });
    if (!todo.length) return checkinLine();
    checkinLine();   // 照常檢查連續天數的慶祝卡
    var first = todo[0];
    return el("button", { class: "checkline todo", onclick: first.go }, [
      el("span", { class: "streak", text: first.t }),
      todo.length > 1 ? el("span", { class: "more", text: "還有 " + (todo.length - 1) + " 件" }) : null
    ]);
  }
  // 首頁的天數一行（原本在工具列第一頁）
  // 天數用一句白話：在一起 5 天・17 天後見面；兩人不同時區時，再加上對方那邊的時間
  function dayPhrase(x) {
    var today = x.n === "今天";
    if (x.key === "meet") return today ? "今天見面" : x.n + " 天後見面";
    if (x.key === "started") return "在一起 " + x.n + " 天";
    if (x.key === "met") return "認識 " + x.n + " 天";
    return x.name.replace("（倒數）", "") + (today ? "就是今天" : "還有 " + x.n + " 天");
  }
  function daysLine(stats) {
    var parts = stats.slice(0, 2).map(dayPhrase);
    if (partner && partner.tz && partner.tz !== me.tz) parts.push(nick(partner) + "那邊 " + localTime(partner.tz));
    if (!parts.length) return el("button", { class: "daysline", onclick: openUs, text: "＋ 設定紀念日" });
    return el("button", { class: "daysline", onclick: openUs, text: parts.join("・") });
  }
  // ---------- 好友與串門子 ----------
  // 兩對情侶互加好友。好友只看得到瓶子、花的位置和顏色、小精靈、小燈、天氣，看不到花的話和任何留言（資料庫端就不回傳）
  var visit = null;   // 正在串門子：{ data: cg_friend_view 的結果, idx: 看第幾個人的瓶子, names }
  function visitGuard() { if (!visit) return false; toast("這是好友的花園，只能看看喔"); return true; }
  function friendErr(e) {
    var m = (e && e.message) || "";
    if (/code not found/.test(m)) return "找不到這組好友碼";
    if (/own code/.test(m)) return "這是你們自己的好友碼";
    if (/already/.test(m)) return "你們已經是好友，或邀請還在等回覆";
    if (/not friends/.test(m)) return "還不是好友";
    return errText(e);
  }
  async function openFriends() {
    openPanel([el("h2", { text: "好友" }), el("p", { class: "legend", text: "載入中…" })]);
    var r = await Promise.all([sb.rpc("cg_friend_code"), sb.rpc("cg_friend_list")]);
    if (r[0].error || r[1].error) { openPanel([el("h2", { text: "好友" }), el("p", { class: "legend", text: "好友功能還沒開通，請稍後再試。" }), el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })])]); return; }
    var code = r[0].data, list = r[1].data || [];
    var names = function (f) { return (f.names || []).join(" & ") || "一對情侶"; };
    var kids = [el("h2", { text: "好友" }),
      el("p", { class: "legend", text: "加好友後可以去對方家串門子，看他們的瓶子。好友看不到你們花上寫的話。" }),
      el("div", { class: "fcode" }, [el("span", { text: "我們的好友碼" }), el("b", { text: code }),
        el("button", { class: "btn ghost", text: "分享", onclick: function () { shareFriendCode(code); } })])];
    var input = el("input", { type: "text", id: "fr-code", placeholder: "輸入對方的好友碼", maxlength: "6", autocapitalize: "characters" });
    kids.push(el("div", { class: "frow" }, [input, el("button", { class: "btn primary", text: "加好友", onclick: async function () {
      var c = input.value.trim(); if (c.length < 6) { toast("好友碼是 6 碼"); return; }
      var x = await sb.rpc("cg_friend_request", { code: c });
      if (x.error) { toast(friendErr(x.error)); return; }
      toast("已送出邀請，等對方同意"); haptic(); openFriends();
    } })]));
    var inc = list.filter(function (f) { return f.status === "pending" && f.incoming; });
    var out = list.filter(function (f) { return f.status === "pending" && !f.incoming; });
    var ok = list.filter(function (f) { return f.status === "accepted"; });
    if (inc.length) {
      kids.push(el("h3", { text: "想跟你們當好友" }));
      inc.forEach(function (f) {
        kids.push(el("div", { class: "fitem" }, [el("div", { class: "fi-t" }, [el("b", { text: names(f) }), el("span", { text: "邀請你們當好友" })]),
          el("button", { class: "btn ghost", text: "不要", onclick: async function () { await sb.from("cg_friends").delete().eq("id", f.id); openFriends(); } }),
          el("button", { class: "btn primary", text: "同意", onclick: async function () {
            var x = await sb.from("cg_friends").update({ status: "accepted" }).eq("id", f.id);
            if (x.error) { toast(friendErr(x.error)); return; }
            toast("成為好友了 👫"); haptic(); openFriends();
          } })]));
      });
    }
    kids.push(el("h3", { text: "好友（" + ok.length + "）" }));
    if (!ok.length) kids.push(el("p", { class: "legend", text: "還沒有好友。把好友碼傳給其他情侶，或輸入他們的好友碼。" }));
    ok.forEach(function (f) {
      var days = f.started_on ? daysBetween(parseDay(f.started_on), new Date()) + 1 : null;
      kids.push(el("button", { class: "fitem go", onclick: function () { startVisit(f); } }, [
        el("div", { class: "fi-t" }, [el("b", { text: names(f) }), el("span", { text: (days ? "在一起 " + days + " 天・" : "") + "共 " + f.flowers + " 朵花" })]),
        el("span", { class: "fi-go", text: "去串門子 →" })]));
    });
    if (out.length) {
      kids.push(el("h3", { text: "等對方回覆" }));
      out.forEach(function (f) {
        kids.push(el("div", { class: "fitem" }, [el("div", { class: "fi-t" }, [el("b", { text: names(f) }), el("span", { text: "邀請已送出" })]),
          el("button", { class: "btn ghost", text: "取消", onclick: async function () { await sb.from("cg_friends").delete().eq("id", f.id); openFriends(); } })]));
      });
    }
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
  }
  function shareFriendCode(code) {
    var text = "來 Couple Garden 跟我們當好友吧！打開 " + location.origin + location.pathname + " ，到「我的 → 好友」輸入好友碼：" + code;
    if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
    try { navigator.clipboard.writeText(text).then(function () { toast("已複製好友碼"); }); } catch (e) { toast("好友碼：" + code); }
  }
  async function startVisit(f) {
    var r = await sb.rpc("cg_friend_view", { target: f.couple });
    if (r.error) { toast(friendErr(r.error)); return; }
    var d = r.data;
    d.entries.forEach(function (e) { e.note = ""; e.reply = ""; });
    visit = { data: d, idx: 0, fid: f.id, names: (f.names || []).join(" & ") };
    closeSheet(); route();
  }
  function endVisit() { visit = null; orbSig = ""; route(); }
  // 借用自己家的畫法：暫時把「我、對方、花、燈、天氣」換成好友的資料來畫瓶子，畫完立刻換回來
  function asVisit(fn) {
    var keep = [me, partner, couple, entries, claims, angers, coaxes, dates, bouquets];   // 小花盆的數量由 potCount() 看 visit 決定
    var m = visit.data.members, k = visit.idx;
    me = Object.assign({}, m[k]); partner = m[1 - k] ? Object.assign({}, m[1 - k]) : null;
    couple = Object.assign({}, visit.data.couple); entries = visit.data.entries; claims = visit.data.claims; angers = visit.data.angers; coaxes = []; dates = []; bouquets = visit.data.bouquets || [];
    try { return fn(); } finally { me = keep[0]; partner = keep[1]; couple = keep[2]; entries = keep[3]; claims = keep[4]; angers = keep[5]; coaxes = keep[6]; dates = keep[7]; bouquets = keep[8]; }
  }
  function renderVisit() {
    var ui = document.getElementById("ui"), m = visit.data.members;
    ui.textContent = "";
    var info = asVisit(function () {
      var g = garden(me);
      renderOrb(g.inOrb, null, me);
      return { count: g.count, blacks: g.blacks.length, days: dayStats(new Date()) };
    });
    var tabs = el("div", { class: "gtabs", role: "tablist" }, m.map(function (p, k) {
      return el("button", { class: "gtab" + (visit.idx === k ? " on" : ""), role: "tab", onclick: function () { if (visit.idx !== k) { visit.idx = k; renderVisit(); } } }, [p.nickname || "?"]);
    }));
    var fb = (visit.data.couple && visit.data.couple.badges) || [];
    ui.appendChild(el("div", { class: "top" }, [el("div", { class: "brand" }, ["好友的花園", el("button", { class: "badgepill", onclick: function () { openBadges(fb, visit.names + " 的徽章"); } }, ["🏅 " + fb.length])]), tabs]));
    ui.appendChild(el("div", { class: "hero" }, [
      el("div", { class: "headline" }, [el("b", { text: String(info.count) }), el("span", { text: " 朵" }), info.blacks ? el("span", { class: "blk", text: "・小黑花 " + info.blacks }) : null]),
      el("p", { class: "daysline", text: visit.names + (info.days.length ? "・" + info.days.slice(0, 1).map(dayPhrase).join("") : "") }),
      el("p", { class: "visitnote", text: "👀 串門子中：看得到瓶子，看不到花上寫的話" }),
      (visit.data.bouquets || []).length ? el("button", { class: "daysline", onclick: function () { asVisit(function () { openShowcase(true); }); } }, ["🏛️ 去看他們的展示廳（" + visit.data.bouquets.length + " 束）"]) : null
    ]));
    var blessed = visit.data.blessed_today;
    ui.appendChild(el("div", { class: "dock liquid-glass tabs4 visitdock" }, [
      el("button", { class: "btn ghost", text: "← 回家", onclick: endVisit }),
      el("button", { class: "btn" + (blessed ? " ghost" : " primary"), text: blessed ? "🤍 今天送過了" : "🤍 送祝福花", onclick: function () { if (blessed) { toast("每天可以送一朵，明天再來"); return; } openBless(); } }),
      el("button", { class: "btn ghost", text: "📝 留言", onclick: openGuestWrite })
    ]));
    layoutVideo();
  }
  // ---------- 花束與展示廳 ----------
  // 瓶子裡沒包起來的花超過 15 朵就提醒；一次把最舊的 10 朵包成一束，放進兩人共用的展示廳。朵數、獎勵、徽章都照總數算
  var BOWL_MAX = 15;
  function bouquetFlowers(b) { return entries.filter(function (e) { return e.bouquet_id === b.id; }).sort(function (x, y) { return x.ts - y.ts; }); }
  function flowerImg(e) {
    if (e.style && e.style !== "rose") return flowerOf(e.style).img;
    if (e.style === "rose") return "rose-red-b.png";
    var owner = e.owner === me.id ? me : partner;
    return gardenColor(owner) === "blue" ? "rose-blue-b.png" : "rose-red-b.png";
  }
  // 花束：10 朵花從同一個點扇形散開，下面是牛皮紙包裝和緞帶（純 CSS 與圖片，不用濾鏡）
  function bouquetEl(list, size) {
    var wrap = el("div", { class: "bq", style: "width:" + size + "px;height:" + Math.round(size * 1.25) + "px" });
    var n = list.length;
    list.forEach(function (e, i) {
      var t = n > 1 ? i / (n - 1) : 0.5, ang = (t - 0.5) * 70, row = i % 2;
      var f = el("div", { class: "bq-f", style: "background-image:url(" + flowerImg(e) + ");transform:translateX(-50%) rotate(" + ang.toFixed(1) + "deg);height:" + (row ? 70 : 80) + "%;z-index:" + (row ? 2 : 1) });
      wrap.appendChild(f);
    });
    wrap.appendChild(el("div", { class: "bq-paper" }));
    wrap.appendChild(el("div", { class: "bq-ribbon" }));
    return wrap;
  }
  function openMakeBouquet() {
    var mine = entries.filter(function (e) { return e.owner === me.id && e.kind !== "black" && e.status === "confirmed" && !e.bouquet_id; }).sort(function (a, b) { return a.ts - b.ts; });
    if (mine.length < 10) { toast("瓶子裡要有 10 朵花才能包成一束（現在 " + mine.length + " 朵）"); return; }
    var ten = mine.slice(0, 10), d0 = new Date(ten[0].ts), d1 = new Date(ten[9].ts);
    var def = d0.getMonth() === d1.getMonth() ? (d0.getMonth() + 1) + " 月的花" : (d0.getMonth() + 1) + "～" + (d1.getMonth() + 1) + " 月的花";
    var name = el("input", { type: "text", id: "bq-name", placeholder: def, maxlength: "20" });
    openPanel([
      el("h2", { text: "💐 把最舊的 10 朵包成一束" }),
      el("div", { class: "bq-stage" }, [bouquetEl(ten, 150)]),
      el("p", { class: "legend", text: shortDate(dateKey(d0)) + " 到 " + shortDate(dateKey(d1)) + " 的 10 朵花，會從瓶子移到展示廳。朵數、獎勵和徽章都不會變少。" }),
      el("label", { class: "field" }, [el("span", { text: "幫這束花取名字" }), name]),
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "先不要", onclick: closeSheet }),
        el("button", { class: "btn primary", text: "包起來", onclick: function () {
          var nm = name.value.trim() || def;
          closeSheet();
          act(function () { return sb.rpc("cg_make_bouquet", { bowl: me.id, bname: nm }); }, "💐 「" + nm + "」放進展示廳了").then(function () { orbSig = ""; glowOrb(false); });
        } })
      ])
    ]);
  }
  // 展示廳：一層層木架上放花束；readonly 是串門子時看好友的（看不到花上寫的話）
  function openShowcase(readonly) {
    var list = bouquets.slice().sort(function (a, b) { return a.ts - b.ts; });
    var kids = [el("h2", { text: "🏛️ " + (readonly ? (visit ? visit.names + " 的" : "") + "展示廳" : "我們的展示廳") + "（" + list.length + " 束）" })];
    if (!list.length) kids.push(el("p", { class: "legend", text: "還沒有花束。瓶子裡的花超過 15 朵時，可以把最舊的 10 朵包成一束放到這裡。" }));
    for (var i = 0; i < list.length; i += 3) {
      kids.push(el("div", { class: "shelf" }, list.slice(i, i + 3).map(function (b, k) {
        var fl = bouquetFlowers(b), who = b.owner === me.id ? me : partner;
        return el("button", { class: "shelf-item", onclick: function () { if (readonly) { toast("「" + (b.name || "花束") + "」：" + fl.length + " 朵花"); return; } openBouquet(b); } }, [
          bouquetEl(fl, 82), el("b", { text: b.name || "第 " + (i + k + 1) + " 束" }), el("span", { text: nick(who) + "的瓶子・" + shortDate(dateKey(new Date(b.ts))) })]);
      })));
    }
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn primary", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
  }
  function openBouquet(b) {
    var fl = bouquetFlowers(b), name = el("input", { type: "text", value: b.name || "", maxlength: "20" });
    var kids = [el("div", { class: "bq-stage" }, [bouquetEl(fl, 160)]), el("h2", { text: b.name || "花束" }),
      el("p", { class: "legend", text: "從" + nick(b.owner === me.id ? me : partner) + "的瓶子包起來・" + shortDate(dateKey(new Date(b.ts))) })];
    kids.push(el("ul", { class: "coaxlist" }, fl.map(function (e) {
      return el("li", {}, [el("b", { text: (e.style ? flowerOf(e.style).name : "玫瑰") }), el("span", { text: (e.note || "（沒有寫話）") + "・" + shortDate(e.day) })]);
    })));
    kids.push(el("label", { class: "field" }, [el("span", { text: "改名字" }), name]));
    kids.push(el("div", { class: "row" }, [
      el("button", { class: "btn ghost", text: "回展示廳", onclick: function () { openShowcase(); } }),
      el("button", { class: "btn primary", text: "儲存名字", onclick: function () {
        var nm = name.value.trim(); closeSheet();
        act(function () { return sb.from("cg_bouquets").update({ name: nm }).eq("id", b.id); }, "已改名");
      } })
    ]));
    openPanel(kids);
  }
  // ---------- 成就徽章 ----------
  // 兩人共有。全部用現有資料算，舊用戶一上線就補發；算好的結果存一份到 cg_couples.badges，給好友串門子時看
  function bestStreak() {   // 歷史上兩人「同一天都報平安」的最長連續天數
    if (!partner) return 0;
    var a = {}, b = {};
    checkins.forEach(function (c) { if (c.user_id === me.id) a[c.day] = 1; else if (c.user_id === partner.id) b[c.day] = 1; });
    var both = Object.keys(a).filter(function (k) { return b[k]; }).sort(), best = 0, run = 0, prev = null;
    both.forEach(function (k) {
      if (prev) { var d = parseDay(prev); d.setDate(d.getDate() + 1); run = dateKey(d) === k ? run + 1 : 1; } else run = 1;
      best = Math.max(best, run); prev = k;
    });
    return best;
  }
  function badgeStats() {
    var flowers = entries.filter(function (e) { return e.kind !== "black" && e.status === "confirmed"; });
    var gave = function (p) { return p && flowers.some(function (e) { return e.created_by === p.id && e.owner !== p.id; }); };
    var calm = angers.filter(function (a) { return a.status === "calm"; });
    return {
      flowers: flowers.length, mutual: gave(me) && gave(partner) ? 1 : 0,
      checkins: checkins.length, streak: bestStreak(),
      done: claims.filter(function (c) { return c.status === "done"; }).length,
      calm: calm.length, coaxed: calm.filter(function (a) { return coaxOf(a).length; }).length, coaxes: coaxes.length,
      pings: pings.length, blacks: entries.filter(function (e) { return e.kind === "black"; }).length,
      friends: +(inbox.friends || 0), blessed: +(inbox.blessed || 0),
      days: couple && couple.started_on ? daysBetween(parseDay(couple.started_on), new Date()) + 1 : 0
    };
  }
  var BADGES = [
    { id: "f1", cat: "🌱 種花", icon: "🌱", name: "第一朵花", desc: "瓶子裡有第一朵花", k: "flowers", goal: 1 },
    { id: "f10", cat: "🌱 種花", icon: "🌷", name: "小花園", desc: "累積 10 朵花", k: "flowers", goal: 10 },
    { id: "f50", cat: "🌱 種花", icon: "💐", name: "花團錦簇", desc: "累積 50 朵花", k: "flowers", goal: 50 },
    { id: "f100", cat: "🌱 種花", icon: "🌺", name: "百花園", desc: "累積 100 朵花", k: "flowers", goal: 100 },
    { id: "mutual", cat: "🌱 種花", icon: "💞", name: "互相寵愛", desc: "兩個人都送過對方花", k: "mutual", goal: 1 },
    { id: "c1", cat: "💌 報平安", icon: "💌", name: "第一次報平安", desc: "報過一次平安", k: "checkins", goal: 1 },
    { id: "s7", cat: "💌 報平安", icon: "🔥", name: "一週不間斷", desc: "兩人連續 7 天都報平安", k: "streak", goal: 7 },
    { id: "s30", cat: "💌 報平安", icon: "🌙", name: "一個月的默契", desc: "兩人連續 30 天都報平安", k: "streak", goal: 30 },
    { id: "s100", cat: "💌 報平安", icon: "⭐", name: "百日守候", desc: "兩人連續 100 天都報平安", k: "streak", goal: 100 },
    { id: "d1", cat: "🎁 獎勵", icon: "🏮", name: "說到做到", desc: "兌現第一個獎勵", k: "done", goal: 1 },
    { id: "d10", cat: "🎁 獎勵", icon: "🎐", name: "守信用", desc: "兌現 10 個獎勵", k: "done", goal: 10 },
    { id: "a1", cat: "☁️ 生氣與和好", icon: "🌈", name: "雨過天晴", desc: "第一次生氣後消氣", k: "calm", goal: 1 },
    { id: "a5", cat: "☁️ 生氣與和好", icon: "🤝", name: "和好專家", desc: "被哄好 5 次", k: "coaxed", goal: 5 },
    { id: "x10", cat: "☁️ 生氣與和好", icon: "🫶", name: "哄人高手", desc: "哄過對方 10 次", k: "coaxes", goal: 10 },
    { id: "p10", cat: "💗 互動", icon: "💗", name: "想你想你", desc: "按過 10 次想你", k: "pings", goal: 10 },
    { id: "b1", cat: "💗 互動", icon: "🖤", name: "小黑花也是愛", desc: "收過第一朵小黑花", k: "blacks", goal: 1 },
    { id: "fr1", cat: "👫 好友", icon: "👫", name: "交到朋友", desc: "第一對好友", k: "friends", goal: 1 },
    { id: "fr5", cat: "👫 好友", icon: "🎉", name: "社交達人", desc: "5 對好友", k: "friends", goal: 5 },
    { id: "bl10", cat: "👫 好友", icon: "🤍", name: "散播祝福", desc: "送出 10 朵祝福花", k: "blessed", goal: 10 },
    { id: "y100", cat: "📅 紀念日", icon: "💯", name: "100 天", desc: "在一起 100 天", k: "days", goal: 100 },
    { id: "y365", cat: "📅 紀念日", icon: "🎂", name: "一週年", desc: "在一起 365 天", k: "days", goal: 365 }
  ];
  function earnedBadges(st) { st = st || badgeStats(); return BADGES.filter(function (b) { return st[b.k] >= b.goal; }).map(function (b) { return b.id; }); }
  // 每次資料更新後檢查：有新徽章就跳慶祝卡，並同步存到 cg_couples.badges
  function checkBadges() {
    if (!couple || !partner || !loaded) return;
    var got = earnedBadges(), key = "cg-badges-" + me.id, seenRaw = lsGet(key), seen = seenRaw ? JSON.parse(seenRaw) : null;
    var stored = Array.isArray(couple.badges) ? couple.badges : [];
    if (got.join(",") !== stored.slice().sort().join(",") && got.length >= stored.length) {
      couple.badges = got;
      sb.from("cg_couples").update({ badges: got }).eq("id", couple.id).then(function () {});
    }
    if (seen === null) {   // 第一次：補發，用一張卡講總數就好
      lsSet(key, JSON.stringify(got));
      if (got.length) setTimeout(function () { queueCard(function () { showBadgeCard(null, got.length); }); }, 2600);
      return;
    }
    var fresh = got.filter(function (id) { return seen.indexOf(id) < 0; });
    if (!fresh.length) return;
    lsSet(key, JSON.stringify(got));
    fresh.forEach(function (id, i) {
      var b = BADGES.filter(function (x) { return x.id === id; })[0];
      if (b) setTimeout(function () { glowOrb(false); queueCard(function () { showBadgeCard(b); }); }, 2000 + i * 300);
    });
  }
  function showBadgeCard(b, total) {
    openPanel([
      el("div", { class: "introicon badgepop", text: b ? b.icon : "🏅" }),
      el("h2", { text: b ? "解鎖徽章：" + b.name : "你們已經有 " + total + " 個徽章" }),
      el("p", { class: "legend", style: "font-size:15px;line-height:1.7;color:var(--ink-soft)", text: b ? b.desc + "。這是你們兩個人一起拿到的。" : "這些是你們一路以來一起達成的。到「我的 → 徽章」看看還有哪些可以挑戰。" }),
      el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "看徽章牆", onclick: function () { openBadges(); } }), el("button", { class: "btn primary", text: "太棒了", onclick: closeSheet })])
    ]);
  }
  // 徽章牆：自己的會顯示進度；好友的（others 傳入已解鎖的 id）只顯示亮或灰
  function openBadges(others, title) {
    var st = others ? null : badgeStats(), got = others || earnedBadges(st), kids = [];
    kids.push(el("h2", { text: (title || "我們的徽章") + "（" + got.length + "／" + BADGES.length + "）" }));
    var cats = [];
    BADGES.forEach(function (b) { if (cats.indexOf(b.cat) < 0) cats.push(b.cat); });
    cats.forEach(function (c) {
      kids.push(el("h3", { text: c }));
      kids.push(el("div", { class: "bgrid" }, BADGES.filter(function (b) { return b.cat === c; }).map(function (b) {
        var on = got.indexOf(b.id) >= 0, cur = st ? Math.min(st[b.k], b.goal) : null;
        return el("div", { class: "bcell" + (on ? " on" : "") }, [
          el("span", { class: "bi", text: b.icon }), el("b", { text: b.name }), el("span", { class: "bd", text: b.desc }),
          !on && st && b.goal > 1 ? el("span", { class: "bp" }, [el("i", { style: "width:" + Math.round(cur / b.goal * 100) + "%" })]) : null,
          !on && st && b.goal > 1 ? el("span", { class: "bn", text: cur + "／" + b.goal }) : null
        ]);
      })));
    });
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn primary", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
  }
  // ---------- 祝福花與留言簿 ----------
  // 好友每天可以送一朵白色祝福花，放在瓶子右下角的小花盆；也可以在好友家留一句話。都不算進兩人的朵數
  function potCount() { return visit ? (visit.data.blessings || 0) : (inbox.blessings || []).length; }
  function addPot(layer, o) {
    var n = potCount(); if (!n) return;
    var W = o.rx * 0.42, box = el("div", { class: "pot", role: "button", "aria-label": "祝福花小花盆：" + n + " 朵" });
    box.style.left = (o.cx + o.rx * 0.8 - W / 2) + "px"; box.style.top = (o.cy + o.ry * 1.08 - W * 1.25) + "px";
    box.style.width = W + "px"; box.style.height = (W * 1.25) + "px";
    var k = Math.min(3, n);
    for (var i = 0; i < k; i++) {
      var r = el("div", { class: "pot-rose" });
      r.style.left = (50 + (i - (k - 1) / 2) * 26) + "%"; r.style.transform = "translateX(-50%) rotate(" + ((i - (k - 1) / 2) * 14) + "deg)";
      r.style.height = (86 - Math.abs(i - (k - 1) / 2) * 10) + "%";
      box.appendChild(r);
    }
    box.appendChild(el("div", { class: "pot-body" }));
    box.appendChild(el("span", { class: "pot-n", text: String(n) }));
    box.addEventListener("click", function () { if (visit) { toast("好友收到的祝福花：" + n + " 朵"); return; } openBlessings(); });
    layer.appendChild(box);
  }
  function inboxNew() {
    var seen = +(lsGet("cg-inbox-seen-" + me.id) || 0), all = (inbox.blessings || []).concat(inbox.guest || []);
    return all.filter(function (x) { return x.ts > seen; }).length;
  }
  function markInboxSeen() {
    var all = (inbox.blessings || []).concat(inbox.guest || []), mx = all.reduce(function (m, x) { return Math.max(m, x.ts); }, 0);
    if (mx) lsSet("cg-inbox-seen-" + me.id, mx);
  }
  function whenText(ts) { var t = new Date(ts); return shortDate(dateKey(t)) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes()); }
  function openBlessings() {
    var list = inbox.blessings || [], kids = [el("h2", { text: "🤍 祝福花（" + list.length + "）" }),
      el("p", { class: "legend", text: "好友來串門子時送的花，放在瓶子旁的小花盆裡，不算進你們的朵數。" })];
    if (!list.length) kids.push(el("p", { class: "legend", text: "還沒有。加好友後，他們就能送你們祝福花。" }));
    kids.push(el("ul", { class: "coaxlist" }, list.slice(0, 50).map(function (b) {
      return el("li", {}, [el("b", { text: b.from || "好友" }), el("span", { text: (b.note || "送了一朵祝福花") + "・" + whenText(b.ts) })]);
    })));
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "留言簿", onclick: openGuestbook }), el("button", { class: "btn primary", text: "關閉", onclick: closeSheet })]));
    markInboxSeen(); openPanel(kids);
  }
  function openGuestbook() {
    var list = inbox.guest || [], kids = [el("h2", { text: "📝 留言簿（" + list.length + "）" }),
      el("p", { class: "legend", text: "好友在你們家留下的話，只有你們兩個人和留言的人看得到。可以刪除。" })];
    if (!list.length) kids.push(el("p", { class: "legend", text: "還沒有留言。" }));
    list.slice(0, 80).forEach(function (g) {
      kids.push(el("div", { class: "fitem" }, [el("div", { class: "fi-t" }, [el("b", { text: g.from || "好友" }), el("span", { text: g.text + "・" + whenText(g.ts) })]),
        el("button", { class: "btn ghost", text: "刪除", onclick: function () {
          confirmPanel("刪除這則留言？", "刪除後就找不回來了。", "刪除", function () { act(function () { return sb.from("cg_guestbook").delete().eq("id", g.id); }, "已刪除"); });
        } })]));
    });
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "祝福花", onclick: openBlessings }), el("button", { class: "btn primary", text: "關閉", onclick: closeSheet })]));
    markInboxSeen(); openPanel(kids);
  }
  function openBless() {
    var note = el("input", { type: "text", id: "bless-note", placeholder: "附一句祝福（可不填）", maxlength: "60" });
    openPanel([
      el("h2", { text: "🤍 送 " + visit.names + " 一朵祝福花" }),
      el("p", { class: "legend", text: "會放在他們瓶子旁的小花盆裡。每對好友每天可以送一朵。" }),
      el("label", { class: "field" }, [el("span", { text: "祝福" }), note]),
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "取消", onclick: closeSheet }),
        el("button", { class: "btn primary", text: "送出", onclick: async function () {
          closeSheet();
          var r = await sb.rpc("cg_bless", { target: visit.data.couple.id, note: note.value.trim() });
          if (r.error) { toast(/already/.test(r.error.message || "") ? "今天已經送過了" : friendErr(r.error)); return; }
          visit.data.blessed_today = true; visit.data.blessings = (visit.data.blessings || 0) + 1; orbSig = "";
          toast("🤍 祝福花送到了"); haptic(); renderVisit();
        } })
      ])
    ]);
  }
  function openGuestWrite() {
    var t = el("input", { type: "text", id: "guest-text", placeholder: "例如：你們的花園好美！", maxlength: "60" });
    openPanel([
      el("h2", { text: "📝 在 " + visit.names + " 家留言" }),
      el("p", { class: "legend", text: "他們兩個人都看得到，也可以刪除。最多 60 字。" }),
      t,
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "取消", onclick: closeSheet }),
        el("button", { class: "btn primary", text: "留言", onclick: async function () {
          var v = t.value.trim(); if (!v) { toast("寫一句話吧"); return; }
          closeSheet();
          var r = await sb.rpc("cg_guest_write", { target: visit.data.couple.id, msg: v });
          if (r.error) { toast(friendErr(r.error)); return; }
          toast("📝 留言送出了"); haptic();
        } })
      ])
    ]);
  }
  // ---------- 待兌現的券 ----------
  // 兌換成立後，獎勵還沒真的發生：主畫面留一張券提醒兩個人，兌換的人收到後按「收到了」，瓶子裡多一盞小燈
  function tickets() { return claims.filter(function (c) { return c.status === "confirmed"; }); }
  function ticketLine() {
    var t = tickets();
    if (!t.length) return null;
    var mine = t.filter(function (c) { return c.owner === me.id; }).length, owe = t.length - mine;
    var txt = [mine ? "我有 " + mine + " 張券" : "", owe ? "欠" + nick(partner) + " " + owe + " 張" : ""].filter(Boolean).join("・");
    return el("button", { class: "ticketline", onclick: openTickets }, [el("span", { text: "🎟️ " + txt })]);
  }
  function ticketCard(c) {
    var mine = c.owner === me.id;
    return el("div", { class: "ticket" }, [
      el("div", { class: "tk-l" }, [el("b", { text: c.title }), el("span", { text: (mine ? nick(partner) + "欠我的" : "我欠" + nick(partner) + "的") + "・" + shortDate(dateKey(new Date(c.ts))) + " 兌換" })]),
      mine ? el("button", { class: "btn primary", text: "收到了", onclick: function () { openTicketDone(c); } }) : el("span", { class: "tk-wait", text: "等你兌現" })
    ]);
  }
  function openTickets() {
    var t = tickets(), kids = [el("h2", { text: "待兌現的券" })];
    kids.push(el("p", { class: "legend", text: "兌換成立的獎勵會留在這裡，直到真的做到。收到的人按「收到了」，瓶子裡會多一盞小燈。" }));
    t.filter(function (c) { return c.owner === me.id; }).concat(t.filter(function (c) { return c.owner !== me.id; })).forEach(function (c) { kids.push(ticketCard(c)); });
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
  }
  function openTicketDone(c) {
    var note = el("input", { type: "text", id: "tk-note", placeholder: "想對" + nick(partner) + "說什麼？（可不填）", maxlength: "60" });
    openPanel([
      el("h2", { text: "🏮 收到了：" + c.title }),
      el("p", { class: "legend", text: "按下後這張券就完成了，瓶子裡會點亮一盞小燈，" + nick(partner) + "也會收到通知。" }),
      el("label", { class: "field" }, [el("span", { text: "留言" }), note]),
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "先不要", onclick: openTickets }),
        el("button", { class: "btn primary", text: "收到了", onclick: function () {
          closeSheet();
          act(function () { return sb.from("cg_reward_claims").update({ status: "done", done_note: note.value.trim(), done_ts: Date.now() }).eq("id", c.id); }, "🏮 瓶子裡多了一盞小燈");
        } })
      ])
    ]);
  }
  function openLantern(c) {
    if (visitGuard()) return;
    var t = new Date(c.done_ts || c.ts);
    openPanel([
      el("h2", { text: "🏮 " + c.title }),
      el("p", { class: "legend", text: (c.owner === me.id ? "我" : nick(byId(c.owner))) + "在 " + shortDate(dateKey(t)) + " 收到的獎勵（" + c.cost + " 朵兌換）" }),
      c.done_note ? el("p", { class: "note", text: "「" + c.done_note + "」" }) : null,
      el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })])
    ]);
  }
  // 雨雲：浮在瓶口上方，雨滴落進瓶子。全部用漸層和動畫畫，不用濾鏡（iPhone 才畫得出來）
  function addRain(layer, o, a) {
    var lv = a.level || 2, w = o.rx * (1.0 + 0.2 * lv), h = o.ry * 0.5;
    var cloud = el("div", { class: "raincloud lv" + lv, role: "button", "aria-label": "雨雲：點一下看生氣的原因" });
    cloud.style.left = (o.cx - w / 2) + "px"; cloud.style.top = (o.cy - o.ry * 1.22) + "px";
    cloud.style.width = w + "px"; cloud.style.height = h + "px";
    cloud.addEventListener("click", function () { openAnger(a); });
    layer.appendChild(cloud);
    var n = [0, 14, 26, 44][lv];
    for (var i = 0; i < n; i++) {
      var d = el("div", { class: "raindrop", "aria-hidden": "true" });
      d.style.left = (o.cx - w * 0.42 + seeded(i + 300) * w * 0.84) + "px";
      d.style.top = (o.cy - o.ry * 0.95) + "px";
      d.style.setProperty("--fall", Math.round(o.ry * (1.2 + seeded(i + 400) * 0.3)) + "px");
      d.style.animationDuration = (0.9 - lv * 0.12 + seeded(i + 500) * 0.3).toFixed(2) + "s";
      d.style.animationDelay = (-seeded(i + 600) * 1.2).toFixed(2) + "s";
      layer.appendChild(d);
    }
  }
  function addRainbow(layer, o) {
    var r = el("div", { class: "rainbow", "aria-hidden": "true" });
    var w = o.rx * 1.7;
    r.style.left = (o.cx - w / 2) + "px"; r.style.top = (o.cy - o.ry * 0.55 - w / 2) + "px";
    r.style.width = w + "px"; r.style.height = (w / 2) + "px";
    layer.appendChild(r);
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 6000);
  }
  // 瓶子裡的小燈：每兌現一個獎勵就點一盞，沿著苔蘚後緣排開。光暈用漸層畫，不用濾鏡（iPhone 才畫得出來）
  function addLanterns(layer, o, owner, bx, by, hw, hh) {
    var done = owner ? claims.filter(function (c) { return c.owner === owner.id && c.status === "done"; }).sort(function (a, b) { return (a.done_ts || a.ts) - (b.done_ts || b.ts); }) : [];
    var S = o.ry * 0.24;
    done.slice(0, 24).forEach(function (c, i) {
      var ang = Math.PI * (1.15 + 0.7 * ((i * 0.618) % 1));   // 後半圈，不擋住前面的花
      var x = bx + Math.cos(ang) * hw * 0.92, y = by + Math.sin(ang) * hh * 0.55 - o.ry * 0.14;   // 浮在苔蘚上方一點
      var L = el("div", { class: "lantern", role: "button", "aria-label": "獎勵小燈：" + c.title });
      L.style.width = S + "px"; L.style.height = S * 1.3 + "px";
      L.style.left = (x - S / 2) + "px"; L.style.top = (y - S * 1.3) + "px";
      L.style.zIndex = String(Math.round(by - hh));   // 在苔蘚上面、花的後面
      L.style.animationDelay = (-i * 0.9) + "s";
      L.addEventListener("click", function () { openLantern(c); });
      layer.appendChild(L);
    });
  }
  // ---------- 花花圖書館：每一朵種下的花，依月份排成相簿 ----------
  var libTab = "in";
  function openLibrary() {
    var owner = libTab === "in" ? me : partner;
    var kids = [el("h2", { text: "花花圖書館" })];
    if (partner) {
      kids.push(el("div", { class: "libtabs" }, [["in", "我收到的"], ["out", "我送出的"]].map(function (t) {
        return el("button", { class: "libtab" + (libTab === t[0] ? " on" : ""), text: t[1], onclick: function () { libTab = t[0]; openLibrary(); } });
      })));
    }
    var all = owner ? entries.filter(function (e) { return e.owner === owner.id && e.kind !== "black" && e.status === "confirmed"; }).sort(function (a, b) { return a.ts - b.ts; }) : [];
    var col = owner ? gardenColor(owner) : "red";
    if (!all.length) {
      kids.push(el("p", { class: "legend", text: libTab === "in" ? "還沒有收到花。申請一朵，等對方確認後就會收進這裡。" : "還沒有送出的花。" }));
    } else {
      var months = {}, order = [];
      all.forEach(function (e, i) {
        var k = e.day.slice(0, 7);
        if (!months[k]) { months[k] = []; order.push(k); }
        months[k].push({ e: e, nth: i + 1 });
      });
      var top = order.slice().sort(function (a, b) { return months[b].length - months[a].length; })[0];
      kids.push(el("div", { class: "libstats" }, [
        el("div", {}, [el("b", { text: String(all.length) }), el("span", { text: "朵" })]),
        el("div", {}, [el("b", { text: shortDate(all[0].day) }), el("span", { text: "第一朵" })]),
        el("div", {}, [el("b", {}, [String(+top.slice(5)), el("small", { text: "月" })]), el("span", { text: "最多花的月份" })])
      ]));
      order.reverse().forEach(function (k) {
        var list = months[k].slice().reverse();
        kids.push(el("h3", { class: "libmonth", text: k.slice(0, 4) + " 年 " + (+k.slice(5)) + " 月・" + list.length + " 朵" }));
        kids.push(el("div", { class: "libgrid" }, list.map(function (x) {
          return el("button", { class: "libcell", onclick: function () { openEntry(x.e, x.nth); } }, [
            el("div", { class: "librose " + col, "aria-hidden": "true" }),
            el("div", { class: "libno", text: "No." + x.nth + "・" + shortDate(x.e.day) }),
            el("div", { class: "libnote", text: x.e.note || "（沒有留言）" })
          ]);
        })));
      });
    }
    kids.push(el("button", { class: "btn ghost libmore", text: "完整紀錄（含小黑花、報平安、兌換）", onclick: function () { openRecords(owner); } }));
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
  }
  function openRecords(who) {
    var owner = who && who.id ? who : viewOwner();
    var list = entries.filter(function (e) { return owner && e.owner === owner.id; })
      .concat(claims.filter(function (c) { return owner && c.owner === owner.id; }).map(function (c) { return Object.assign({ _claim: true, day: dateKey(new Date(c.ts)) }, c); }))
      .concat(checkins.filter(function (c) { return owner && c.user_id === owner.id; }).map(function (c) { return Object.assign({ _checkin: true }, c); }))
      .concat(angers.filter(function (a) { return owner && a.from_id === owner.id; }).map(function (a) { return Object.assign({ _anger: true, day: dateKey(new Date(a.ts)) }, a); }))
      .sort(function (a, b) { return b.ts - a.ts; }).slice(0, 80);
    var log = el("ul", { class: "log" });
    if (!list.length) log.appendChild(el("li", {}, [el("span", { class: "when" }), el("span", { class: "what", text: "還沒有紀錄。" })]));
    var tagText = { pending: "等確認", rejected: "已退回", appeal: "申訴中", revoked: "已撤銷", redeemed: "已贖回" };
    list.forEach(function (e) {
      if (e._checkin) {
        log.appendChild(el("li", { class: "checkin" }, [el("span", { class: "when", text: shortDate(e.day) }), el("div", { class: "what" }, [
          el("div", {}, [el("b", { text: "報平安 " + (e.mood || "") })]),
          e.note ? el("p", { class: "note", text: e.note }) : null
        ])]));
        return;
      }
      if (e._anger) {
        var hs = coaxOf(e);
        log.appendChild(el("li", { class: "anger" }, [el("span", { class: "when", text: shortDate(e.day) }), el("div", { class: "what" }, [
          el("div", {}, [el("b", { text: (ANGER[e.level] || ANGER[2]).e + " " + (ANGER[e.level] || ANGER[2]).t }), el("span", { class: "tag" + (e.status === "angry" ? "" : " no"), text: e.status === "angry" ? "還在下雨" : "🌈 消氣了" })]),
          e.reason ? el("p", { class: "note", text: e.reason }) : null,
          hs.length ? el("p", { class: "reply", text: "被哄了 " + hs.length + " 次：" + hs.map(function (c) { return c.text; }).join("、") }) : null
        ])]));
        return;
      }
      if (e._claim) {
        var ct = { pending: "等確認", rejected: "沒有兌換", confirmed: "待兌現", done: "🏮 已兌現" }[e.status];
        log.appendChild(el("li", { class: "claim" }, [el("span", { class: "when", text: shortDate(e.day) }), el("div", { class: "what" }, [
          el("div", {}, [el("b", { text: "🎁 兌換：" + e.title + "（" + e.cost + " 朵）" }), ct ? el("span", { class: "tag" + (e.status === "pending" ? "" : " no"), text: ct }) : null]),
          e.reply ? el("p", { class: "reply", text: nick(e.owner === me.id ? partner : me) + "：" + e.reply }) : null,
          e.done_note ? el("p", { class: "note", text: nick(byId(e.owner)) + "：" + e.done_note }) : null
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
  // ---------- 每日報平安 ----------
  var MOODS = ["😊", "🥰", "😴", "😢", "😤", "🤒"];
  function checkinOf(p, day) { return p ? checkins.filter(function (c) { return c.user_id === p.id && c.day === day; })[0] : null; }
  function myCheckin() { return checkinOf(me, localDay(me.tz)); }
  // 連續天數：兩個人同一天（各自當地日期）都有報平安才算；今天還沒完成不會中斷，從昨天往回數
  function streak() {
    if (!partner) return 0;
    var has = function (p, k) { return checkins.some(function (c) { return c.user_id === p.id && c.day === k; }); };
    var d = parseDay(localDay(me.tz)), n = 0;
    if (!(has(me, dateKey(d)) && has(partner, dateKey(d)))) d.setDate(d.getDate() - 1);
    while (has(me, dateKey(d)) && has(partner, dateKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function checkinLine() {
    var n = streak(), a = myCheckin(), b = checkinOf(partner, localDay(partner.tz));
    var who = function (p, c) { return el("span", { class: "ck" + (c ? " ok" : "") }, [nick(p) + " " + (c ? (c.mood || "✓") : "…")]); };
    checkStreakCard(n);
    return el("button", { class: "checkline" + (a ? "" : " todo"), onclick: function () { if (!a) openCheckin(); else openCheckinView(); } }, [
      a ? el("span", { class: "streak", text: n ? "🔥 連續 " + n + " 天" : "✓ 已報平安" }) : el("span", { class: "streak", text: "💌 今天還沒報平安，點我" }),
      who(me, a), who(partner, b)
    ]);
  }
  // 點膠囊：看兩個人今天的報平安，還有最近 7 天
  function ckCard(p, c) {
    var t = c ? new Date(c.ts) : null;
    return el("div", { class: "ckcard" + (c ? "" : " empty") }, [
      el("div", { class: "ckhead" }, [el("span", { class: "ckmood", text: c ? (c.mood || "💌") : "…" }), el("b", { text: p === me ? "我" : nick(p) }), el("span", { class: "cktime", text: c ? pad(t.getHours()) + ":" + pad(t.getMinutes()) : "還沒報平安" })]),
      c ? el("p", { class: "cknote", text: c.note || "今天平安" }) : null
    ]);
  }
  function openCheckinView() {
    var n = streak(), kids = [el("h2", { text: n ? "🔥 連續 " + n + " 天" : "今天的報平安" })];
    kids.push(ckCard(partner, checkinOf(partner, localDay(partner.tz))));
    kids.push(ckCard(me, myCheckin()));
    var d = parseDay(localDay(me.tz)), days = [];
    for (var i = 1; i <= 7; i++) { var x = new Date(d); x.setDate(d.getDate() - i); days.push(dateKey(x)); }
    var past = days.map(function (k) { return { k: k, a: checkinOf(me, k), b: checkinOf(partner, k) }; }).filter(function (x) { return x.a || x.b; });
    if (past.length) {
      kids.push(el("h3", { text: "最近幾天" }));
      kids.push(el("ul", { class: "log" }, past.map(function (x) {
        return el("li", {}, [el("span", { class: "when", text: shortDate(x.k) }), el("div", { class: "what" }, [
          x.b ? el("p", { class: "note", text: nick(partner) + " " + (x.b.mood || "✓") + "　" + (x.b.note || "") }) : el("p", { class: "note", text: nick(partner) + " 沒報" }),
          x.a ? el("p", { class: "note", text: "我 " + (x.a.mood || "✓") + "　" + (x.a.note || "") }) : el("p", { class: "note", text: "我 沒報" })
        ])]);
      })));
    }
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
  }
  function openCheckin() {
    var done = myCheckin();
    if (done) { toast("今天已經報過平安了 " + (done.mood || "")); return; }
    var mood = "";
    var row = el("div", { class: "moods" }, MOODS.map(function (m) {
      var b = el("button", { class: "mood", text: m, onclick: function () { mood = m; [].forEach.call(row.children, function (c) { c.classList.toggle("on", c === b); }); } });
      return b;
    }));
    var note = el("input", { type: "text", id: "checkin-note", placeholder: "想說的話，例如：平安到家了（可留空）", maxlength: "60" });
    openPanel([
      el("h2", { text: "報平安" }),
      checkinOf(partner, localDay(partner.tz)) ? ckCard(partner, checkinOf(partner, localDay(partner.tz))) : null,
      el("p", { class: "legend", text: "今天過得怎麼樣？讓" + nick(partner) + "知道你平安。" }),
      row, note,
      el("div", { class: "row" }, [
        el("button", { class: "btn ghost", text: "取消", onclick: closeSheet }),
        el("button", { class: "btn primary", text: "送出", onclick: function () {
          var row2 = { couple_id: couple.id, user_id: me.id, day: localDay(me.tz), mood: mood, note: note.value.trim(), ts: Date.now() };
          closeSheet();
          act(function () { return sb.from("cg_checkins").insert(row2); }, "已報平安" + (mood ? " " + mood : ""));
        } })
      ])
    ]);
  }
  // 連續報平安的慶祝卡：7、30、100、200、365 天各一次
  function checkStreakCard(n) {
    var marks = [7, 30, 100, 200, 365], hit = marks.filter(function (m) { return n >= m; }).pop();
    if (!hit) return;
    var k = "cg-streak-" + me.id;
    if (+(lsGet(k) || 0) >= hit) return;
    lsSet(k, hit);
    setTimeout(function () {
      glowOrb(false);
      queueCard(function () {
        openPanel([
          el("div", { class: "introicon", text: "🔥" }),
          el("h2", { text: "連續報平安 " + hit + " 天" }),
          el("p", { class: "legend", style: "font-size:15px;line-height:1.7;color:var(--ink-soft)", text: "你們已經連續 " + hit + " 天，每天都讓對方知道自己平安。這是很溫柔的習慣。" }),
          el("div", { class: "row" }, [el("button", { class: "btn primary", text: "繼續保持", onclick: closeSheet })])
        ]);
      });
    }, 1800);
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
    kids.push(el("button", { class: "btn", text: "📖 使用說明（重看新手導覽）", onclick: function () { closeSheet(); setTimeout(function () { showIntro(0); }, 200); } }));
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
      el("button", { class: "linkbtn", text: "這是什麼？怎麼開始？", onclick: openAbout }),
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
      el("ol", { class: "steps" }, [
        el("li", {}, [el("b", { text: "先到的人" }), el("span", { text: "按「建立我們的花園」，會拿到 6 碼邀請碼，傳給另一半。" })]),
        el("li", {}, [el("b", { text: "另一半" }), el("span", { text: "用自己的 Email 註冊後，在下面輸入邀請碼加入。" })]),
        el("li", {}, [el("b", { text: "完成" }), el("span", { text: "兩人進到同一個花園，就能開始互相種花。" })])
      ]),
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
    if (visit) { renderVisit(); return; }
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
    if (loaded) checkBadges();
    if (!mineView && partner) {
      var ps = lsGet("cg-pseen-" + me.id);
      g.inOrb.forEach(function (e) { if (ps !== null && e.ts > +ps && !animated[e.id]) fresh[e.id] = 1; });
      lsSet("cg-pseen-" + me.id, g.maxTs);
    }


    // 天數、見面倒數、兩地時間
    // 天數卡片：見面倒數、在一起、認識（最多 3 張）
    var now = new Date(), stats = dayStats(now);

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
    // 上半部只留三層：頂列（品牌＋切換瓶子）→ 朵數與天數 → 今天小卡
    ui.appendChild(el("div", { class: "top" }, [
      el("div", { class: "brand" }, ["Couple Garden", connText ? el("span", { class: "conndot", title: connText, "aria-label": connText }) : null,
        partner ? el("button", { class: "badgepill", "aria-label": "徽章", onclick: function () { openBadges(); } }, ["🏅 " + earnedBadges().length]) : null]),
      tabs
    ]));
    ui.appendChild(el("div", { class: "hero" }, [
      el("div", { class: "headline" }, [el("b", { text: String(g.count) }), el("span", { text: " 朵" }),
        g.blacks.length ? el("span", { class: "blk", text: "・小黑花 " + g.blacks.length }) : null]),
      daysLine(stats),
      partner ? todayCard(pend) : null,
      !partner ? el("div", { class: "invite" }, [
        el("p", { class: "invite-t", text: "還差一步：邀請另一半加入" }),
        el("p", { class: "invite-code", text: couple.invite_code }),
        el("p", { class: "invite-d", text: "對方註冊後輸入這組邀請碼，就會跟你在同一個花園。" }),
        el("button", { class: "btn primary", text: "傳邀請給對方", onclick: shareCode })
      ]) : null
    ]));

    // 工具列：四個固定分頁。花園＝主畫面，其他三個各打開一個功能清單
    var ico = function (d) { return svg("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, [svg("path", { d: d })]); };
    var tabBtn = function (key, icon, label, badge) {
      return el("button", { class: "tab" + (hubOn === key ? " on" : ""), "data-hub": key, onclick: function () { if (key === "home") { closeSheet(); if (view !== "me") switchView("me"); } else openHub(key); } },
        [ico(icon), label, badge ? el("span", { class: "badge", text: String(badge) }) : null]);
    };
    ui.appendChild(el("div", { class: "dock liquid-glass tabs4" }, [el("div", { class: "page" }, [
      tabBtn("home", "M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5", "花園"),
      tabBtn("act", "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z", "互動", pend.length),
      tabBtn("mem", "M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h10", "回憶"),
      tabBtn("mine", "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8M4 21c0-4 4-6 8-6s8 2 8 6", "我的")
    ])]));

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
    if (visit) { var k = v === "partner" ? 1 : 0; if (k !== visit.idx && visit.data.members[k]) { visit.idx = k; renderVisit(); } return; }
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
