/* =========================================================
 * 气功学堂 · 本地数据层（localStorage，无任何服务端）
 * 键：qigong_v1
 * 结构：{ records:[{d:'YYYY-MM-DD', set:setId, sec, moves:[id]}],
 *         learned:{ setId: { moveId: true } }, settings:{} }
 * ========================================================= */
(function (global) {
  'use strict';

  var KEY = 'qigong_v1';

  function todayStr(offset) {
    var d = new Date();
    if (offset) d.setDate(d.getDate() + offset);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* 隐私模式 */ }
    var data = { records: [], learned: {}, settings: { sound: true } };
    if (raw) {
      try {
        var p = JSON.parse(raw);
        if (p && Array.isArray(p.records)) data.records = p.records;
        if (p && p.learned && typeof p.learned === 'object') data.learned = p.learned;
        if (p && p.settings) data.settings = Object.assign(data.settings, p.settings);
      } catch (e) { /* 损坏则重置 */ }
    }
    return data;
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 存满忽略 */ }
  }

  var S = {
    todayStr: todayStr,
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

    /* ---- 打卡记录 ---- */
    addRecord: function (setId, sec, moveIds) {
      this._data.records.push({
        d: todayStr(), set: setId, sec: Math.round(sec),
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

    /* ---- 设置 ---- */
    soundOn: function () { return this._data.settings.sound !== false; },
    toggleSound: function () {
      this._data.settings.sound = !this.soundOn();
      save(this._data);
      return this._data.settings.sound;
    }
  };

  global.QGStore = S;
})(typeof window !== 'undefined' ? window : globalThis);
