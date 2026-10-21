/* The paintings on the walls of the 3D view, and their Like plaques.
 *
 * The paintings are the famous public-domain paintings of js/paintings.js
 * (see img/paintings/CREDITS.md). Every game hangs them anew: each wall of
 * each room gets a different painting, drawn at random from all of them
 * (hang), so every room has 4 different paintings. While js/paintings.js
 * holds none (or game.paintings is false), the game paints its own
 * landscapes instead, the same one for the same room colour.
 *
 * A painting keeps its own shape (never stretched or cut): in its gilded
 * frame it is fitted into at most FRAME_MAX_W x FRAME_MAX_H tiles, 80% of
 * the height of the wall between the moulding and the skirting board, with
 * the Like plaque beside the frame (layout). The view draws paintings far away from ATLAS, 1 image with a
 * small picture of every painting; near ones sharp from their own image:
 * the 512 pixel copy, and the 1600 pixel one for the room the player is in
 * (want, image), each put into its frame once it has come in. Picture
 * numbers: p >= 0 is painting p of FG.PAINTINGS, p < 0 the game's own
 * landscape -1 - p. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  // the picture in its frame at most this wide and high (tiles; a wall is 1
  // tile high, a painting has 2 tiles of it), the frame BORDER wide, its
  // middle V_MID down the wall: from 0.08 to 0.88, clear of the moulding at
  // the top (to 0.05) and the skirting board at the bottom (from 0.9)
  var FRAME_MAX_W = 1.5, FRAME_MAX_H = 0.8, BORDER = 0.045, V_MID = 0.48;
  // the game's own small landscapes (game.paintings false) as before
  var LANDSCAPE_MAX_W = 1.24, LANDSCAPE_MAX_H = 0.59;
  // the Like plaque: its size, how far right of the frame; its middle at
  // the eyes of a person (half way up the wall)
  var PLAQUE_W = 0.2, PLAQUE_H = 0.088, PLAQUE_GAP = 0.06, PLAQUE_MID = 0.5;
  var GENERATED = 48, GEN_W = 156, GEN_H = 116;
  // images kept that are not wanted any more, at most
  var KEEP = {large: 8, small: 24};
  var LOADING_AT_ONCE = 4;
  var FRAME_RGB = [176, 136, 62], PLAQUE_RGB = [236, 228, 206], LIKED_RGB = [46, 156, 90];

  var list = [];            // FG.PAINTINGS
  var atlas = null;         // {data, w, h}: the pixels of FG.PAINTINGS_ATLAS
  var made = {};            // generated landscapes: {canvas, data}
  var layouts = {};
  var plaques = {};
  var labels = {like: "Like", liked: "Liked"};
  var images = {};          // "p:size" -> {img, framed (the picture in its frame), ready, failed, used}
  var wanted = [];          // [{p, size}], most wanted first
  var active = 0;
  var listeners = [];
  var changes = 0;          // goes up whenever an image comes in or is let go

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

  // ------------------------------------------------------------ the list
  function count() {
    return list.length;
  }

  function info(p) {
    return p >= 0 ? list[p] : null;
  }

  /* The paintings for a maze's places (js/world.js paintingPlaces), drawn
   * at random with rand: every place a different painting while there are
   * enough of them (the biggest maze, 140 rooms, has 560 places). Without
   * paintings (or with real false) the game's own landscapes, 1 for each
   * room colour, as before 2.5.0. */
  function hang(places, rand, real) {
    var out = new Int32Array(places.length);
    if (!list.length || real === false) {
      places.forEach(function (pl, k) { out[k] = -1 - (pl.colour % GENERATED); });
      return out;
    }
    var order = [];
    for (var k = 0; k < places.length; k++) {
      if (k % list.length === 0) {
        order = shuffled(list.length, rand);
      }
      out[k] = order[k % list.length];
    }
    return out;
  }

  function shuffled(n, rand) {
    var a = [];
    for (var i = 0; i < n; i++) {
      a.push(i);
    }
    for (i = n - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1)), t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function aspect(p) {
    return p >= 0 ? list[p].w / list[p].h : GEN_W / GEN_H;
  }

  /* Where a picture, its frame and its plaque are on their 2 wall tiles:
   * across (x, tiles from the start of the 2 tiles as seen from the room)
   * and down (v, from the top of the wall, which is 1 tile high). */
  function layout(p) {
    var key = p >= 0 ? p : "g";
    if (!layouts[key]) {
      var a = aspect(p);
      // the picture as high as the frame allows, unless that is too wide
      var maxW = p >= 0 ? FRAME_MAX_W : LANDSCAPE_MAX_W, maxH = p >= 0 ? FRAME_MAX_H : LANDSCAPE_MAX_H;
      var ph = maxH - 2 * BORDER, pw = ph * a;
      if (pw + 2 * BORDER > maxW) {
        pw = maxW - 2 * BORDER;
        ph = pw / a;
      }
      var fw = pw + 2 * BORDER, fh = ph + 2 * BORDER;
      var x0 = (2 - (fw + PLAQUE_GAP + PLAQUE_W)) / 2;
      var L = {fx0: x0, fx1: x0 + fw, fv0: V_MID - fh / 2, fv1: V_MID + fh / 2,
        px0: x0 + BORDER, px1: x0 + fw - BORDER, pv0: V_MID - ph / 2, pv1: V_MID + ph / 2,
        qx0: x0 + fw + PLAQUE_GAP, qx1: x0 + fw + PLAQUE_GAP + PLAQUE_W,
        qv0: PLAQUE_MID - PLAQUE_H / 2, qv1: PLAQUE_MID + PLAQUE_H / 2};
      layouts[key] = L;
    }
    return layouts[key];
  }

  // ------------------------------------------------------------ pixels
  function generated(n) {
    if (!made[n]) {
      var c = document.createElement("canvas");
      c.width = GEN_W;
      c.height = GEN_H;
      var g = c.getContext("2d");
      landscape(g, GEN_W, GEN_H, n);
      brush(g, GEN_W, GEN_H, n);
      made[n] = {canvas: c, data: g.getImageData(0, 0, GEN_W, GEN_H).data};
    }
    return made[n];
  }

  /* The small picture of p for the view's own pixels: {data, stride, x0, y0,
   * w, h}, or null (then colour(p)). */
  function pixels(p) {
    if (p < 0) {
      var m = generated(-1 - p);
      return {data: m.data, stride: GEN_W, x0: 0, y0: 0, w: GEN_W, h: GEN_H};
    }
    if (!atlas) {
      return null;
    }
    var c = list[p].cell;
    return {data: atlas.data, stride: atlas.w, x0: c[0], y0: c[1], w: c[2], h: c[3]};
  }

  function colour(p) {
    return p >= 0 ? list[p].rgb : [120, 130, 110];
  }

  // ------------------------------------------------------------ images
  function key(p, size) {
    return p + ":" + size;
  }

  function src(p, size) {
    return "img/paintings/" + size + "/" + list[p].id + ".jpg";
  }

  /* The images to have ready, most wanted first: [{p, size}], size "small"
   * (512 pixels) or "large" (1600). Images no longer wanted are kept a
   * while (KEEP), then let go. */
  function want(w) {
    wanted = w.filter(function (x) { return x.p >= 0 && x.p < list.length; });
    var now = performance.now();
    wanted.forEach(function (x) {
      var e = images[key(x.p, x.size)];
      if (e) {
        e.used = now;
      }
    });
    pump();
    trim();
  }

  function pump() {
    for (var i = 0; i < wanted.length && active < LOADING_AT_ONCE; i++) {
      var w = wanted[i], k = key(w.p, w.size);
      if (!images[k]) {
        start(w.p, w.size, k);
      }
    }
  }

  function start(p, size, k) {
    var img = new Image(), e = {img: img, framed: null, ready: false, failed: false, used: performance.now(),
      size: size};
    images[k] = e;
    active += 1;
    var done = function (ok) {
      active -= 1;
      img.onload = img.onerror = null;
      if (images[k] === e) {
        if (ok) {
          try {
            e.framed = framed(p, img);
          } catch (err) {
            ok = false;
          }
          // the picture is kept in its frame: the image itself can go
          img.src = "";
        }
        e.ready = ok;
        e.failed = !ok;
        if (ok) {
          changes += 1;
          listeners.forEach(function (fn) { fn(p, size); });
        }
      }
      pump();
    };
    img.decoding = "async";
    img.onload = function () {
      if (img.decode) {
        img.decode().then(function () { done(true); }, function () { done(img.naturalWidth > 0); });
      } else {
        done(true);
      }
    };
    img.onerror = function () { done(false); };
    img.src = src(p, size);
  }

  function trim() {
    ["large", "small"].forEach(function (size) {
      var keepNow = {};
      wanted.forEach(function (w) {
        if (w.size === size) {
          keepNow[key(w.p, size)] = true;
        }
      });
      var spare = Object.keys(images).filter(function (k) {
        return images[k].size === size && !keepNow[k] && images[k].ready;
      }).sort(function (a, b) { return images[b].used - images[a].used; });
      spare.slice(KEEP[size]).forEach(function (k) {
        images[k].img.src = "";
        images[k].framed = null;
        delete images[k];
        changes += 1;
      });
    });
  }

  /* The sharpest picture of p in its frame there is, for a picture px
   * pixels high on the screen: a canvas that is the frame (layout fx0 to
   * fx1, fv0 to fv1) with the picture in it, from the large copy when it is
   * needed and ready, else from the small one; null while none is ready. */
  function image(p, px) {
    if (p < 0) {
      var m = generated(-1 - p);
      if (!m.framed) {
        m.framed = framed(p, m.canvas);
      }
      return m.framed;
    }
    var s = images[key(p, "small")], l = images[key(p, "large")];
    var now = performance.now();
    var big = l && l.ready && (px > list[p].sh * 0.8 || !(s && s.ready));
    var e = big ? l : (s && s.ready ? s : (l && l.ready ? l : null));
    if (!e) {
      return null;
    }
    e.used = now;
    return e.framed;
  }

  /* The picture img of p in its frame, at the picture's own pixels. */
  function framed(p, img) {
    var L = layout(p), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var per = iw / (L.px1 - L.px0);              // pixels a tile
    var c = document.createElement("canvas");
    c.width = Math.round((L.fx1 - L.fx0) * per);
    c.height = Math.round((L.fv1 - L.fv0) * per);
    var g = c.getContext("2d"), b = BORDER * per;
    g.imageSmoothingQuality = "high";
    drawFrame(g, c.width, c.height, b);
    g.drawImage(img, b, b, c.width - 2 * b, c.height - 2 * b);
    return c;
  }

  /* fn(p, size) when an image has come in. */
  function onLoad(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (f) { return f !== fn; });
    };
  }

  function loaded() {
    var out = {small: 0, large: 0, failed: 0};
    Object.keys(images).forEach(function (k) {
      var e = images[k];
      if (e.ready) {
        out[e.size] += 1;
      } else if (e.failed) {
        out.failed += 1;
      }
    });
    return out;
  }

  // ------------------------------------------------------------ frame and plaque
  /* The gilded frame, W x H pixels and b wide, with its middle clear. */
  function drawFrame(g, W, H, b) {
    var grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#8a6a2c");
    grad.addColorStop(0.3, "#d8b25a");
    grad.addColorStop(0.55, "#9b7633");
    grad.addColorStop(0.8, "#e0bf6c");
    grad.addColorStop(1, "#7c5d25");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.lineJoin = "miter";
    g.strokeStyle = "rgba(60,40,10,0.85)";
    g.lineWidth = Math.max(1.5, b * 0.12);
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
    g.strokeStyle = "rgba(255,240,190,0.55)";
    g.lineWidth = Math.max(1, b * 0.08);
    g.strokeRect(b * 0.32, b * 0.32, W - b * 0.64, H - b * 0.64);
    g.strokeStyle = "rgba(70,48,14,0.7)";
    g.lineWidth = Math.max(1, b * 0.1);
    g.strokeRect(b * 0.62, b * 0.62, W - b * 1.24, H - b * 1.24);
    // the inner edge, in the shadow of the frame
    var e = Math.max(2, b * 0.06);
    g.fillStyle = "rgba(40,26,8,0.9)";
    g.fillRect(b - e, b - e, W - 2 * b + 2 * e, H - 2 * b + 2 * e);
    g.clearRect(b, b, W - 2 * b, H - 2 * b);
  }

  /* The Like plaque beside every painting: a small plate with a thumb up
   * and "Like"; once liked, green, with "Liked". */
  function plaque(liked) {
    var k = liked ? "on" : "off";
    if (!plaques[k]) {
      var c = document.createElement("canvas");
      c.width = 264;
      c.height = Math.round(264 * PLAQUE_H / PLAQUE_W);
      var g = c.getContext("2d"), W = c.width, H = c.height, r = H * 0.18;
      g.fillStyle = liked ? "#2e9c5a" : "#ece4ce";
      g.strokeStyle = liked ? "#1c6a3b" : "#8f7a52";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(r, 3);
      g.arcTo(W - 3, 3, W - 3, H - 3, r);
      g.arcTo(W - 3, H - 3, 3, H - 3, r);
      g.arcTo(3, H - 3, 3, 3, r);
      g.arcTo(3, 3, W - 3, 3, r);
      g.closePath();
      g.fill();
      g.stroke();
      thumb(g, H * 0.58, H * 0.5, H * 0.56, liked ? "#ffffff" : "#5a4a2c");
      g.fillStyle = liked ? "#ffffff" : "#3b301c";
      g.font = "bold " + Math.round(H * 0.44) + "px ui-sans-serif, system-ui, sans-serif";
      g.textBaseline = "middle";
      g.textAlign = "center";
      g.fillText(liked ? labels.liked : labels.like, (H * 1.05 + W - H * 0.2) / 2, H * 0.53, W - H * 1.3);
      plaques[k] = c;
    }
    return plaques[k];
  }

  /* A thumb up, s high, its middle at (cx, cy). */
  function thumb(g, cx, cy, s, ink) {
    var u = s / 10;
    g.save();
    g.translate(cx - 5 * u, cy - 5 * u);
    g.fillStyle = ink;
    // the cuff
    g.fillRect(0, 4.4 * u, 2.2 * u, 5.4 * u);
    // the hand, its fingers folded, and the thumb up
    g.beginPath();
    g.moveTo(2.9 * u, 4.6 * u);
    g.lineTo(4.6 * u, 0.9 * u);
    g.quadraticCurveTo(5.4 * u, -0.2 * u, 6.1 * u, 0.6 * u);
    g.quadraticCurveTo(6.6 * u, 1.4 * u, 6.0 * u, 3.4 * u);
    g.lineTo(9.0 * u, 3.4 * u);
    g.quadraticCurveTo(10 * u, 3.6 * u, 9.8 * u, 4.6 * u);
    g.lineTo(9.0 * u, 9.0 * u);
    g.quadraticCurveTo(8.8 * u, 9.8 * u, 7.9 * u, 9.8 * u);
    g.lineTo(2.9 * u, 9.8 * u);
    g.closePath();
    g.fill();
    g.restore();
  }

  function setLabels(like, liked) {
    if (like && liked && (like !== labels.like || liked !== labels.liked)) {
      labels = {like: like, liked: liked};
      plaques = {};
      changes += 1;
    }
  }

  // ------------------------------------------------------------ loading
  /* Gets the small pictures of all paintings ready (from js/paintings.js, so
   * also for the game opened from a file); resolves to the number of
   * paintings. Without them, paintings far away are drawn in 1 colour. */
  function load() {
    list = FG.PAINTINGS || [];
    if (!list.length || !FG.PAINTINGS_ATLAS) {
      return Promise.resolve(list.length);
    }
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          var g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          atlas = {data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height};
        } catch (err) {
          atlas = null;
        }
        resolve(list.length);
      };
      img.onerror = function () { resolve(list.length); };
      img.src = FG.PAINTINGS_ATLAS;
    });
  }

  function source() {
    return list.length ? "paintings" : "generated";
  }

  FG.art = {
    load: load, source: source, count: count, info: info, hang: hang, layout: layout, aspect: aspect,
    pixels: pixels, colour: colour, want: want, image: image, onLoad: onLoad, loaded: loaded,
    plaque: plaque, setLabels: setLabels, landscape: landscape,
    atlas: function () { return atlas; },
    changes: function () { return changes; },
    FRAME_RGB: FRAME_RGB, PLAQUE_RGB: PLAQUE_RGB, LIKED_RGB: LIKED_RGB
  };
  list = FG.PAINTINGS || [];
})(typeof window !== "undefined" ? window : globalThis);
