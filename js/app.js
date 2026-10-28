/* =========================================================
 * 气功学堂 · 应用主逻辑（路由 / 渲染 / 跟练状态机 / 打卡）
 * 依赖：window.QG_DATA, window.QGStore, window.QG3D（可缺省降级）
 * ========================================================= */
(function (global) {
  'use strict';

  /* ---- 全局错误兜底：不白屏不静默，轻提示可继续 ---- */
  var errSeen = {}, errN = 0;
  function toastError(what, detail) {
    if (detail !== undefined && global.console) global.console[what === 'unhandledrejection' ? 'warn' : 'error'](detail);
    var key = what + ':' + (detail && detail.message ? detail.message : String(detail || what));
    if (errSeen[key]) return; /* 同类只报一次，不刷屏 */
    errSeen[key] = 1; errN++;
    if (errN > 3) return; /* 错误过多说明环境异常，停止打扰 */
    var bar = document.createElement('div');
    bar.className = 'sw-update err-toast';
    bar.textContent = '☯️ 页面有个小地方没走通，不影响继续练功；若反复出现可刷新重试。';
    document.body.appendChild(bar);
    setTimeout(function () { bar.remove(); }, 6000);
  }
  global.addEventListener('error', function (e) { toastError('error', e.error || e.message); });
  global.addEventListener('unhandledrejection', function (e) { toastError('unhandledrejection', e.reason); });

  var DATA = global.QG_DATA;
  var S = global.QGStore;
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var moveTotal = 0, keyTotal = 0;
  DATA.sets.forEach(function (st) {
    moveTotal += st.moves.length;
    st.moves.forEach(function (m) { keyTotal += m.keys.length; });
  });

  /* ================= 3D 桥接（CDN 失败自动降级） ================= */
  function q3d() { return global.QG3D && global.QG3D.setPose ? global.QG3D : null; }
  function pose3d(p, spd) { var q = q3d(); if (q) q.setPose(p, spd); }
  function snap3d(p) { var q = q3d(); if (q) q.snap(p); }
  function breath3d(ph) { var q = q3d(); if (q && q.setBreath) q.setBreath(ph); }
  function float3d(txt) { var q = q3d(); if (q && q.floatText) q.floatText(txt); }

  function boot3D(tries) {
    var stage = $('#stage');
    if (global.QG3D && typeof global.QG3D.init === 'function' && !global.QG3D.ready) {
      try {
        global.QG3D.init(stage);
        var ld = $('#stageLoading');
        if (ld) ld.style.display = 'none';
        applyMood();
        idleOn();
        return;
      } catch (e) { console.error('[QG] 3D 启动失败', e); }
    }
    if (global.QG3D && global.QG3D.failed) {
      var ldf = $('#stageLoading');
      if (ldf) ldf.textContent = '3D 引擎未能加载（可能离线），图文跟练不受影响';
      return;
    }
    if (tries > 0) setTimeout(function () { boot3D(tries - 1); }, 400);
  }
  document.addEventListener('qg3d:failed', function () {
    var ld = $('#stageLoading');
    if (ld) ld.textContent = '3D 引擎未能加载（可能离线），图文跟练不受影响';
  });

  /* ---------- 待机巡游：首页/浏览时人形自然呼吸 ---------- */
  var idleTimer = null, idleFlip = false;
  var idlePoses = [
    { lh: 3, lk: 4, la: 8, lfl: 10, lb: 50, ra: 8, rfl: 10, rb: 50 },
    { lh: 4, lk: 6, la: 9, lfl: 12, lb: 55, ra: 9, rfl: 12, rb: 55, tp: 1.5, y: 0.004 }
  ];
  function idleOn() {
    if (idleTimer) return;
    idleTimer = setInterval(function () {
      if (Train.active || viewingMove) return; /* 跟练/定格时不抢控制权 */
      idleFlip = !idleFlip;
      pose3d(idlePoses[idleFlip ? 1 : 0], 0.8);
      breath3d(idleFlip ? 'in' : 'out');
    }, 4200);
    pose3d(idlePoses[0], 1);
  }

  /* ================= 语音口令 ================= */
  var voicesReady = false;
  if ('speechSynthesis' in global) {
    speechSynthesis.onvoiceschanged = function () { voicesReady = true; };
  }
  function mkUtter(text) {
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = Math.min(1.3, Math.max(0.7, 0.95 * S.tempo())); /* 快节奏口令同步变，钳制在自然区间 */
    u.pitch = 0.92;
    var vs = speechSynthesis.getVoices();
    for (var i = 0; i < vs.length; i++) {
      if (/zh|Chinese|中文/i.test(vs[i].lang)) { u.voice = vs[i]; break; }
    }
    return u;
  }
  function speak(text) {
    if (!S.soundOn() || !('speechSynthesis' in global) || !text) return;
    try {
      if (rd.on) rdStop(); /* 口令要开口，先把朗读收了，不留挂着的按钮 */
      speechSynthesis.cancel();
      speechSynthesis.speak(mkUtter(text));
    } catch (e) { /* 忽略 */ }
  }
  /* ---- 知识全篇朗读：逐段入队，一念一念接着读 ---- */
  var rd = { on: false, id: '', btn: null, keep: 0, cur: 0, tot: 0, prog: null, el: null };
  function paintRdBtn() {
    var b = rd.btn;
    if (!b) return;
    b.className = 'btn ghost sm rd-btn' + (rd.on ? ' on' : '');
    b.textContent = rd.on ? '⏹ 停止朗读' : '🔊 朗读全篇';
  }
  /* 读到第几段浮在钮边，段落在卡里同步点亮：耳朵跟着走，眼睛也知道走到哪 */
  function paintRdProg(p) {
    if (!p) return;
    if (rd.on && rd.cur) { p.textContent = '🔊 ' + rd.cur + '/' + rd.tot; p.classList.remove('hidden'); }
    else { p.classList.add('hidden'); p.textContent = ''; }
  }
  function rdHop(p, i) {
    rd.cur = i + 1;
    paintRdProg(rd.prog);
    var ps = p.querySelectorAll('.kb > p');
    for (var k = 0; k < ps.length; k++) ps[k].classList.toggle('rd-now', k === i - 1);
  }
  function rdTail(p) {
    var ps = p.querySelectorAll('.kb > p');
    for (var k = 0; k < ps.length; k++) ps[k].classList.remove('rd-now');
  }
  function rdStop() {
    if (rd.keep) { clearInterval(rd.keep); rd.keep = 0; }
    rd.on = false; rd.id = ''; rd.cur = 0;
    if (rd.el) rdTail(rd.el);
    paintRdProg(rd.prog);
    try { if (global.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
    paintRdBtn();
  }
  function rdStart(kn, btn) {
    if (rd.on && rd.id === kn.id) { rdStop(); return; }
    if (!voiceOk() || !S.soundOn()) { showVoiceHint(); return; }
    rdStop(); /* 换篇先收干净 */
    rd.btn = btn;
    var parts = [kn.title + '。'].concat(kn.points || []).concat(['本篇朗读完毕，如理如法。']);
    rd.on = true; rd.id = kn.id; rd.tot = parts.length; rd.cur = 0;
    /* 进度浮字与段落高亮都挂在朗读钮所在的那张卡上 */
    var foot = btn.closest('.kb-foot');
    rd.prog = foot && foot._rdProg ? foot._rdProg : null;
    rd.el = btn.closest('.know-card');
    paintRdBtn();
    paintRdProg(rd.prog);
    try {
      speechSynthesis.cancel();
      parts.forEach(function (t, i) {
        var u = mkUtter(t);
        u.onstart = function () { if (rd.on && rd.id === kn.id && rd.el) rdHop(rd.el, i); };
        if (i === parts.length - 1) {
          var fin = function () {
            if (rd.id === kn.id) {
              rd.on = false; rd.id = ''; rd.cur = 0;
              if (rd.el) rdTail(rd.el);
              paintRdProg(rd.prog); paintRdBtn();
            }
          };
          u.onend = fin; u.onerror = fin;
        }
        speechSynthesis.speak(u);
      });
      /* 部分 Chromium 长句会自锁：定期探一下，卡住就推一把 */
      rd.keep = setInterval(function () {
        if (!rd.on) return;
        if (!('speechSynthesis' in global)) { rdStop(); return; }
        if (speechSynthesis.speaking && !speechSynthesis.paused) return;
        if (!speechSynthesis.speaking) { rdStop(); } /* 队已空而末句未报 onend，收尾不挂钮 */
        else speechSynthesis.resume();
      }, 9000);
    } catch (e) {
      rdStop();
      if (global.console) global.console.warn('朗读失败', e);
    }
  }
  function syncSoundBtn() {
    var b = $('#soundBtn');
    b.textContent = S.soundOn() ? '🔊 口令' : '🔇 口令';
    b.classList.toggle('off', !S.soundOn());
    if (S.soundOn() && !voiceOk()) showVoiceHint();
  }
  /* 语音降级：真实发声失败时只提示一次，文字口令仍照常上屏；voiceOk 每次现判，防运行时引擎消失误判 */
  var voiceOk = function () { return !!global.speechSynthesis; }, voiceHintShown = false;
  function showVoiceHint() {
    if (voiceHintShown) return;
    voiceHintShown = true;
    var bar = document.createElement('div');
    bar.className = 'sw-update';
    bar.textContent = '🔇 此浏览器没有可用的中文语音引擎，已降级为纯文字口令，跟练不受影响';
    document.body.appendChild(bar);
    setTimeout(function () { bar.remove(); }, 8000);
  }
  function syncTempoBtn() {
    var b = $('#tempoBtn');
    if (!b) return;
    var t = S.tempo();
    b.textContent = t < 1 ? '🚶 慢速' : t > 1 ? '🏄 快速' : '🧘 常速';
    b.classList.toggle('off', false);
  }

  /* ================= 磬声音效（Web Audio 合成，无素材） ================= */
  var AC = null;
  function ac() {
    if (!AC) {
      try { AC = new (global.AudioContext || global.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  /* 五音对应五行：宫商角徵羽，随式轮换 */
  var PENTA = [261.63, 293.66, 329.63, 392.0, 440.0];
  function chime(freq, vol, decay) {
    var c = ac();
    if (!c || !S.soundOn()) return;
    try {
      var t = c.currentTime;
      [[1, 1], [2.01, 0.32], [2.76, 0.12]].forEach(function (part) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.value = freq * part[0];
        g.gain.setValueAtTime((vol || 0.16) * part[1], t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || 1.4));
        o.connect(g); g.connect(c.destination);
        o.start(t); o.stop(t + (decay || 1.4) + 0.05);
      });
    } catch (e) { /* 音频不可用则静默 */ }
  }

  /* ================= 路由 ================= */
  var lastPage = 'home';
  function showPage(name) {
    rdStop(); /* 换页先收朗读，不留个按钮在那空响 */
    if (name !== 'train' && Train.active) Train.stop(true);
    $$('.page').forEach(function (p) { p.classList.remove('on'); });
    $('#page-' + name).classList.add('on');
    $$('#nav button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.go === (name === 'done' || name === 'train' ? '' : name));
    });
    if (name !== 'checkin' && name !== 'home' && name !== 'sets') lastPage = name === 'train' || name === 'done' ? lastPage : name;
    if (name === 'checkin') renderCheckin();
    if (name === 'home') renderHome();
    if (name === 'course') renderCourse();
    /* 已处于功法/单式详情时不重渲染列表，避免把详情重新隐藏 */
    if (name === 'sets' && $('#setDetail').classList.contains('hidden') && $('#moveDetail').classList.contains('hidden')) renderSetList();
    if (name !== 'train') { viewingMove = null; }
    window.scrollTo({ top: 0 });
  }
  function goBack() { showPage(lastPage || 'home'); }

  /* ================= 首页 ================= */
  function dayOfYear() {
    var now = new Date();
    return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  }
  /* 按当前节奏折算的预计分钟数（慢速时间更长） */
  function estMin(set) {
    return Math.max(1, Math.round(set.durationMin / (S.tempo() || 1)));
  }
  /* ================= 时段宜练 ================= */
  /* 早升发、午养长、晚收敛、夜安眠：推荐按钟点筛，不随便推 */
  function slotLabel(h) {
    return h >= 5 && h < 11 ? '早' : h >= 11 && h < 17 ? '午' : h >= 17 && h < 23 ? '晚' : '夜';
  }
  var SLOT_TXT = { '早': '☀️ 早晨宜升发', '午': '🌤 日中宜养长', '晚': '🌙 入夜宜收敛', '夜': '⭐ 夜深宜安眠' };
  var SLOT_ICON = { '早': '☀️', '午': '🌤', '晚': '🌙', '夜': '⭐' }; /* 最近跟练列表的时段角标，与 SLOT_TXT 同一套图标 */
  var pickIdx = -1; /* 「换一套」的手动偏移；-1 表示按日期确定性轮 */
  var labLock = ''; /* 手动跳去别的时段时锁住那个 lab，免得重渲染又跳回来 */
  var lockHour = -1; /* 锁定发生在几点：真跨了时段就自动撒手，不跟时钟拧着来 */
  function curSlot() {
    var nowH = new Date().getHours();
    if (labLock && lockHour >= 0 && slotLabel(nowH) !== slotLabel(lockHour)) {
      labLock = ''; pickIdx = -1; lockHour = -1; /* 钟点已换，交还给时段自己 */
    }
    var lab = labLock || slotLabel(nowH);
    var withTag = DATA.sets.filter(function (s) { return (s.moods || []).indexOf(lab) >= 0; });
    var cand = withTag.length ? withTag : DATA.sets.slice(); /* 该时段没标注就退回全量 */
    return { lab: lab, cand: cand };
  }
  function pickSet(cs) {
    var cand = cs.cand;
    if (pickIdx < 0 || pickIdx >= cand.length) return cand[dayOfYear() % cand.length];
    return cand[pickIdx];
  }
  function renderHome() {
    $('#statMoves').textContent = moveTotal + ' 个动作';
    $('#statKeys').textContent = keyTotal + ' 组 3D 姿势';
    /* 自有累计 chip：一练过就把“你的功夫”提到首屏 */
    var self = $('#statSelf');
    if (self) {
      if (S.totalSess()) {
        self.classList.remove('hidden');
        var _calmAll = S.records().filter(function (r) { return r.set === 'calm'; }).length;
        var _calmMin = Math.round(S.records().reduce(function (a, r) { return a + (r.set === 'calm' ? (r.sec || 0) : 0); }, 0) / 60);
        var _learnedAll = DATA.sets.reduce(function (a, s) { return a + Math.min(S.learnedCount(s.id), s.moves.length); }, 0);
        var _wkSess = S.weekReport().sessions;
        var _monPre = S.todayStr().slice(0, 7);
        var _monSess = S.records().filter(function (r) { return r.d && r.d.slice(0, 7) === _monPre; }).length;
        var _setsTouched = {}; S.records().forEach(function (r) { if (r.set !== 'calm') _setsTouched[r.set] = 1; });
        var _touchedN = Object.keys(_setsTouched).length;
        self.innerHTML = '🌿 你已练 <b>' + S.totalSess() + '</b> 场 · 累计 <b>' + S.totalMin() + '</b> 分钟' + (_wkSess ? ' · 本周 <b>' + _wkSess + '</b> 场' : '') + (_monSess ? ' · 本月 <b>' + _monSess + '</b> 场' : '') + (S.streak() > 1 ? ' · 连续 <b>' + S.streak() + '</b> 天' : '') + (_learnedAll ? ' · 已学 <b>' + _learnedAll + '/' + moveTotal + '</b> 式' : '') + (_calmAll ? ' · 定息 <b>' + _calmAll + '</b> 次' + (_calmMin ? '（共 <b>' + _calmMin + '</b> 分）' : '') : '') + (S.readCount() ? ' · 明理 <b>' + S.readCount() + '</b> 篇' : '') + (_touchedN >= 2 ? ' · 涉猎 <b>' + _touchedN + '/' + DATA.sets.length + '</b> 套' : '') + (S.favIds().length ? ' · 收藏 <b>' + S.favIds().length + '</b> 套' : '');
      } else self.classList.add('hidden');
    }
    /* 今日习练推荐：先按时段筛，再按日期确定性轮换，不随机不骚扰 */
    var cs = curSlot();
    var cand = cs.cand, lab = cs.lab;
    var st = pickSet(cs);
    var recs = S.recordsOfDay(S.todayStr());
    /* 快捷版：今日推荐前 3 式，估算用时随节奏 */
    var quick = st.moves.slice(0, 3);
    var qSec = quick.reduce(function (a, m) { return a + m.keys.reduce(function (x, k) { return x + k.sec; }, 0); }, 0);
    var qMin = Math.max(1, Math.round(qSec / 60 / (S.tempo() || 1)));
    var allRec = S.records(), lastSet = null;
    for (var li = allRec.length - 1; li >= 0; li--) {
      lastSet = DATA.sets.find(function (s) { return s.id === allRec[li].set; });
      if (lastSet) break;
    }
    var _lc = S.learnedCount(st.id), _lt = st.moves.length;
    var _learnLine = (_lc > 0 && _lc < _lt) ? ' · 本套已学 <b>' + _lc + '/' + _lt + '</b> 式' : (_lc >= _lt && _lt ? ' · 本套 <b>' + _lt + '</b> 式已学满' : '');
    var _calmNudge = S.calmToday() ? '' : ' · 🍃 今日未定息，静一分钟也很养';
    var _stWkFrom = S.weekReport().rangeFrom;
    var _stWkN = S.records().filter(function (r) { return r.set === st.id && r.d >= _stWkFrom; }).length;
    var _stWkLine = _stWkN ? ' · 本套本周 <b>' + _stWkN + '</b> 场' : '';
    var _stMonPre = S.todayStr().slice(0, 7);
    var _stMonN = S.records().filter(function (r) { return r.set === st.id && r.d && r.d.slice(0, 7) === _stMonPre; }).length;
    var _stMonLine = (_stMonN && _stMonN !== _stWkN) ? ' · 本套本月 <b>' + _stMonN + '</b> 场' : '';
    var _stAllN = S.records().filter(function (r) { return r.set === st.id; }).length;
    var _stAllLine = _stAllN > _stWkN ? ' · 本套累计 <b>' + _stAllN + '</b> 场' : '';
    $('#todayCard').innerHTML =
      '<div class="tc-icon">' + st.icon + '<span class="tc-slot">' + lab + '</span></div>' +
      '<div class="tc-main"><div class="tc-title">' + SLOT_TXT[lab] + ' · ' + st.name + '：' + st.tagline + '</div>' +
      '<div class="tc-sub">' + (recs.length
        ? '今日已练 <b>' + recs.length + '</b> 次 · 连续 <b>' + S.streak() + '</b> 天，换个功法均衡调理？'
        : '今日未练 · 完整一套约 ' + estMin(st) + ' 分钟，练完自动点亮打卡') +
      _learnLine + _stWkLine + _stMonLine + _stAllLine + _calmNudge + ' · 此时段共 <b>' + cand.length + '</b> 套可选</div></div>' +
      '<div class="tc-btns">' +
      '<button class="btn primary" id="todayGo">▶ 立即跟练</button>' +
      '<button class="btn ghost sm" id="todayQuick" title="前三式快跟一遍，见好就收">⚡ 快捷版约 ' + qMin + ' 分钟</button>' +
      '<button class="btn ghost sm" id="todaySwap" title="此时段还有别的功法则换一套，否则去下一个时段宜练的">🔄 换一套</button>' +
      '<button class="btn ghost sm" id="todayReview" title="练完温一温：抽卡、难卡、错题、续读一处直达">🧠 复习台</button>' +
      '<button class="btn ghost sm" id="todayFav" title="收藏/取消收藏这套（与目录页星、首页常用同口径）">' + (S.isFav(st.id) ? '⭐ 已收藏' : '☆ 收藏这套') + '</button>' +
      (lastSet ? '<button class="btn ghost sm" id="todayResume" title="接着上次那套练整套">↩️ 接着练' + lastSet.name + '</button>' : '') +
      '</div>';
    $('#todayGo').addEventListener('click', function () { Train.start(st, st.moves, 'full'); });
    $('#todayFav').addEventListener('click', function () { S.toggleFav(st.id); renderHome(); });
    $('#todayQuick').addEventListener('click', function () { Train.start(st, quick, 'custom'); });
    $('#todayReview').addEventListener('click', reviewOpen);
    $('#todaySwap').addEventListener('click', function () {
      var cur = cand.findIndex(function (s) { return s.id === st.id; });
      if (cand.length > 1) {
        /* 本时段还有别的：就地轮下一套，lab 不变 */
        pickIdx = (cur + 1) % cand.length;
      } else {
        /* 本时段只一套：往后找下一个“确实另有别的套子”的时段，否则跳过去也是原地踢空 */
        var order = ['早', '午', '晚', '夜'];
        var li = order.indexOf(lab), nxt = '', alt = null;
        for (var s2 = 1; s2 <= 4; s2++) {
          var l2 = order[(li + s2) % 4];
          var pool = DATA.sets.filter(function (x) { return (x.moods || []).indexOf(l2) >= 0; });
          if (pool.some(function (x) { return x.id !== st.id; })) { nxt = l2; alt = pool; break; }
        }
        if (!alt) { /* 全天翻遍都只同一套：不演空跳，明说就好 */
          float3d('此时段就这一套，练熟了就等时辰换');
          return;
        }
        var ai = alt.findIndex(function (x) { return x.id === st.id; });
        labLock = nxt;
        lockHour = new Date().getHours();
        pickIdx = ai < 0 ? 0 : (ai + 1) % alt.length;
        float3d(SLOT_TXT[nxt].slice(2) + '·' + alt[pickIdx].name);
      }
      renderHome();
    });
    if (lastSet) $('#todayResume').addEventListener('click', function () { Train.start(lastSet, lastSet.moves, 'full'); });
    var box = $('#homeSets');
    box.innerHTML = '';
    DATA.sets.forEach(function (st2) { box.appendChild(setCard(st2, false)); });
    renderFavs();
    renderPlan();
    renderFavMoves();
    paintGapBanner();
  }

  /* ---- 常练式集合：星标过的式在首页成一排，一点即单式开练 ---- */
  function renderFavMoves() {
    var sec = $('#favMoves');
    if (!sec) return;
    var keys = S.moveFavKeys();
    /* 按功法目录序排列（非 id 字符串序，免 yjj-10 排 yjj-2 前），不被对象键序牵着走 */
    keys.sort(function (a, b) {
      if (a.set !== b.set) return a.set < b.set ? -1 : 1;
      var st0 = DATA.sets.find(function (s) { return s.id === a.set; });
      var ia = st0 ? st0.moves.findIndex(function (m) { return m.id === a.move; }) : 0;
      var ib = st0 ? st0.moves.findIndex(function (m) { return m.id === b.move; }) : 0;
      return ia - ib;
    });
    sec.innerHTML = '';
    if (!keys.length) { sec.classList.add('hidden'); return; }
    var head = document.createElement('div');
    head.className = 'fm-head';
    head.textContent = '⭐ 我的常练式（点一下就直接练这式）';
    sec.appendChild(head);
    var row = document.createElement('div');
    row.className = 'fm-row';
    keys.forEach(function (k) {
      var st2 = DATA.sets.find(function (s) { return s.id === k.set; });
      var m = st2 && st2.moves.find(function (x) { return x.id === k.move; });
      if (!st2 || !m) return;
      var b = document.createElement('button');
      b.className = 'fm-chip';
      b.innerHTML = '▶ ' + m.name + '<small>' + st2.icon + ' ' + st2.name + '</small>';
      b.title = '跟练 ' + m.name + ' 单式';
      b.addEventListener('click', function () { Train.start(st2, [m], 'single'); });
      row.appendChild(b);
    });
    sec.appendChild(row);
    sec.classList.toggle('hidden', !row.children.length);
  }

  /* ---- 久未练功提醒：≥ 3 天没练露banner，关一下今天不再打扰 ---- */
  function paintGapBanner() {
    var el = $('#gapBanner');
    if (!el) return;
    var g = S.gapDays();
    var dismissed = false;
    try { dismissed = sessionStorage.getItem('qigong_gap_dismiss') === S.todayStr(); } catch (e) { /* 隐私模式退化为每次都提 */ }
    if (g === null || g < 3 || dismissed) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    var st = DATA.sets[dayOfYear() % DATA.sets.length];
    el.innerHTML = '<span class="gb-txt">🍂 已经 ' + g + ' 天没练功了，身体默默记着账——来一套' + st.name + '松松？</span>' +
      '<button class="btn primary sm" id="gapGo">▶ 这就开练</button>' +
      '<button class="btn ghost sm" id="gapX">今天先不打扰</button>';
    el.classList.remove('hidden');
    $('#gapGo').addEventListener('click', function () { Train.start(st, st.moves, 'full'); });
    $('#gapX').addEventListener('click', function () {
      try { sessionStorage.setItem('qigong_gap_dismiss', S.todayStr()); } catch (e) { }
      el.classList.add('hidden');
    });
  }

  /* ---- 收藏常用：有收藏才在首页露出 ---- */
  function renderFavs() {
    var sec = $('#favSection'), box = $('#favSets');
    if (!sec || !box) return;
    var ids = S.favIds();
    sec.classList.toggle('hidden', ids.length === 0);
    box.innerHTML = '';
    DATA.sets.forEach(function (st) {
      if (S.isFav(st.id)) box.appendChild(setCard(st, false));
    });
  }

  /* ---- 21 天入门挑战：报名后自动按真实打卡记录判定 ---- */
  function renderPlan() {
    var el = $('#planCard');
    if (!el) return;
    if (!S.planStatus()) {
      el.innerHTML =
        '<div class="plan-head"><span class="plan-icon">🏮</span>' +
        '<div><div class="plan-title">21 天入门挑战</div>' +
        '<div class="plan-sub">报名后每天至少完成一次跟练即自动点亮，21 天内集满即功成</div></div>' +
        '<button class="btn primary" id="planJoin">🏮 报名</button></div>';
      var jb = $('#planJoin');
      if (jb) jb.addEventListener('click', function () { S.joinPlan(); renderPlan(); });
      return;
    }
    var p = S.planInfo();
    var cells = p.grid.map(function (g, i) {
      var cls = g.has ? 'done' : (g.past ? 'miss' : 'todo');
      return '<span class="p-cell ' + cls + '" title="' + g.d + '">' + (g.has ? '✿' : (i + 1)) + '</span>';
    }).join('');
    var banner;
    if (p.success) banner = '<div class="plan-banner ok">🎉 挑战功成！四十九日而基础固，此后功夫自有境界</div>';
    else if (p.over) banner = '<div class="plan-banner fail">挑战窗口已结束（累计点亮 ' + p.done + '/21）。可以重整旗鼓再报一次</div>';
    else banner = '<div class="plan-banner go">第 <b>' + p.dayIdx + '</b> / 21 天 · 已点亮 <b>' + p.done + '</b> 朵 · 还差 <b>' + Math.max(0, p.need) + '</b> 天功成</div>';
    el.innerHTML =
      '<div class="plan-head"><span class="plan-icon">🏮</span>' +
      '<div><div class="plan-title">21 天入门挑战 · ' + p.start + ' 起</div>' +
      '<div class="plan-sub">每天完成任意一次跟练自动点亮，漏一天不罚，21 天内集满即功成</div></div>' +
      '<button class="btn ghost sm" id="planReset">放弃本次</button></div>' +
      banner + '<div class="plan-grid">' + cells + '</div>';
    var rb = $('#planReset');
    if (rb) rb.addEventListener('click', function () {
      if (confirm('确定放弃本次挑战？记录会保留，可重新报名开新一期')) { S.resetPlan(); renderPlan(); }
    });
  }
  function setCard(st, showIntro) {
    var el = document.createElement('div');
    el.className = 'set-card';
    el.style.setProperty('--acc', st.color);
    var learned = Math.min(S.learnedCount(st.id), st.moves.length);
    var est = estMin(st);
    var lpct = Math.round(learned / st.moves.length * 100);
    var doneToday = S.recordsOfDay(S.todayStr()).some(function (r) { return r.set === st.id; });
    var _wkFromS = S.weekReport().rangeFrom;
    var _wkSetN = S.records().filter(function (r) { return r.set === st.id && r.d >= _wkFromS; }).length;
    var _lastD = null;
    S.records().forEach(function (r) { if (r.set === st.id && (!_lastD || r.d > _lastD)) _lastD = r.d; });
    var _ago = (_lastD && _wkSetN === 0) ? Math.round((new Date(S.todayStr()) - new Date(_lastD)) / 86400000) : null;
    var _favMv = S.moveFavKeys().filter(function (k) { return k.set === st.id; }).length;
    var slotTags = (st.moods || []).map(function (kk) { return SLOT_ICON[kk] || kk; }).join(' ');
    el.innerHTML =
      '<div class="icon">' + st.icon + '</div>' +
      '<button class="fav-star' + (S.isFav(st.id) ? ' on' : '') + '" title="收藏/取消收藏常用功法">' + (S.isFav(st.id) ? '⭐' : '☆') + '</button>' +
      '<h3>' + st.name + '</h3>' +
      '<div class="py">' + st.pinyin + ' · ' + st.level + (slotTags ? ' <span class="sc-slot" title="此时段宜练">' + slotTags + '</span>' : '') + '</div>' +
      '<div class="tagline">' + st.tagline + '</div>' +
      '<div class="meta"><span>' + st.moves.length + ' 式</span><span>约 ' + est + ' 分钟</span>' + (_wkSetN ? '<span class="sc-wk" title="本周跟练这套的场次">本周 ' + _wkSetN + ' 场</span>' : '') + (_ago !== null && _ago > 0 ? '<span class="sc-ago" title="久未跟练这套，换个口味">🕗 上次 ' + _ago + ' 天前</span>' : '') + (doneToday ? '<span class="sc-today" title="今天已跟练过这套">✓ 今日已练</span>' : '') + '</div>' +
      '<div class="prog">已学 ' + learned + '/' + st.moves.length + ' 式' + (_favMv ? ' · 常练 <b>' + _favMv + '</b> 式' : '') + '<span class="prog-bar"><i style="width:' + lpct + '%"></i></span></div>';
    el.querySelector('.fav-star').addEventListener('click', function (e) {
      e.stopPropagation();
      S.toggleFav(st.id);
      renderHome();
    });
    el.addEventListener('click', function () { openSet(st.id); });
    return el;
  }

  /* ================= 功法学堂 ================= */
  var curSet = null, curMove = null, viewingMove = false;
  var picked = {}, pickedSetId = null; /* 自定义选式状态 */

  function pickedList(set) {
    return set.moves.filter(function (m) { return picked[m.id]; });
  }
  function refreshCustomBtn() {
    var btn = $('#trainCustom');
    if (!btn) return;
    var n = pickedList(curSet).length;
    btn.classList.toggle('hidden', n < 2);
    btn.textContent = '▶ 选式跟练（已选 ' + n + ' 式）';
    if (n >= 2) btn.onclick = function () { Train.start(curSet, pickedList(curSet), 'custom'); };
  }

  function renderSetList() {
    $('#setList').classList.remove('hidden');
    $('#setDetail').classList.add('hidden');
    $('#moveDetail').classList.add('hidden');
    paintFilter();
    renderSetStat();
  }

  /* 目录页收藏/常练统计微条：一眼看到自己积下的“我的常用” */
  function renderSetStat() {
    var el = $('#setStat');
    if (!el) return;
    var nf = S.favIds().length, nm = S.moveFavKeys().length;
    var learnedAll = DATA.sets.reduce(function (a, s) { return a + Math.min(S.learnedCount(s.id), s.moves.length); }, 0);
    var _rfS = S.weekReport().rangeFrom, _wkKinds = {};
    var _monPreS = S.todayStr().slice(0, 7), _monKinds = {};
    S.records().forEach(function (r) { if (r.set !== 'calm') { if (r.d >= _rfS) _wkKinds[r.set] = 1; if (r.d && r.d.slice(0, 7) === _monPreS) _monKinds[r.set] = 1; } });
    var _wkSetKinds = Object.keys(_wkKinds).length;
    var _monSetKinds = Object.keys(_monKinds).length;
    var _tail = (learnedAll ? ' · 已学 <b>' + learnedAll + '/' + moveTotal + '</b> 式' : '') + (_wkSetKinds ? ' · 本周碰 <b>' + _wkSetKinds + '</b> 套' : '') + (_monSetKinds && _monSetKinds !== _wkSetKinds ? ' · 本月碰 <b>' + _monSetKinds + '</b> 套' : '');
    if (!nf && !nm) {
      el.innerHTML = '🌱 还没收藏——功法卡右上角点星⭐收进“我的常用”，单式点“常练”☆' + _tail;
      return;
    }
    el.innerHTML = '⭐ 已收藏 <b>' + nf + '</b> 套功法 · 🔖 列常练 <b>' + nm + '</b> 式' + _tail;
  }

  /* ---- 功法页搜索与部位标签筛选 ---- */
  var TAGS = {
    '肩颈': ['肩', '颈'], '腰肾': ['腰', '肾'], '心肺': ['胸', '肺', '心'],
    '脾胃': ['脾', '胃', '三焦', '消化'], '安神': ['安', '静', '松', '眠'], '腿足': ['腿', '足', '马步', '下蹲', '蹲']
  };
  var activeTag = null, searchQ = '';
  function moveTags(st, m) {
    var hay = (m.name + ' ' + (m.desc || '') + ' ' + (m.benefit || '') + ' ' + (m.breath || '')).toLowerCase();
    var out = [];
    Object.keys(TAGS).forEach(function (tag) {
      if (TAGS[tag].some(function (w) { return hay.indexOf(w) >= 0; })) out.push(tag);
    });
    return out;
  }
  function paintFilter() {
    /* 标签栏 */
    var chips = $('#tagChips');
    chips.innerHTML = '';
    var mk = ['全部'];
    Object.keys(TAGS).forEach(function (k) { mk.push(k); });
    mk.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'chip-btn' + (t === '全部' ? (!activeTag && !searchQ ? ' on' : '') : (t === activeTag ? ' on' : ''));
      b.textContent = t;
      b.addEventListener('click', function () {
        activeTag = (t === '全部') ? null : t;
        searchQ = ''; $('#moveSearch').value = '';
        paintFilter();
      });
      chips.appendChild(b);
    });
    /* 搜索命中面板：非空时接管卡片列表 */
    var resBox = $('#searchResult');
    var cardsBox = $('#setCards');
    if (searchQ || activeTag) {
      var hits = [];
      DATA.sets.forEach(function (st) {
        st.moves.forEach(function (m, idx) {
          var okTag = !activeTag || moveTags(st, m).indexOf(activeTag) >= 0;
          var okQ = !searchQ || (m.name + ' ' + (m.desc || '') + ' ' + (m.benefit || '')).toLowerCase().indexOf(searchQ) >= 0;
          if (okTag && okQ) hits.push({ st: st, m: m, idx: idx });
        });
      });
      cardsBox.classList.add('hidden');
      resBox.classList.remove('hidden');
      resBox.innerHTML = '';
      var head = document.createElement('div');
      head.className = 'search-head';
      head.textContent = '找到 ' + hits.length + ' 个动作' + (activeTag ? '（标签：' + activeTag + '）' : '') + (searchQ ? '（关键词：“' + searchQ + '”）' : '');
      resBox.appendChild(head);
      hits.slice(0, 40).forEach(function (h) {
        var row = document.createElement('div');
        row.className = 'sr-row';
        row.style.setProperty('--acc', h.st.color);
        row.innerHTML = '<div class="sr-set">' + h.st.icon + ' ' + h.st.name + '<span>第 ' + (h.idx + 1) + ' 式</span></div>' +
          '<div class="sr-nm">' + h.m.name + '</div><div class="sr-bt">' + (h.m.benefit || '') + '</div>';
        row.addEventListener('click', function () { openSet(h.st.id); openMove(h.m.id); });
        resBox.appendChild(row);
      });
      if (!hits.length) {
        var empty = document.createElement('div');
        empty.className = 'search-head';
        empty.textContent = '没找到匹配的动作，换个词试试（如“托天”“摇头”“射雕”）';
        resBox.appendChild(empty);
      }
    } else {
      resBox.classList.add('hidden');
      resBox.innerHTML = '';
      cardsBox.classList.remove('hidden');
      cardsBox.innerHTML = '';
      DATA.sets.forEach(function (st) {
        var card = setCard(st, true);
        if (st.intro) {
          var p = document.createElement('div');
          p.style.cssText = 'color:var(--sub);font-size:13px;margin-top:6px';
          p.textContent = st.intro.slice(0, 46) + '……';
          card.appendChild(p);
        }
        cardsBox.appendChild(card);
      });
    }
  }

  function openSet(setId) {
    var prev = curSet;
    curSet = DATA.sets.find(function (s) { return s.id === setId; });
    if (!curSet) return;
    if (!prev || prev.id !== curSet.id || pickedSetId !== curSet.id) {
      pickedSetId = curSet.id;
      picked = {};
      /* 恢复上次在这套里勾过的选式（只认当前仍存在的动作 id） */
      var pm = S.pickMem();
      if (pm && pm.set === curSet.id && Array.isArray(pm.ids)) {
        pm.ids.forEach(function (id) {
          if (curSet.moves.some(function (m) { return m.id === id; })) picked[id] = true;
        });
      }
    }
    $('#setList').classList.add('hidden');
    $('#moveDetail').classList.add('hidden');
    $('#setDetail').classList.remove('hidden');
    showPage('sets');

    var head = $('#setHead');
    var doneN = curSet.moves.filter(function (m) { return S.isLearned(curSet.id, m.id); }).length;
    var pctN = Math.round(doneN / curSet.moves.length * 100);
    var sessN = S.records().filter(function (r) { return r.set === curSet.id; }).length;
    var _setWkFrom = S.weekReport().rangeFrom;
    var sessWkN = S.records().filter(function (r) { return r.set === curSet.id && r.d >= _setWkFrom; }).length;
    var _setMonPre = S.todayStr().slice(0, 7);
    var sessMonN = S.records().filter(function (r) { return r.set === curSet.id && r.d && r.d.slice(0, 7) === _setMonPre; }).length;
    head.innerHTML =
      '<h2>' + curSet.icon + ' ' + curSet.name + ' <span class="py">' + curSet.pinyin + '</span>' +
      '<button class="set-fav' + (S.isFav(curSet.id) ? ' on' : '') + '" id="setFavStar" title="收藏/取消收藏这套功法">' + (S.isFav(curSet.id) ? '⭐ 已收藏' : '☆ 收藏这套') + '</button></h2>' +
      '<p>' + curSet.intro + '</p>' +
      '<div class="set-sess">' + (sessN ? '🔥 这套你已练 <b>' + sessN + '</b> 场' + (sessWkN ? ' · 本周 <b>' + sessWkN + '</b> 场' : '') + (sessMonN && sessMonN !== sessWkN ? ' · 本月 <b>' + sessMonN + '</b> 场' : '') : '🌱 还没练过这套，不如今天开个张') + '</div>' +
      '<div class="benefits">' + curSet.benefits.map(function (b) { return '<span>' + b + '</span>'; }).join('') + '</div>' +
      '<p style="margin-top:8px">💡 ' + curSet.tips + '</p>' +
      '<div class="learn-progress" title="逐式学习、跟练或跳步覆盖到的动作会标记为已学">' +
      '<span class="lp-label">学习进度</span>' +
      '<span class="lp-bar"><i style="width:' + pctN + '%"></i></span>' +
      '<span class="lp-num">' + (doneN ? '已学 ' + doneN + '/' + curSet.moves.length + ' 式' : '还没开始学，随时开练') + '</span>' +
      (doneN === curSet.moves.length ? '<span class="lp-done">✓ 全部掌握</span>' : '') + '</div>' +
      '<div class="cta-row">' +
      '<button class="btn primary" id="trainFull">▶ 整套跟练（' + curSet.moves.length + ' 式 · 约' + estMin(curSet) + '分钟）</button>' +
      '<button class="btn ghost" id="learnFrom1">📖 从第一式逐式学习</button>' +
      '<button class="btn ghost hidden" id="trainCustom"></button></div>';
    $('#trainFull').addEventListener('click', function () {
      Train.start(curSet, curSet.moves, 'full');
    });
    var sf = $('#setFavStar');
    if (sf) sf.addEventListener('click', function () {
      S.toggleFav(curSet.id);
      var on = S.isFav(curSet.id);
      this.textContent = on ? '⭐ 已收藏' : '☆ 收藏这套';
      this.classList.toggle('on', on);
      renderHome();
    });
    $('#learnFrom1').addEventListener('click', function () {
      var next = curSet.moves.find(function (m) { return !S.isLearned(curSet.id, m.id); }) || curSet.moves[0];
      openMove(next.id);
    });

    var grid = $('#moveGrid');
    grid.innerHTML = '';
    [].forEach.call(document.querySelectorAll('.set-hit-note'), function (n) { n.remove(); }); /* 先清旧条，防重复注入 */
    /* 延续列表页的关键词/标签：命中高亮，未中置灰；置灰可点“只看命中”硬筛 */
    var hasFilter = !!(searchQ || activeTag);
    var hitIds = {}, note = null, hardFilter = false;
    if (hasFilter) {
      curSet.moves.forEach(function (m) {
        var okTag = !activeTag || moveTags(curSet, m).indexOf(activeTag) >= 0;
        var okQ = !searchQ || (m.name + ' ' + (m.desc || '') + ' ' + (m.benefit || '')).toLowerCase().indexOf(searchQ) >= 0;
        if (okTag && okQ) hitIds[m.id] = true;
      });
      var note = document.createElement('div');
      note.className = 'set-hit-note';
      var n = Object.keys(hitIds).length;
      note.innerHTML = '<span>🔍 命中 ' + n + ' 式' + (activeTag ? '（标签：' + activeTag + '）' : '') + (searchQ ? '（关键词：“' + searchQ + '”）' : '') + '</span>' +
        '<button class="btn ghost sm">' + (hardFilter ? '取消只看命中' : '只看命中') + '</button>';
      note.querySelector('button').addEventListener('click', function () {
        hardFilter = !hardFilter;
        paintGrid();
        note.querySelector('button').textContent = hardFilter ? '取消只看命中' : '只看命中';
      });
      grid.parentNode.insertBefore(note, grid);
    } else {
      hardFilter = false;
      var old = document.querySelector('.set-hit-note');
      if (old) old.remove();
    }
    function paintGrid() {
      grid.innerHTML = '';
      var oldNote = document.querySelector('.set-hit-note');
      if (hasFilter && !oldNote && note) { grid.parentNode.insertBefore(note, grid); }
      curSet.moves.forEach(function (m, idx) {
        if (hasFilter && hardFilter && !hitIds[m.id]) return;
        var cell = document.createElement('div');
        cell.className = 'move-cell' + (hasFilter && !hitIds[m.id] ? ' dim' : '') + (hasFilter && hitIds[m.id] ? ' hit' : '');
        cell.style.setProperty('--acc', curSet.color);
        cell.innerHTML =
          '<div class="no">第 ' + (idx + 1) + ' 式</div>' +
          '<div class="nm">' + m.name + '</div>' +
          (S.isLearned(curSet.id, m.id) ? '<div class="learned-mark">✓</div>' : '');
        var pb = document.createElement('button');
        pb.className = 'pick-btn' + (picked[m.id] ? ' on' : '');
        pb.textContent = picked[m.id] ? '✓ 已入选' : '+ 加入自定义';
        pb.addEventListener('click', function (e) {
          e.stopPropagation();
          picked[m.id] = !picked[m.id];
          pb.classList.toggle('on', !!picked[m.id]);
          pb.textContent = picked[m.id] ? '✓ 已入选' : '+ 加入自定义';
          refreshCustomBtn();
          S.savePick(curSet.id, Object.keys(picked).filter(function (k) { return picked[k]; }));
        });
        cell.appendChild(pb);
        var star = document.createElement('button');
        star.className = 'star-btn' + (S.isMoveFav(curSet.id, m.id) ? ' on' : '');
        star.textContent = S.isMoveFav(curSet.id, m.id) ? '★ 常练' : '☆ 常练';
        star.title = '标为常练式，首页“我的常练式”里一点即练';
        star.addEventListener('click', function (e) {
          e.stopPropagation();
          var on = S.toggleMoveFav(curSet.id, m.id);
          star.textContent = on ? '★ 常练' : '☆ 常练';
          star.classList.toggle('on', on);
        });
        cell.appendChild(star);
        cell.addEventListener('click', function () { openMove(m.id); });
        grid.appendChild(cell);
      });
    }
    paintGrid();
    refreshCustomBtn();
  }

  /* 单式自动演示循环：按时序模拟点击关键姿势 */
  var demoTimer = null;
  function stopDemo() {
    if (demoTimer) {
      clearInterval(demoTimer); demoTimer = null;
      var dl = $('#demoLoop');
      if (dl) dl.textContent = '🔁 连续演示';
    }
  }

  function openMove(moveId) {
    stopDemo();
    curMove = curSet.moves.find(function (m) { return m.id === moveId; });
    if (!curMove) return;
    $('#setDetail').classList.add('hidden');
    $('#moveDetail').classList.remove('hidden');
    viewingMove = true;

    var msess = S.records().filter(function (r) { return (r.moves || []).indexOf(curMove.id) >= 0; }).length;
    var _wkFrom = S.weekReport().rangeFrom;
    var msessWk = S.records().filter(function (r) { return (r.moves || []).indexOf(curMove.id) >= 0 && r.d >= _wkFrom; }).length;
    var _mLast = null;
    S.records().forEach(function (r) { if ((r.moves || []).indexOf(curMove.id) >= 0 && (!_mLast || r.d > _mLast)) _mLast = r.d; });
    var _mAgo = _mLast ? Math.round((new Date(S.todayStr()) - new Date(_mLast)) / 86400000) : null;
    var _mAgoTxt = _mAgo === null ? '' : (_mAgo === 0 ? '今天练过' : '上次 ' + _mAgo + ' 天前');
    var _mIdx = curSet.moves.indexOf(curMove);
    var _mPosTxt = _mIdx >= 0 ? '第 ' + (_mIdx + 1) + '/' + curSet.moves.length + ' 式' : '';
    $('#moveHead').innerHTML =
      '<h2>' + curMove.name + (_mPosTxt ? ' <span class="mv-pos">' + _mPosTxt + '</span>' : '') + (msess ? ' <span class="mv-sess">已练 ' + msess + ' 场' + (msessWk ? ' · 本周 ' + msessWk + ' 场' : '') + (_mAgoTxt ? ' · ' + _mAgoTxt : '') + '</span>' : '') +
      '<button class="btn ghost sm mv-fav-set' + (S.isFav(curSet.id) ? ' on' : '') + '" id="mvFavSet" title="收藏/取消收藏这套（' + curSet.name + '）">' + (S.isFav(curSet.id) ? '⭐ 已收藏这套' : '☆ 收藏这套') + '</button></h2><p class="desc">' + curMove.desc + '</p>';
    $('#moveSteps').innerHTML = curMove.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('');
    $('#moveBreath').textContent = curMove.breath;
    $('#moveBenefit').textContent = curMove.benefit;

    var kb = $('#keyBtns');
    kb.innerHTML = '';
    curMove.keys.forEach(function (key, i) {
      var b = document.createElement('button');
      b.className = 'key-btn';
      b.innerHTML = key.label + ' <small>' + (key.inhale === 'in' ? '吸' : key.inhale === 'out' ? '呼' : '定') + ' · ' + key.sec + 's</small>';
      b.addEventListener('click', function () {
        $$('#keyBtns .key-btn').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        pose3d(key.pose, 2.4);
        breath3d(key.inhale);
        float3d(key.label);
        $('#stageTitle').textContent = curMove.name + ' · ' + key.label;
        speak(key.cue);
      });
      kb.appendChild(b);
    });
    /* 默认展示首帧姿势 */
    pose3d(curMove.keys[0].pose, 1.6);
    breath3d(curMove.keys[0].inhale);
    $('#stageTitle').textContent = curMove.name + ' · ' + curMove.keys[0].label;

    $('#learnMove').classList.toggle('hidden', S.isLearned(curSet.id, moveId));
    $('#drillMove').onclick = function () { Train.start(curSet, [curMove], 'single'); };
    $('#learnMove').onclick = function () {
      S.markLearned(curSet.id, moveId);
      speak('好，' + curMove.name + '已记下学会');
      openSet(curSet.id);
      openMove(moveId); /* 重进以刷新状态 */
    };
    /* 单式页收藏整套快捷：与套页星、收功页同口径 */
    var mfs = $('#mvFavSet');
    if (mfs) mfs.addEventListener('click', function () {
      S.toggleFav(curSet.id);
      var on = S.isFav(curSet.id);
      this.textContent = on ? '⭐ 已收藏这套' : '☆ 收藏这套';
      this.classList.toggle('on', on);
      renderHome();
    });
    /* 常练星标：与目录格双向同步，重开即新 */
    var fs = $('#favMoveStar');
    function paintFavStar() {
      var on = S.isMoveFav(curSet.id, curMove.id);
      fs.textContent = on ? '★ 已列常练' : '☆ 常练';
      fs.classList.toggle('gold', on);
    }
    fs.onclick = function () { S.toggleMoveFav(curSet.id, curMove.id); paintFavStar(); };
    paintFavStar();
    $('#backToSet').textContent = '← 返回' + curSet.name;

    /* 同一套内快速前后翻式，尽头禁用 */
    var mi = curSet.moves.indexOf(curMove);
    var pv = $('#prevMove'), nx = $('#nextMove');
    pv.disabled = mi <= 0;
    nx.disabled = mi >= curSet.moves.length - 1;
    pv.textContent = mi > 0 ? '⬅ 上一式 · ' + curSet.moves[mi - 1].name : '⬅ 已是第一式';
    nx.textContent = mi < curSet.moves.length - 1 ? '下一式 · ' + curSet.moves[mi + 1].name + ' ➡' : '已是最后一式 ➡';
    pv.onclick = function () { if (mi > 0) openMove(curSet.moves[mi - 1].id); };
    nx.onclick = function () { if (mi < curSet.moves.length - 1) openMove(curSet.moves[mi + 1].id); };

    /* 连续演示开关：2.2 秒一个姿势循环；不足两动不启用 */
    var dl = $('#demoLoop');
    dl.onclick = function () {
      if (demoTimer) { stopDemo(); return; }
      var btns = $$('#keyBtns .key-btn');
      if (btns.length < 2) return;
      var di = -1;
      dl.textContent = '⏹ 停止演示';
      demoTimer = setInterval(function () {
        di = (di + 1) % btns.length;
        btns[di].click();
      }, 2200);
    };
  }

  $('#backToSet').addEventListener('click', function () {
    stopDemo();
    viewingMove = false;
    openSet(curSet.id);
    pose3d(idlePoses[0], 1.2);
    if (!Train.active) { breath3d('idle'); resetStage(); } /* 单式页留下的标题不泄漏回目录 */
  });

  /* ================= 跟练状态机 ================= */
  var lastSession = null;
  var Train = {
    active: false,
    _steps: [], _i: 0, _remain: 0, _total: 0, _last: 0, _raf: 0,
    _paused: false, _set: null, _mode: '', _doneSec: 0, _warned: false,

    start: function (set, moves, mode) {
      stopDemo(); /* 开练前先收起演示循环，免口令叠口令 */
      var steps = [{ label: '预备 · 调整呼吸', sec: 5, inhale: 'hold', cue: '双脚与肩同宽，全身放松，调整呼吸，即将开始' + set.name, pose: idlePoses[0], _prep: true }];
      var withRest = (mode === 'full' && moves.length > 1); /* 整套跟练式与式之间加调息间歇 */
      moves.forEach(function (m, mi) {
        m.keys.forEach(function (k, ki) {
          steps.push({ label: k.label, sec: k.sec, inhale: k.inhale, cue: k.cue, pose: k.pose, move: m, moveIdx: mi, keyIdx: ki, totalKeys: m.keys.length });
        });
        if (withRest && mi < moves.length - 1) {
          steps.push({ label: '间歇 · 调息', sec: 6, inhale: 'hold', cue: moves[mi].name + '收功。松静站立，调息两次，准备' + moves[mi + 1].name, pose: idlePoses[mi % 2], _rest: true });
        }
      });
      this._steps = steps; this._i = 0; this._total = steps.length;
      this._tempo = S.tempo(); /* 开场定格，中途切节奏从下一步生效 */
      this._set = set; this._mode = mode; this._paused = false;
      this._moveIds = moves.map(function (m) { return m.id; });
      this._startWall = 0; this._doneSec = 0;
      this.active = true;
      showPage('train');
      /* 自然伴奏：开场按设置拉起（点击链路里才有手势解锁 AudioContext） */
      if (global.QGAmbient) {
        var amb = S.ambient();
        if (amb !== 'off') QGAmbient.start(amb);
      }
      paintAmbBtn();
      $('#trainSetName').textContent = set.icon + ' ' + set.name +
        (mode === 'single' ? ' · ' + moves[0].name : mode === 'custom' ? ' · 选式 ' + moves.length + ' 式' : ' · 整套');
      /* 跟练页也亮当前时段，与首页宜练、收功后语一条线贯通 */
      var tsl = $('#trainSlot');
      if (tsl) { tsl.textContent = SLOT_TXT[slotLabel(new Date().getHours())] || ''; tsl.classList.toggle('hidden', !tsl.textContent); }
      $('#btnPause').textContent = '⏸ 暂停';
      this.enterStep(0);
      this.renderTick(); /* 开场即刷新步数，不留上一场残值 */
      var self = this;
      this._last = performance.now();
      cancelAnimationFrame(this._raf);
      function tick(now) {
        var dt = (now - self._last) / 1000;
        self._last = now;
        if (!self._paused && self.active) {
          self._remain -= dt;
          self._doneSec += dt;
          self.renderTick();
          var stepNow = self._steps[self._i];
          if (!self._warned && self._remain <= 3 && self._remain > 0.3 && stepNow && stepNow._eff >= 5) {
            self._warned = true;
            chime(392, 0.07, 0.9); /* 换式/换动前轻声磬音提醒，长步骤才预告 */
          }
          if (self._remain <= 0) {
            var cur = self._steps[self._i];
            if (cur.move) S.markLearned(set.id, cur.move.id); /* 跟到该式即算学过 */
            if (self._i + 1 >= self._total) { self.finish(); return; }
            self.enterStep(self._i + 1);
          }
        }
        self._raf = requestAnimationFrame(tick);
      }
      this._raf = requestAnimationFrame(tick);
    },

    enterStep: function (i) {
      this._i = i;
      this._warned = false;
      var cd0 = $('#cdNum'); if (cd0) { cd0.classList.add('hidden'); cd0.dataset.v = ''; cd0.textContent = ''; } /* 新步不留上一拍残影 */
      var st = this._steps[i];
      st._eff = st.sec / (this._tempo || 1); /* 慢速(0.75)时长更长，快速(1.5)更短 */
      this._remain = st._eff;
      pose3d(st.pose, Math.max(0.9, 2.6 / Math.max(st._eff / 3, 1)));
      breath3d(st.inhale);
      var ring = $('#breathRing');
      ring.className = 'breath-ring ' + (st.inhale === 'hold' ? 'hold' : st.inhale);
      /* 开合速度跟真实呼吸时长走（慢/常/快节奏下均同步） */
      ring.style.transitionDuration = Math.max(1.2, Math.min(st._eff - 0.2, 8)) + 's';
      $('#breathText').textContent = st.inhale === 'in' ? '吸' : st.inhale === 'out' ? '呼' : '定';
      if (st.move) {
        $('#trainMoveName').textContent = st.move.name;
        $('#trainKeyLabel').textContent = '第 ' + (st.moveIdx + 1) + '/' + this._countMoves() + ' 式 · ' + st.label + '（' + (st.keyIdx + 1) + '/' + st.totalKeys + ' 动）';
        $('#stageTitle').textContent = st.move.name + ' · ' + st.label;
        $('#trainCue').textContent = st.cue;
        speak((st.keyIdx === 0 ? st.move.name + '。' : '') + st.cue);
        if (st.keyIdx === 0) { chime(PENTA[st.moveIdx % PENTA.length], 0.13, 1.6); float3d(st.move.name + ' · ' + st.label); }
      } else {
        $('#trainMoveName').textContent = st._rest ? '间歇调息' : '预备起';
        $('#trainKeyLabel').textContent = st.label;
        $('#stageTitle').textContent = st._rest ? '间歇 · 放松调息' : '预备 · 调整呼吸';
        $('#trainCue').textContent = st.cue;
        speak(st.cue);
      }
    },
    _countMoves: function () {
      var n = 0;
      this._steps.forEach(function (s) { if (s.move && s.keyIdx === 0) n++; });
      return n || 1;
    },

    renderTick: function () {
      var st = this._steps[this._i];
      var pct = (1 - this._remain / (st._eff || st.sec)) * 100;
      $('#trainBar').style.width = Math.min(100, pct) + '%';
      $('#trainStepIdx').textContent = this._i + 1 + ' / ' + this._total;
      $('#trainTimeLeft').textContent = Math.max(0, Math.ceil(this._remain)) + ' 秒';
      /* 最后 3 秒倒计时大字：秒变弹一次，提前收拍不叠字 */
      var cd = $('#cdNum');
      if (cd) {
        var rl = this._remain;
        if (!this._paused && rl > 0 && rl <= 3.05) {
          var v = Math.min(3, Math.max(1, Math.ceil(rl))); /* 卡在 3，免 3.05 窗口 ceil 出 4 */
          if (cd.dataset.v !== String(v)) {
            cd.dataset.v = String(v);
            cd.textContent = v;
            cd.classList.remove('hidden', 'pop');
            void cd.offsetWidth; /* 重触发 pop 动画 */
            cd.classList.add('pop');
          }
        } else if (!cd.classList.contains('hidden')) {
          cd.classList.add('hidden'); cd.dataset.v = '';
        }
      }
    },

    togglePause: function () {
      this._paused = !this._paused;
      $('#btnPause').textContent = this._paused ? '▶ 继续' : '⏸ 暂停';
      if (this._paused) { if ('speechSynthesis' in global) speechSynthesis.cancel(); }
    },
    jump: function (dir) {
      if (!this.active) return;
      var leaving = this._steps[this._i];
      if (dir > 0 && leaving && leaving.move) S.markLearned(this._set.id, leaving.move.id);
      var ni = this._i + dir;
      if (ni < 0) ni = 0;
      if (ni >= this._total) { this.finish(); return; }
      this.enterStep(ni);
      this.renderTick(); /* 暂停中手动跳步也要立即刷新步数/倒计时显示 */
    },
    stop: function (silent) {
      this.active = false;
      cancelAnimationFrame(this._raf);
      var cdq = $('#cdNum'); /* 退出时刻避开倒计时窗口，不留残字 */
      if (cdq) { cdq.classList.add('hidden'); cdq.dataset.v = ''; cdq.textContent = ''; }
      if (global.QGAmbient) QGAmbient.stop(); /* 退出跟练收掉伴奏 */
      if (!silent && global.history) { /* keep simple */ }
      pose3d(idlePoses[0], 1.2);
      breath3d('idle');
    },
    finish: function () {
      if (!this.active) return;
      var set = this._set, min = Math.round(this._doneSec / 60 * 10) / 10;
      var daysBefore = S.totalDays(); /* 落盘前的累计天数，用来看本场是否刚跨过里程碑 */
      var lastMoveId = (this._mode === 'single' && this._moveIds.length === 1) ? this._moveIds[0] : null;
      var gotBefore = {};
      try { S.badges(DATA.sets.length, moveTotal).forEach(function (a) { gotBefore[a.id] = a.got; }); } catch (e) { if (global.console) global.console.warn('成就快照读取失败，跳过解锁提示', e); }
      S.addRecord(set.id, this._doneSec, this._moveIds);
      var daysNow = S.totalDays();
      lastSession = {
        set: set, min: min, mode: this._mode, n: this._moveIds.length,
        days: S.totalDays(), streak: S.streak(), learned: S.learnedTotal(),
        date: S.todayStr()
      };
      this.active = false;
      cancelAnimationFrame(this._raf);
      if (global.QGAmbient) QGAmbient.stop();
      $('#doneTitle').textContent = this._mode === 'single' ? '此式功成！' : '功成！' + (S.checkedToday() ? '今日打卡已点亮' : '');
      $('#doneStats').textContent =
        '本次跟练 ' + set.name + '，用时约 ' + min + ' 分钟 · 连续打卡 ' + S.streak() + ' 天 · 累计 ' + S.totalDays() + ' 天 · 今日第 ' + S.recordsOfDay(S.todayStr()).length + ' 练 · 本周第 ' + S.weekReport().sessions + ' 场';
      /* 本周目标进度：跟练完当场回音，未达报差几场、已达则庆 */
      var _wsess = S.weekReport().sessions, _wgoal = S.weekGoal();
      $('#doneStats').textContent += _wsess >= _wgoal ? ' · 本周目标已达成 🎉' : ' · 距周目标还差 ' + (_wgoal - _wsess) + ' 场';
      /* 连续天数追平/刷新个人最长：streak 已等于 streakMax 且超 1 天才提 */
      if (S.streak() > 1 && S.streak() >= S.streakMax()) {
        $('#doneStats').textContent += ' · 🔥 连练 ' + S.streak() + ' 天，追平个人最长';
      }
      if (S.planStatus()) {
        var pl = S.planInfo();
        $('#doneStats').textContent += pl && !pl.success && !pl.over ? ' · 21天挑战已点亮 ' + pl.done + '/21' : '';
      }
      speak('收功。' + set.name + '练习完成，今日打卡已记录。');
      chime(196, 0.2, 2.6); /* 收功大磬 */
      /* 累计天数里程碑：只在跨过那一档的本场提一句，不重复扰 */
      var MILE = { 7: '七日不辍，气感初成', 21: '廿一天小成，习惯已立', 30: '满月功期，脱胎换骨之始', 50: '五十日半载，气血自盈', 100: '百日筑基圆满，功夫上身' };
      var dm = $('#doneMile');
      var mileTxt = (daysNow > daysBefore && MILE[daysNow]) ? MILE[daysNow] : '';
      if (dm) {
        dm.textContent = mileTxt ? '🏅 里程碑 · 累计打卡 ' + daysNow + ' 天——' + mileTxt : '';
        dm.classList.toggle('hidden', !mileTxt);
      }
      if (mileTxt) setTimeout(function () { speak('恭喜，' + MILE[daysNow]); }, 3200);
      /* 收功后语随时段：早护升发、午宜小憩、晚安神、夜忌再见光 */
      var SLOT_DONE = {
        '早': '🌅 晨练收功，阳气已升 —— 宜温水缓饮，不宜即刻寒凉生冷。',
        '午': '🌤 日中收功，气血养长 —— 宜静坐小憩一刻，再赴午后之事。',
        '晚': '🌙 入夜收功，阳气已敛 —— 宜少见光屏，让神慢慢安下来。',
        '夜': '⭐ 夜深收功，最宜安眠 —— 此后少碰屏光，温水漱口即可。'
      };
      var ds = $('#doneSlot');
      if (ds) {
        ds.textContent = SLOT_DONE[slotLabel(new Date().getHours())] || '';
        ds.classList.toggle('hidden', !ds.textContent);
      }
      /* 新成就解锁提示：对比写入记录前后的达成态 */
      var un = $('#doneUnlock');
      try {
        var fresh = S.badges(DATA.sets.length, moveTotal).filter(function (a) { return a.got && !gotBefore[a.id]; });
        if (fresh.length && un) {
          un.classList.remove('hidden');
          un.innerHTML = '🎉 新解锁：' + fresh.map(function (a) { return a.icon + ' ' + a.name; }).join(' · ');
          chime(523.25, 0.12, 1.2);
          setTimeout(function () { chime(659.25, 0.12, 1.4); }, 260);
          speak('恭喜，解锁新成就' + fresh.map(function (a) { return a.name; }).join('，'));
        } else if (un) {
          un.classList.add('hidden'); un.innerHTML = '';
        }
      } catch (e) { if (global.console) global.console.warn('解锁提示渲染失败', e); if (un) { un.classList.add('hidden'); un.innerHTML = ''; } }
      /* 收功三息：口头引导一遍，圆点动画自动跑三轮后停 */
      setTimeout(function () {
        speak('收功三息：缓缓吸气——微微停顿——细细呼出。三息之后，气归丹田。');
      }, 1800);
      float3d('收功 · 气归丹田');
      pose3d(idlePoses[1], 1);
      /* 练后感想：每次功成重置一行，可选刻下 */
      var nr = $('#doneNoteRow'), ni = $('#doneNoteInput'), nm = $('#doneNoteMsg');
      if (nr && ni) {
        nr.classList.remove('hidden');
        ni.value = ''; ni.disabled = false;
        ni.placeholder = '给身体留一句话——刚练完' + set.name;
        if (nm) { nm.textContent = ''; }
        var nb = $('#doneNoteSave'); if (nb) nb.disabled = false;
      }
      /* 单式且不是末式：露“接着练下一式”，一点就顺下去 */
      var nb2 = $('#doneNextBtn'), nextMv = null;
      if (this._mode === 'single' && lastMoveId) {
        var mi = -1;
        set.moves.forEach(function (m, i) { if (m.id === lastMoveId) mi = i; });
        if (mi >= 0 && mi + 1 < set.moves.length) nextMv = set.moves[mi + 1];
      }
      doneNextMove = nextMv ? { set: set, move: nextMv } : null;
      if (nb2) { nb2.classList.toggle('hidden', !nextMv); nb2.textContent = nextMv ? ('▶ 接着练下一式：' + nextMv.name) : '▶ 接着练下一式'; }
      /* 收功顺手收藏这套为常用（定息无套可藏） */
      var fb2 = $('#doneFavSet');
      doneFavSetId = (set.id !== 'calm') ? set.id : null;
      if (fb2) {
        fb2.classList.toggle('hidden', !doneFavSetId);
        if (doneFavSetId) fb2.textContent = S.isFav(doneFavSetId) ? '✓ 已收藏这套' : '⭐ 收藏这套';
      }
      showPage('done');
    }
  };

  /* 跟练控制按钮 */
  $('#btnPause').addEventListener('click', function () { Train.togglePause(); });
  $('#btnPrevKey').addEventListener('click', function () { Train.jump(-1); });
  $('#btnNextKey').addEventListener('click', function () { Train.jump(1); });
  $('#btnQuit').addEventListener('click', function () {
    Train.stop(true);
    resetStage();
    goBack();
  });

  /* 练后感想落盘：写进最近一条记录，打卡页回顾得见 */
  $('#doneNoteSave').addEventListener('click', function () {
    var ni = $('#doneNoteInput'), nm = $('#doneNoteMsg');
    var v = (ni.value || '').trim();
    if (!v) { ni.focus(); return; }
    if (S.noteLast(v)) {
      nm.textContent = '✓ 已刻下，打卡页可回看';
      ni.disabled = true; this.disabled = true;
    } else { nm.textContent = '✕ 没接住，再试一次'; }
  });
  $('#doneNoteInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('#doneNoteSave').click();
  });

  /* 单式跟练后的一键接下一式（finish 里赋值 doneNextMove） */
  var doneNextMove = null;
  $('#doneNextBtn').addEventListener('click', function () {
    if (doneNextMove) Train.start(doneNextMove.set, [doneNextMove.move], 'single');
  });

  /* 收功页收藏/取消本套为常用（与目录页星、首页收藏区同一口径） */
  var doneFavSetId = null;
  $('#doneFavSet').addEventListener('click', function () {
    if (!doneFavSetId) return;
    S.toggleFav(doneFavSetId);
    this.textContent = S.isFav(doneFavSetId) ? '✓ 已收藏这套' : '⭐ 收藏这套';
    renderHome();
  });

  /* ================= 定息 · 数呼吸（吸4呼6 × 六息） ================= */
  var calm = { timer: 0, left: 60, phase: '' };
  function calmPhaseSet(ph) {
    calm.phase = ph;
    var r = $('#calmRing');
    r.style.transitionDuration = (ph === 'in' ? 4 : 6) + 's'; /* 胀缩跟真实呼吸时长 */
    r.className = 'calm-ring ' + ph;
    $('#calmPhase').textContent = ph === 'in' ? '吸' : '呼';
  }
  function calmStart() {
    if (calm.timer) return;
    $('#calmMask').classList.remove('hidden');
    calm.left = 60; calm.phase = '';
    $('#calmLeft').textContent = '60';
    $('#calmCount').textContent = '第 1 / 6 息';
    calmPhaseSet('in');
    chime(392, 0.08, 1.2); /* 引磬一声，开工 */
    speak('定息开始：缓缓吸气。');
    calm.timer = setInterval(function () {
      calm.left--;
      $('#calmLeft').textContent = String(Math.max(0, calm.left));
      if (calm.left <= 0) { calmEnd(true); return; }
      var el = 60 - calm.left, pos = el % 10;
      if (pos === 0) $('#calmCount').textContent = '第 ' + (el / 10 + 1) + ' / 6 息';
      var ph = pos < 4 ? 'in' : 'out';
      if (ph !== calm.phase) {
        calmPhaseSet(ph);
        if (pos === 4) speak('细细呼出。');
        else if (pos === 0) speak('缓缓吸气。');
      }
    }, 1000);
  }
  function calmEnd(full) {
    clearInterval(calm.timer); calm.timer = 0; calm.phase = '';
    $('#calmMask').classList.add('hidden');
    if (full) {
      chime(523.25, 0.14, 1.8);
      setTimeout(function () { chime(659.25, 0.12, 1.4); }, 300);
      speak('六息数满，心定神怡。');
      /* 圆满一场落盘今日练功（一天只记一场），定息钮打勾 */
      S.addCalm(60, 6);
      paintCalmBtn();
      if ($('#page-home').classList.contains('on')) renderHome();
    }
  }
  function paintCalmBtn() {
    var b = $('#calmBtn');
    if (b) b.textContent = S.calmToday() ? '🍃 今日六息已满' : '🍃 一分钟定息';
  }
  paintCalmBtn();
  $('#calmBtn').addEventListener('click', calmStart);
  $('#calmStop').addEventListener('click', function () { calmEnd(false); });

  /* 自然伴奏开关：无伴奏→泉流→山风→鸟鸣循环，选完即响 */
  function paintAmbBtn() {
    var b = $('#ambBtn');
    if (!b) return;
    var a = S.ambient();
    b.textContent = (global.QGAmbient && QGAmbient.LABEL[a]) || a;
    b.title = '自然伴奏（Web Audio 程序化合成，无音频素材）：点按循环切换';
  }
  var ambBtn = $('#ambBtn');
  if (ambBtn) ambBtn.addEventListener('click', function () {
    var a = S.cycleAmbient();
    if (global.QGAmbient) { if (a === 'off') QGAmbient.stop(); else QGAmbient.start(a); }
    paintAmbBtn();
  });

  function resetStage() {
    $('#stageTitle').textContent = '演武台 · 拖拽旋转视角';
    float3d('');
  }

  /* ================= 知识抽卡复习 ================= */
  var fc = { queue: [], total: 0, got: 0, logged: false, hard: false };
  function refreshKnowHead() { /* 知识页已渲染时重画统计条，未渲染则罢 */
    var sp = $('#knowStats');
    if (sp) paintKnowHead(sp);
    var hb = $('#fcHardBtn'); /* 难卡钮随销账/加卡实时增减 */
    if (hb) { var n = S.hardCount(); hb.textContent = '⛰ 难卡包 ' + n; hb.disabled = !n; }
  }
  function fcShow() {
    var p = $('#fcProg'), c = $('#fcCard');
    if (!fc.queue.length) {
      if (!fc.logged) { fc.logged = true; if (!fc.hard) S.fcLog(fc.got, fc.total); refreshKnowHead(); }
      var fs = S.fcStat();
      p.textContent = fc.hard ? '难卡包过完 · 共 ' + fc.total + ' 张 · 包内剩 ' + S.hardCount() + ' 张'
        : '本轮过完 · 共 ' + fc.total + ' 张 · 累计 ' + fs.rounds + ' 轮';
      c.innerHTML = '<div class="fc-done"><b>' + (fc.hard ? '⛰' : '🎉') + ' 记住 ' + fc.got + ' / ' + fc.total + '</b><p>' +
        (fc.hard ? '记不住的还在包里，练熟一张销一张' : (fc.got >= fc.total ? '诸条记全，理气双长' : '没记住的下轮还会绕回来')) + '</p></div>';
      $('#fcAgain').disabled = true; $('#fcGot').disabled = true;
      chime(523.25, 0.13, 1.6);
      return;
    }
    var it = fc.queue[0];
    p.textContent = '还剩 ' + fc.queue.length + ' 张 · 记住 ' + fc.got + ' 张' + (fc.hard ? ' · 难卡包模式' : '');
    c.innerHTML = '<div class="fc-tag">' + it.icon + ' 出自《' + it.from + '》</div><div class="fc-pt">' + it.txt + '</div>' +
      '<button class="btn ghost sm fc-hard' + (S.isHard(it.id) ? ' on' : '') + '" id="fcHard">' +
      (S.isHard(it.id) ? '⛰ 已在难卡包（点移除）' : '⛰ 记不准，丢进难卡包') + '</button>';
    $('#fcAgain').disabled = false; $('#fcGot').disabled = false;
    $('#fcHard').addEventListener('click', function () {
      S.toggleHard(it.id);
      refreshKnowHead();
      fcShow(); /* 重画卡面钮态 */
    });
  }
  function fcOpen(hardMode) {
    /* 全部要点入队列，按当年天数错位轮播；难卡包模式只抽被 mark 的卡 */
    var items = [];
    DATA.knowledge.forEach(function (kn) {
      kn.points.forEach(function (p, pi) { items.push({ id: kn.id + ':' + pi, icon: kn.icon, from: kn.title, txt: p }); });
    });
    var off = dayOfYear() % items.length;
    items = items.slice(off).concat(items.slice(0, off));
    if (hardMode) items = items.filter(function (it) { return S.isHard(it.id); });
    fc.hard = !!hardMode;
    fc.queue = items;
    fc.total = items.length; fc.got = 0; fc.logged = false;
    $('#fcMask').classList.remove('hidden');
    fcShow();
  }
  $('#fcGot').addEventListener('click', function () {
    var it = fc.queue.shift();
    if (it) S.unhard(it.id); /* 记住了就销难账 */
    fc.got++;
    fcShow(); refreshKnowHead();
  });
  $('#fcAgain').addEventListener('click', function () { var it = fc.queue.shift(); if (it) fc.queue.push(it); fcShow(); });
  $('#fcClose').addEventListener('click', function () { $('#fcMask').classList.add('hidden'); });

  /* ================= 复习台 ================= */
  /* 抽卡、难卡、错题、未读四件事拢到一个浮层里，练完想温习不用翻来翻去 */
  function paintReview() {
    var box = $('#rvBody');
    if (!box) return;
    var total = DATA.knowledge.length;
    var hn = S.hardCount(), ws = S.wrongList().length;
    var unread = DATA.knowledge.filter(function (k) { return !S.isRead(k.id); }).length;
    var fs = S.fcStat();
    function row(icon, name, stat, btnId, label, disabled, tip) {
      return '<div class="rv-row"><div class="rv-info"><span class="rv-name">' + icon + ' ' + name + '</span>' +
        '<span class="rv-stat">' + stat + '</span></div>' +
        '<button class="btn primary sm" id="' + btnId + '"' + (disabled ? ' disabled' : '') + (tip ? ' title="' + tip + '"' : '') + '>' + label + '</button></div>';
    }
    box.innerHTML =
      row('🃏', '全量抽卡', '知识要点共 ' + total + ' 篇' + (fs.rounds ? ' · 已抽 ' + fs.rounds + ' 轮（上轮记住 ' + fs.lastGot + '/' + fs.lastTotal + '）' : ''), 'rvFc', '开一轮抽卡', !total, '把所有要点打乱轮一遍') +
      row('⛰', '难卡包', hn ? '包内 ' + hn + ' 张 · 卡面上随手归档' : '还没存难卡 · 抽卡时点「归入难卡」收进来', 'rvHard', '专攻难卡', !hn, '只抽被标记的难卡') +
      row('📕', '错题订正', ws ? '待订正 ' + ws + ' 题 · 补对自动销账' : '暂无错题 · 随堂小测答错就记进来', 'rvWrong', '直达第一篇', !ws, '跳到第一道待订正的篇目') +
      row('📖', '续读一篇', unread ? '还有 ' + unread + ' 篇未读完（已读 ' + (total - unread) + '/' + total + '）' : '全部读完 · 明理圆满 🎉', 'rvNext', unread ? '读下一篇未读的' : '无需再读', !unread, '展开未读的那篇并滚到眼前');
    $('#rvFc').addEventListener('click', function () { $('#rvMask').classList.add('hidden'); fcOpen(false); });
    $('#rvHard').addEventListener('click', function () { $('#rvMask').classList.add('hidden'); fcOpen(true); });
    $('#rvWrong').addEventListener('click', function () {
      $('#rvMask').classList.add('hidden');
      showPage('knowledge');
      var ws0 = S.wrongList();
      var kn0 = DATA.knowledge.find(function (k) { return ws0.indexOf(k.id) >= 0 && !S.quizPassed(k.id); });
      if (kn0) rvJumpCard(kn0.id);
    });
    $('#rvNext').addEventListener('click', function () {
      var kn1 = DATA.knowledge.find(function (k) { return !S.isRead(k.id); });
      if (!kn1) return;
      $('#rvMask').classList.add('hidden');
      showPage('knowledge');
      rvJumpCard(kn1.id);
    });
  }
  function rvJumpCard(id) {
    /* 知识卡是原地保留不重渲染的，这里直接找 details 展开滚过去 */
    setTimeout(function () {
      var cards = $$('#knowList .know-card');
      var c = cards.filter(function (x) { return x._kn && x._kn.id === id; })[0];
      if (!c) return;
      c.open = true;
      c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
      setTimeout(function () { c.classList.remove('flash'); }, 1600);
    }, 60);
  }
  function reviewOpen() {
    paintReview();
    $('#rvMask').classList.remove('hidden');
  }
  $('#rvClose').addEventListener('click', function () { $('#rvMask').classList.add('hidden'); });

  /* 键盘快捷键：空格暂停/继续，←→切换动作，Esc 退出 */
  document.addEventListener('keydown', function (e) {
    var mask = $('#helpMask');
    var helpOpen = mask && !mask.classList.contains('hidden');
    var inField = e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    /* ? 全局开关帮助（输入框里不打断；开着时 ?/Esc 只关浮层，不落到跟练分支） */
    if (!inField && (e.key === '?' || (e.code === 'Slash' && e.shiftKey))) {
      e.preventDefault(); toggleHelp(!helpOpen); return;
    }
    if (helpOpen && e.key === 'Escape') { e.preventDefault(); toggleHelp(false); return; }
    /* 复习台/清空确认浮层开着时，Esc 只收浮层 */
    var rv = $('#rvMask');
    var rvOpen = rv && !rv.classList.contains('hidden');
    if (rvOpen && e.key === 'Escape') { e.preventDefault(); rv.classList.add('hidden'); return; }
    var wm = $('#wipeMask');
    if (wm && !wm.classList.contains('hidden') && e.key === 'Escape') { e.preventDefault(); closeWipe(); return; }
    /* 全局小键：R 朗读当前展开的那篇知识，M 换一档演武台晨昏 */
    if (!inField && !helpOpen && !Train.active && e.code === 'KeyR' && $('#page-knowledge').classList.contains('on')) {
      e.preventDefault();
      var opens = $$('.know-card[open]');
      var tgt = opens.length ? opens[opens.length - 1] : $('.know-card');
      if (tgt && tgt._kn) {
        var rb = tgt.querySelector('.rd-btn');
        if (rb) rdStart(tgt._kn, rb);
      }
      return;
    }
    if (!inField && !helpOpen && e.code === 'KeyM') { e.preventDefault(); moodNext(); return; }
    /* V 键随时进复习台（浮层开着时不重复弹） */
    if (!inField && !helpOpen && !Train.active && e.code === 'KeyV') {
      e.preventDefault();
      var rvk = $('#rvMask');
      if (rvk && !rvk.classList.contains('hidden')) { rvk.classList.add('hidden'); return; }
      reviewOpen(); return;
    }
    if (!Train.active) return;
    if (inField) return;
    if (e.code === 'Space') { e.preventDefault(); Train.togglePause(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); Train.jump(1); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); Train.jump(-1); }
    else if (e.code === 'Escape') { Train.stop(true); resetStage(); goBack(); }
  });

  /* ---- 快捷键帮助浮层 ---- */
  function toggleHelp(to) {
    var mask = $('#helpMask');
    if (!mask) return;
    var show = to === null ? mask.classList.contains('hidden') : to;
    mask.classList.toggle('hidden', !show);
  }
  $('#helpBtn').addEventListener('click', function () { toggleHelp(null); });
  $('#footHelp').addEventListener('click', function (e) { e.preventDefault(); toggleHelp(true); });
  $('#helpClose').addEventListener('click', function () { toggleHelp(false); });
  $('#helpMask').addEventListener('click', function (e) { if (e.target === this) toggleHelp(false); });

  /* ---- 每日一句养生箴言（按年内天数轮换，可手动换一句） ---- */
  var quoteOffset = 0;
  function renderQuote() {
    var el = $('#dailyQuote');
    if (!el) return;
    var qs = DATA.quotes || [];
    if (!qs.length) { el.classList.add('hidden'); return; }
    var now = new Date();
    var doy = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 0)) / 86400000);
    var q = qs[(doy + quoteOffset) % qs.length];
    el.innerHTML = '<span class="dq-txt">🍵 今日一句：' + q.t + ' —— ' + q.s + '</span>' +
      (qs.length > 1 ? '<button class="dq-next" id="quoteNext" title="换一句箴言看看">↻ 换一句</button>' : '');
    var nb = $('#quoteNext');
    if (nb) nb.addEventListener('click', function () { quoteOffset = (quoteOffset + 1) % qs.length; renderQuote(); });
  }

  /* ================= 打卡成就页 ================= */
  var calDate = new Date();

  /* 备份区上次备份/恢复时间小结：只在有记录时露出 */
  function renderBackupInfo() {
    var el = $('#backupInfo');
    if (!el) return;
    var bi = S.backupInfo();
    if (!bi.lastBackup && !bi.lastImport) { el.classList.add('hidden'); el.textContent = ''; return; }
    el.classList.remove('hidden');
    var _ds = S.records().map(function (r) { return r.d; }).sort();
    var _span = _ds.length ? ' · 记录跨度 <b>' + _ds[0] + '</b> ~ <b>' + _ds[_ds.length - 1] + '</b>' : '';
    el.innerHTML = '🗂 上次备份：' + (bi.lastBackup || '从未') + ' · 上次恢复：' + (bi.lastImport || '从未') + ' · 现有 <b>' + S.records().length + '</b> 条记录' + _span;
  }

  function renderCheckin() {
    var mins = S.totalSec() > 0 ? Math.max(1, Math.round(S.totalSec() / 60)) : 0;
    var _td = new Date(S.todayStr());
    var _mMap = S.monthMap(_td.getFullYear(), _td.getMonth());
    var _mSess = Object.keys(_mMap).reduce(function (a, k) { return a + (_mMap[k] || 0); }, 0);
    $('#statRow').innerHTML =
      statBox(S.streak(), '天', '当前连续', true) +
      statBox(S.streakMax(), '天', '最长连续') +
      statBox(S.totalDays(), '天', '累计打卡', true) +
      statBox(mins, '分钟', '累计练功时长') +
      statBox(S.weekReport().sessions, '次', '本周练功') +
      statBox(_mSess, '次', '本月练功') +
      statBox(S.learnedTotal(), '/' + moveTotal, '已学动作') +
      statBox(S.favIds().length, '套', '收藏功法');

    renderCalendar();
    renderWeekCard();
    renderTimeDist();
    renderMoveRank();
    renderTodoMoves();
    renderBackupInfo();

    var bg = $('#badgeGrid');
    bg.innerHTML = '';
    S.badges(DATA.sets.length, moveTotal).forEach(function (b) {
      var el = document.createElement('div');
      el.className = 'badge' + (b.got ? ' got' : '');
      el.innerHTML = '<span class="bi">' + b.icon + '</span><div class="bn">' + b.name + '</div><div class="bd">' + b.desc + '</div>';
      bg.appendChild(el);
    });

    var list = $('#recordList');
    var recs = S.records().slice(-12).reverse();
    list.innerHTML = recs.length ? '' : '<li class="empty">还没有跟练记录，去功法学堂挑一套开练吧 🌿</li>';
    recs.forEach(function (r) {
      var st = DATA.sets.find(function (s) { return s.id === r.set; });
      var li = document.createElement('li');
      var slotIco = (typeof r.hour === 'number') ? SLOT_ICON[slotLabel(r.hour)] : '';
      var _wd = ['日', '一', '二', '三', '四', '五', '六'][new Date(r.d).getDay()];
      li.innerHTML = '<b>' + r.d + ' <i class="rec-wk">周' + _wd + '</i>' + (slotIco ? ' <i class="rec-slot" title="' + slotLabel(r.hour) + '时练" style="font-style:normal">' + slotIco + '</i>' : '') + '</b><span>' + (r.set === 'calm' ? '🍃 定息六息' : (st ? st.icon + ' ' + st.name : '🍂 旧存档功法')) + '</span><span>约 ' + Math.max(1, Math.round((r.sec || 0) / 60)) + ' 分钟</span><span>' + (r.set === 'calm' ? (r.breaths || 6) + ' 息' : ((r.moves || []).length) + ' 式') + '</span>' +
        (r.note ? '<i class="rec-note">💬 ' + String(r.note).replace(/[<>]/g, '') + '</i>' : '');
      list.appendChild(li);
    });
  }
  function statBox(v, unit, label, gold) {
    return '<div class="stat-box' + (gold ? ' gold' : '') + '"><b>' + v + '<small style="font-size:14px"> ' + unit + '</small></b><span>' + label + '</span></div>';
  }

  /* 练功时段分布：四段横向条，随真实打卡时刻生长 */
  function renderTimeDist() {
    var el = $('#timeDist');
    if (!el) return;
    var b = S.timeBuckets(), max = 0, total = 0, topIdx = -1;
    b.forEach(function (x, i) { if (x.n > max) { max = x.n; topIdx = i; } total += x.n; });
    el.innerHTML = '';
    var head = document.createElement('div');
    head.className = 'td-head';
    head.textContent = total ? '⏰ 练功时段分布（按时分归段，共 ' + total + ' 次带时刻的跟练）' : '⏰ 练功时段分布：完成一次带时刻记录的跟练后，这里会长出你的练功生物钟';
    el.appendChild(head);
    if (!total) return;
    b.forEach(function (x, i) {
      var row = document.createElement('div');
      row.className = 'td-row' + (i === topIdx ? ' td-top' : '');
      row.title = x.tip;
      var w = max ? Math.round(x.n / max * 100) : 0;
      var pct = total ? Math.round(x.n / total * 100) : 0;
      row.innerHTML = '<span class="td-lb">' + x.icon + ' ' + x.name + (i === topIdx ? ' <em class="td-flag">最勤</em>' : '') + '</span>' +
        '<span class="td-bar"><i style="width:' + w + '%"></i></span>' +
        '<span class="td-n">' + (x.n ? x.n + ' 次 · ' + pct + '%' : '—') + '</span>';
      el.appendChild(row);
    });
  }

  /* 式 id 反查所属功法与式本身（功夫榜、旧记录展示都用这一个口径） */
  function findMove(mid) {
    var hit = null;
    DATA.sets.some(function (s) {
      var m = s.moves.filter(function (x) { return x.id === mid; })[0];
      if (m) { hit = { set: s, move: m }; return true; }
      return false;
    });
    return hit;
  }

  /* 我的功夫榜：练得最多的几式排前面，点一下直接重练这一式 */
  function renderMoveRank() {
    var el = $('#moveRank');
    if (!el) return;
    /* 先取全量（大 n），过滤掉字典里查不到的旧式 id，再截前 8：免脏 id 挤掉好卡、造成序号空洞 */
    var all = S.moveRank(9999).filter(function (it) { return !!findMove(it.move); });
    var rk = all.slice(0, 8);
    var _rkWkFrom = S.weekReport().rangeFrom;
    var _wkRecs = S.records().filter(function (r) { return r.d >= _rkWkFrom; });
    el.innerHTML = '';
    if (!rk.length) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    var medal = ['🥇', '🥈', '🥉'];
    var head = document.createElement('div');
    head.className = 'mr-head';
    head.textContent = '🏆 我的功夫榜 · 练得最多的式（共练过 ' + all.length + ' 式，点一下重练这一式）';
    el.appendChild(head);
    rk.forEach(function (it, i) {
      var fm = findMove(it.move); /* 上面已过滤，这里必命中 */
      var row = document.createElement('div');
      row.className = 'mr-row';
      var b = document.createElement('button');
      b.className = 'mr-name';
      b.textContent = fm.move.name;
      b.title = '跟练 ' + fm.move.name + ' 单式';
      b.addEventListener('click', function () { Train.start(fm.set, [fm.move], 'single'); });
      row.innerHTML = '<span class="mr-rank">' + (medal[i] || (i + 1)) + '</span>';
      row.appendChild(b);
      /* 星标与首页常练式同一口径：点星即收进那一排，两处同进同出 */
      var star = document.createElement('button');
      star.className = 'mr-star';
      var onFav = function () { star.textContent = S.isMoveFav(fm.set.id, fm.move.id) ? '★' : '☆'; };
      onFav();
      star.title = '星标为常练式（首页“我的常练式”同步收放）';
      star.addEventListener('click', function () {
        S.toggleMoveFav(fm.set.id, fm.move.id);
        onFav();
        renderFavMoves();
      });
      row.appendChild(star);
      var meta = document.createElement('span');
      meta.className = 'mr-meta';
      var _wkN = _wkRecs.filter(function (r) { return (r.moves || []).indexOf(fm.move.id) >= 0; }).length;
      meta.textContent = fm.set.icon + ' ' + fm.set.name + ' · 练过 ' + it.count + ' 场 · 最近 ' + it.last + (_wkN ? ' · 本周 ' + _wkN + ' 场' : '');
      row.appendChild(meta);
      el.appendChild(row);
    });
  }

  /* 待补的式：把从未在任何记录里出现过的式按功法分组列出，鼓动凑齐 */
  function renderTodoMoves() {
    var el = $('#todoMoves');
    if (!el) return;
    el.innerHTML = '';
    if (!S.totalSess()) { el.classList.add('hidden'); return; } /* 还没开练不剧透，不留一整墙待补吓人 */
    var seen = S.trainedMoveIds();
    var groups = [], todoTotal = 0;
    DATA.sets.forEach(function (st) {
      var todo = st.moves.filter(function (m) { return !seen[m.id]; });
      todoTotal += todo.length;
      if (todo.length) groups.push({ set: st, todo: todo, full: todo.length === st.moves.length });
    });
    el.classList.remove('hidden');
    if (!todoTotal) {
      var ok = document.createElement('div');
      ok.className = 'tm-head tm-done';
      ok.textContent = '🈵 待补清单已清空——四功 ' + moveTotal + ' 式都至少练过一遍了';
      el.appendChild(ok);
      return;
    }
    var head = document.createElement('div');
    head.className = 'tm-head';
    head.textContent = '🧩 待补的式 · 还有 ' + todoTotal + ' 式没练过（点一下补这一式）';
    el.appendChild(head);
    var shown = 0, CAP = 14;
    groups.forEach(function (g) {
      if (shown >= CAP) return;
      var row = document.createElement('div');
      row.className = 'tm-group';
      var lb = document.createElement('span');
      lb.className = 'tm-set';
      lb.textContent = g.set.icon + ' ' + g.set.name + (g.full ? ' · 还没碰过' : ' · 差 ' + g.todo.length + ' 式');
      row.appendChild(lb);
      /* 集式进度微条：已练过多少式/共多少式，凑齐的动力看得见 */
      var doneCnt = g.set.moves.length - g.todo.length;
      var pctv = Math.round(doneCnt / g.set.moves.length * 100);
      var pb = document.createElement('span');
      pb.className = 'tm-prog';
      pb.innerHTML = '集 ' + doneCnt + '/' + g.set.moves.length + '<i class="tm-prog-bar"><b style="width:' + pctv + '%"></b></i>';
      row.appendChild(pb);
      if (g.full) { /* 整套未碰：不拆成一堆单式，直接给整套开练 */
        var fb = document.createElement('button');
        fb.className = 'btn primary sm';
        fb.textContent = '▶ 整套开练';
        fb.addEventListener('click', function () { Train.start(g.set, g.set.moves, 'full'); });
        row.appendChild(fb);
        el.appendChild(row);
        return;
      }
      var chips = document.createElement('div');
      chips.className = 'tm-chips';
      g.todo.forEach(function (m) {
        if (shown >= CAP) return;
        var c = document.createElement('button');
        c.className = 'tm-chip';
        c.textContent = m.name;
        c.title = '跟练 ' + m.name + ' 单式';
        c.addEventListener('click', function () { Train.start(g.set, [m], 'single'); });
        chips.appendChild(c);
        shown++;
      });
      row.appendChild(chips);
      el.appendChild(row);
    });
    if (todoTotal > CAP) {
      var more = document.createElement('div');
      more.className = 'tm-more';
      more.textContent = '……另有 ' + (todoTotal - CAP) + ' 式待补，零散多练几场就集齐了';
      el.appendChild(more);
    }
  }

  /* 周练报告：近 7 天小结 + 周练目标环，完全由真实打卡记录推导 */
  var lastGoalHit = null;
  function renderWeekCard() {
    var el = $('#weekCard');
    if (!el) return;
    var w = S.weekReport();
    var body;
    if (!w.sessions) {
      body = '<div class="wk-body wk-empty">近 7 天还没有练功记录。练完一次整套，这里就会替你算好账。</div>';
    } else {
      var delta = w.dayCount - w.prevDayCount;
      var trendTxt = w.prevDayCount === 0 ? (w.dayCount + ' 天 · 从零起步最难得') :
        delta > 0 ? ('比上周多 ' + delta + ' 天，见功了') :
        delta < 0 ? ('比上周少 ' + (-delta) + ' 天，松一松还能追回来') : '与上周打平，贵在照常';
      var topSet = w.topSet && DATA.sets.find(function (x) { return x.id === w.topSet; });
      var line2 = topSet ? ('练得最多的是 ' + topSet.icon + ' ' + topSet.name + '（' + w.topN + ' 次）') : '先把第一套跟下来';
      var line3 = w.dayCount >= 5 ? '💚 已入佳境，气息渐稳' : w.dayCount >= 3 ? '🌿 节奏渐稳，继续保持' : '🌱 刚起步，下周试试隔天练一次';
      var slotLine = w.topSlot ? ('⏰ 本周你最常在这个时段练：' + SLOT_TXT[w.topSlot] + '（' + w.topSlotN + ' 次）' + (w.slotKinds > 1 ? ' · 共跨 ' + w.slotKinds + ' 个时段' : ' · 只囿于一个时段')) : '';
      /* 单日最勤：某天练了 2 场以上才值得单拎出来，否则天天打平没意义 */
      var WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      var busiLine = '';
      if (w.topDay && w.topDayN >= 2) {
        var dt = new Date(w.topDay + 'T00:00:00');
        busiLine = '🗓 本周最勤的是 ' + (WD[dt.getDay()] || w.topDay) + '（一天 ' + w.topDayN + ' 场），劳逸有度';
      }
      var calmLine = w.calmCount ? '🍃 本周定息 ' + w.calmCount + ' 次' + (w.calmMin ? '（共 ' + w.calmMin + ' 分）' : '') + '，静可生慧' : '';
      /* 功法多样性：练得杂夸均衡，只咬一套则提醒换换 */
      var varLine = '';
      if (w.sets >= 3) varLine = '🌈 本周碰了 ' + w.sets + ' 种功法，五脏皆调';
      else if (w.sets === 1 && w.sessions >= 3) varLine = '🔁 本周只咬着一套，换换功法更均衡';
      var dayAvg = w.dayCount ? Math.round(w.min / w.dayCount) : 0;
      body = '<div class="wk-body">' +
        '<div>本周练了 <b>' + w.dayCount + '</b> 天 · 共 <b>' + w.sessions + '</b> 次 · <b>' + w.min + '</b> 分钟 · 碰了 <b>' + w.sets + '/' + DATA.sets.length + '</b> 种功法' + (dayAvg ? ' · 日均约 <b>' + dayAvg + '</b> 分钟' : '') + '</div>' +
        '<div>' + trendTxt + '；' + line2 + '。</div>' +
        (slotLine ? '<div class="wk-slot">' + slotLine + '</div>' : '') +
        (varLine ? '<div class="wk-var">' + varLine + '</div>' : '') +
        (busiLine ? '<div class="wk-busy">' + busiLine + '</div>' : '') +
        (calmLine ? '<div class="wk-calm">' + calmLine + '</div>' : '') +
        '<div>' + line3 + '</div></div>';
    }
    /* 目标环：次数达标转金色，首次跨线补一声磬 */
    var goal = S.weekGoal(), sess = w.sessions || 0;
    var pct = Math.min(100, Math.round(sess / goal * 100));
    var hit = sess >= goal;
    el.innerHTML = '<div class="wk-head">🗒 周练报告 <span class="wk-range">' + w.rangeFrom + ' ~ ' + w.rangeTo + '</span> <span class="wk-today' + (S.recordsOfDay(S.todayStr()).length ? ' on' : '') + '">' + (S.recordsOfDay(S.todayStr()).length ? '✓ 今日已练' : '⭕ 今日未练') + '</span></div>' + body +
      '<div class="wk-goal-row">' +
      '<div class="wk-ring' + (hit ? ' hit' : '') + '" style="--p:' + pct + '"><b>' + Math.min(sess, goal) + '/' + goal + '</b></div>' +
      '<div class="wk-goal-side">' +
      '<span class="wk-goal-t">🎯 周练目标 <button id="goalDn" title="减一次">−</button> ' + goal + ' 次/周 <button id="goalUp" title="加一次">+</button></span>' +
      '<span class="wk-goal-hint">' + (hit ? (sess > goal ? ('目标已超额 ' + (sess - goal) + ' 场，功夫没白下 🎉') : '目标恰好达成，功夫没白下 🎉') : '还差 ' + (goal - sess) + ' 次，一套八段锦也就十分钟') + '</span>' +
      '</div></div>';
    $('#goalDn').addEventListener('click', function () { S.setWeekGoal(S.weekGoal() - 1); renderWeekCard(); });
    $('#goalUp').addEventListener('click', function () { S.setWeekGoal(S.weekGoal() + 1); renderWeekCard(); });
    if (hit && lastGoalHit === false) { chime(523.25, 0.13, 1.6); setTimeout(function () { chime(659.25, 0.11, 1.4); }, 260); }
    lastGoalHit = hit;
  }

  function renderCalendar() {
    var y = calDate.getFullYear(), m = calDate.getMonth();
    $('#calTitle').textContent = y + ' 年 ' + (m + 1) + ' 月';
    var week = ['日', '一', '二', '三', '四', '五', '六'];
    $('#calWeek').innerHTML = week.map(function (w) { return '<div>' + w + '</div>'; }).join('');
    var map = S.monthMap(y, m);
    var smap = S.monthSetMap(y, m);
    var first = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var today = S.todayStr();
    var html = '';
    for (var i = 0; i < first; i++) html += '<div class="cal-cell blank"></div>';
    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var n = map[ds] || 0;
      /* 彩色功法点：那天练过哪几套就涂哪几个色（定息用青色） */
      var dots = '';
      var sids = smap[ds] || [];
      if (sids.length) {
        dots = '<span class="cal-dots">' + sids.slice(0, 4).map(function (sid) {
          var s0 = DATA.sets.find(function (x) { return x.id === sid; });
          var col = s0 ? s0.color : (sid === 'calm' ? '#5fd6b8' : 'var(--sub)');
          return '<i style="background:' + col + '" title="' + (s0 ? s0.name : sid === 'calm' ? '定息' : sid) + '"></i>';
        }).join('') + '</span>';
      }
      html += '<div class="cal-cell' + (n ? ' done' + (n > 1 ? ' multi' : '') : '') + (ds === today ? ' today' : '') + '"' + (n ? ' data-ds="' + ds + '" title="' + ds + ' · 练了 ' + n + ' 场，点看明细"' : '') + '>' + d + dots + '</div>';
    }
    $('#calGrid').innerHTML = html;
    /* 本月汇总：练过的天数 + 总场次 + 最热一天，帮一眼看清这个月的功夫 */
    var mDays = 0, mSess = 0, mMaxN = 0, mMaxDs = '';
    Object.keys(map).forEach(function (k) {
      var n = map[k] || 0;
      if (n > 0) { mDays++; mSess += n; if (n > mMaxN) { mMaxN = n; mMaxDs = k; } }
    });
    var foot = $('#calFoot');
    if (foot) {
      var curMon = (y === new Date(S.todayStr()).getFullYear() && m === new Date(S.todayStr()).getMonth());
      foot.innerHTML = mDays
        ? '<b>' + (curMon ? '本月' : '该月') + '</b>练功 <b>' + mDays + '</b> 天 · 共 <b>' + mSess + '</b> 场' + (mMaxN > 1 ? ' · 最勤 ' + mMaxDs.slice(5) + '（' + mMaxN + ' 场）' : '')
        : '这个月还没有练功记录，翻个月看看功夫足迹';
    }
  }
  function hideDayPop() { var p = $('#dayPop'); if (p) { p.classList.add('hidden'); p.innerHTML = ''; } SHOW_ALL = {}; }
  var SHOW_ALL = {}; /* 当日明细的“展开全部式”开关，按行序号记，收起时清 */
  $('#calPrev').addEventListener('click', function () { calDate.setMonth(calDate.getMonth() - 1); hideDayPop(); renderCalendar(); });
  $('#calNext').addEventListener('click', function () { calDate.setMonth(calDate.getMonth() + 1); hideDayPop(); renderCalendar(); });

  /* 当日明细里的式名 chip：点一下直接重练那一式，旧记录不用从头翻 */
  function mkMoveChip(st, m) {
    var b = document.createElement('button');
    b.className = 'dp-mchip';
    b.textContent = m.name;
    b.title = '跟练 ' + m.name + ' 单式';
    b.addEventListener('click', function (ev) {
      ev.stopPropagation();
      Train.start(st, [m], 'single');
    });
    return b;
  }

  /* 日历当日明细：点练过的格子展开那天的场次清单 */
  function paintDayPop(ds) {
    var pop = $('#dayPop');
    if (!pop) return;
    var recs = S.recordsOfDay(ds);
    if (!recs.length) { pop.classList.add('hidden'); return; }
    pop.innerHTML = '<div class="dp-head">🗓 ' + ds + ' · 当日 ' + recs.length + ' 场 · 共约 ' + Math.max(1, Math.round(recs.reduce(function (a, r) { return a + (r.sec || 0); }, 0) / 60)) + ' 分钟<button class="btn ghost sm" id="dpX">收起</button></div>' +
      recs.map(function (r) {
        var st = DATA.sets.find(function (s) { return s.id === r.set; });
        var hh = r.hour == null ? '🕒' : (r.hour < 5 || r.hour >= 23) ? '🌙' : r.hour < 11 ? '🌅' : r.hour < 17 ? '☀️' : '🌆';
        var label = r.set === 'calm' ? '🍃 定息六息' : (st ? st.icon + ' ' + st.name : '🍂 旧存档功法');
        return '<div class="dp-row" data-ri="' + recs.indexOf(r) + '">' + hh + ' ' + label +
          ' · 约 ' + Math.max(1, Math.round((r.sec || 0) / 60)) + ' 分钟 · ' + (r.set === 'calm' ? (r.breaths || 6) + ' 息' : ((r.moves || []).length) + ' 式') +
          (r.note ? '<i class="dp-note">💬 ' + String(r.note).replace(/[<>]/g, '') + '</i>' : '') + '</div>';
      }).join('');
    /* 逐行挂上本场练过的式（最多先露 6 个，想全看再展开） */
    recs.forEach(function (r, ri) {
      var st2 = DATA.sets.find(function (s) { return s.id === r.set; });
      if (!st2 || !(r.moves || []).length) return;
      var rowEl = pop.querySelector('.dp-row[data-ri="' + ri + '"]');
      if (!rowEl) return;
      var box = document.createElement('span');
      box.className = 'dp-moves';
      var ms = st2.moves.filter(function (m) { return r.moves.indexOf(m.id) >= 0; });
      var shown = SHOW_ALL[ds + ':' + ri] ? ms : ms.slice(0, 6);
      shown.forEach(function (m) { box.appendChild(mkMoveChip(st2, m)); });
      if (ms.length > shown.length) {
        var more = document.createElement('button');
        more.className = 'dp-mchip more';
        more.textContent = '+' + (ms.length - shown.length);
        more.title = '展开剩下的式';
        more.addEventListener('click', function (ev) { ev.stopPropagation(); SHOW_ALL[ds + ':' + ri] = true; paintDayPop(ds); });
        box.appendChild(more);
      }
      rowEl.appendChild(box);
    });
    pop.classList.remove('hidden');
    $('#dpX').addEventListener('click', function (ev) {
      ev.stopPropagation();
      pop.classList.add('hidden'); pop.innerHTML = ''; SHOW_ALL = {};
    });
  }
  $('#calGrid').addEventListener('click', function (e) {
    var cell = e.target.closest ? e.target.closest('.cal-cell.done') : null;
    var pop = $('#dayPop');
    if (!pop) return;
    if (!cell) { pop.classList.add('hidden'); pop.innerHTML = ''; return; }
    paintDayPop(cell.dataset.ds);
  });

  /* ================= 知识页 ================= */
  /* 只看未读：把读过的暂时藏起、没读的排在前，切页/标记后都重画 */
  var knUnread = false;
  function applyKnowFilter() {
    var hint = $('#knFilterHint');
    if (!hint) return;
    if (!knUnread) {
      $$('#knowList .know-card').forEach(function (el) { el.classList.remove('khide'); });
      hint.classList.add('hidden'); hint.textContent = ''; return;
    }
    var hid = 0;
    $$('#knowList .know-card').forEach(function (el) {
      var hide = S.isRead(el._kn.id);
      el.classList.toggle('khide', hide);
      if (hide) hid++;
    });
    var unread = DATA.knowledge.length - S.readCount();
    hint.textContent = '📖 只看未读 · 待读 ' + unread + ' 篇' + (hid ? '（已藏起读过的 ' + hid + ' 篇）' : '（都还没读，全在这）');
    hint.classList.remove('hidden');
  }
  /* 统计条提升到模块级：抽卡过完一轮也能回头重画，不困在闭包里 */
  function paintKnowHead(sp) {
    sp = sp || $('#knowStats');
    if (!sp) return;
    var total = DATA.knowledge.length, qc = S.quizCount(), fs = S.fcStat(), unread = total - S.readCount();
    var _wl = S.wrongList().length;
    sp.innerHTML = '已读 <b>' + S.readCount() + '</b> / ' + total + ' 篇' + (unread > 0 ? ' · 待读 <b>' + unread + '</b> 篇' : ' · 明理圆满 🎉') +
      ' · 小测过关 <b>' + qc + '</b> / ' + total + (qc === total && total ? ' · 全部拿捏 🈴' : '') +
      (_wl ? ' · 待复习错题 <b>' + _wl + '</b> 道' : '') +
      (fs.rounds ? ' · 抽卡 <b>' + fs.rounds + '</b> 轮（上轮记住 ' + fs.lastGot + '/' + fs.lastTotal + '）' : '');
  }
  function renderKnowledge() {
    var box = $('#knowList');
    box.innerHTML = '';
    var total = DATA.knowledge.length, rc = S.readCount();
    var head = document.createElement('div');
    head.className = 'know-progress';
    var hn = S.hardCount();
    head.innerHTML = '<span id="knowStats"></span> <button class="btn ghost sm" id="rvBtn" title="抽卡、难卡、错题、续读一处直达">🧠 复习台</button>' +
      '<button class="btn ghost sm" id="fcBtn">🃏 抽卡复习</button>' +
      '<button class="btn ghost sm" id="fcHardBtn" title="卡面上随手归档的难卡，单独抽一轮">⛰ 难卡包 ' + hn + '</button>' +
      '<button class="btn ghost sm" id="knUnreadBtn" title="只留没读过的，读完的自然往后藏">📖 只看未读</button>';
    box.appendChild(head);
    var kfh = document.createElement('div'); kfh.id = 'knFilterHint'; kfh.className = 'kn-hint hidden'; box.appendChild(kfh);
    paintKnowHead();
    $('#rvBtn').addEventListener('click', reviewOpen);
    $('#fcBtn').addEventListener('click', function () { fcOpen(false); });
    var fhh = $('#fcHardBtn');
    fhh.disabled = !hn; /* 零卡时钮灰，不抽空包 */
    fhh.addEventListener('click', function () { fcOpen(true); });
    var ubn = $('#knUnreadBtn');
    if (ubn) { ubn.classList.toggle('on', knUnread); ubn.addEventListener('click', function () { knUnread = !knUnread; ubn.classList.toggle('on', knUnread); applyKnowFilter(); }); }
    /* 错题本横幅：答错记账、补对销账，一键直达待订正篇 */
    var wbar = document.createElement('div');
    wbar.className = 'quiz-wrongs hidden';
    box.appendChild(wbar);
    var cardEls = {};
    function paintWrongBar() {
      var ws = S.wrongList();
      if (!ws.length) { wbar.classList.add('hidden'); wbar.innerHTML = ''; return; }
      var kn0 = DATA.knowledge.find(function (k) { return ws.indexOf(k.id) >= 0; });
      wbar.innerHTML = '<span class="qw-txt">📕 待订正的错题 <b>' + ws.length + '</b> 题——错一处，长一智</span>';
      if (kn0) {
        var gb = document.createElement('button');
        gb.className = 'btn primary sm';
        gb.textContent = '▶ 去补第一题';
        gb.addEventListener('click', function () {
          var c = cardEls[kn0.id];
          if (!c) return;
          c.open = true;
          c.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        wbar.appendChild(gb);
      }
      wbar.classList.remove('hidden');
    }
    paintWrongBar();
    DATA.knowledge.forEach(function (kn) {
      var isRead = S.isRead(kn.id);
      var isWrong = S.wrongList().indexOf(kn.id) >= 0 && !S.quizPassed(kn.id);
      var el = document.createElement('details');
      el.className = 'know-card' + (isRead ? ' read' : '');
      el._kn = kn; /* 供 R 键找到要朗读的那一篇 */
      cardEls[kn.id] = el;
      el.innerHTML = '<summary><span class="ki">' + kn.icon + '</span>' + kn.title +
        (isRead ? '<span class="read-dot" title="已读">✓</span>' : '') +
        (isWrong ? '<span class="wrong-dot" title="这篇小测错过">📕</span>' : '') + '</summary>' +
        '<div class="kb">' + kn.points.map(function (p) { return '<p>· ' + p + '</p>'; }).join('') +
        '<div class="kb-foot"></div></div>';
      var f = el.querySelector('.kb-foot');
      /* 朗读进度锚：跟卡走，切篇重渲染也不丢 */
      var rdp = document.createElement('span');
      rdp.className = 'rd-prog hidden';
      f.appendChild(rdp);
      f._rdProg = rdp;
      /* 全篇朗读：眼睛累了让耳朵接一下 */
      var rb = document.createElement('button');
      rb.className = 'btn ghost sm rd-btn';
      rb.textContent = '🔊 朗读全篇';
      rb.addEventListener('click', function () { rdStart(kn, rb); });
      f.appendChild(rb);
      var btn = document.createElement('button');
      btn.className = 'btn ' + (isRead ? 'ghost' : 'primary') + ' sm';
      btn.textContent = isRead ? '✓ 已读（点击取消）' : '标记读完';
      btn.addEventListener('click', function () {
        var nowRead = S.toggleRead(kn.id); /* 原地更新，不重渲染，保留展开与阅读位置 */
        el.classList.toggle('read', nowRead);
        btn.className = 'btn ' + (nowRead ? 'ghost' : 'primary') + ' sm';
        btn.textContent = nowRead ? '✓ 已读（点击取消）' : '标记读完';
        var dot = el.querySelector('.read-dot');
        if (nowRead && !dot) {
          var s = document.createElement('span');
          s.className = 'read-dot'; s.title = '已读'; s.textContent = '✓';
          el.querySelector('summary').appendChild(s);
        } else if (!nowRead && dot) { dot.remove(); }
        paintKnowHead();
        applyKnowFilter(); /* 只看未读开着时，刚读完的就地往后藏 */
      });
      f.appendChild(btn);

      /* 随堂小测：答对落盘、答错可重试 */
      if (kn.quiz) {
        var qb = document.createElement('div');
        qb.className = 'quiz-box';
        var passed = S.quizPassed(kn.id);
        var fbHtml = passed ? '<div class="q-fb ok">✓ 已过关 · ' + kn.quiz.why + '</div>' : '<div class="q-fb"></div>';
        qb.innerHTML = '<div class="q-title">📝 随堂小测 · ' + kn.quiz.q + '</div>' +
          '<div class="q-opts">' + kn.quiz.opts.map(function (o, i) {
            return '<button class="q-opt' + (passed && i === kn.quiz.a ? ' right' : '') + '" data-i="' + i + '"' + (passed ? ' disabled' : '') + '>' + o + '</button>';
          }).join('') + '</div>' + fbHtml;
        qb.querySelectorAll('.q-opt').forEach(function (b) {
          b.addEventListener('click', function () {
            if (S.quizPassed(kn.id)) return;
            var i = +b.dataset.i, fb = qb.querySelector('.q-fb');
            if (i === kn.quiz.a) {
              S.markQuizPass(kn.id);
              qb.querySelectorAll('.q-opt').forEach(function (x) { x.disabled = true; });
              b.classList.add('right');
              fb.className = 'q-fb ok';
              fb.textContent = '✓ 答对了！' + kn.quiz.why;
              chime(659.25, 0.12, 1.2);
              paintKnowHead();
              var wd = el.querySelector('.wrong-dot'); if (wd) wd.remove(); /* 补对销账 */
              paintWrongBar();
            } else {
              S.markQuizWrong(kn.id);
              b.classList.add('wrong');
              setTimeout(function () { b.classList.remove('wrong'); }, 650);
              fb.className = 'q-fb bad';
              fb.textContent = '✗ 再想想，换个试试';
              if (!el.querySelector('.wrong-dot')) {
                var s2 = document.createElement('span');
                s2.className = 'wrong-dot'; s2.title = '这篇小测错过'; s2.textContent = '📕';
                el.querySelector('summary').appendChild(s2);
              }
              paintWrongBar();
            }
          });
        });
        var kbFoot = el.querySelector('.kb-foot');
        el.querySelector('.kb').insertBefore(qb, kbFoot);
      }
      box.appendChild(el);
    });
    applyKnowFilter();

    /* 五音听医：点一声长音，配一句脏腑提示 */
    if (DATA.wuxing && DATA.wuxing.length) {
      var wx = document.createElement('div');
      wx.className = 'wuxing-box';
      wx.innerHTML = '<div class="wx-head">🎵 五音听医 · 点一声长音，调和脏腑</div><div class="wx-row">' +
        DATA.wuxing.map(function (x, i) { return '<button class="wx-btn" data-i="' + i + '">' + x.icon + '<b>' + x.note + '</b><small>' + x.organ + '</small></button>'; }).join('') +
        '</div><div class="wx-fb" id="wxFb">挑一声：宫商角徵羽各有所宜，长音里静听身体的反应</div>';
      wx.querySelectorAll('.wx-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          var x = DATA.wuxing[+b.dataset.i];
          chime(x.freq, 0.2, 3.6);
          chime(x.freq * 2, 0.05, 2.2); /* 泛音一层，音色更润 */
          wx.querySelectorAll('.wx-btn').forEach(function (y) { y.classList.remove('on'); });
          b.classList.add('on');
          $('#wxFb').textContent = x.line;
          float3d(x.note + '音 · ' + x.organ);
        });
      });
      box.appendChild(wx);
    }
  }

  /* ================= 首访新手引导 ================= */
  function buildTour() {
    var steps = [
      { icon: '☯️', t: '欢迎来到气功学堂', b: '八段锦 / 易筋经 / 五禽戏 / 六字诀四大经典功法，三维师父在线带练，免注册打开即练。' },
      { icon: '🀄', t: '先学 · 再练 · 后打卡', b: '“功法”逐式看动作与呼吸；“入门”跟四周计划一步步来；跟练完成自动点亮“打卡”，还有 21 天挑战。' },
      { icon: '🔒', t: '你的数据只属于你', b: '打卡与进度全部保存在本机浏览器，不注册、不上传、可导出备份；断网也能照常练。' }
    ];
    var mask = document.createElement('div'); mask.className = 'tour-mask';
    var card = document.createElement('div'); card.className = 'tour-card';
    mask.appendChild(card); document.body.appendChild(mask);
    var i = 0;
    function paint() {
      var s = steps[i], last = i === steps.length - 1;
      card.innerHTML =
        '<div class="tour-step">' + s.icon + ' ' + s.t + '</div>' +
        '<div class="tour-dots">' + steps.map(function (_, k) { return '<i class="' + (k === i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<p class="tour-body">' + s.b + '</p>' +
        '<div class="tour-acts">' +
        (last
          ? '<button class="btn ghost" data-t="close">以后再说</button>' +
            '<button class="btn primary" data-t="course">🗓 看四周计划</button>' +
            '<button class="btn primary" data-t="train">▶ 立刻跟练</button>'
          : '<button class="btn ghost" data-t="close">跳过</button>' +
            '<button class="btn primary" data-t="next">下一步 →</button>') +
        '</div>';
    }
    function close() { S.markTourSeen(); if (mask.parentNode) mask.parentNode.removeChild(mask); }
    card.addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return;
      var a = b.dataset.t;
      if (a === 'next') { i++; paint(); }
      else if (a === 'close') { close(); }
      else if (a === 'course') { close(); showPage('course'); }
      else if (a === 'train') { close(); Train.start(DATA.sets[0], DATA.sets[0].moves, 'full'); }
    });
    paint();
  }
  function maybeShowTour() { if (!S.hasSeenTour()) buildTour(); }

  /* ================= 四周入门计划 ================= */
  function setById(id) {
    return DATA.sets.find(function (s) { return s.id === id; });
  }
  /* 有序单趟计算每天达成状态：
   *   learn 天：当日列出的式全部已学；
   *   train 天：该功法的第 k 个跟练天需要累计 >=k 条跟练记录（避免一次跟练点亮多天） */
  function computeCourseStates(cur) {
    var recCount = {};
    S.records().forEach(function (r) { recCount[r.set] = (recCount[r.set] || 0) + 1; });
    var trainSeen = {}, grid = [];
    cur.weeks.forEach(function (wk) {
      var row = [];
      wk.days.forEach(function (d) {
        var setId = d.set || wk.set;
        var done;
        if (d.kind === 'learn') {
          done = d.moves.every(function (m) { return S.isLearned(setId, m); });
        } else {
          var need = (trainSeen[setId] || 0) + 1;
          trainSeen[setId] = need;
          done = (recCount[setId] || 0) >= need;
        }
        row.push({ setId: setId, done: !!done });
      });
      grid.push(row);
    });
    return grid;
  }
  function renderCourse() {
    var cur = DATA.curriculum;
    if (!cur) return;
    $('#courseIntro').textContent = cur.intro;
    var grid = computeCourseStates(cur);
    var total = 0, doneN = 0;
    cur.weeks.forEach(function (wk, wi) { wk.days.forEach(function (d, di) { total++; if (grid[wi][di].done) doneN++; }); });
    var pct = Math.round(doneN / total * 100);
    /* 自我锚点定位：首次进页定为第 1 天，之后按日数亮“今日”格 */
    var cs = S.courseStart();
    var dayIdx = Math.round((new Date(S.todayStr()) - new Date(cs)) / 86400000) + 1;
    var locTxt = '', locBtn = '';
    if (dayIdx >= 1 && dayIdx <= total) {
      locTxt = ' · 📍 今日是第 <b>' + dayIdx + '</b> 天';
      locBtn = ' <button class="btn ghost sm" id="cwdTodayGo">跳到今日</button>';
    } else if (dayIdx > total) {
      locTxt = ' · 🏁 四周已过完（第 ' + (dayIdx - total) + ' 天），随喜重温';
    }
    $('#courseProg').innerHTML =
      '<div class="cp-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="cp-txt">已完成 <b>' + doneN + '</b> / ' + total + ' 天 · ' + pct + '%' + locTxt +
      (doneN === total && total > 0 ? ' 🎉 四周圆满！' : '') + locBtn + '</div>';
    var box = $('#courseWeeks'); box.innerHTML = '';
    var gno = 0, todayCell = null;
    cur.weeks.forEach(function (wk, wi) {
      var wset = setById(wk.set);
      var wdone = wk.days.filter(function (d, di) { return grid[wi][di].done; }).length;
      var col = document.createElement('div');
      col.className = 'course-wk';
      col.innerHTML =
        '<div class="cw-head"><span class="cw-ico">' + (wset ? wset.icon : '') + '</span>' +
        '<div class="cw-tt"><div class="cw-theme">' + wk.theme + '</div>' +
        '<div class="cw-sub">' + wdone + '/' + wk.days.length + ' 天已达成</div></div></div>';
      var daysEl = document.createElement('div'); daysEl.className = 'cw-days';
      wk.days.forEach(function (d, di) {
        gno++;
        var s = grid[wi][di];
        var st = setById(s.setId);
        var cell = document.createElement('div');
        cell.className = 'cw-day' + (s.done ? ' done' : '') + (gno === dayIdx ? ' today' : '');
        if (gno === dayIdx) todayCell = cell;
        var label, names = '';
        if (d.kind === 'learn') {
          names = d.moves.map(function (mid) {
            var mv = st && st.moves.find(function (m) { return m.id === mid; });
            return mv ? mv.name : mid;
          }).join('、');
          label = '学 ' + d.moves.length + ' 式';
        } else {
          label = '跟整套';
          names = (st ? st.name : s.setId);
        }
        cell.innerHTML =
          '<div class="cwd-top"><span class="cwd-no">第 ' + gno + ' 天</span>' +
          (gno === dayIdx ? '<span class="cwd-here">📍 今日</span>' : '') +
          '<span class="cwd-kind">' + (d.kind === 'learn' ? '📖 ' + label : '▶ ' + label) + '</span>' +
          (s.done ? '<span class="cwd-ok">✓</span>' : '') + '</div>' +
          '<div class="cwd-names">' + names + '</div>';
        var btn = document.createElement('button');
        btn.className = 'btn ' + (s.done ? 'ghost' : 'primary') + ' sm';
        btn.textContent = s.done ? '重温' : (d.kind === 'learn' ? '去学' : '去练');
        btn.addEventListener('click', function () {
          if (d.kind === 'learn') {
            openSet(s.setId);
            var next = d.moves.find(function (m) { return !S.isLearned(s.setId, m); }) || d.moves[0];
            openMove(next);
          } else if (st) {
            Train.start(st, st.moves, 'full');
          }
        });
        cell.appendChild(btn);
        daysEl.appendChild(cell);
      });
      col.appendChild(daysEl);
      box.appendChild(col);
    });
    var goBtn = $('#cwdTodayGo');
    if (goBtn && todayCell) goBtn.addEventListener('click', function () {
      todayCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
      todayCell.classList.add('flash'); /* 闪一下金光，眼睛能接住 */
      setTimeout(function () { todayCell.classList.remove('flash'); }, 1600);
    });
  }

  /* ================= 全局事件绑定 ================= */
  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go && !go.closest('#nav')) { showPage(go.dataset.go); }
    var bk = e.target.closest('[data-back]');
    if (bk && bk.dataset.back === 'sets') {
      /* 显式“返回功法列表”：清空详情层并强制重渲染列表 */
      viewingMove = null;
      $('#moveDetail').classList.add('hidden');
      $('#setDetail').classList.add('hidden');
      $('#setList').classList.remove('hidden');
      showPage('sets');
      renderSetList();
      pose3d(idlePoses[0], 1.2);
    } else if (bk) { goBack(); }
  });
  $$('#nav button').forEach(function (b) {
    b.addEventListener('click', function () { showPage(b.dataset.go); lastPage = b.dataset.go; });
  });
  $('#quickStart').addEventListener('click', function () {
    Train.start(DATA.sets[0], DATA.sets[0].moves, 'full');
  });
  var rt = $('#replayTour');
  if (rt) rt.addEventListener('click', function (e) { e.preventDefault(); buildTour(); });
  /* 动作搜索输入：防抖 200ms */
  var searchTimer = null;
  $('#moveSearch').addEventListener('input', function () {
    var v = this.value.trim().toLowerCase();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      searchQ = v;
      if (v) activeTag = null; /* 关键词优先，标签回“全部” */
      paintFilter();
    }, 200);
  });
  /* 浏览器隐私模式等导致无法本地持久化时提醒 */
  if (!S.canPersist()) {
    var w = document.createElement('div');
    w.className = 'sw-update';
    w.textContent = '⚠️ 当前浏览器不允许本地存储（隐私模式？），本次打卡记录只留在内存，刷新即失';
    document.body.appendChild(w);
  }
  $('#soundBtn').addEventListener('click', function () {
    S.toggleSound();
    syncSoundBtn();
    if (!S.soundOn()) { if (global.speechSynthesis) speechSynthesis.cancel(); }
    else { speak('语音口令已开启'); if (!voiceOk()) showVoiceHint(); }
  });
  $('#tempoBtn').addEventListener('click', function () {
    var t = S.cycleTempo();
    syncTempoBtn();
    renderHome(); renderSetList();
    speak(t < 1 ? '慢速跟练' : t > 1 ? '快速跟练' : '常速跟练');
  });
  $('#spinChk').addEventListener('change', function (e) {
    var q = q3d();
    if (q && q.setAutoRotate) q.setAutoRotate(e.target.checked);
  });
  $$('.stage-ctrls [data-view]').forEach(function (b) {
    b.addEventListener('click', function () {
      var q = q3d();
      if (q && q.camView) q.camView(b.dataset.view);
      $('#stageTitle').textContent = '演武台 · ' + b.textContent + '观练';
    });
  });

  /* ---- 晨昏演武台：默认跟真实时段上光，点钮可手动锁定轮播 ---- */
  var MOOD_ORDER = ['dawn', 'day', 'dusk', 'night'];
  var MOOD_LABEL = { dawn: '晨光', day: '日朗', dusk: '暮色', night: '夜色' };
  var moodLock = '';
  function moodByHour(h) {
    return h >= 5 && h < 11 ? 'dawn' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 23 ? 'dusk' : 'night';
  }
  function applyMood() {
    var q = q3d();
    if (!q || !q.setMood) return;
    var m = moodLock || moodByHour(new Date().getHours());
    q.setMood(m);
    var b = $('#moodBtn');
    if (b) b.textContent = '🌗 ' + MOOD_LABEL[m] + (moodLock ? ' · 锁定' : ' · 随时段');
  }
  var moodBtn = $('#moodBtn');
  if (moodBtn) moodBtn.addEventListener('click', moodNext);
  function moodNext() {
    var cur = (q3d() && q3d().mood) ? q3d().mood() : 'day';
    moodLock = MOOD_ORDER[(MOOD_ORDER.indexOf(cur) + 1) % MOOD_ORDER.length];
    applyMood();
    float3d(MOOD_LABEL[moodLock] + '演武台');
  }
  setInterval(applyMood, 60000); /* 跨过时段边界自动换光，锁定过的不抢 */
  $('#acuChk').addEventListener('change', function (e) {
    var q = q3d();
    if (q && q.setAcuShow) q.setAcuShow(e.target.checked);
  });

  /* ================= 成绩卡与分享 ================= */
  var MODE_CN = { full: '整套', single: '单式', custom: '选式' };
  function paintCard() {
    var cv = $('#shareCanvas'), x = cv.getContext('2d'), w = 640, h = 860;
    var ls = lastSession;
    if (!ls) return false;
    var g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#123033'); g.addColorStop(1, '#0b1416');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    var rg = x.createRadialGradient(w / 2, 260, 30, w / 2, 260, 300);
    rg.addColorStop(0, 'rgba(95,214,184,.28)'); rg.addColorStop(1, 'rgba(95,214,184,0)');
    x.fillStyle = rg; x.fillRect(0, 0, w, 620);
    x.textAlign = 'center';
    x.fillStyle = '#9db8b2'; x.font = '26px "Songti SC", "SimSun", serif';
    x.fillText('气功学堂 · 今日功课', w / 2, 96);
    x.font = '110px serif';
    x.fillText(ls.set.icon, w / 2, 240);
    x.fillStyle = '#d9b46a'; x.font = 'bold 88px "Songti SC", "SimSun", serif';
    x.fillText('功 成', w / 2, 368);
    x.fillStyle = '#e9e4d5'; x.font = '34px "Songti SC", "SimSun", serif';
    x.fillText(ls.set.name + ' · ' + (MODE_CN[ls.mode] || '跟练') + ' ' + ls.n + ' 式', w / 2, 432);
    x.strokeStyle = 'rgba(217,180,106,.5)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(120, 486); x.lineTo(520, 486); x.stroke();
    var rows = [
      ['本次用时', '约 ' + ls.min + ' 分钟'],
      ['连续打卡', ls.streak + ' 天'],
      ['累计打卡', ls.days + ' 天'],
      ['已学动作', ls.learned + ' / ' + moveTotal + ' 式']
    ];
    rows.forEach(function (r, i) {
      var cx = i % 2 === 0 ? 175 : 465, cy = i < 2 ? 560 : 680;
      x.fillStyle = '#9db8b2'; x.font = '22px "Songti SC", "SimSun", serif';
      x.fillText(r[0], cx, cy);
      x.fillStyle = '#5fd6b8'; x.font = 'bold 40px "Songti SC", "SimSun", serif';
      x.fillText(r[1], cx, cy + 48);
    });
    x.fillStyle = '#e9e4d5'; x.font = '22px "Songti SC", "SimSun", serif';
    x.fillText('每天十二分钟，把气练明白', w / 2, 786);
    x.fillStyle = '#3fae8a'; x.font = '20px sans-serif';
    x.fillText('shixingya.github.io/qigong · ' + ls.date, w / 2, 822);
    return true;
  }
  $('#shareCardBtn').addEventListener('click', function () {
    if (!paintCard()) { this.textContent = '先完成一次跟练'; return; }
    var a = document.createElement('a');
    a.download = '气功学堂成绩卡-' + lastSession.date + '.png';
    a.href = $('#shareCanvas').toDataURL('image/png');
    a.click();
  });
  $('#shareTextBtn').addEventListener('click', function () {
    var txt = lastSession
      ? '【气功学堂】今天跟练' + lastSession.set.name + '（' + lastSession.n + ' 式，约 ' + lastSession.min + ' 分钟），已连续打卡 ' + lastSession.streak + ' 天！40 式三维师父在线带练 → https://shixingya.github.io/qigong/'
      : '气功学堂：八段锦/易筋经/五禽戏/六字诀 3D 在线跟练 → https://shixingya.github.io/qigong/';
    var btn = this;
    function done() { btn.textContent = '✓ 已复制'; setTimeout(function () { btn.textContent = '📋 复制分享文案'; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { window.prompt('手动复制：', txt); });
    } else window.prompt('手动复制：', txt);
  });

  /* ================= 清空本机数据（二次确认） ================= */
  /* 不可逆的动作不拿一个裸按钮吹人：要照着屏上两个字输一遍才放行 */
  function openWipe() {
    var n = S.totalSess(), ld = S.learnedTotal(), rd = S.readCount(), qc = S.quizCount();
    $('#wpTip').innerHTML = '将清掉：<b>' + n + '</b> 场练功记录 · <b>' + ld + '</b> 式已学 · <b>' + rd + '</b> 篇已读 · <b>' + qc + '</b> 题小测过关' +
      (S.planStatus() ? ' · 21 天挑战进度' : '') + (S.hardCount() ? ' · 难卡包 ' + S.hardCount() + ' 张' : '');
    var inp = $('#wpIn'); inp.value = '';
    $('#wpYes').disabled = true;
    $('#wipeMask').classList.remove('hidden');
  }
  function closeWipe() { $('#wipeMask').classList.add('hidden'); $('#wpIn').value = ''; $('#wpYes').disabled = true; }
  $('#wipeBtn').addEventListener('click', openWipe);
  $('#wpNo').addEventListener('click', closeWipe);
  $('#wpIn').addEventListener('input', function () {
    $('#wpYes').disabled = this.value.trim() !== $('#wpWord').textContent.trim();
  });
  $('#wpYes').addEventListener('click', function () {
    if (this.disabled) return;
    if (Train.active) Train.stop(true);
    S.wipeAll();
    closeWipe();
    /* 各个页面都得回到空数据的样子，不留上一份的残留数字 */
    renderHome(); renderCheckin(); renderKnowledge(); paintKnowHead(); renderFavMoves(); renderFavs(); renderPlan();
    if ($('#page-course').classList.contains('on')) renderCourse();
    var msg = $('#importMsg');
    msg.textContent = '✓ 已清空本机数据（声音与节奏偏好保留）';
    msg.className = 'import-msg ok';
    var sw = $('#soundBtn'); if (sw) syncSoundBtn();
    paintCalmBtn(); paintAmbBtn();
    if (global.console) global.console.log('已按用户确认清空本地练功数据');
  });

  /* ================= 备份导出/导入 ================= */
  $('#exportBtn').addEventListener('click', function () {
    var blob = new Blob([S.exportPayload()], { type: 'application/json' });
    var a = document.createElement('a');
    a.download = 'qigong-backup-' + S.todayStr() + '.json';
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    S.setLastBackup();
    renderBackupInfo();
    $('#importMsg').textContent = '✓ 已导出备份文件（纯本地，未上传）';
  });
  $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0], msg = $('#importMsg');
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var res = S.parseImport(String(rd.result));
      if (!res.ok) { msg.textContent = '✕ 导入失败：' + res.err; msg.className = 'import-msg err'; return; }
      var added = S.mergeImport(res.data);
      /* 若能读出备份来源时间就一并报，让用户知道合的是哪一份、新旧如何 */
      var srcD = res.meta && res.meta.exportedAt ? String(res.meta.exportedAt).slice(0, 10) : '';
      msg.textContent = '✓ 导入完成：新增 ' + added + ' 条跟练记录（重复自动去重）'
        + (srcD ? ' · 来自 ' + srcD + ' 的备份，共 ' + (res.meta.total || 0) + ' 条' : '');
      msg.className = 'import-msg ok';
      S.setLastImport();
      renderCheckin();
    };
    rd.onerror = function () { msg.textContent = '✕ 文件读取失败'; msg.className = 'import-msg err'; };
    rd.readAsText(f);
    e.target.value = '';
  });

  /* ================= 启动 ================= */
  renderHome();
  renderKnowledge();
  renderQuote();
  syncSoundBtn();
  syncTempoBtn();
  paintAmbBtn(); /* 伴奏钮先跟存档 ambient 对上，不默认显示“无伴奏”骗人 */
  boot3D(60);
  maybeShowTour();

  /* PWA：Service Worker 离线缓存（http(s) 环境下） */
  if ('serviceWorker' in navigator && /^https?:$/.test(global.location.protocol)) {
    window.addEventListener('load', function () {
      /* updateViaCache:'none'：sw.js 永不走 HTTP 缓存，免得旧脚本首访误弹更新条 */
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(watchSwUpdate).catch(function () { /* 离线能力缺失不影响使用 */ });
    });
  }

  /* 新版本缓存就绪时提示一键刷新，避免 cache-first 下老用户需刷两次 */
  function watchSwUpdate(reg) {
    var shown = false;
    function promptReload(sw) {
      if (shown || !sw) return;
      shown = true;
      var bar = document.createElement('div');
      bar.className = 'sw-update';
      bar.innerHTML = '☯️ 气功学堂有新版本 <button class="btn primary sm">立即刷新</button>';
      bar.querySelector('button').addEventListener('click', function () {
        sw.postMessage('skip');
        /* 不依赖 controllerchange 时序：兜底定时重载，激活后重载即拿新版；已在新版控制时重载也无害 */
        setTimeout(function () { location.reload(); }, 1500);
      });
      document.body.appendChild(bar);
    }
    if (reg.waiting) promptReload(reg.waiting);
    else setInterval(function () { if (reg.waiting) promptReload(reg.waiting); }, 20000); /* 页面长开时轮询兜底 */
    reg.addEventListener('updatefound', function () {
      var nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', function () {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) promptReload(nw);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (shown) location.reload();
    });
  }

  /* ---- PWA 安装引导：桌面支持时一次轻量提示，拒绝后不再打扰 ---- */
  var deferredPrompt = null;
  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (global.matchMedia('(display-mode: standalone)').matches) return;
    if (sessionStorage.getItem('qigong_inst_dismiss')) return;
    var bar = document.createElement('div');
    bar.className = 'sw-update install-bar';
    bar.innerHTML = '📲 把气功学堂装到桌面，断网也能练 <button class="btn primary sm">安装</button> <button class="btn ghost sm">暂不</button>';
    var yes = bar.querySelector('.primary'), no = bar.querySelector('.ghost');
    yes.addEventListener('click', function () {
      yes.disabled = true;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (ch) {
        if (ch && ch.outcome !== 'accepted') {
          try { sessionStorage.setItem('qigong_inst_dismiss', '1'); } catch (err) { }
        }
        bar.remove(); deferredPrompt = null;
      }).catch(function () { bar.remove(); });
    });
    no.addEventListener('click', function () {
      try { sessionStorage.setItem('qigong_inst_dismiss', '1'); } catch (err) { }
      bar.remove();
    });
    document.body.appendChild(bar);
  });

  global.QGApp = { showPage: showPage, Train: Train, DATA: DATA };
})(typeof window !== 'undefined' ? window : globalThis);
