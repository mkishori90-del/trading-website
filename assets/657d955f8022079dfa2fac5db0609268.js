/* XYZ hero — bull charge / rock destruction engine.
   Stage space is the banner plate: 1920 x 921 logical px. */
(function () {
  var W = 1920, H = 921;
  var RING = { cx: 965, cy: 791, rx: 512, ry: 29 };
  var PILE = { x: 534, y: 557, w: 834, h: 249 };      // intact cut-out placement
  var RUB = { x: 452, y: 517, w: 1036, h: 353 };      // rubble cut-out placement
  var BULL = { w: 608, h: 495, feet: 476, cx: 308, front: 560 };

  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function load(src) { return new Promise(function (res) { var i = new Image(); i.decoding = 'async'; i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }

  function mount(o) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var stage = o.stage, rc = o.rockCanvas, fc = o.fxCanvas, bull = o.bull, ghosts = o.ghosts || [];
    var rctx = rc.getContext('2d'), fctx = fc.getContext('2d');
    var imgs = {}, ready = false, dead = false;
    var coarse = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    // Real device pixels per CSS pixel: without a viewport meta tag phones lay the page out ~980px wide and
    // zoom it out, so window.devicePixelRatio (3 on iPhone) overstates what the screen can show.
    var zoom = (window.screen && window.screen.width && window.innerWidth > window.screen.width) ? window.screen.width / window.innerWidth : 1;
    var DPR = Math.min((window.devicePixelRatio || 1) * zoom, coarse ? 1.25 : 1.75), S = 1, lastStageTf = '';

    Promise.all([load(o.assets.pile), load(o.assets.rubble), load(o.assets.pileGlow), load(o.assets.rubbleGlow)]).then(function (r) {
      imgs.pile = r[0]; imgs.rubble = r[1]; imgs.pileGlow = r[2]; imgs.rubbleGlow = r[3];
      ready = true; start();
    });

    var OX = 0; // left edge (css px) of the part of the stage the canvases cover
    function resize() {
      var w = stage.clientWidth || 1; S = w / W;
      // On tall/narrow screens the stage is far wider than what its clipping parent shows.
      // Size the canvases to the visible strip only (+ margin for shake/parallax) instead of the whole stage.
      var vis = stage.parentElement ? stage.parentElement.clientWidth : w;
      var cw = Math.min(w, vis + 80); OX = Math.max(0, (w - cw) / 2);
      [rc, fc].forEach(function (c) {
        if (OX > 0) { c.style.left = OX + 'px'; c.style.right = 'auto'; c.style.width = cw + 'px'; }
        else { c.style.left = ''; c.style.right = ''; c.style.width = ''; }
        c.width = Math.round(cw * DPR); c.height = Math.round(w * H / W * DPR);
      });
    }
    var ro = new ResizeObserver(resize); ro.observe(stage); if (stage.parentElement) ro.observe(stage.parentElement); resize();

    /* ---------- shards of the intact pile (jittered grid) ---------- */
    var shards = [];
    function buildShards() {
      shards = [];
      var r = rng(11), cols = 8, rows = 4, pts = [];
      for (var j = 0; j <= rows; j++) { pts[j] = []; for (var i = 0; i <= cols; i++) {
        var x = PILE.x + PILE.w * i / cols, y = PILE.y + PILE.h * j / rows;
        if (i > 0 && i < cols) x += (r() - 0.5) * PILE.w / cols * 0.7;
        if (j > 0 && j < rows) y += (r() - 0.5) * PILE.h / rows * 0.7;
        pts[j][i] = [x, y];
      } }
      for (var j2 = 0; j2 < rows; j2++) for (var i2 = 0; i2 < cols; i2++) {
        var poly = [pts[j2][i2], pts[j2][i2 + 1], pts[j2 + 1][i2 + 1], pts[j2 + 1][i2]];
        var cx = (poly[0][0] + poly[1][0] + poly[2][0] + poly[3][0]) / 4, cy = (poly[0][1] + poly[1][1] + poly[2][1] + poly[3][1]) / 4;
        var dx = cx - 960, dy = cy - 640, d = Math.hypot(dx, dy) || 1;
        var sp = 260 + r() * 480 + (1 - j2 / rows) * 200;
        shards.push({ poly: poly, cx: cx, cy: cy, x: 0, y: 0, a: 0,
          vx: dx / d * sp * 1.1, vy: dy / d * sp * 0.5 - 280 - r() * 380, va: (r() - 0.5) * 4,
          ground: 800 + r() * 50 - cy });
      }
    }

    /* ---------- particles ---------- */
    var debris = [], sparks = [], dust = [], embers = [], waves = [];
    function polyShape(r, n, rad) { var p = []; for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2 + r() * 0.5; var rr = rad * (0.6 + r() * 0.5); p.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.8]); } return p; }
    function spawnDebris() {
      var r = rng(77);
      for (var i = 0; i < 90; i++) {
        var big = i < 14, size = big ? 14 + r() * 20 : 4 + r() * 9;
        var sx = 700 + r() * 520, sy = 590 + r() * 150;
        var dir = (sx - 960) / 300;
        var depth = r();
        debris.push({ x: sx, y: sy, vx: (dir * 520 + (r() - 0.5) * 520) * (big ? 0.55 : 1), vy: -(300 + r() * 900) * (big ? 0.55 : 1),
          a: r() * 6, va: (r() - 0.5) * 14, shape: polyShape(r, 5 + (r() * 3 | 0), size), size: size,
          ground: 812 + depth * 58, hot: r() < 0.35, settled: false, tone: 18 + r() * 16, scale: 0.8 + depth * 0.4 });
      }
    }
    function burstSparks(x, y, n, power) {
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = (300 + Math.random() * 1200) * power;
        sparks.push({ x: x + (Math.random() - 0.5) * 120, y: y + (Math.random() - 0.5) * 60, vx: Math.cos(a) * v + 200 * power, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 1.2, w: 1 + Math.random() * 2 });
      }
    }
    function puff(x, y, n, size, speed) {
      for (var i = 0; i < n; i++) dust.push({ x: x + (Math.random() - 0.5) * size, y: y - Math.random() * size * 0.3, vx: (Math.random() - 0.5) * speed, vy: -Math.random() * speed * 0.4, r: size * (0.4 + Math.random() * 0.6), life: 0, max: 1.2 + Math.random() * 1.6 });
    }
    function ember(rate) {
      embers.push({ x: 560 + Math.random() * 820, y: 640 + Math.random() * 180, vx: (Math.random() - 0.5) * 30, vy: -(40 + Math.random() * 90), life: 0, max: 2.5 + Math.random() * 3.5, r: 0.8 + Math.random() * 1.8, ph: Math.random() * 6 });
    }

    /* ---------- timeline ---------- */
    var T0 = 0, t = 0, last = 0, impacted = false, landed = false, raf = 0, visible = true;
    var CH0 = 0.9, IMPACT = 1.62, JUMP1 = IMPACT;
    var BS = 0.95, LAND = { x: 958, f: 610 };
    var visuals = o.visuals || [], cur = o.initial || 0, pending = -1, exiting = false, exitK = 0, hasVisual = true, firstRun = true, lastPose = null;
    var TARGET_W = 522; // every visual lands at the same width (stage px)
    function applyVisual(i) {
      var v = visuals[i];
      hasVisual = !!(v && v.src);
      if (!hasVisual) return;
      BULL = { w: v.w, h: v.h, feet: v.feet, cx: v.cx, front: v.w };
      BS = v.scale || TARGET_W / (v.contentW || v.w);
      [bull].concat(ghosts).forEach(function (el) {
        if (el.getAttribute('src') !== v.src) el.setAttribute('src', v.src);
        el.style.width = v.w + 'px'; el.style.height = v.h + 'px';
      });
      if (v.alt) bull.setAttribute('alt', v.alt);
    }
    function setVisual(i) {
      if (i === cur && !exiting) return;
      pending = i;
      if (!ready) { cur = i; applyVisual(i); return; }
      if (!exiting) { exiting = true; exitK = 0; setPhase(''); if (o.plateBroken) o.plateBroken.style.opacity = '0'; }
    }
    var shake = 0, flare = 0, stepAcc = 0;
    var ptr = { x: 0, y: 0, sx: 0, sy: 0 };

    function setPhase(p) { if (stage.getAttribute('data-phase') !== p) stage.setAttribute('data-phase', p); }
    function start() { if (dead) return; applyVisual(cur); replay(); last = performance.now(); raf = requestAnimationFrame(frame); }
    function replay() {
      setPhase('');
      CH0 = firstRun ? 0.9 : 0.3; IMPACT = hasVisual ? CH0 + 0.72 : 1e9; firstRun = false;
      t = 0; impacted = false; landed = false; shake = 0; flare = 0;
      debris = []; sparks = []; dust = []; waves = []; buildShards();
      if (o.plateBroken) o.plateBroken.style.opacity = '0';
      if (reduce && hasVisual) { t = IMPACT + 3; impacted = true; landed = true; shards.forEach(function (s) { s.gone = true; }); if (o.plateBroken) o.plateBroken.style.opacity = '1'; setPhase('landed'); }
    }

    function bullPose() {
      var lF = LAND.x - BULL.cx * BS, top = -40;
      if (t < CH0) return { l: lF, f: top, s: BS, r: 0, o: 1, g: 0 };
      if (t < IMPACT) {
        // fast, powerful drop: accelerates all the way into the rock
        var k = (t - CH0) / (IMPACT - CH0), e = k * k * (0.55 + 0.45 * k);
        return { l: lF, f: lerp(top, LAND.f, e), s: BS * lerp(1.06, 1, e), r: lerp(5, 1.5, k), o: 1, g: 2, v: k };
      }
      var since = t - IMPACT;
      // heavy landing: compress, rebound, settle
      var sink = since < 0.7 ? Math.sin(since / 0.7 * Math.PI * 1.5) * 16 * Math.exp(-since * 3.5) : 0;
      var squash = 1 - 0.05 * Math.exp(-since * 9) * Math.cos(since * 20);
      var br = Math.sin(since * 1.5);
      return { l: lF, f: LAND.f + sink + br * 1, s: BS * squash * (1 + br * 0.005), r: 1.5 * Math.exp(-since * 5), o: 1, g: 0 };
    }

    function placeBull(el, p, dx, dy, op, bob, rot) {
      var fx = (p.l + dx + BULL.cx * p.s) * S, fy = (p.f + bob + dy) * S, k = p.s * S;
      var o3 = op.toFixed(3);
      if (o3 !== el._xo) { el._xo = o3; el.style.opacity = o3; }
      if (op <= 0 && el._xt) return; // invisible ghost: no need to move it every frame
      var tf = 'translate3d(' + fx.toFixed(1) + 'px,' + fy.toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg) scale(' + k.toFixed(4) + ') translate(' + (-BULL.cx) + 'px,' + (-BULL.feet) + 'px)';
      if (tf !== el._xt) { el._xt = tf; el.style.transform = tf; }
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden || !ready) { last = now; return; }
      var dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      ptr.sx += (ptr.x - ptr.sx) * Math.min(1, dt * 3); ptr.sy += (ptr.y - ptr.sy) * Math.min(1, dt * 3);

      if (exiting) {
        exitK += dt / 0.45;
        if (exitK >= 1) { exiting = false; exitK = 0; cur = pending; applyVisual(cur); replay(); }
      }
      /* bull */
      var p = bullPose();
      if (exiting) {
        var ek = exitK * exitK;
        p = { l: p.l, f: p.f - ek * 320, s: p.s * (1 - ek * 0.15), r: p.r, o: p.o * (1 - exitK), g: 0 };
      }
      if (!hasVisual) p.o = 0;
      var bob = 0, rot = p.r;
      if (p.g === 1) {
        var ph = (t - CH0) / 0.34 * Math.PI;
        bob = -Math.abs(Math.sin(ph)) * 26 * p.s; rot += Math.sin(ph * 2) * 3.2;
        stepAcc += dt; if (stepAcc > 0.17) { stepAcc = 0; puff(p.l + 180 * p.s, p.f, 3, 40 * p.s, 120); }
      }
      placeBull(bull, p, 0, 0, p.o, bob, rot);
      var vel = p.g === 2 ? p.v : 0;
      ghosts.forEach(function (g, i) {
        var lag = (i + 1) * 95 * vel;
        placeBull(g, p, 0, -lag, p.g ? (0.4 - i * 0.16) * vel : 0, bob, rot);
      });

      /* impact */
      if (!impacted && t >= IMPACT) {
        impacted = true; shake = 1.1; flare = 1.1;
        spawnDebris(); burstSparks(958, 612, 320, 1.1); burstSparks(958, 700, 140, 0.75);
        puff(958, 660, 34, 200, 620); setPhase('landed'); waves.push({ t: 0 });
        if (o.plateBroken) o.plateBroken.style.opacity = '1';
        if (o.flash) { o.flash.style.transition = 'none'; o.flash.style.opacity = '1'; requestAnimationFrame(function () { o.flash.style.transition = 'opacity 1.1s ease-out'; o.flash.style.opacity = '0'; }); }
      }

      /* shake */
      shake = Math.max(0, shake - dt * 2.2);
      var sx = (Math.random() - 0.5) * 26 * shake * shake, sy = (Math.random() - 0.5) * 18 * shake * shake;
      var stf = 'translate(-50%,-50%) translate3d(' + (sx - ptr.sx * 10).toFixed(1) + 'px,' + (sy - ptr.sy * 6).toFixed(1) + 'px,0)';
      if (stf !== lastStageTf) { lastStageTf = stf; stage.style.transform = stf; }
      flare = Math.max(0, flare - dt * 0.9);

      drawRocks(dt);
      drawFx(dt);
    }

    /* ---------- rock layer: ring, rubble, intact shards ---------- */
    function drawRing(ctx) {
      var segs = 160, head = (t * 0.075) % 1, boost = 1 + flare * 2.2;
      var grow = impacted ? easeOut(clamp((t - IMPACT) / 1.4, 0, 1)) : 0;
      var rx = RING.rx + grow * 130, ry = RING.ry + grow * 9, cy = RING.cy + grow * 10;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (var pass = 0; pass < 3; pass++) {
        var lw = [16, 6, 1.8][pass], al = [0.06, 0.16, 0.9][pass];
        for (var i = 0; i < segs; i++) {
          var a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2;
          var u = i / segs, d1 = (u - head + 1) % 1, d2 = (u - head + 1.5) % 1;
          var comet = Math.pow(d1, 12) * 2.2 + Math.pow(d2, 16) * 1.3;
          var front = Math.sin((a0 + a1) / 2) > 0 ? 1 : 0.65;
          var b = (0.55 + comet) * front * boost;
          var hotc = comet > 0.6 && pass === 2;
          ctx.strokeStyle = hotc ? 'rgba(255,226,180,' + clamp(al * b, 0, 1) + ')' : 'rgba(255,' + (pass === 2 ? 120 : 80) + ',24,' + clamp(al * b, 0, 1) + ')';
          ctx.lineWidth = lw;
          ctx.beginPath(); ctx.ellipse(RING.cx, cy, rx, ry, 0, a0, a1 + 0.004); ctx.stroke();
        }
      }
      // floor bounce glow
      var g = ctx.createRadialGradient(RING.cx, RING.cy + 10, 10, RING.cx, RING.cy + 10, 560);
      g.addColorStop(0, 'rgba(255,90,20,' + (0.08 + flare * 0.25) + ')'); g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.setTransform(ctx.getTransform().scale(1, 0.12)); ctx.fillStyle = g;
      ctx.fillRect(RING.cx - 600, (RING.cy + 10) / 0.12 - 600, 1200, 1200);
      ctx.restore();
    }
    var cracks = (function () {
      var r = rng(31), out = [];
      for (var i = 0; i < 10; i++) {
        var ang = (i / 10) * Math.PI * 2 + (r() - 0.5) * 0.5, x = 960, y = 615, pts = [[x, y]];
        var steps = 6 + (r() * 6 | 0), len = 24 + r() * 20;
        for (var k = 0; k < steps; k++) {
          ang += (r() - 0.5) * 0.9;
          x += Math.cos(ang) * len; y += Math.sin(ang) * len * (Math.sin(ang) > 0 ? 0.7 : 0.25);
          y = clamp(y, 560, 800); pts.push([x, y]);
        }
        out.push({ pts: pts, w: 1 + r() * 1.6, d: r() * 0.15 });
      }
      return out;
    })();
    function drawCracks(ctx) {
      var since = t - IMPACT;
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      cracks.forEach(function (c) {
        var k = clamp((since - c.d) / 0.28, 0, 1); if (k <= 0) return;
        var n = Math.max(2, Math.round(c.pts.length * k));
        var fade = clamp(1 - (since - 1.5) / 4, 0.3, 1);
        var pulse = (0.6 + 0.4 * Math.sin(t * 2.2 + c.d * 20)) * fade + flare;
        [[8, 0.14], [3, 0.35], [c.w * 0.8, 0.7]].forEach(function (pw, j) {
          ctx.globalAlpha = clamp(pw[1] * pulse, 0, 1);
          ctx.strokeStyle = j === 2 ? '#ffa860' : '#ff4a0a'; ctx.lineWidth = pw[0];
          ctx.beginPath(); for (var i = 0; i < n; i++) i ? ctx.lineTo(c.pts[i][0], c.pts[i][1]) : ctx.moveTo(c.pts[i][0], c.pts[i][1]); ctx.stroke();
        });
      });
    }
    function drawRocks(dt) {
      var ctx = rctx; ctx.setTransform(S * DPR, 0, 0, S * DPR, -OX * DPR, 0); ctx.clearRect(0, 0, W, H);
      drawRing(ctx);
      if (impacted) {
        var ra = clamp((t - IMPACT) / 0.18, 0, 1) * (exiting ? 1 - exitK : 1);
        ctx.globalAlpha = ra; ctx.drawImage(imgs.rubble, RUB.x, RUB.y, RUB.w, RUB.h);
        var pulse = 0.55 + 0.45 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1) + flare * 1.5;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ra * clamp(pulse, 0, 1);
        ctx.drawImage(imgs.rubbleGlow, RUB.x, RUB.y, RUB.w, RUB.h);
        ctx.drawImage(imgs.rubbleGlow, RUB.x, RUB.y, RUB.w, RUB.h);
        drawCracks(ctx);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
      // intact pile (whole before impact, flying shards after)
      var since = t - IMPACT;
      if (!impacted || exiting) {
        ctx.globalAlpha = exiting && impacted ? exitK : 1;
        ctx.drawImage(imgs.pile, PILE.x, PILE.y, PILE.w, PILE.h);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2.0);
        ctx.drawImage(imgs.pileGlow, PILE.x, PILE.y, PILE.w, PILE.h);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      } else if (since < 0.9) {
        shards.forEach(function (s) {
          s.vy += 2100 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.va * dt;
          if (s.y > s.ground) { s.y = s.ground; s.vy *= -0.25; s.vx *= 0.6; s.va *= 0.5; }
          var al = clamp(1 - (since - 0.12) / 0.6, 0, 1);
          if (al <= 0) return;
          ctx.save(); ctx.globalAlpha = al;
          ctx.translate(s.cx + s.x, s.cy + s.y); ctx.rotate(s.a * 0.25); ctx.translate(-s.cx, -s.cy);
          ctx.beginPath(); s.poly.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.clip();
          ctx.drawImage(imgs.pile, PILE.x, PILE.y, PILE.w, PILE.h);
                    ctx.restore();
        });
      }
    }

    /* ---------- fx layer: debris, sparks, dust, embers, shockwave ---------- */
    function drawFx(dt) {
      var ctx = fctx; ctx.setTransform(S * DPR, 0, 0, S * DPR, -OX * DPR, 0); ctx.clearRect(0, 0, W, H);
      // shockwave
      waves = waves.filter(function (w) { w.t += dt; return w.t < 1.2; });
      waves.forEach(function (w) {
        var k = easeOut(w.t / 1.2), rx = 80 + k * 1100, al = (1 - w.t / 1.2);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,140,50,' + (0.55 * al) + ')'; ctx.lineWidth = 3 + 10 * (1 - k);
        ctx.beginPath(); ctx.ellipse(RING.cx, RING.cy + 8, rx, rx * 0.065, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      });
      // dust
      dust = dust.filter(function (d) { d.life += dt; return d.life < d.max; });
      dust.forEach(function (d) {
        d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.97; d.vy *= 0.97; d.r += dt * 40;
        var al = Math.sin(d.life / d.max * Math.PI) * 0.16;
        var g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        g.addColorStop(0, 'rgba(120,96,80,' + al + ')'); g.addColorStop(1, 'rgba(60,45,38,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
      });
      // debris with bounce & settle
      var debA = exiting ? 1 - exitK : 1;
      debris.forEach(function (b) {
        if (!b.settled) {
          b.vy += 2400 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
          if (b.y > b.ground) {
            b.y = b.ground; b.vy *= -0.3; b.vx *= 0.55; b.va *= 0.45;
            if (Math.abs(b.vy) < 60) { b.vy = 0; b.settled = true; }
            if (b.size > 14 && Math.abs(b.vy) > 120) burstSparks(b.x, b.y, 4, 0.25);
          }
        }
        var hot = b.hot ? clamp(1 - (t - IMPACT) / 6, 0.25, 1) * (0.7 + 0.3 * Math.sin(t * 3 + b.x)) : 0;
        ctx.save(); ctx.globalAlpha = debA; ctx.translate(b.x, b.y - b.size * 0.45 * b.scale); ctx.rotate(b.a); ctx.scale(b.scale, b.scale);
        ctx.beginPath(); b.shape.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
        var gr = ctx.createLinearGradient(0, -b.size, 0, b.size);
        gr.addColorStop(0, 'rgb(' + (b.tone + 46) + ',' + (b.tone + 42) + ',' + (b.tone + 40) + ')'); gr.addColorStop(1, 'rgb(' + b.tone * 0.5 + ',' + b.tone * 0.45 + ',' + b.tone * 0.42 + ')');
        ctx.fillStyle = gr; ctx.fill();
        if (hot > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,110,25,' + hot + ')'; ctx.lineWidth = 1.4; ctx.stroke(); }
        ctx.restore();
      });
      // sparks (streaks)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      sparks = sparks.filter(function (s) { s.life += dt; return s.life < s.max; });
      sparks.forEach(function (s) {
        s.vy += 900 * dt; s.vx *= 0.985; s.vy *= 0.985; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y > 860) { s.y = 860; s.vy *= -0.3; }
        var k = 1 - s.life / s.max;
        ctx.strokeStyle = 'rgba(255,' + (150 + 90 * k | 0) + ',' + (60 + 120 * k * k | 0) + ',' + k + ')'; ctx.lineWidth = s.w * k + 0.4;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.022, s.y - s.vy * 0.022); ctx.stroke();
      });
      // embers rising
      var rate = impacted ? 26 : 12;
      if (Math.random() < rate * dt) ember();
      embers = embers.filter(function (e) { e.life += dt; return e.life < e.max; });
      embers.forEach(function (e) {
        e.x += (e.vx + Math.sin(e.life * 1.3 + e.ph) * 18) * dt; e.y += e.vy * dt;
        var al = Math.sin(e.life / e.max * Math.PI) * (0.6 + 0.4 * Math.sin(e.life * 9 + e.ph));
        ctx.fillStyle = 'rgba(255,140,50,' + al * 0.35 + ')'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,214,150,' + al + ')'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
    }

    var io = null;
    if ('IntersectionObserver' in window) { io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }); io.observe(stage); }
    for (var i = 0; i < 40; i++) { ember(); embers[embers.length - 1].life = Math.random() * 3; }

    return {
      replay: function () { if (ready && !exiting) replay(); },
      setVisual: setVisual,
      setPointer: function (x, y) { ptr.x = x; ptr.y = y; },
      dispose: function () { dead = true; cancelAnimationFrame(raf); ro.disconnect(); if (io) io.disconnect(); }
    };
  }
  window.XYZCharge = { mount: mount };
})();
