(function () {
  "use strict";
  // ============================================================
  // 情侶花園（新版）：帳號、情侶配對、自訂任務、紀念日、異地倒數
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
    full: { video: "bg-loop.mp4", front: "front.webp", start: "bg-start.jpg", end: "bg-end.jpg", w: 1920, h: 1086, orb: { cx: 0.506, cy: 0.718, rx: 0.1413, ry: 0.2356 } },
    mobile: { video: "bg-m-loop.mp4", front: "front-m.webp", start: "bg-m-start.jpg", end: "bg-m-end.jpg", w: 1440, h: 1464, orb: { cx: 0.5, cy: 0.5833, rx: 0.3757, ry: 0.3484 } }
  };
  var ASSET = (window.innerWidth <= 700 && window.innerHeight > window.innerWidth) ? ASSETS.mobile : ASSETS.full;
  var VID = { w: ASSET.w, h: ASSET.h }, ORB = ASSET.orb;

  var sb = null, me = null, partner = null, couple = null, tasks = [], entries = [], dates = [];
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
  var DOCK_GAP = 106;
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
    var top = vh - DOCK_GAP - VID.h * sc;
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
  function photoFlower(i, isNew, S, atlas) {
    var idx = Math.floor(seeded(i * 3 + 1) * 9), col = idx % 3, row = Math.floor(idx / 3);
    var flip = seeded(i * 5 + 2) > 0.5 ? -1 : 1, tilt = (seeded(i * 7 + 3) - 0.5) * 30, lean = (seeded(i * 11 + 4) - 0.5) * 12;
    var stemH = S * (0.45 + seeded(i * 13 + 5) * 0.3), H = S * 0.55 + stemH;
    var f = el("div", { class: "pf" + atlas + (isNew ? " new" : ""), "aria-hidden": "true" });
    f.style.width = S + "px"; f.style.height = H + "px";
    var sw = Math.max(1.2, S * 0.035);
    var stem = el("div", { class: "stem" });
    stem.style.top = (S * 0.5) + "px"; stem.style.height = (H - S * 0.5) + "px"; stem.style.width = sw + "px";
    stem.style.marginLeft = (-sw / 2) + "px"; stem.style.transform = "rotate(" + lean.toFixed(1) + "deg)";
    var head = el("div", { class: "head" });
    head.style.width = S + "px"; head.style.height = S + "px";
    head.style.backgroundPosition = (col * 50) + "% " + (row * 50) + "%";
    head.style.transform = "scaleX(" + flip + ") rotate(" + tilt.toFixed(1) + "deg)";
    f.appendChild(stem); f.appendChild(head);
    f._H = H;
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
    layer.appendChild(dim);
    var bx = o.cx, by = o.cy + 0.44 * o.ry, hw = 0.82 * o.rx, hh = 0.34 * o.ry;
    if (!n) {
      layer.appendChild(el("div", { class: "orb-hint", style: "left:" + o.cx + "px;top:" + (o.cy + 0.2 * o.ry) + "px", text: "第一朵花，等著被種下" }));
      addFront(layer, o);
      return;
    }
    var hF = Math.max(o.ry * 0.34, Math.min(o.ry * 0.6, o.ry * 0.6 * Math.sqrt(10 / Math.max(n, 10))));
    var S0 = o.ry * 0.4 * Math.max(0.62, Math.min(1, Math.sqrt(14 / Math.max(n, 14))));
    var M = 40, items = [], bloomIdx = 0, seedOff = owner && partner && owner.id === partner.id ? 500 : 0;
    list.forEach(function (d, i) {
      var k = i % M, wrap = Math.floor(i / M);
      var r = Math.sqrt((k + 0.5) / M) * (wrap ? 0.92 : 1), a = i * 2.39996 + wrap * 0.7;
      items.push({ i: i, d: d, x: bx + Math.cos(a) * hw * r + (seeded(i + 90) - 0.5) * hF * 0.5, y: by + Math.sin(a) * hh * r + wrap * 3 + (seeded(i + 91) - 0.5) * hF * 0.3 });
    });
    items.sort(function (a, b) { return a.y - b.y; });
    var color = owner && owner.color === "blue" ? "blue" : "red";
    items.forEach(function (it) {
      var isNew = !!(fresh && fresh[it.d.id]);
      var dp = Math.max(0, Math.min(1, (it.y - (by - hh)) / (2 * hh)));
      var S = S0 * (0.86 + 0.28 * dp);
      var f = photoFlower(it.i + seedOff, isNew, S, ATLAS[it.d.kind === "black" ? "black" : color]);
      if (isNew) { f.style.animationDelay = (bloomIdx++ * 0.25) + "s"; animated[it.d.id] = 1; }
      f.style.opacity = (0.82 + 0.18 * dp).toFixed(2);
      f.style.left = (it.x - S / 2) + "px"; f.style.top = (it.y - f._H) + "px";
      (function (doc, nth, node) {
        node.addEventListener("click", function () { node.classList.add("picked"); setTimeout(function () { node.classList.remove("picked"); }, 900); openEntry(doc, nth); });
      })(it.d, it.i + 1, f);
      layer.appendChild(f);
    });
    addFront(layer, o);
  }
  // 前排青苔遮罩：花長在青苔裡，而不是貼在畫面上
  function addFront(layer, o) {
    var img = el("img", { class: "orb-front", src: ASSET.front, alt: "", "aria-hidden": "true" });
    img.style.left = (o.cx - o.rx) + "px"; img.style.top = (o.cy - o.ry) + "px";
    img.style.width = (o.rx * 2) + "px"; img.style.height = (o.ry * 2) + "px";
    layer.appendChild(img);
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
      sb.from("cg_dates").select("*").eq("couple_id", me.couple_id).order("day")
    ]);
    res.forEach(function (r) { if (r.error) throw r.error; });
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
    }).sort(function (a, b) { return a.ts - b.ts; });
  }
  function taskToday(t) {
    var d = today();
    return entries.filter(function (e) { return e.task_id === t.id && e.day === d && e.status !== "rejected"; });
  }
  function reqsToday() { var d = today(); return entries.filter(function (e) { return e.kind === "request" && e.owner === me.id && e.day === d; }); }
  function viewOwner() { return view === "me" ? me : partner; }
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
  function giveFlower(reason) { act(function () { return insertEntry({ owner: partner.id, kind: "gift", status: "confirmed", note: reason }); }, "送出了，" + nick(partner) + "的玻璃球長出一朵"); }
  function giveBlack(reason) { act(function () { return insertEntry({ owner: partner.id, kind: "black", status: "confirmed", note: reason }); }, "已給" + nick(partner) + "一朵小黑花"); }
  function confirmEntry(e, reply) { act(function () { return updateEntry(e, { status: "confirmed", reply: reply || "", ts: Date.now() }); }, "已確認，" + nick(partner) + "的玻璃球長出一朵"); }
  function rejectEntry(e, reply) { act(function () { return updateEntry(e, { status: "rejected", reply: reply || "" }); }, "已退回"); }
  function appealBlack(e, text) { act(function () { return updateEntry(e, { status: "appeal", reply: text }); }, "已送出申訴，等" + nick(partner) + "決定"); }
  function decideAppeal(e, revoke) { act(function () { return updateEntry(e, { status: revoke ? "revoked" : "confirmed" }); }, revoke ? "已撤銷這朵小黑花" : "已駁回申訴"); }
  function redeemBlack(e) {
    if (garden(me).count < REDEEM_COST) { toast("花不夠 " + REDEEM_COST + " 朵，還不能贖回"); return; }
    act(function () { return updateEntry(e, { status: "redeemed" }); }, "用 " + REDEEM_COST + " 朵花換掉了一朵小黑花");
  }

  // ---------- 面板：花、待處理、紀錄 ----------
  function openEntry(e, nth) {
    var by = byId(e.created_by), owner = byId(e.owner);
    var kids = [el("h2", { text: (e.kind === "black" ? "小黑花" : "第 " + nth + " 朵") + "・" + shortDate(e.day) + " " + taskName(e) })];
    if (e.note) kids.push(el("div", { class: "msgcard" }, [el("small", { text: nick(by) }), el("p", { text: e.note })]));
    if (e.reply) kids.push(el("div", { class: "msgcard" }, [el("small", { text: e.kind === "black" ? nick(owner) + "的申訴" : nick(e.created_by === me.id ? partner : me) }), el("p", { text: e.reply })]));
    if (!e.note && !e.reply) kids.push(el("p", { class: "legend", text: "這朵花沒有留言，但它記得那天的事。" }));
    if (e.kind === "black") {
      if (e.status === "appeal") kids.push(el("p", { class: "legend", text: "申訴中。" }));
      kids.push(el("div", { class: "row" }, blackActions(e)));
    }
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
  }
  function blackActions(e) {
    var btns = [];
    if (e.owner === me.id && e.status === "confirmed") {
      if (!e.reply) btns.push(el("button", { class: "btn", text: "申訴", onclick: function () { openInput("申訴這朵小黑花", "寫下你的理由（只能申訴一次）", "送出申訴", function (v) { appealBlack(e, v); }, true); } }));
      btns.push(el("button", { class: "btn primary", text: "用 " + REDEEM_COST + " 朵花贖回", onclick: function () {
        var c = garden(me).count;
        if (c < REDEEM_COST) { toast("花不夠 " + REDEEM_COST + " 朵，還不能贖回"); return; }
        confirmPanel("用 " + REDEEM_COST + " 朵花換掉它？", "你現在有 " + c + " 朵花，換掉後剩 " + (c - REDEEM_COST) + " 朵。最舊的幾朵會離開玻璃球，紀錄還留著。", "換掉", function () { redeemBlack(e); });
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
  function openRecords() {
    var owner = viewOwner();
    var list = entries.filter(function (e) { return owner && e.owner === owner.id; }).slice(0, 80);
    var log = el("ul", { class: "log" });
    if (!list.length) log.appendChild(el("li", {}, [el("span", { class: "when" }), el("span", { class: "what", text: "還沒有紀錄。" })]));
    var tagText = { pending: "等確認", rejected: "已退回", appeal: "申訴中", revoked: "已撤銷", redeemed: "已贖回" };
    list.forEach(function (e) {
      var t = tagText[e.status];
      var tag = t ? el("span", { class: "tag" + (e.status === "pending" || e.status === "appeal" ? "" : " no"), text: t }) : null;
      log.appendChild(el("li", {}, [el("span", { class: "when", text: shortDate(e.day) }), el("div", { class: "what" }, [
        el("div", {}, [el("b", { text: taskName(e) }), tag]),
        e.note ? el("p", { class: "note", text: nick(byId(e.created_by)) + "：" + e.note }) : null,
        e.reply ? el("p", { class: "reply", text: (e.kind === "black" ? nick(byId(e.owner)) + "（申訴）" : nick(e.created_by === me.id ? partner : me)) + "：" + e.reply }) : null
      ])]));
    });
    openPanel([el("h2", { text: nick(owner) + "的紀錄" }), log, el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })])]);
  }
  function openBlacks() {
    var list = garden(me).blacks.slice().reverse();
    var kids = [el("h2", { text: "我的小黑花 " + list.length + " 朵" })];
    if (!list.length) kids.push(el("p", { class: "legend", text: "目前沒有小黑花，很乖。" }));
    list.forEach(function (e) {
      kids.push(el("div", { class: "pitem black" }, [
        el("div", { class: "who", text: shortDate(e.day) + (e.status === "appeal" ? "・申訴中" : "") }),
        el("p", { class: "quote", text: nick(partner) + "：" + e.note }),
        el("div", { class: "row" }, blackActions(e))
      ]));
    });
    kids.push(el("div", { class: "row" }, [el("button", { class: "btn ghost", text: "關閉", onclick: closeSheet })]));
    openPanel(kids);
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
      el("p", { class: "legend", style: "font-size:15px;color:var(--ink-soft)", text: "你的玻璃球裡已經有 " + ms + " 朵花了。" }),
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
    var title = el("input", { type: "text", id: "date-title", placeholder: "例如：她的生日、交往紀念日", maxlength: "40" });
    var day = el("input", { type: "date", id: "date-day" });
    var yearly = el("input", { type: "checkbox", id: "date-yearly", checked: "" });
    openPanel([
      el("h2", { text: "我們" }),
      el("label", { class: "field" }, [el("span", { text: "在一起的日子" }), started]),
      el("label", { class: "field" }, [el("span", { text: "認識的日子" }), met]),
      el("label", { class: "field" }, [el("span", { text: "下次見面" }), meet]),
      el("div", { class: "row" }, [el("button", { class: "btn primary", text: "儲存", onclick: function () {
        var patch = { started_on: started.value || null, met_on: met.value || null, next_meet: meet.value || null };
        closeSheet(); act(function () { return sb.from("cg_couples").update(patch).eq("id", couple.id); }, "已儲存");
      } })]),
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
    var colorSel = el("select", { id: "set-color" }, [el("option", { value: "red", text: "小紅花" }), el("option", { value: "blue", text: "小藍花" })]);
    colorSel.value = me.color || "red";
    var kids = [
      el("h2", { text: "設定" }),
      el("label", { class: "field" }, [el("span", { text: "我的暱稱" }), nickIn]),
      el("label", { class: "field" }, [el("span", { text: "我在哪個時區" }), tzSel]),
      el("label", { class: "field" }, [el("span", { text: "我的花" }), colorSel]),
      el("div", { class: "row" }, [el("button", { class: "btn primary", text: "儲存", onclick: function () {
        var patch = { nickname: nickIn.value.trim() || me.nickname, tz: tzSel.value, color: colorSel.value };
        closeSheet(); act(function () { return sb.from("cg_profiles").update(patch).eq("id", me.id); }, "已儲存");
      } })]),
      el("h3", { text: "每日任務" })
    ];
    [me, partner].forEach(function (p) {
      if (!p) return;
      var mineTasks = tasks.filter(function (t) { return t.doer === p.id && t.active; });
      kids.push(el("p", { class: "legend", text: nick(p) + "要做的（" + nick(p === me ? partner : me) + "確認）" }));
      if (!mineTasks.length) kids.push(el("p", { class: "legend", text: "還沒有任務。" }));
      mineTasks.forEach(function (t) {
        kids.push(el("div", { class: "taskrow" }, [
          el("span", { text: t.title + "・一天 " + t.per_day + " 次" }),
          el("button", { class: "btn ghost", style: "min-height:32px;padding:4px 10px;font-size:13px", text: "移除", onclick: function () {
            confirmPanel("移除「" + t.title + "」？", "已經得到的花會保留。", "移除", function () { act(function () { return sb.from("cg_tasks").update({ active: false }).eq("id", t.id); }, "已移除"); });
          } })
        ]));
      });
      kids.push(el("button", { class: "btn", text: "幫" + nick(p) + "新增任務", onclick: function () { openAddTask(p); } }));
    });
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
      el("p", { class: "eyebrow", text: "LITTLE RED FLOWER" }),
      el("h1", { class: "auth-title", text: "情侶花園" }),
      el("p", { class: "legend", text: "把彼此照顧好，玻璃球裡就會長出花。" }),
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
      el("div", { class: "brand" }, ["Little Red Flower", el("small", { text: nick(me) })]),
      el("div", { class: "topr" }, [
        el("span", { class: "conn", text: connText }),
        needTiltPermission() && !lsGet("cg-tilt") ? el("button", { class: "tiltbtn", onclick: askTilt }, ["✦ 開啟景深"]) : null
      ])
    ]));

    // 天數、見面倒數、兩地時間
    // 天數卡片：見面倒數、在一起、認識（最多 3 張）
    var now = new Date(), stats = [];
    if (couple.next_meet) { var left = daysBetween(now, parseDay(couple.next_meet)); if (left >= 0) stats.push({ n: left === 0 ? "今天" : String(left), label: left === 0 ? "見面" : "見面倒數", cls: " meet" }); }
    if (couple.started_on) stats.push({ n: String(daysBetween(parseDay(couple.started_on), now) + 1), label: "在一起・天" });
    if (couple.met_on) stats.push({ n: String(daysBetween(parseDay(couple.met_on), now) + 1), label: "認識・天" });
    var statRow = stats.length
      ? el("div", { class: "stats" }, stats.slice(0, 3).map(function (x) { return el("button", { class: "stat" + (x.cls || ""), onclick: openUs }, [el("b", { text: x.n }), el("span", { text: x.label })]); }))
      : el("div", { class: "stats" }, [el("button", { class: "stat setup", onclick: openUs }, [el("b", { text: "＋" }), el("span", { text: "設定紀念日" })])]);
    var tzLine = partner && partner.tz && partner.tz !== me.tz ? nick(partner) + "在" + tzName(partner.tz) + " " + localTime(partner.tz) : "";

    var tabs = el("div", { class: "gtabs", role: "tablist" }, [["me", me], ["partner", partner]].map(function (pair) {
      var key = pair[0], p = pair[1];
      var dot = key === "partner" && pend.length ? el("span", { class: "gdot amber" }) : null;
      return el("button", { class: "gtab" + (view === key ? " on" : "") + (p && p.color === "blue" ? " blue" : ""), role: "tab", "aria-selected": view === key ? "true" : "false", disabled: p ? false : "", onclick: function () { switchView(key); } }, [p ? nick(p) : "等待加入", dot]);
    }));
    var unit = owner && owner.color === "blue" ? "朵小藍花" : "朵小紅花";
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
      statRow,
      el("div", { class: "chips" }, [
        el("span", {}, ["本週 ", el("b", { text: String(g.week) }), " 朵"]),
        el("span", { class: "blk" }, ["小黑花 ", el("b", { text: String(g.blacks.length) }), " 朵"])
      ]),
      tzLine ? el("p", { class: "caption", text: tzLine }) : null,
      !partner ? el("p", { class: "caption", text: "邀請碼 " + couple.invite_code + "，傳給對方就能配對" }) : null
    ]));

    // 工具列第一頁：被看的這個人的任務
    var page1 = el("div", { class: "page" });
    var ownTasks = tasks.filter(function (t) { return owner && t.doer === owner.id && t.active; });
    if (!ownTasks.length) {
      page1.appendChild(el("button", { class: "mbtn wide", onclick: function () { if (owner) openAddTask(owner); } }, [el("span", { class: "name", text: "新增任務" }), el("span", { class: "state", text: mineView ? "設定你每天要做的事" : "幫" + nick(partner) + "設定任務" })]));
    }
    ownTasks.slice(0, 4).forEach(function (t) {
      var got = taskToday(t), done = got.filter(function (e) { return e.status === "confirmed"; }).length, wait = got.filter(function (e) { return e.status === "pending"; }).length;
      var full = got.length >= t.per_day;
      var cls = "mbtn" + (full ? (wait ? " pending" : " done") : "");
      var state = full ? (wait ? "等確認" : "完成") : (t.per_day > 1 ? (done + wait) + "/" + t.per_day : (mineView ? "我做到了" : "代記"));
      var b = el("button", { class: cls, onclick: function () {
        if (full) return;
        if (mineView) openInput("完成「" + t.title + "」了嗎？", "想跟" + nick(partner) + "說什麼？（可留空）", "送出", function (v) { claimTask(t, v); });
        else openInput("幫" + nick(partner) + "記上「" + t.title + "」", "備註（可留空）", "記上一朵", function (v) { claimTask(t, v); });
      } }, [el("span", { class: "name", text: t.title }), el("span", { class: "state", text: state })]);
      if (full) b.setAttribute("disabled", "");
      page1.appendChild(b);
    });

    // 第二頁：互動
    var ico = function (d) { return svg("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, [svg("path", { d: d })]); };
    var page2 = el("div", { class: "page" });
    page2.appendChild(el("button", { class: "tab", onclick: openPending }, [ico("M5 12.5l4.5 4.5L19 7.5"), "待處理", pend.length ? el("span", { class: "badge", text: String(pend.length) }) : null]));
    if (mineView) {
      var left2 = REQ_PER_DAY - reqsToday().length;
      page2.appendChild(el("button", { class: "tab", onclick: function () {
        if (!partner) { toast("等對方加入後才能申請"); return; }
        if (left2 <= 0) { toast("今天已經申請 " + REQ_PER_DAY + " 次了，明天再來"); return; }
        openInput("申請一朵花", "寫下想讓" + nick(partner) + "知道的事", "送出申請", requestFlower, true);
      } }, [ico("M12 3.5l2.4 5.3 5.6.6-4.2 3.8 1.2 5.6L12 15.9 7 18.8l1.2-5.6L4 9.4l5.6-.6z"), "申請一朵"]));
      page2.appendChild(el("button", { class: "tab", onclick: openBlacks }, [ico("M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16"), "小黑花"]));
    } else {
      page2.appendChild(el("button", { class: "tab", onclick: function () { openInput("送" + nick(partner) + "一朵花", "原因，例如：謝謝你今天陪我", "送出", giveFlower, true); } }, [ico("M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"), "送一朵"]));
      page2.appendChild(el("button", { class: "tab", onclick: function () { openInput("給" + nick(partner) + "一朵小黑花", "原因，例如：又熬夜不睡", "給", giveBlack, true); } }, [ico("M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16"), "給小黑花"]));
    }
    page2.appendChild(el("button", { class: "tab", onclick: openRecords }, [ico("M8 6.5h11M8 12h11M8 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"), "紀錄"]));

    // 第三頁：我們、設定
    var page3 = el("div", { class: "page" });
    page3.appendChild(el("button", { class: "tab", onclick: openUs }, [ico("M7 3v3M17 3v3M4 8h16M5 5h14v15H5z"), "紀念日"]));
    page3.appendChild(el("button", { class: "tab", onclick: openSettings }, [ico("M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M4 12h2M18 12h2M12 4v2M12 18v2"), "設定"]));

    var pages = el("div", { class: "pages" }, [page1, page2, page3]);
    var dots = el("div", { class: "dots2" });
    var dotEls = [0, 1, 2].map(function (n) {
      var d = el("button", { class: "dot2" + (n === dockPage ? " on" : "") + (n === 1 && pend.length ? " alert" : ""), "aria-label": ["任務", "互動", "我們"][n], onclick: function () { pages.scrollTo({ left: n * pages.clientWidth, behavior: "smooth" }); } });
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
    var base = (o.cy - o.ry) + o.ry * 0.42;                       // 數字底部落在球裡 42% 的位置
    var fs = Math.max(64, Math.min(window.innerWidth * 0.5, 300, (base - hb - 8) / 0.86));
    num.style.fontSize = fs + "px";
    num.style.left = o.cx + "px";
    num.style.top = (base - fs * 0.86) + "px";
    var w = num.getBoundingClientRect().width || fs;
    unit.style.left = (o.cx + w / 2 + 6) + "px";
    unit.style.top = (base - fs * 0.86 + fs * 0.12) + "px";
    var m = "radial-gradient(ellipse " + (o.rx * 0.985) + "px " + (o.ry * 0.985) + "px at " + o.cx + "px " + o.cy + "px, rgba(0,0,0,.14) 0, rgba(0,0,0,.14) 97%, #000 100%)";
    b.style.webkitMaskImage = m; b.style.maskImage = m;
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
    v.src = ASSET.video;
    function showStill() { stage.classList.add("still-on"); }
    v.addEventListener("ended", showStill);
    v.addEventListener("playing", function () { stage.classList.remove("still-on"); });
    v.addEventListener("error", showStill);
    var p = v.play(); if (p && p.catch) p.catch(showStill);
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
