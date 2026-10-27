/* =========================================================
 * 气功学堂 · 本地数据层（localStorage，无任何服务端）
 * 键：qigong_v1
 * 结构：{ records:[{d:'YYYY-MM-DD', set:setId, sec, moves:[id]}],
 *         learned:{ setId: { moveId: true } }, settings:{} }
 * ========================================================= */
(function (global) {
  'use strict';

  var KEY = 'qigong_v1';
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* localStorage 包装：隐私模式/存满时回退内存，本次会话仍可用并告知宿主 */
  var memFallback = {}, canPersist = true;
  try { localStorage.setItem(KEY + '__probe', '1'); localStorage.removeItem(KEY + '__probe'); } catch (e) { canPersist = false; }
  var LS = {
    getItem: function (k) { try { return localStorage.getItem(k); } catch (e) { return memFallback[k] !== undefined ? memFallback[k] : null; } },
    setItem: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { memFallback[k] = String(v); } },
    removeItem: function (k) { try { localStorage.removeItem(k); } catch (e) { delete memFallback[k]; } }
  };

  function todayStr(offset) {
    var d = new Date();
    if (offset) d.setDate(d.getDate() + offset);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function load() {
    var raw = null;
    try { raw = LS.getItem(KEY); } catch (e) { /* 隐私模式 */ }
    var data = { records: [], learned: {}, read: {}, settings: { sound: true, tempo: 1, favs: {} }, plan: null };
    if (raw) {
      try {
        var p = JSON.parse(raw);
        if (p && Array.isArray(p.records)) data.records = p.records;
        if (p && p.learned && typeof p.learned === 'object') data.learned = p.learned;
        if (p && p.read && typeof p.read === 'object') data.read = p.read;
        if (p && p.settings) data.settings = Object.assign(data.settings, p.settings);
        if (!data.settings.favs || typeof data.settings.favs !== 'object') data.settings.favs = {};
        if (p && p.plan && typeof p.plan.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.plan.start)) data.plan = { start: p.plan.start };
      } catch (e) { /* 损坏则重置 */ }
    }
    return data;
  }

  function save(data) {
    try { LS.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 存满忽略 */ }
  }

  function diffDays(a, b) { /* 含头含尾的天数：b - a + 1 */
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1;
  }

  var S = {
    todayStr: todayStr,
    canPersist: function () { return canPersist; },
    _data: load(),

    /* ---- 学习进度 ---- */
    markLearned: function (setId, moveId) {
      var l = this._data.learned;
      if (!l[setId]) l[setId] = {};
      if (!l[setId][moveId]) l[setId][moveId] = true;
      save(this._data);
    },
    isLearned: function (setId, moveId) {
      return !!(this._data.learned[setId] && this._data.learned[setId][moveId]);
    },
    learnedCount: function (setId) {
      return Object.keys(this._data.learned[setId] || {}).length;
    },

    /* 练功时段分布：按十二时粗分为四段，无时刻的旧记录不计入 */
    timeBuckets: function () {
      var defs = [
        { name: '朝练', tip: '卯辰时 5-11 点', icon: '🌅', lo: 5, hi: 11 },
        { name: '昼练', tip: '巳午时 11-17 点', icon: '☀️', lo: 11, hi: 17 },
        { name: '晚练', tip: '申酉时 17-23 点', icon: '🌇', lo: 17, hi: 23 },
        { name: '子时练', tip: '亥子寅 23-5 点，能起来练是真爱', icon: '🌙', lo: 23, hi: 5 }
      ];
      var out = defs.map(function (d) { return { name: d.name, tip: d.tip, icon: d.icon, n: 0 }; });
      this._data.records.forEach(function (r) {
        if (typeof r.hour !== 'number' || r.hour < 0 || r.hour > 23) return;
        for (var i = 0; i < defs.length; i++) {
          var d = defs[i];
          var ok = d.lo < d.hi ? (r.hour >= d.lo && r.hour < d.hi) : (r.hour >= d.lo || r.hour < d.hi);
          if (ok) { out[i].n++; break; }
        }
      });
      return out;
    },

    /* ---- 打卡记录 ---- */
    addRecord: function (setId, sec, moveIds) {
      this._data.records.push({
        d: todayStr(), set: setId, sec: Math.round(sec),
        hour: new Date().getHours(),
        moves: (moveIds || []).slice()
      });
      save(this._data);
    },
    records: function () { return this._data.records; },
    recordsOfDay: function (ds) {
      return this._data.records.filter(function (r) { return r.d === ds; });
    },
    checkedToday: function () { return this.recordsOfDay(todayStr()).length > 0; },
    totalDays: function () {
      var m = {};
      this._data.records.forEach(function (r) { m[r.d] = 1; });
      return Object.keys(m).length;
    },
    totalSec: function () {
      return this._data.records.reduce(function (a, r) { return a + (isFinite(r.sec) ? r.sec : 0); }, 0);
    },
    setsPracticed: function () {
      var m = {};
      this._data.records.forEach(function (r) { if (r.set) m[r.set] = 1; });
      return Object.keys(m).length;
    },

    /* ---- 连续天数（今天或昨天有记录才延续） ---- */
    streak: function () {
      var days = {};
      this._data.records.forEach(function (r) { days[r.d] = 1; });
      var n = 0, probe = 0;
      /* 今天没练则从昨天起算 */
      if (!days[todayStr()]) probe = 1;
      while (days[todayStr(-probe)]) { n++; probe++; }
      return n;
    },

    /* ---- 月度日历数据：{ 'YYYY-MM-DD': 次数 } ---- */
    monthMap: function (year, month) {
      var prefix = year + '-' + String(month + 1).padStart(2, '0');
      var m = {};
      this._data.records.forEach(function (r) {
        if (r.d && r.d.indexOf(prefix) === 0) m[r.d] = (m[r.d] || 0) + 1;
      });
      return m;
    },

    /* ---- 成就（由真实数据运行时计算） ---- */
    badges: function (setCount, moveTotal) {
      var d = this._data;
      var streakMax = this.streakMax();
      return [
        { id: 'first', icon: '🌱', name: '初练功成', desc: '完成第一次跟练打卡', got: d.records.length >= 1, now: d.records.length >= 1 ? '已达成' : '待点亮' },
        { id: 'streak3', icon: '🔥', name: '三日不辍', desc: '连续打卡 3 天', got: streakMax >= 3 },
        { id: 'streak7', icon: '⭐', name: '七日功课', desc: '连续打卡 7 天', got: streakMax >= 7 },
        { id: 'all4', icon: '🏔️', name: '四功齐修', desc: '四种功法各练过一遍', got: this.setsPracticed() >= setCount },
        { id: 'learn10', icon: '📖', name: '十式通晓', desc: '学会 10 个动作', got: this.learnedTotal() >= 10 },
        { id: 'hour', icon: '⏳', name: '功满一时', desc: '累计跟练满 60 分钟', got: this.totalSec() >= 3600 },
        { id: 'halfmoves', icon: '🧘', name: '过半功夫', desc: '学会一半动作（' + Math.ceil(moveTotal / 2) + ' 式）', got: this.learnedTotal() >= Math.ceil(moveTotal / 2) }
      ];
    },
    learnedTotal: function () {
      var l = this._data.learned, n = 0;
      Object.keys(l).forEach(function (k) { n += Object.keys(l[k]).length; });
      return n;
    },
    streakMax: function () {
      var setObj = {};
      this._data.records.forEach(function (r) { setObj[r.d] = 1; });
      var days = Object.keys(setObj).sort();
      var best = 0, run = 0, prev = null;
      days.forEach(function (d) {
        if (prev) {
          var gap = (new Date(d) - new Date(prev)) / 86400000;
          run = gap === 1 ? run + 1 : 1;
        } else run = 1;
        best = Math.max(best, run);
        prev = d;
      });
      return best;
    },

    /* ---- 21 天入门挑战（报名后以真实打卡记录自动判定，不另设手动勾选） ---- */
    PLAN_LEN: 21,
    planStatus: function () { return !!this._data.plan; },
    planInfo: function () {
      if (!this._data.plan) return null;
      var start = this._data.plan.start, len = this.PLAN_LEN;
      var today = todayStr();
      var has = {};
      this._data.records.forEach(function (r) {
        if (r.d >= start && diffDays(start, r.d) <= len) has[r.d] = 1;
      });
      var elapsed = Math.max(0, diffDays(start, today) - 1); /* 已过完的整天数 */
      var grid = [], doneGrid = [], done = 0;
      for (var i = 0; i < len; i++) {
        var ds = todayStr(i - elapsed); /* 第 i+1 天的日期 = 今天 - (elapsed - i) */
        grid.push({ d: ds, has: !!has[ds], past: ds <= today });
        doneGrid.push(!!has[ds]);
        if (has[ds]) done++;
      }
      var dayIdx = diffDays(start, today); /* 今天是挑战第几天（可能 >len） */
      return {
        start: start, done: done, need: len - done, dayIdx: dayIdx,
        over: dayIdx > len, success: done >= len,
        inWin: dayIdx >= 1 && dayIdx <= len,
        grid: grid, doneGrid: doneGrid
      };
    },
    joinPlan: function () {
      if (this._data.plan) return this._data.plan;
      this._data.plan = { start: todayStr() };
      save(this._data);
      return this._data.plan;
    },
    resetPlan: function () { this._data.plan = null; save(this._data); },

    /* ---- 周练报告：近 7 天（含今天） vs 上一周 ---- */
    weekReport: function () {
      var a = todayStr(-6), b = todayStr(-13), c = todayStr(-7);
      var recs = this._data.records;
      var inWin = function (r, from, to) { return r.d >= from && r.d <= to; };
      var cur = recs.filter(function (r) { return inWin(r, a, todayStr()); });
      var prev = recs.filter(function (r) { return inWin(r, b, c); });
      var days = {}, setCount = {}, sec = 0;
      cur.forEach(function (r) {
        days[r.d] = 1; setCount[r.set] = (setCount[r.set] || 0) + 1; sec += r.sec || 0;
      });
      var top = null, topN = 0;
      Object.keys(setCount).forEach(function (k) { if (setCount[k] > topN) { top = k; topN = setCount[k]; } });
      return {
        dayCount: Object.keys(days).length, sessions: cur.length,
        min: Math.round(sec / 60), sets: Object.keys(setCount).length,
        topSet: top, topN: topN,
        prevDayCount: Object.keys(prev.reduce(function (m, r) { m[r.d] = 1; return m; }, {})).length,
        rangeFrom: a, rangeTo: todayStr()
      };
    },

    /* ---- 设置 ---- */
    soundOn: function () { return this._data.settings.sound !== false; },
    toggleSound: function () {
      this._data.settings.sound = !this.soundOn();
      save(this._data);
      return this._data.settings.sound;
    },
    /* 跟练节奏（速度系数）：0.75 慢 / 1 常 / 1.5 快；每个动作的实际时间 = sec / tempo，故慢速时间更长 */
    TEMPOS: [0.75, 1, 1.5],
    tempo: function () {
      var t = this._data.settings.tempo;
      return this.TEMPOS.indexOf(t) >= 0 ? t : 1;
    },
    cycleTempo: function () {
      var ts = this.TEMPOS, i = ts.indexOf(this.tempo());
      /* 循环顺序：常→慢→快→常（前移一位） */
      this._data.settings.tempo = ts[(i - 1 + ts.length) % ts.length];
      save(this._data);
      return this._data.settings.tempo;
    },
    /* 自然伴奏：off/water/wind/birds */
    AMBIENTS: ['off', 'water', 'wind', 'birds'],
    ambient: function () {
      var a = this._data.settings.ambient;
      return this.AMBIENTS.indexOf(a) >= 0 ? a : 'off';
    },
    cycleAmbient: function () {
      var as = this.AMBIENTS, i = as.indexOf(this.ambient());
      this._data.settings.ambient = as[(i + 1) % as.length];
      save(this._data);
      return this._data.settings.ambient;
    },
    /* 自定义选式记忆：上次在某套里勾选的式 */
    pickMem: function () {
      var p = this._data.settings.pick;
      return (p && typeof p === 'object' && typeof p.set === 'string') ? p : null;
    },
    savePick: function (setId, ids) {
      this._data.settings.pick = { set: setId, ids: ids };
      save(this._data);
    },
    /* 收藏常用功法 */
    isFav: function (setId) { return !!(this._data.settings.favs || {})[setId]; },
    toggleFav: function (setId) {
      var f = this._data.settings.favs = this._data.settings.favs || {};
      if (f[setId]) delete f[setId]; else f[setId] = true;
      save(this._data);
      return f[setId] === true;
    },
    favIds: function () {
      var f = this._data.settings.favs || {};
      return Object.keys(f).filter(function (k) { return f[k]; });
    },

    /* ---- 首访引导与知识阅读 ---- */
    hasSeenTour: function () { return !!this._data.settings.toured; },
    markTourSeen: function () { this._data.settings.toured = true; save(this._data); },
    resetTour: function () { this._data.settings.toured = false; save(this._data); },
    isRead: function (knId) { return !!this._data.read[knId]; },
    toggleRead: function (knId) {
      if (this._data.read[knId]) delete this._data.read[knId];
      else this._data.read[knId] = true;
      save(this._data);
      return this._data.read[knId] === true;
    },
    readCount: function () { return Object.keys(this._data.read).length; },

    /* ---- 备份导出/导入（纯本地，无上传） ---- */
    exportPayload: function () {
      return JSON.stringify({
        app: 'qigong', version: 1, exportedAt: new Date().toISOString(),
        records: this._data.records, learned: this._data.learned, read: this._data.read, settings: this._data.settings,
        plan: this._data.plan || null
      }, null, 1);
    },
    /* 校验并清洗外部 JSON，容忍脏数据不崩 */
    parseImport: function (text) {
      var p;
      try { p = JSON.parse(text); } catch (e) { return { ok: false, err: '文件不是合法 JSON' }; }
      if (!p || p.app !== 'qigong' || !Array.isArray(p.records)) return { ok: false, err: '不是气功学堂的备份文件' };
      var records = p.records.filter(function (r) {
        return r && DATE_RE.test(r.d) && typeof r.set === 'string' && isFinite(r.sec) && r.sec >= 0 && r.sec < 86400;
      }).map(function (r) {
        return { d: r.d, set: String(r.set).slice(0, 40), sec: Math.round(r.sec), hour: (typeof r.hour === 'number' && r.hour >= 0 && r.hour < 24) ? Math.round(r.hour) : null, moves: Array.isArray(r.moves) ? r.moves.slice(0, 60) : [] };
      });
      var learned = {};
      if (p.learned && typeof p.learned === 'object') {
        Object.keys(p.learned).forEach(function (sid) {
          var sk = String(sid).slice(0, 40);
          var src = p.learned[sid];
          if (src && typeof src === 'object') {
            Object.keys(src).forEach(function (mid) {
              if (src[mid]) {
                learned[sk] = learned[sk] || {};
                learned[sk][String(mid).slice(0, 40)] = true;
              }
            });
          }
        });
      }
      var read = {};
      if (p.read && typeof p.read === 'object') {
        Object.keys(p.read).forEach(function (kid) { if (p.read[kid]) read[String(kid).slice(0, 40)] = true; });
      }
      return { ok: true, data: { records: records, learned: learned, read: read, plan: (p.plan && p.plan.start && DATE_RE.test(p.plan.start)) ? { start: p.plan.start } : null } };
    },
    /* 合并导入：记录按唯一键去重，已学取并集 */
    mergeImport: function (inc) {
      var seen = {};
      this._data.records.forEach(function (r) { seen[[r.d, r.set, r.sec, (r.moves || []).join(',')].join('|')] = 1; });
      var added = 0;
      inc.records.forEach(function (r) {
        var key = [r.d, r.set, r.sec, r.moves.join(',')].join('|');
        if (!seen[key]) { seen[key] = 1; this._data.records.push(r); added++; }
      }, this);
      var l = this._data.learned;
      Object.keys(inc.learned).forEach(function (sid) {
        l[sid] = l[sid] || {};
        Object.keys(inc.learned[sid]).forEach(function (mid) { l[sid][mid] = true; });
      });
      if (inc.read) {
        var rd = this._data.read = this._data.read || {};
        Object.keys(inc.read).forEach(function (kid) { rd[kid] = true; });
      }
      save(this._data);
      /* 挑战计划：取更早开始日，视为同一挑战 */
      if (inc.plan && inc.plan.start && DATE_RE.test(inc.plan.start)) {
        var cur = this._data.plan;
        if (!cur || inc.plan.start < cur.start) this._data.plan = { start: inc.plan.start };
      }
      return added;
    }
  };

  global.QGStore = S;
})(typeof window !== 'undefined' ? window : globalThis);
