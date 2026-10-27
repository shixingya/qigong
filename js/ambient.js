/* =========================================================
 * 气功学堂 · 自然伴奏（Web Audio 全程序化合成，无音频素材）
 * 流水 / 山风 / 鸟鸣三种氛围，可在跟练中开关
 * 暴露：window.QGAmbient = { start(kind), stop(), current(), LABEL }
 * ========================================================= */
(function (global) {
  'use strict';

  var LABEL = { off: '🔇 无伴奏', water: '🌊 泉流', wind: '🍃 山风', birds: '🐦 鸟鸣' };
  var ctx = null, master = null, cur = 'off', live = [], birdTimer = null;

  function ac() {
    if (!ctx) {
      try { ctx = new (global.AudioContext || global.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* 2 秒白噪声循环缓冲 */
  var noiseBuf = null;
  function noise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = c.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    return s;
  }

  function track(node) { live.push(node); return node; }

  function teardown() {
    if (birdTimer) { clearTimeout(birdTimer); birdTimer = null; }
    live.forEach(function (n) { try { n.stop ? n.stop() : n.disconnect(); } catch (e) { /* 忽略 */ } });
    live = [];
    if (master) { try { master.gain.disconnect(); master.disconnect(); } catch (e) { } master = null; }
  }

  /* ---- 流水：噪声→低通，LFO 缓慢调制截止频率起伏 ---- */
  function buildWater(c, out) {
    var src = track(noise(c));
    var lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = .7;
    var g = c.createGain(); g.gain.value = .55;
    src.connect(lp); lp.connect(g); g.connect(out);
    var lfo = track(c.createOscillator()), la = c.createGain();
    lfo.frequency.value = .13; la.gain.value = 240;
    lfo.connect(la); la.connect(lp.frequency);
    /* 细碎水沫：一层高通轻噪声 */
    var src2 = track(noise(c)), hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1400;
    var g2 = c.createGain(); g2.gain.value = .07;
    src2.connect(hp); hp.connect(g2); g2.connect(out);
    src.start(); src2.start(); lfo.start();
  }

  /* ---- 山风：噪声→带通，LFO 扫频 + 轻呼吸感增益 ---- */
  function buildWind(c, out) {
    var src = track(noise(c));
    var bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 340; bp.Q.value = .85;
    var g = c.createGain(); g.gain.value = .5;
    src.connect(bp); bp.connect(g); g.connect(out);
    var lfo = track(c.createOscillator()), la = c.createGain();
    lfo.frequency.value = .07; la.gain.value = 170;
    lfo.connect(la); la.connect(bp.frequency);
    var lfo2 = track(c.createOscillator()), lb = c.createGain();
    lfo2.frequency.value = .19; lb.gain.value = .16;
    lfo2.connect(lb); lb.connect(g.gain);
    src.start(); lfo.start(); lfo2.start();
  }

  /* ---- 鸟鸣：随机间隔的短促哨音（频率快速上滑+衰减） ---- */
  function chirp(c, out, t0, f0) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.6, t0 + .07);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.1, t0 + .16);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(.16, t0 + .02);
    g.gain.exponentialRampToValueAtTime(.001, t0 + .22);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + .3);
  }
  function scheduleBirds(c, out) {
    birdTimer = setTimeout(function () {
      if (cur !== 'birds') return;
      var t0 = c.currentTime + .05, n = 1 + Math.floor(Math.random() * 3);
      for (var i = 0; i < n; i++) {
        chirp(c, out, t0 + i * (.12 + Math.random() * .1), 2400 + Math.random() * 1800);
      }
      scheduleBirds(c, out);
    }, 1400 + Math.random() * 4200);
  }
  function buildBirds(c, out) {
    /* 底衬一层极轻的风林声，避免纯静音间隙突兀 */
    var src = track(noise(c)), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    var g = c.createGain(); g.gain.value = .06;
    src.connect(lp); lp.connect(g); g.connect(out);
    src.start();
    scheduleBirds(c, out);
  }

  var BUILD = { water: buildWater, wind: buildWind, birds: buildBirds };

  var QGAmbient = {
    LABEL: LABEL,
    current: function () { return cur; },
    start: function (kind) {
      if (cur === kind) return;
      QGAmbient.stop();
      if (!kind || kind === 'off') return;
      var c = ac();
      if (!c || !BUILD[kind]) return;
      try {
        master = c.createGain();
        master.gain.setValueAtTime(0.0001, c.currentTime);
        master.gain.exponentialRampToValueAtTime(.5, c.currentTime + 1.2); /* 淡入 */
        master.connect(c.destination);
        BUILD[kind](c, master);
        cur = kind;
      } catch (e) { teardown(); cur = 'off'; }
    },
    stop: function () {
      if (cur === 'off') { teardown(); return; }
      var c = ctx;
      cur = 'off';
      try {
        if (master) master.gain.exponentialRampToValueAtTime(.0001, c.currentTime + .6);
      } catch (e) { }
      setTimeout(teardown, 700); /* 淡出后再拆节点 */
    }
  };

  global.QGAmbient = QGAmbient;
})(window);
