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
  function speak(text) {
    if (!S.soundOn() || !('speechSynthesis' in global) || !text) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = Math.min(1.3, Math.max(0.7, 0.95 * S.tempo())); /* 快节奏口令同步变，钳制在自然区间 */
      u.pitch = 0.92;
      var vs = speechSynthesis.getVoices();
      for (var i = 0; i < vs.length; i++) {
        if (/zh|Chinese|中文/i.test(vs[i].lang)) { u.voice = vs[i]; break; }
      }
      speechSynthesis.speak(u);
    } catch (e) { /* 忽略 */ }
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
  function renderHome() {
    $('#statMoves').textContent = moveTotal + ' 个动作';
    $('#statKeys').textContent = keyTotal + ' 组 3D 姿势';
    /* 今日习练推荐：按日期确定性轮换，不随机不骚扰 */
    var st = DATA.sets[dayOfYear() % DATA.sets.length];
    var recs = S.recordsOfDay(S.todayStr());
    $('#todayCard').innerHTML =
      '<div class="tc-icon">' + st.icon + '</div>' +
      '<div class="tc-main"><div class="tc-title">今日推荐 · ' + st.name + '：' + st.tagline + '</div>' +
      '<div class="tc-sub">' + (recs.length
        ? '今日已练 <b>' + recs.length + '</b> 次 · 连续 <b>' + S.streak() + '</b> 天，换个功法均衡调理？'
        : '今日未练 · 完整一套约 ' + estMin(st) + ' 分钟，练完自动点亮打卡') + '</div></div>' +
      '<button class="btn primary" id="todayGo">▶ 立即跟练</button>';
    $('#todayGo').addEventListener('click', function () { Train.start(st, st.moves, 'full'); });
    var box = $('#homeSets');
    box.innerHTML = '';
    DATA.sets.forEach(function (st2) { box.appendChild(setCard(st2, false)); });
    renderFavs();
    renderPlan();
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
    el.innerHTML =
      '<div class="icon">' + st.icon + '</div>' +
      '<button class="fav-star' + (S.isFav(st.id) ? ' on' : '') + '" title="收藏/取消收藏常用功法">' + (S.isFav(st.id) ? '⭐' : '☆') + '</button>' +
      '<h3>' + st.name + '</h3>' +
      '<div class="py">' + st.pinyin + ' · ' + st.level + '</div>' +
      '<div class="tagline">' + st.tagline + '</div>' +
      '<div class="meta"><span>' + st.moves.length + ' 式</span><span>约 ' + est + ' 分钟</span></div>' +
      '<div class="prog">已学 ' + learned + '/' + st.moves.length + ' 式<span class="prog-bar"><i style="width:' + lpct + '%"></i></span></div>';
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
    if (!prev || prev.id !== curSet.id || pickedSetId !== curSet.id) { picked = {}; pickedSetId = curSet.id; }
    $('#setList').classList.add('hidden');
    $('#moveDetail').classList.add('hidden');
    $('#setDetail').classList.remove('hidden');
    showPage('sets');

    var head = $('#setHead');
    var doneN = curSet.moves.filter(function (m) { return S.isLearned(curSet.id, m.id); }).length;
    var pctN = Math.round(doneN / curSet.moves.length * 100);
    head.innerHTML =
      '<h2>' + curSet.icon + ' ' + curSet.name + ' <span class="py">' + curSet.pinyin + '</span></h2>' +
      '<p>' + curSet.intro + '</p>' +
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
        });
        cell.appendChild(pb);
        cell.addEventListener('click', function () { openMove(m.id); });
        grid.appendChild(cell);
      });
    }
    paintGrid();
    refreshCustomBtn();
  }

  function openMove(moveId) {
    curMove = curSet.moves.find(function (m) { return m.id === moveId; });
    if (!curMove) return;
    $('#setDetail').classList.add('hidden');
    $('#moveDetail').classList.remove('hidden');
    viewingMove = true;

    $('#moveHead').innerHTML =
      '<h2>' + curMove.name + '</h2><p class="desc">' + curMove.desc + '</p>';
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
    $('#backToSet').textContent = '← 返回' + curSet.name;
  }

  $('#backToSet').addEventListener('click', function () {
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
        (mode === 'single' ? ' · 单式' : mode === 'custom' ? ' · 选式 ' + moves.length + ' 式' : ' · 整套');
      $('#btnPause').textContent = '⏸ 暂停';
      this.enterStep(0);
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
      var st = this._steps[i];
      st._eff = st.sec / (this._tempo || 1); /* 慢速(0.75)时长更长，快速(1.5)更短 */
      this._remain = st._eff;
      pose3d(st.pose, Math.max(0.9, 2.6 / Math.max(st._eff / 3, 1)));
      breath3d(st.inhale);
      var ring = $('#breathRing');
      ring.className = 'breath-ring ' + (st.inhale === 'hold' ? 'hold' : st.inhale);
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
      if (global.QGAmbient) QGAmbient.stop(); /* 退出跟练收掉伴奏 */
      if (!silent && global.history) { /* keep simple */ }
      pose3d(idlePoses[0], 1.2);
      breath3d('idle');
    },
    finish: function () {
      if (!this.active) return;
      var set = this._set, min = Math.round(this._doneSec / 60 * 10) / 10;
      S.addRecord(set.id, this._doneSec, this._moveIds);
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
        '本次跟练 ' + set.name + '，用时约 ' + min + ' 分钟 · 连续打卡 ' + S.streak() + ' 天 · 累计 ' + S.totalDays() + ' 天';
      if (S.planStatus()) {
        var pl = S.planInfo();
        $('#doneStats').textContent += pl && !pl.success && !pl.over ? ' · 21天挑战已点亮 ' + pl.done + '/21' : '';
      }
      speak('收功。' + set.name + '练习完成，今日打卡已记录。');
      chime(196, 0.2, 2.6); /* 收功大磬 */
      float3d('收功 · 气归丹田');
      pose3d(idlePoses[1], 1);
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

  /* ---- 每日一句养生箴言（按年内天数轮换） ---- */
  function renderQuote() {
    var el = $('#dailyQuote');
    if (!el) return;
    var qs = DATA.quotes || [];
    if (!qs.length) { el.classList.add('hidden'); return; }
    var now = new Date();
    var doy = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 0)) / 86400000);
    var q = qs[doy % qs.length];
    el.textContent = '🍵 今日一句：' + q.t + ' —— ' + q.s;
  }

  /* ================= 打卡成就页 ================= */
  var calDate = new Date();

  function renderCheckin() {
    var mins = S.totalSec() > 0 ? Math.max(1, Math.round(S.totalSec() / 60)) : 0;
    $('#statRow').innerHTML =
      statBox(S.streak(), '天', '当前连续', true) +
      statBox(S.streakMax(), '天', '最长连续') +
      statBox(S.totalDays(), '天', '累计打卡', true) +
      statBox(mins, '分钟', '累计练功时长') +
      statBox(S.learnedTotal(), '/' + moveTotal, '已学动作');

    renderCalendar();
    renderWeekCard();

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
      li.innerHTML = '<b>' + r.d + '</b><span>' + (st ? st.icon + st.name : r.set) + '</span><span>约 ' + Math.max(1, Math.round((r.sec || 0) / 60)) + ' 分钟</span><span>' + ((r.moves || []).length) + ' 式</span>';
      list.appendChild(li);
    });
  }
  function statBox(v, unit, label, gold) {
    return '<div class="stat-box' + (gold ? ' gold' : '') + '"><b>' + v + '<small style="font-size:14px"> ' + unit + '</small></b><span>' + label + '</span></div>';
  }

  /* 周练报告：近 7 天小结，完全由真实打卡记录推导 */
  function renderWeekCard() {
    var el = $('#weekCard');
    if (!el) return;
    var w = S.weekReport();
    if (!w.sessions) {
      el.innerHTML = '<div class="wk-head">🗒 周练报告</div><div class="wk-body wk-empty">近 7 天还没有练功记录。练完一次整套，这里就会替你算好账。</div>';
      return;
    }
    var delta = w.dayCount - w.prevDayCount;
    var trendTxt = w.prevDayCount === 0 ? (w.dayCount + ' 天 · 从零起步最难得') :
      delta > 0 ? ('比上周多 ' + delta + ' 天，见功了') :
      delta < 0 ? ('比上周少 ' + (-delta) + ' 天，松一松还能追回来') : '与上周打平，贵在照常';
    var topSet = w.topSet && DATA.sets.find(function (x) { return x.id === w.topSet; });
    var line2 = topSet ? ('练得最多的是 ' + topSet.icon + ' ' + topSet.name + '（' + w.topN + ' 次）') : '先把第一套跟下来';
    var line3 = w.dayCount >= 5 ? '💚 已入佳境，气息渐稳' : w.dayCount >= 3 ? '🌿 节奏渐稳，继续保持' : '🌱 刚起步，下周试试隔天练一次';
    el.innerHTML = '<div class="wk-head">🗒 周练报告 <span class="wk-range">' + w.rangeFrom + ' ~ ' + w.rangeTo + '</span></div>' +
      '<div class="wk-body">' +
      '<div>本周练了 <b>' + w.dayCount + '</b> 天 · 共 <b>' + w.sessions + '</b> 次 · <b>' + w.min + '</b> 分钟 · 碰了 <b>' + w.sets + '</b> 种功法</div>' +
      '<div>' + trendTxt + '；' + line2 + '。</div>' +
      '<div>' + line3 + '</div>' +
      '</div>';
  }

  function renderCalendar() {
    var y = calDate.getFullYear(), m = calDate.getMonth();
    $('#calTitle').textContent = y + ' 年 ' + (m + 1) + ' 月';
    var week = ['日', '一', '二', '三', '四', '五', '六'];
    $('#calWeek').innerHTML = week.map(function (w) { return '<div>' + w + '</div>'; }).join('');
    var map = S.monthMap(y, m);
    var first = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var today = S.todayStr();
    var html = '';
    for (var i = 0; i < first; i++) html += '<div class="cal-cell blank"></div>';
    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var n = map[ds] || 0;
      html += '<div class="cal-cell' + (n ? ' done' + (n > 1 ? ' multi' : '') : '') + (ds === today ? ' today' : '') + '">' + d + '</div>';
    }
    $('#calGrid').innerHTML = html;
  }
  $('#calPrev').addEventListener('click', function () { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
  $('#calNext').addEventListener('click', function () { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });

  /* ================= 知识页 ================= */
  function renderKnowledge() {
    var box = $('#knowList');
    box.innerHTML = '';
    var total = DATA.knowledge.length, rc = S.readCount();
    var head = document.createElement('div');
    head.className = 'know-progress';
    head.innerHTML = '已读 <b>' + rc + '</b> / ' + total + ' 篇' + (total && rc === total ? ' · 明理圆满 🎉' : '');
    box.appendChild(head);
    DATA.knowledge.forEach(function (kn) {
      var isRead = S.isRead(kn.id);
      var el = document.createElement('details');
      el.className = 'know-card' + (isRead ? ' read' : '');
      el.innerHTML = '<summary><span class="ki">' + kn.icon + '</span>' + kn.title +
        (isRead ? '<span class="read-dot" title="已读">✓</span>' : '') + '</summary>' +
        '<div class="kb">' + kn.points.map(function (p) { return '<p>· ' + p + '</p>'; }).join('') +
        '<div class="kb-foot"></div></div>';
      var f = el.querySelector('.kb-foot');
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
        var rc2 = S.readCount();
        head.innerHTML = '已读 <b>' + rc2 + '</b> / ' + total + ' 篇' + (total && rc2 === total ? ' · 明理圆满 🎉' : '');
      });
      f.appendChild(btn);
      box.appendChild(el);
    });
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
    $('#courseProg').innerHTML =
      '<div class="cp-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="cp-txt">已完成 <b>' + doneN + '</b> / ' + total + ' 天 · ' + pct + '%' +
      (doneN === total && total > 0 ? ' 🎉 四周圆满！' : '') + '</div>';
    var box = $('#courseWeeks'); box.innerHTML = '';
    var gno = 0;
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
        cell.className = 'cw-day' + (s.done ? ' done' : '');
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
  $$('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () {
      var q = q3d();
      if (q && q.camView) q.camView(b.dataset.view);
      $('#stageTitle').textContent = '演武台 · ' + b.textContent + '观练';
    });
  });
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

  /* ================= 备份导出/导入 ================= */
  $('#exportBtn').addEventListener('click', function () {
    var blob = new Blob([S.exportPayload()], { type: 'application/json' });
    var a = document.createElement('a');
    a.download = 'qigong-backup-' + S.todayStr() + '.json';
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
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
      msg.textContent = '✓ 导入完成：新增 ' + added + ' 条跟练记录（重复记录自动去重）';
      msg.className = 'import-msg ok';
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
  boot3D(60);
  maybeShowTour();

  /* PWA：Service Worker 离线缓存（http(s) 环境下） */
  if ('serviceWorker' in navigator && /^https?:$/.test(global.location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(watchSwUpdate).catch(function () { /* 离线能力缺失不影响使用 */ });
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
