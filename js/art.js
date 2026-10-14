/* The paintings on the walls of the 3D view.
 *
 * Each room colour has its own painting, so a painting tells the player no
 * more than the colour of the wall it hangs on. The paintings are the
 * public-domain works in js/paintings.js (written by check/get_paintings.py
 * from img/paintings/, see img/paintings/CREDITS.md); while that file holds
 * none, the game paints its own landscapes, the same ones every time.
 *
 * A painting is kept as {w, h, data} pixels with its frame, 176 x 136. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var W = 176, H = 136, FRAME = 10;
  var GENERATED = 48;
  var real = [];            // pixels of the paintings in js/paintings.js, once loaded
  var made = {};

  function noise(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function css(c, alpha) {
    var s = Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]);
    return alpha === undefined ? "rgb(" + s + ")" : "rgba(" + s + "," + alpha + ")";
  }

  // the light of a landscape: sky from top to horizon, the sun, the land
  // from far to near, water
  var LIGHTS = [
    {sky: [[96, 140, 196], [214, 226, 236]], sun: [255, 246, 214], land: [[132, 150, 170], [92, 128, 96], [58, 96, 52], [40, 70, 36]], water: [104, 146, 186]},
    {sky: [[238, 158, 120], [252, 222, 170]], sun: [255, 238, 190], land: [[176, 128, 140], [128, 96, 112], [86, 70, 84], [52, 46, 56]], water: [214, 150, 140]},
    {sky: [[64, 58, 112], [236, 140, 96]], sun: [255, 196, 120], land: [[110, 72, 106], [76, 52, 82], [48, 36, 60], [28, 22, 36]], water: [176, 104, 110]},
    {sky: [[20, 30, 60], [70, 90, 130]], sun: [236, 236, 214], land: [[58, 70, 98], [40, 52, 76], [28, 38, 56], [16, 24, 36]], water: [52, 70, 104]},
    {sky: [[150, 176, 200], [232, 222, 196]], sun: [255, 240, 200], land: [[170, 150, 110], [186, 128, 60], [140, 86, 40], [92, 58, 30]], water: [140, 160, 170]},
    {sky: [[170, 192, 214], [236, 240, 244]], sun: [255, 252, 240], land: [[196, 206, 220], [226, 232, 238], [168, 180, 196], [120, 132, 150]], water: [150, 172, 196]},
    {sky: [[176, 184, 180], [222, 224, 216]], sun: [244, 242, 230], land: [[172, 180, 172], [138, 152, 136], [102, 120, 98], [70, 88, 66]], water: [168, 180, 176]},
    {sky: [[120, 168, 210], [244, 220, 170]], sun: [255, 244, 200], land: [[214, 178, 130], [196, 150, 98], [166, 118, 72], [120, 84, 50]], water: [110, 160, 190]},
    {sky: [[130, 186, 226], [226, 240, 236]], sun: [255, 252, 220], land: [[150, 182, 164], [124, 176, 106], [88, 150, 70], [60, 116, 50]], water: [96, 170, 196]},
    {sky: [[78, 120, 170], [196, 214, 220]], sun: [255, 250, 226], land: [[96, 124, 150], [70, 104, 120], [46, 84, 96], [30, 60, 70]], water: [52, 106, 140]}
  ];
  // what is in it
  var KINDS = ["mountains", "hills", "coast", "lake", "forest"];

  /* A ridge from left to right, by halving: heights 0 to 1 at w + 1 points. */
  function ridge(w, rough, rnd) {
    var n = 1;
    while (n < w) {
      n *= 2;
    }
    var pts = new Float32Array(n + 1);
    pts[0] = rnd();
    pts[n] = rnd();
    for (var step = n; step > 1; step /= 2) {
      for (var i = step / 2; i < n; i += step) {
        pts[i] = (pts[i - step / 2] + pts[i + step / 2]) / 2 + (rnd() - 0.5) * rough * step / n;
      }
    }
    var lo = Infinity, hi = -Infinity;
    for (i = 0; i <= n; i++) {
      lo = Math.min(lo, pts[i]);
      hi = Math.max(hi, pts[i]);
    }
    for (i = 0; i <= n; i++) {
      pts[i] = hi > lo ? (pts[i] - lo) / (hi - lo) : 0.5;
    }
    return pts;
  }

  function landscape(g, w, h, index) {
    var rnd = noise(index * 7919 + 13);
    var L = LIGHTS[index % LIGHTS.length], kind = KINDS[Math.floor(index / LIGHTS.length) % KINDS.length];
    var horizon = h * (0.42 + 0.16 * rnd());
    // sky
    var grad = g.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, css(L.sky[0]));
    grad.addColorStop(1, css(L.sky[1]));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // the sun or the moon, with its glow
    var sx = w * (0.15 + 0.7 * rnd()), sy = horizon * (0.3 + 0.45 * rnd()), sr = h * (0.05 + 0.04 * rnd());
    var glow = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 5);
    glow.addColorStop(0, css(L.sun, 0.55));
    glow.addColorStop(1, css(L.sun, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = css(L.sun);
    g.beginPath();
    g.arc(sx, sy, sr, 0, 2 * Math.PI);
    g.fill();
    // clouds
    var clouds = 2 + Math.floor(rnd() * 4);
    for (var c = 0; c < clouds; c++) {
      var cx = w * rnd(), cy = horizon * (0.12 + 0.55 * rnd()), cw = w * (0.12 + 0.2 * rnd());
      for (var p = 0; p < 7; p++) {
        g.fillStyle = css(mix(L.sky[1], [255, 255, 255], 0.5), 0.18 + 0.12 * rnd());
        g.beginPath();
        g.ellipse(cx + (rnd() - 0.5) * cw, cy + (rnd() - 0.5) * cw * 0.18, cw * (0.25 + 0.3 * rnd()),
          cw * (0.08 + 0.08 * rnd()), 0, 0, 2 * Math.PI);
        g.fill();
      }
    }
    // the land, far to near; far layers take on the colour of the sky
    var layers = 4;
    var waterTop = null;
    if (kind === "coast") {
      // the sea up to the horizon, a headland on 1 side and a beach in front
      grad = g.createLinearGradient(0, horizon, 0, h);
      grad.addColorStop(0, css(mix(L.water, L.sky[1], 0.45)));
      grad.addColorStop(1, css(L.water));
      g.fillStyle = grad;
      g.fillRect(0, horizon, w, h - horizon);
      var left = rnd() < 0.5, hr = ridge(w, 1.2, rnd);
      g.fillStyle = css(mix(L.land[1], L.sky[1], 0.25));
      g.beginPath();
      g.moveTo(left ? 0 : w, horizon + 2);
      for (var hx = 0; hx <= w * 0.5; hx++) {
        var fall = 1 - hx / (w * 0.5);
        g.lineTo(left ? hx : w - hx, horizon + 2 - h * 0.2 * fall * (0.6 + 0.4 * hr[Math.floor(hx / w * (hr.length - 1))]));
      }
      g.lineTo(w * 0.5, horizon + 2);
      g.closePath();
      g.fill();
      for (var wv = 0; wv < 16; wv++) {
        g.strokeStyle = css([255, 255, 255], 0.35);
        g.lineWidth = 1;
        var wy = horizon + 3 + (h * 0.8 - horizon) * rnd(), wx = w * rnd();
        g.beginPath();
        g.moveTo(wx, wy);
        g.lineTo(wx + w * 0.05, wy);
        g.stroke();
      }
      g.fillStyle = css(mix(L.land[1], [236, 214, 170], 0.55));
      g.beginPath();
      g.moveTo(0, h);
      g.lineTo(0, h * 0.84);
      g.quadraticCurveTo(w * 0.5, h * 0.76, w, h * 0.88);
      g.lineTo(w, h);
      g.closePath();
      g.fill();
      layers = 0;
    }
    for (var k = 0; k < layers; k++) {
      var near = k / Math.max(1, layers - 1);
      var colour = mix(L.land[k], L.sky[1], (1 - near) * 0.45);
      var rough = kind === "mountains" && k < 2 ? 1.9 : kind === "hills" ? 0.7 : 1.1;
      var r = ridge(w, rough, rnd);
      var base = horizon + (h - horizon) * (k / layers) * 0.9;
      var amp = (kind === "mountains" ? h * 0.32 : h * 0.14) * (1 - near * 0.55);
      if (kind === "lake" && k === layers - 2) {
        waterTop = base;
      }
      g.fillStyle = css(colour);
      g.beginPath();
      g.moveTo(0, h);
      for (var x = 0; x <= w; x++) {
        g.lineTo(x, base - amp * r[Math.floor(x / w * (r.length - 1))]);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fill();
      if (kind === "mountains" && k === 0) {
        // snow on the highest peaks
        g.fillStyle = css(mix(colour, [250, 250, 250], 0.7), 0.85);
        g.beginPath();
        var snowLine = base - amp * 0.72;
        g.moveTo(0, snowLine);
        for (x = 0; x <= w; x++) {
          g.lineTo(x, Math.min(snowLine, base - amp * r[Math.floor(x / w * (r.length - 1))]));
        }
        g.lineTo(w, snowLine);
        g.closePath();
        g.fill();
      }
      if (kind === "forest" && k >= 1) {
        // a line of firs along the ridge
        var tree = mix(L.land[Math.min(3, k + 1)], [10, 30, 16], 0.35);
        g.fillStyle = css(tree);
        for (x = 0; x < w; x += 3 + rnd() * 5) {
          var ty = base - amp * r[Math.floor(x / w * (r.length - 1))];
          var th = h * (0.04 + 0.05 * near) * (0.7 + 0.6 * rnd());
          g.beginPath();
          g.moveTo(x, ty - th);
          g.lineTo(x - th * 0.32, ty + 1);
          g.lineTo(x + th * 0.32, ty + 1);
          g.closePath();
          g.fill();
        }
      }
    }
    if (waterTop !== null) {
      // the lake, the sky in it
      var top = waterTop - h * 0.02, bottom = Math.min(h, waterTop + h * 0.16);
      grad = g.createLinearGradient(0, top, 0, bottom);
      grad.addColorStop(0, css(mix(L.water, L.sky[1], 0.5)));
      grad.addColorStop(1, css(mix(L.water, L.sky[0], 0.3)));
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(w * (0.35 + 0.3 * rnd()), (top + bottom) / 2, w * 0.42, (bottom - top) / 2, 0, 0, 2 * Math.PI);
      g.fill();
      g.strokeStyle = css(L.sun, 0.4);
      g.lineWidth = 1;
      for (var q = 0; q < 6; q++) {
        var qy = top + 3 + (bottom - top) * 0.1 * q, qw = sr * (1.2 - q * 0.15);
        g.beginPath();
        g.moveTo(sx - qw, qy);
        g.lineTo(sx + qw, qy);
        g.stroke();
      }
    }
    // grass in front
    g.strokeStyle = css(mix(L.land[3], [0, 0, 0], 0.2), 0.6);
    g.lineWidth = 1;
    for (var b = 0; b < 60; b++) {
      var gx = w * rnd(), gy = h - h * 0.08 * rnd();
      g.beginPath();
      g.moveTo(gx, gy);
      g.lineTo(gx + (rnd() - 0.5) * 3, gy - h * (0.02 + 0.03 * rnd()));
      g.stroke();
    }
  }

  /* Brush strokes over a picture, in its own colours, so that it looks
   * painted rather than drawn. */
  function brush(g, w, h, seed) {
    var rnd = noise(seed * 31 + 5);
    var src = g.getImageData(0, 0, w, h).data;
    for (var s = 0; s < w * h / 14; s++) {
      var x = Math.floor(rnd() * w), y = Math.floor(rnd() * h), o = (y * w + x) * 4;
      var j = (rnd() - 0.5) * 22;
      g.strokeStyle = "rgba(" + Math.round(src[o] + j) + "," + Math.round(src[o + 1] + j) + "," +
        Math.round(src[o + 2] + j) + ",0.55)";
      g.lineWidth = 1 + rnd() * 1.6;
      var a = (rnd() - 0.5) * 0.9, len = 2 + rnd() * 5;
      g.beginPath();
      g.moveTo(x - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2);
      g.lineTo(x + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2);
      g.stroke();
    }
  }

  /* A gilded frame around the picture area of a W x H canvas. */
  function frame(g) {
    var grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#8a6a2c");
    grad.addColorStop(0.3, "#d8b25a");
    grad.addColorStop(0.55, "#9b7633");
    grad.addColorStop(0.8, "#e0bf6c");
    grad.addColorStop(1, "#7c5d25");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, FRAME);
    g.fillRect(0, H - FRAME, W, FRAME);
    g.fillRect(0, 0, FRAME, H);
    g.fillRect(W - FRAME, 0, FRAME, H);
    g.strokeStyle = "rgba(60,40,10,0.8)";
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
    g.strokeRect(FRAME - 1, FRAME - 1, W - 2 * FRAME + 2, H - 2 * FRAME + 2);
    g.strokeStyle = "rgba(255,240,190,0.5)";
    g.lineWidth = 1;
    g.strokeRect(4.5, 4.5, W - 9, H - 9);
  }

  function pixels(c) {
    var d = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    return {w: c.width, h: c.height, data: d.data};
  }

  function generated(i) {
    if (!made[i]) {
      var c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      var g = c.getContext("2d");
      var inner = document.createElement("canvas");
      inner.width = W - 2 * FRAME;
      inner.height = H - 2 * FRAME;
      var ig = inner.getContext("2d");
      landscape(ig, inner.width, inner.height, i);
      brush(ig, inner.width, inner.height, i);
      g.drawImage(inner, FRAME, FRAME);
      frame(g);
      made[i] = pixels(c);
    }
    return made[i];
  }

  /* A loaded picture, cut to the frame's shape from its middle. */
  function framed(img) {
    var c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    var g = c.getContext("2d");
    var iw = W - 2 * FRAME, ih = H - 2 * FRAME;
    var scale = Math.max(iw / img.width, ih / img.height);
    var sw = iw / scale, sh = ih / scale;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, FRAME, FRAME, iw, ih);
    frame(g);
    return pixels(c);
  }

  /* Loads the paintings of js/paintings.js; resolves when they are ready
   * (at once when there are none). A painting that cannot be loaded is left
   * out. */
  function load() {
    var list = FG.PAINTINGS || [];
    return Promise.all(list.map(function (p) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          try {
            resolve(framed(img));
          } catch (err) {
            resolve(null);
          }
        };
        img.onerror = function () { resolve(null); };
        img.src = p.data;
      });
    })).then(function (got) {
      real = got.filter(Boolean);
      return real.length;
    });
  }

  /* The painting of room colour n. */
  function painting(n) {
    return real.length ? real[n % real.length] : generated(n % GENERATED);
  }

  function source() {
    return real.length ? "paintings" : "generated";
  }

  FG.art = {W: W, H: H, load: load, painting: painting, source: source, landscape: landscape};
})(typeof window !== "undefined" ? window : globalThis);
