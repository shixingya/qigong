/* =========================================================
 * 气功学堂 · Three.js 场景与程序化人形（ESM module）
 * 依赖 importmap: "three" 与 "three/addons/" 指向 CDN
 * 对外暴露 window.QG3D：
 *   init(container) / setPose(p) / snap(p) / setBreath(phase)
 *   setAutoRotate(b) / currentPose()
 * 姿势字典约定见 js/data.js 头部注释。
 * ========================================================= */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

(function () {
  'use strict';

  var DEG = Math.PI / 180;

  /* 中立位（全 0，y 除外） */
  var NEUTRAL = {
    y: 0, tp: 0, ty: 0, tz: 0, hp: 0, hr: 0,
    la: 0, lfl: 0, lb: 0, ra: 0, rfl: 0, rb: 0,
    lh: 0, ls: 0, lk: 0, rh: 0, rs: 0, rk: 0
  };
  var KEYS = Object.keys(NEUTRAL);

  function normalize(p) {
    var out = {};
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      var v = p && typeof p[k] === 'number' ? p[k] : NEUTRAL[k];
      if (k === 'y') v = Math.max(-0.3, Math.min(0.3, v));
      out[k] = v;
    }
    return out;
  }

  var inited = false;
  var api = {
    ready: false,
    init: function () { throw new Error('QG3D not ready'); },
    setPose: function () {},
    snap: function () {},
    setBreath: function () {},
    setAutoRotate: function () {},
    setAuraColor: function () {},
    setAcuShow: function () {},
    floatText: function () {},
    camView: function () {},
    currentPose: function () { return {}; }
  };
  function stubFail() {
    return { failed: true, ready: false,
      setPose: function () {}, snap: function () {}, setBreath: function () {},
      setAutoRotate: function () {}, setAuraColor: function () {}, setAcuShow: function () {},
      floatText: function () {}, camView: function () {}, currentPose: function () { return {}; } };
  }

  function boot(container) {
    if (inited) return;
    inited = true;

    /* ---------- 基础场景 ---------- */
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1b1e);
    scene.fog = new THREE.Fog(0x0d1b1e, 6, 14);

    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0.7, 1.45, 3.6);

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    var controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.6;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.autoRotateSpeed = 0.9;

    /* ---------- 灯光 ---------- */
    scene.add(new THREE.HemisphereLight(0xbfd8d2, 0x1a2a26, 0.75));
    var key = new THREE.DirectionalLight(0xf2e6c8, 1.35);
    key.position.set(2.5, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3; key.shadow.camera.right = 3;
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -1;
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x5fd6b8, 0.8);
    rim.position.set(-3, 2, -2.5);
    scene.add(rim);

    /* ---------- 地面与阵法圆台 ---------- */
    var floorMat = new THREE.MeshStandardMaterial({ color: 0x14262a, roughness: 0.95, metalness: 0.05 });
    var floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    var dais = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.25, 0.06, 48),
      new THREE.MeshStandardMaterial({ color: 0x1d3a3f, roughness: 0.7 })
    );
    dais.position.y = 0.03;
    dais.receiveShadow = true;
    scene.add(dais);

    function ring(radius, color, opacity, y) {
      var g = new THREE.RingGeometry(radius, radius + 0.014, 64);
      var m = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide });
      var mesh = new THREE.Mesh(g, m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y === undefined ? 0.065 : y;
      return mesh;
    }
    scene.add(ring(1.12, 0x5fd6b8, 0.5));
    scene.add(ring(0.86, 0x5fd6b8, 0.22));
    scene.add(ring(1.5, 0xc9a45c, 0.18));

    /* ---------- 程序化人形 ---------- */
    var robe = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6, metalness: 0.02 });
    var sash = new THREE.MeshStandardMaterial({ color: 0x3fae8a, roughness: 0.5 });
    var skin = new THREE.MeshStandardMaterial({ color: 0xf0d5b8, roughness: 0.55 });

    function cast(m) { m.castShadow = true; m.receiveShadow = false; return m; }
    function limb(mat, r, len) {
      var seg = new THREE.Group();
      var geo = new THREE.CapsuleGeometry(r, len, 6, 12);
      var mesh = cast(new THREE.Mesh(geo, mat));
      mesh.position.y = -(len / 2 + r); /* 骨骼从 pivot 向下 */
      seg.add(mesh);
      seg.userData.childOffset = -(len + 2 * r);
      return seg;
    }

    var root = new THREE.Group();          /* 整体（含 y 抬升） */
    var pelvis = new THREE.Group();
    pelvis.position.y = 1.02; /* 配合腿长，收势时脚正好落在圆台上 */
    root.add(pelvis);
    scene.add(root);

    /* 骨盆 */
    var pelvisMesh = cast(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), sash));
    pelvisMesh.scale.set(1.5, 0.8, 1);
    pelvis.add(pelvisMesh);

    /* 躯干（可俯/扭/侧倾） */
    var torso = new THREE.Group();
    torso.position.y = 0.05;
    pelvis.add(torso);

    var belly = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.24, 6, 16), robe));
    belly.position.y = 0.18;
    belly.scale.set(1.15, 1, 0.8);
    torso.add(belly);
    var chest = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.16, 6, 16), robe));
    chest.position.y = 0.46;
    chest.scale.set(1.3, 1, 0.85);
    torso.add(chest);
    /* 腰带 */
    var belt = cast(new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.022, 8, 24), sash));
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.06;
    belt.scale.set(1.12, 1.12, 1);
    torso.add(belt);

    /* 颈与头 */
    var neck = new THREE.Group();
    neck.position.y = 0.62;
    torso.add(neck);
    var headGroup = new THREE.Group();
    neck.add(headGroup);
    var head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), skin));
    head.position.y = 0.1;
    head.scale.set(0.95, 1.12, 0.95);
    headGroup.add(head);
    /* 发髻（道家丸子头） */
    var bun = cast(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.8 })));
    bun.position.set(0, 0.205, -0.01);
    headGroup.add(bun);
    /* 面部朝向 +Z：双眼点缀，方便辨认正脸 */
    var eyeMat = new THREE.MeshBasicMaterial({ color: 0x22201d });
    [-0.035, 0.035].forEach(function (x) {
      var e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), eyeMat);
      e.position.set(x, 0.115, 0.088);
      headGroup.add(e);
    });

    /* 手臂：肩(外展z 前举x) -> 肘(屈x) */
    function makeArm(side) {
      var shoulder = new THREE.Group();
      shoulder.position.set(0.21 * side, 0.55, 0);
      var upper = limb(robe, 0.05, 0.26);
      shoulder.add(upper);
      var elbow = new THREE.Group();
      elbow.position.y = upper.userData.childOffset;
      upper.add(elbow);
      var fore = limb(robe, 0.043, 0.24);
      elbow.add(fore);
      var hand = cast(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin));
      hand.scale.set(0.8, 1, 0.55);
      hand.position.y = fore.userData.childOffset - 0.02;
      fore.add(hand);
      torso.add(shoulder);
      return { shoulder: shoulder, elbow: elbow };
    }
    /* 左手在 -X（side=-1 时 abduction z 取负） */
    var armL = makeArm(-1);
    var armR = makeArm(1);

    /* 腿：髋(举x 展z) -> 膝(屈x) */
    function makeLeg(side) {
      var hip = new THREE.Group();
      hip.position.set(0.095 * side, -0.02, 0);
      pelvis.add(hip);
      var thigh = limb(robe, 0.065, 0.36);
      hip.add(thigh);
      var knee = new THREE.Group();
      knee.position.y = thigh.userData.childOffset;
      thigh.add(knee);
      var shin = limb(robe, 0.052, 0.34);
      knee.add(shin);
      var foot = cast(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.2), skin));
      foot.position.set(0, shin.userData.childOffset - 0.02, 0.05);
      shin.add(foot);
      return { hip: hip, knee: knee };
    }
    var legL = makeLeg(-1);
    var legR = makeLeg(1);

    /* ---------- 气感特效：丹田光 + 环绕灵气粒子 ---------- */
    var dantian = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x7fffd0, transparent: true, opacity: 0.55 })
    );
    torso.add(dantian);
    dantian.position.set(0, 0.14, 0.12);

    /* 穴位光点（Sprite 光晕：永远面向相机、不被肢体遮挡） */
    var acuTex = (function () {
      var c = document.createElement('canvas');
      c.width = c.height = 64;
      var x = c.getContext('2d');
      var g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,238,170,1)');
      g.addColorStop(0.35, 'rgba(255,226,138,.8)');
      g.addColorStop(1, 'rgba(255,226,138,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      var t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    var acus = [];
    function acu(parent, pos, name) {
      var m = new THREE.Sprite(new THREE.SpriteMaterial({ map: acuTex, transparent: true, opacity: 0.9, depthWrite: false }));
      m.scale.set(0.12, 0.12, 1);
      m.position.set(pos[0], pos[1], pos[2]);
      m.visible = false;
      m.userData.name = name;
      parent.add(m);
      acus.push(m);
      return m;
    }
    acu(headGroup, [0, 0.25, 0], '百会');
    acu(torso, [0, 0.42, 0.17], '膻中');
    acu(torso, [0, 0.14, 0.15], '丹田');
    acu(torso, [0, 0.16, -0.16], '命门');
    function sole(leg, side) {
      /* 脚底涌泉：随踝关节联动 */
      var shinObj = leg.knee.children[0];
      return acu(shinObj, [0.02 * side, -0.46, 0.05], '涌泉');
    }
    sole(legL, -1); sole(legR, 1);

    var aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 20),
      new THREE.MeshBasicMaterial({ color: 0x5fd6b8, transparent: true, opacity: 0.05, side: THREE.BackSide, depthWrite: false })
    );
    aura.scale.set(1.4, 2.2, 1.1);
    aura.position.y = 0.1;
    root.add(aura);

    /* ---------- 头顶浮字（CanvasTexture Sprite） ---------- */
    var ftCanvas = document.createElement('canvas');
    ftCanvas.width = 1024; ftCanvas.height = 192;
    var ftCtx = ftCanvas.getContext('2d');
    var ftTex = new THREE.CanvasTexture(ftCanvas);
    ftTex.colorSpace = THREE.SRGBColorSpace;
    var ftSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ftTex, transparent: true, opacity: 0, depthWrite: false }));
    ftSprite.position.set(0, 2.28, 0);
    ftSprite.scale.set(2.6, 0.49, 1);
    root.add(ftSprite);
    var ftHold = 0, ftAlpha = 0;
    function drawFloatText(txt) {
      ftCtx.clearRect(0, 0, 1024, 192);
      ftCtx.font = 'bold 72px "Songti SC", "SimSun", serif';
      ftCtx.textAlign = 'center';
      ftCtx.textBaseline = 'middle';
      ftCtx.shadowColor = 'rgba(95,214,184,.9)';
      ftCtx.shadowBlur = 22;
      ftCtx.fillStyle = '#f4e8c8';
      ftCtx.fillText(String(txt || '').slice(0, 14), 512, 96);
      ftTex.needsUpdate = true;
    }

    var P_COUNT = 260;
    var pGeo = new THREE.BufferGeometry();
    var pPos = new Float32Array(P_COUNT * 3);
    var pSpeed = new Float32Array(P_COUNT);
    for (var i = 0; i < P_COUNT; i++) {
      var a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 2.2;
      pPos[i * 3] = Math.cos(a) * r;
      pPos[i * 3 + 1] = Math.random() * 2.4;
      pPos[i * 3 + 2] = Math.sin(a) * r;
      pSpeed[i] = 0.05 + Math.random() * 0.25;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    var motes = new THREE.Points(pGeo, new THREE.PointsMaterial({
      color: 0xc9e8d8, size: 0.02, transparent: true, opacity: 0.55, depthWrite: false
    }));
    scene.add(motes);

    /* ---------- 姿势插值状态 ---------- */
    var cur = normalize({});
    var tgt = normalize({});
    var speed = 2.2;

    function applyPose(p) {
      root.position.y = p.y;
      torso.rotation.set(p.tp * DEG, p.ty * DEG, p.tz * DEG);
      headGroup.rotation.set(p.hp * DEG, 0, p.hr * DEG);
      /* 肩：外展 z（左负右正），前举 x（负）；肘屈 x（负） */
      armL.shoulder.rotation.set(-p.lfl * DEG, 0, -p.la * DEG);
      armL.elbow.rotation.set(-p.lb * DEG, 0, 0);
      armR.shoulder.rotation.set(-p.rfl * DEG, 0, p.ra * DEG);
      armR.elbow.rotation.set(-p.rb * DEG, 0, 0);
      /* 髋：前举 x（负），外展 z（左负右正）；膝屈 x（正=向后） */
      legL.hip.rotation.set(-p.lh * DEG, 0, -p.ls * DEG);
      legL.knee.rotation.set(p.lk * DEG, 0, 0);
      legR.hip.rotation.set(-p.rh * DEG, 0, p.rs * DEG);
      legR.knee.rotation.set(p.rk * DEG, 0, 0);
    }
    applyPose(cur);

    /* ---------- 渲染循环 ---------- */
    var clock = new THREE.Clock();
    var breathPhase = 'idle'; /* in | out | hold | idle */
    var breathT = 0;

    function resize() {
      var w = container.clientWidth || 1, h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(resize).observe(container);
    }
    window.addEventListener('resize', resize);
    resize();

    function loop() {
      requestAnimationFrame(loop);
      var dt = Math.min(clock.getDelta(), 0.05);
      var t = clock.elapsedTime;

      /* 视角预设缓动（用户一旦拖拽即交还控制权） */
      if (camGoal) {
        camera.position.lerp(camGoal, 1 - Math.exp(-3.2 * dt));
        if (camera.position.distanceTo(camGoal) < 0.02) camGoal = null;
      }

      /* 姿势向目标缓动 */
      var f = 1 - Math.exp(-speed * dt);
      for (var i = 0; i < KEYS.length; i++) {
        var k = KEYS[i];
        cur[k] += (tgt[k] - cur[k]) * f;
      }
      applyPose(cur);

      /* 呼吸节律：丹田明暗 + 胸腔微起伏 */
      breathT += dt;
      var pulse = breathPhase === 'in' ? 0.5 + 0.45 * Math.sin(Math.min(breathT * 1.1, Math.PI / 2))
        : breathPhase === 'out' ? 0.5 + 0.45 * Math.cos(Math.min(breathT * 0.8, Math.PI / 2))
        : 0.5 + 0.3 * Math.sin(t * 1.2);
      dantian.material.opacity = 0.25 + 0.5 * pulse;
      dantian.scale.setScalar(0.85 + 0.35 * pulse);
      aura.material.opacity = 0.035 + 0.05 * pulse;
      chest.scale.y = 1 + 0.04 * (breathPhase === 'in' ? pulse : 1 - pulse * 0.4);

      /* 灵气粒子上浮环绕 */
      var arr = pGeo.attributes.position.array;
      for (var j = 0; j < P_COUNT; j++) {
        arr[j * 3 + 1] += pSpeed[j] * dt * (breathPhase === 'in' ? 1.4 : 0.8);
        var x = arr[j * 3], z = arr[j * 3 + 2];
        var ang = dt * 0.12;
        arr[j * 3] = x * Math.cos(ang) - z * Math.sin(ang);
        arr[j * 3 + 2] = x * Math.sin(ang) + z * Math.cos(ang);
        if (arr[j * 3 + 1] > 2.6) arr[j * 3 + 1] = 0.05;
      }
      pGeo.attributes.position.needsUpdate = true;

      /* 穴位明暗呼吸 + 浮字淡入淡出 */
      if (acuVisible) {
        var ao = 0.55 + 0.4 * Math.sin(t * 2.4);
        for (var ai = 0; ai < acus.length; ai++) acus[ai].material.opacity = ao;
      }
      if (ftHold > 0) { ftHold -= dt; ftAlpha += (1 - ftAlpha) * Math.min(1, dt * 8); }
      else ftAlpha += (0 - ftAlpha) * Math.min(1, dt * 5);
      ftSprite.material.opacity = ftAlpha;

      controls.update();
      renderer.render(scene, camera);
    }

    /* ---------- 相机视角预设 ---------- */
    var camGoal = null;
    var VIEWS = {
      front: [0.001, 1.5, 3.6], back: [0.001, 1.6, -3.6],
      left: [-3.6, 1.5, 0.001], right: [3.6, 1.5, 0.001], top: [0, 3.9, 1.5]
    };
    controls.addEventListener('start', function () { camGoal = null; });

    var acuVisible = false;

    api = {
      ready: true,
      init: function (c) { boot(c); }, /* 幂等：inited 守卫防重复 */
      setPose: function (p, spd) {
        tgt = normalize(p);
        if (typeof spd === 'number') speed = spd;
        breathT = 0;
      },
      snap: function (p) {
        cur = normalize(p); tgt = normalize(p);
        breathT = 0;
        applyPose(cur);
      },
      setBreath: function (phase) {
        if (phase !== breathPhase) { breathPhase = phase; breathT = 0; }
      },
      setAutoRotate: function (b) { controls.autoRotate = !!b; },
      setAuraColor: function (hex) {
        dantian.material.color.set(hex);
        aura.material.color.set(hex);
      },
      setAcuShow: function (b) {
        acuVisible = !!b;
        for (var i = 0; i < acus.length; i++) acus[i].visible = !!b;
      },
      floatText: function (txt) {
        if (!txt) { ftHold = 0; return; }
        drawFloatText(txt);
        ftHold = 2.4;
      },
      camView: function (name) {
        var v = VIEWS[name];
        if (v) camGoal = new THREE.Vector3(v[0], v[1], v[2]);
      },
      currentPose: function () { return cur; }
    };
    window.QG3D = api;
    loop();
  }

  /* 暴露惰性初始化入口：app.js 调用 QG3D.boot(container) */
  api.init = function (container) {
    try {
      boot(container);
    } catch (err) {
      console.error('[QG3D] 3D 场景初始化失败，已降级为图文模式', err);
      window.QG3D = stubFail();
      document.dispatchEvent(new CustomEvent('qg3d:failed'));
    }
  };
  window.QG3D = api;
})();
