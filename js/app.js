/* =========================================================
 * 气功学堂 · 应用主逻辑（路由 / 渲染 / 跟练状态机 / 打卡）
 * 依赖：window.QG_DATA, window.QGStore, window.QG3D（可缺省降级）
 * ========================================================= */
(function (global) {
  'use strict';

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
      u.rate = 0.95;
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
    /* 已处于功法/单式详情时不重渲染列表，避免把详情重新隐藏 */
    if (name === 'sets' && $('#setDetail').classList.contains('hidden') && $('#moveDetail').classList.contains('hidden')) renderSetList();
    if (name !== 'train') { viewingMove = null; }
    window.scrollTo({ top: 0 });
  }
  function goBack() { showPage(lastPage || 'home'); }

  /* ================= 首页 ================= */
  function renderHome() {
    $('#statMoves').textContent = moveTotal + ' 个动作';
    $('#statKeys').textContent = keyTotal + ' 组 3D 姿势';
    var box = $('#homeSets');
    box.innerHTML = '';
    DATA.sets.forEach(function (st) { box.appendChild(setCard(st, false)); });
  }
  function setCard(st, showIntro) {
    var el = document.createElement('div');
    el.className = 'set-card';
    el.style.setProperty('--acc', st.color);
    var learned = S.learnedCount(st.id);
    el.innerHTML =
      '<div class="icon">' + st.icon + '</div>' +
      '<h3>' + st.name + '</h3>' +
      '<div class="py">' + st.pinyin + ' · ' + st.level + '</div>' +
      '<div class="tagline">' + st.tagline + '</div>' +
      '<div class="meta"><span>' + st.moves.length + ' 式</span><span>约 ' + st.durationMin + ' 分钟</span></div>' +
      '<div class="prog">已学 ' + learned + '/' + st.moves.length + ' 式</div>';
    el.addEventListener('click', function () { openSet(st.id); });
    return el;
  }

  /* ================= 功法学堂 ================= */
  var curSet = null, curMove = null, viewingMove = false;

  function renderSetList() {
    $('#setList').classList.remove('hidden');
    $('#setDetail').classList.add('hidden');
    $('#moveDetail').classList.add('hidden');
    var box = $('#setCards');
    box.innerHTML = '';
    DATA.sets.forEach(function (st) {
      var card = setCard(st, true);
      if (st.intro) {
        var p = document.createElement('div');
        p.style.cssText = 'color:var(--sub);font-size:13px;margin-top:6px';
        p.textContent = st.intro.slice(0, 46) + '……';
        card.appendChild(p);
      }
      box.appendChild(card);
    });
  }

  function openSet(setId) {
    curSet = DATA.sets.find(function (s) { return s.id === setId; });
    if (!curSet) return;
    $('#setList').classList.add('hidden');
    $('#moveDetail').classList.add('hidden');
    $('#setDetail').classList.remove('hidden');
    showPage('sets');

    var head = $('#setHead');
    head.innerHTML =
      '<h2>' + curSet.icon + ' ' + curSet.name + ' <span class="py">' + curSet.pinyin + '</span></h2>' +
      '<p>' + curSet.intro + '</p>' +
      '<div class="benefits">' + curSet.benefits.map(function (b) { return '<span>' + b + '</span>'; }).join('') + '</div>' +
      '<p style="margin-top:8px">💡 ' + curSet.tips + '</p>' +
      '<div class="cta-row">' +
      '<button class="btn primary" id="trainFull">▶ 整套跟练（' + curSet.moves.length + ' 式 · 约' + curSet.durationMin + '分钟）</button>' +
      '<button class="btn ghost" id="learnFrom1">📖 从第一式逐式学习</button></div>';
    $('#trainFull').addEventListener('click', function () {
      Train.start(curSet, curSet.moves, 'full');
    });
    $('#learnFrom1').addEventListener('click', function () {
      var next = curSet.moves.find(function (m) { return !S.isLearned(curSet.id, m.id); }) || curSet.moves[0];
      openMove(next.id);
    });

    var grid = $('#moveGrid');
    grid.innerHTML = '';
    curSet.moves.forEach(function (m, idx) {
      var cell = document.createElement('div');
      cell.className = 'move-cell';
      cell.style.setProperty('--acc', curSet.color);
      cell.innerHTML =
        '<div class="no">第 ' + (idx + 1) + ' 式</div>' +
        '<div class="nm">' + m.name + '</div>' +
        (S.isLearned(curSet.id, m.id) ? '<div class="learned-mark">✓</div>' : '');
      cell.addEventListener('click', function () { openMove(m.id); });
      grid.appendChild(cell);
    });
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
  }

  $('#backToSet').addEventListener('click', function () {
    viewingMove = false;
    openSet(curSet.id);
    pose3d(idlePoses[0], 1.2);
  });

  /* ================= 跟练状态机 ================= */
  var Train = {
    active: false,
    _steps: [], _i: 0, _remain: 0, _total: 0, _last: 0, _raf: 0,
    _paused: false, _set: null, _mode: '', _doneSec: 0,

    start: function (set, moves, mode) {
      var steps = [{ label: '预备 · 调整呼吸', sec: 5, inhale: 'hold', cue: '双脚与肩同宽，全身放松，调整呼吸，即将开始' + set.name, pose: idlePoses[0], _prep: true }];
      moves.forEach(function (m, mi) {
        m.keys.forEach(function (k, ki) {
          steps.push({ label: k.label, sec: k.sec, inhale: k.inhale, cue: k.cue, pose: k.pose, move: m, moveIdx: mi, keyIdx: ki, totalKeys: m.keys.length });
        });
      });
      this._steps = steps; this._i = 0; this._total = steps.length;
      this._set = set; this._mode = mode; this._paused = false;
      this._moveIds = moves.map(function (m) { return m.id; });
      this._startWall = 0; this._doneSec = 0;
      this.active = true;
      showPage('train');
      $('#trainSetName').textContent = set.icon + ' ' + set.name + (mode === 'single' ? ' · 单式' : ' · 整套');
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
      var st = this._steps[i];
      this._remain = st.sec;
      pose3d(st.pose, Math.max(0.9, 2.6 / Math.max(st.sec / 3, 1)));
      breath3d(st.inhale);
      var ring = $('#breathRing');
      ring.className = 'breath-ring ' + (st.inhale === 'hold' ? 'hold' : st.inhale);
      $('#breathText').textContent = st.inhale === 'in' ? '吸' : st.inhale === 'out' ? '呼' : '定';
      if (st.move) {
        $('#trainMoveName').textContent = st.move.name;
        $('#trainKeyLabel').textContent = '第 ' + (st.moveIdx + 1) + '/' + this._countMoves() + ' 式 · ' + st.label + '（' + (st.keyIdx + 1) + '/' + st.totalKeys + ' 动）';
        $('#stageTitle').textContent = st.move.name + ' · ' + st.label;
        speak((st.keyIdx === 0 ? st.move.name + '。' : '') + st.cue);
      } else {
        $('#trainMoveName').textContent = '预备起';
        $('#trainKeyLabel').textContent = st.label;
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
      var pct = (1 - this._remain / st.sec) * 100;
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
      var leaving = this._steps[this._i];
      if (dir > 0 && leaving && leaving.move) S.markLearned(this._set.id, leaving.move.id);
      var ni = this._i + dir;
      if (ni < 0) ni = 0;
      if (ni >= this._total) { this.finish(); return; }
      this.enterStep(ni);
    },
    stop: function (silent) {
      this.active = false;
      cancelAnimationFrame(this._raf);
      if (!silent && global.history) { /* keep simple */ }
      pose3d(idlePoses[0], 1.2);
      breath3d('idle');
    },
    finish: function () {
      var set = this._set, min = Math.round(this._doneSec / 60 * 10) / 10;
      S.addRecord(set.id, this._doneSec, this._moveIds);
      this.active = false;
      cancelAnimationFrame(this._raf);
      $('#doneTitle').textContent = this._mode === 'single' ? '此式功成！' : '功成！' + (S.checkedToday() ? '今日打卡已点亮' : '');
      $('#doneStats').textContent =
        '本次跟练 ' + set.name + '，用时约 ' + min + ' 分钟 · 连续打卡 ' + S.streak() + ' 天 · 累计 ' + S.totalDays() + ' 天';
      speak('收功。' + set.name + '练习完成，今日打卡已记录。');
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
    goBack();
  });

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
    DATA.knowledge.forEach(function (kn) {
      var el = document.createElement('details');
      el.className = 'know-card';
      el.innerHTML = '<summary><span class="ki">' + kn.icon + '</span>' + kn.title + '</summary>' +
        '<div class="kb">' + kn.points.map(function (p) { return '<p>· ' + p + '</p>'; }).join('') + '</div>';
      box.appendChild(el);
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
  $('#soundBtn').addEventListener('click', function () {
    S.toggleSound();
    syncSoundBtn();
    if (!S.soundOn() && 'speechSynthesis' in global) speechSynthesis.cancel();
    else speak('语音口令已开启');
  });
  $('#spinChk').addEventListener('change', function (e) {
    var q = q3d();
    if (q && q.setAutoRotate) q.setAutoRotate(e.target.checked);
  });

  /* ================= 启动 ================= */
  renderHome();
  renderKnowledge();
  syncSoundBtn();
  boot3D(60);
  global.QGApp = { showPage: showPage, Train: Train, DATA: DATA };
})(typeof window !== 'undefined' ? window : globalThis);
