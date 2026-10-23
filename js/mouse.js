/* The player as a little mouse (settings.js: game.player "mouse"), drawn by
 * the game itself: seen from above in the 2D view, with its paw prints; in
 * the 3D view through its eyes, the tips of its whiskers; and with the camera
 * behind it, all of it seen from behind. Its gait comes from the
 * distance walked (js/game.js), so that the feet, the tail, the prints, the
 * bob of the view and the patter of its steps keep time together.
 *
 * st, the state of the mouse: {phase (the gait: 2 pi is 2 steps), move (0
 * standing to 1 at full speed), t (seconds, for the small movements while
 * standing), eat (true while nibbling)}. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var FUR_LIGHT = "#b7aca2", FUR_DARK = "#625850", LINE = "rgba(28,22,18,0.6)";
  var PINK = "#eaa3a8", PINK_DEEP = "#cf838a", TAIL = "#c99c9b", EYE = "#130e0c";
  var LENGTH = 1.6;                  // the body in the 2D view, in tiles (the tail as long again)
  var PRINT_MS = 1600;               // how long a paw print stays on the floor of the 2D view
  var SHOULDERS = 0.3;               // from the middle of the body to the place of the player, in bodies
  var EYE = 0.25;                    // the eyes in the 3D view, as part of the height of a wall (a person: 0.5)

  function ellipse(g, x, y, rx, ry) {
    g.beginPath();
    g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, 2 * Math.PI);
  }

  function clamp(v) {
    return Math.max(0, Math.min(1, v || 0));
  }

  /* The nose twitches in short bursts while the mouse stands. */
  function twitch(t) {
    return Math.sin(t * 1.7) > 0.55 ? Math.sin(t * 38) : 0;
  }

  // ------------------------------------------------------------ 2D
  function tail(g, L, ph, mv, t) {
    var a = Math.sin(ph - 1.1) * 0.16 * mv + Math.sin(t * 1.3) * 0.07 * (1 - mv);
    var b = Math.sin(ph - 2.3) * 0.26 * mv + Math.sin(t * 1.1 + 1) * 0.13 * (1 - mv);
    var x0 = -0.48 * L, cx = -0.95 * L, x1 = -1.42 * L;
    var cy = a * L, y1 = b * L;
    var n = 8;
    g.lineCap = "round";
    g.strokeStyle = TAIL;
    for (var i = 0; i < n; i++) {
      var u0 = i / n, u1 = (i + 1) / n;
      g.lineWidth = Math.max(1, L * (0.055 - 0.04 * u0));
      g.beginPath();
      g.moveTo(qx(x0, cx, x1, u0), qx(0, cy, y1, u0));
      g.lineTo(qx(x0, cx, x1, u1), qx(0, cy, y1, u1));
      g.stroke();
    }
  }

  function qx(a, b, c, u) {
    return (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * c;
  }

  function foot(g, x, y, L, side) {
    g.fillStyle = PINK;
    ellipse(g, x, y, L * 0.06, L * 0.042);
    g.fill();
    // 4 little toes, pointing forward and out
    g.fillStyle = PINK_DEEP;
    for (var k = 0; k < 4; k++) {
      var a = -0.9 + k * 0.6;
      ellipse(g, x + Math.cos(a) * L * 0.06, y + side * Math.sin(a) * L * 0.045 + side * L * 0.012, L * 0.016, L * 0.014);
      g.fill();
    }
  }

  function whiskers2d(g, L, t, mv, side) {
    var shake = (1 - mv) * Math.sin(t * 31 + side) * 0.05;
    var back = mv * 0.3;
    g.strokeStyle = "rgba(248,244,238,0.7)";
    g.lineWidth = Math.max(0.5, L * 0.007);
    [0.25, 0.5, 0.78, 1.05].forEach(function (spread, i) {
      var ang = side * (spread + back * (0.5 + 0.2 * i) - shake);
      var len = L * (0.36 - 0.035 * i);
      var x0 = L * 0.55, y0 = side * L * 0.03;
      var x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 - L * 0.01, (y0 + y1) / 2 + side * L * 0.025, x1, y1);
      g.stroke();
    });
  }

  /* The mouse at (x, y) on the canvas, facing heading (radians, 0 east),
   * its body L pixels long (the tail as long again). (x, y) is at its
   * shoulders, so that its nose stays near the walls it walks up to. */
  function draw2d(g, x, y, heading, L, st) {
    var ph = st.phase || 0, mv = clamp(st.move), t = st.t || 0;
    var s1 = Math.sin(ph);
    g.save();
    g.translate(x, y);
    g.rotate(heading);
    g.translate(-SHOULDERS * L, 0);
    g.fillStyle = "rgba(0,0,0,0.28)";
    ellipse(g, L * 0.03, L * 0.07, L * 0.56, L * 0.3);
    g.fill();
    tail(g, L, ph, mv, t);
    // the feet, in diagonal pairs: front left with back right
    var stride = L * 0.11 * mv;
    foot(g, L * 0.2 + stride * s1, -L * 0.265, L, -1);
    foot(g, L * 0.2 - stride * s1, L * 0.265, L, 1);
    foot(g, -L * 0.27 - stride * s1, -L * 0.29, L, -1);
    foot(g, -L * 0.27 + stride * s1, L * 0.29, L, 1);
    // the body rocks a little from side to side with the steps
    g.translate(0, L * 0.022 * mv * Math.cos(ph));
    // nibbling: the front of the mouse goes a little forward and back
    var nib = st.eat ? Math.max(0, Math.sin(t * 21)) * L * 0.025 : 0;
    // body and head in 1 outline: round rump, shoulders, head, pointed snout
    var fur = g.createLinearGradient(-L * 0.5, 0, L * 0.6, 0);
    fur.addColorStop(0, "#8b8077");
    fur.addColorStop(0.45, "#9d9289");
    fur.addColorStop(1, "#857a72");
    g.fillStyle = fur;
    g.strokeStyle = LINE;
    g.lineWidth = Math.max(1, L * 0.018);
    g.beginPath();
    g.moveTo(L * 0.6 + nib, 0);
    [-1, 1].forEach(function (side) {
      var y = function (v) { return side * v * L; };
      if (side === -1) {
        g.bezierCurveTo(L * 0.55 + nib, y(0.06), L * 0.43 + nib, y(0.16), L * 0.29 + nib, y(0.17));
        g.bezierCurveTo(L * 0.19, y(0.18), L * 0.1, y(0.24), -L * 0.04, y(0.26));
        g.bezierCurveTo(-L * 0.26, y(0.31), -L * 0.5, y(0.22), -L * 0.5, 0);
      } else {
        g.bezierCurveTo(-L * 0.5, y(0.22), -L * 0.26, y(0.31), -L * 0.04, y(0.26));
        g.bezierCurveTo(L * 0.1, y(0.24), L * 0.19, y(0.18), L * 0.29 + nib, y(0.17));
        g.bezierCurveTo(L * 0.43 + nib, y(0.16), L * 0.55 + nib, y(0.06), L * 0.6 + nib, 0);
      }
    });
    g.closePath();
    g.fill();
    g.stroke();
    // the light on its back
    var shine = g.createRadialGradient(-L * 0.12, -L * 0.06, L * 0.02, -L * 0.12, -L * 0.04, L * 0.3);
    shine.addColorStop(0, "rgba(255,250,240,0.28)");
    shine.addColorStop(1, "rgba(255,250,240,0)");
    g.fillStyle = shine;
    ellipse(g, -L * 0.12, -L * 0.04, L * 0.3, L * 0.2);
    g.fill();
    g.translate(nib, 0);
    // the ears, standing out from the sides of the head
    [-1, 1].forEach(function (side) {
      var flick = 1 + (1 - mv) * 0.2 * Math.max(0, Math.sin(t * 2.3 + side * 1.7) - 0.8);
      g.fillStyle = "#7e736b";
      ellipse(g, L * 0.2, side * L * 0.2, L * 0.1 * flick, L * 0.105 * flick);
      g.fill();
      g.strokeStyle = LINE;
      g.lineWidth = Math.max(1, L * 0.016);
      g.stroke();
      g.fillStyle = PINK;
      ellipse(g, L * 0.205, side * L * 0.212, L * 0.064 * flick, L * 0.068 * flick);
      g.fill();
    });
    // the eyes, with a glint
    [-1, 1].forEach(function (side) {
      g.fillStyle = EYE;
      ellipse(g, L * 0.41, side * L * 0.085, L * 0.026, L * 0.021);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.8)";
      ellipse(g, L * 0.417, side * L * 0.081, L * 0.008, L * 0.008);
      g.fill();
    });
    whiskers2d(g, L, t, mv, -1);
    whiskers2d(g, L, t, mv, 1);
    // the nose, twitching while it stands
    g.fillStyle = PINK_DEEP;
    ellipse(g, L * 0.595 + twitch(t) * (1 - mv) * L * 0.012, 0, L * 0.032, L * 0.028);
    g.fill();
    g.restore();
  }

  /* A paw print on the floor, faded by alpha (1 new, 0 gone). */
  function print2d(g, x, y, heading, T, alpha) {
    if (alpha <= 0) {
      return;
    }
    g.save();
    g.translate(x, y);
    g.rotate(heading);
    g.globalAlpha = alpha * 0.7;
    g.fillStyle = "#231b17";
    var s = T * 0.09;
    ellipse(g, 0, 0, s * 1.05, s * 0.8);
    g.fill();
    [-0.75, 0, 0.75].forEach(function (k) {
      ellipse(g, s * 1.25, k * s * 0.95, s * 0.36, s * 0.32);
      g.fill();
    });
    g.restore();
  }

  // ------------------------------------------------------------ 3D
  /* Through the mouse's eyes: the tips of its whiskers, close to the eyes
   * and so out of focus, coming in at the bottom corners of the view. They
   * tremble while it stands and sweep back as it runs. W x H: the canvas in
   * pixels. */
  function overlay3d(g, W, H, st) {
    var ph = st.phase || 0, mv = clamp(st.move), t = st.t || 0;
    g.save();
    g.lineCap = "round";
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < 3; i++) {
        var shake = (1 - mv) * 0.008 * Math.sin(t * (21 + 4 * i) + side * 1.3 + i) + mv * 0.005 * Math.sin(ph * 2 + i);
        // from the snout, below the middle of the bottom edge, out and a
        // little up; swept back (out) while running
        var a = 0.42 + 0.17 * i + mv * 0.12 + shake * 4;
        var len = H * (0.5 - 0.06 * i);
        var x0 = W * 0.5 + side * W * 0.03, y0 = H * 1.12;
        var x1 = x0 + side * Math.cos(a) * len * 1.25, y1 = y0 - Math.sin(a) * len * 0.62 - len * 0.18;
        var cx = (x0 + x1) / 2 + side * len * 0.06, cy = (y0 + y1) / 2 - len * 0.07;
        // out of focus: 3 strokes, wide and faint to thin and clearer
        [[0.026, 0.05], [0.013, 0.09], [0.006, 0.16]].forEach(function (k) {
          var grd = g.createLinearGradient(x0, y0, x1, y1);
          grd.addColorStop(0, "rgba(70,58,50," + (k[1] * 2).toFixed(3) + ")");
          grd.addColorStop(0.5, "rgba(232,226,216," + k[1].toFixed(3) + ")");
          grd.addColorStop(1, "rgba(232,226,216,0)");
          g.strokeStyle = grd;
          g.lineWidth = Math.max(1, H * k[0] * (1 - 0.2 * i));
          g.beginPath();
          g.moveTo(x0, y0);
          g.quadraticCurveTo(cx, cy, x1, y1);
          g.stroke();
        });
      }
    });
    g.restore();
  }

  // ------------------------------------------------------------ 3D, behind
  // The camera of "Behind the mouse": BACK tiles behind it, CAM_EYE (part of
  // the height of a wall) above the floor, looking down a little (the
  // horizon at HORIZON of the screen from the top). Closer when a wall is
  // behind the mouse or beside the camera, never nearer a wall than CLEAR
  // behind it or SIDE beside it. Closer than LOW, the camera goes down to
  // just over the mouse's head (NEAR_EYE) and the parts of the mouse nearest
  // to it fade out, so that a mouse with its back to a wall never fills the
  // view: the view is then over its head, with its ears at the bottom.
  var BACK = 1.6, CAM_EYE = 0.55, HORIZON = 0.47, CLEAR = 0.15, SIDE = 0.24, LOW = 0.8, NEAR_EYE = 0.36;

  /* How far behind the mouse at (x, y), facing angle, the camera can be:
   * BACK (or most, for another character), or less where a wall comes first
   * or would be closer than SIDE to the camera (a door frame right beside it
   * fills the view). M: the tiles (js/world.js). */
  function cameraBack(M, x, y, angle, most) {
    var far = most || BACK;
    var dx = -Math.cos(angle), dy = -Math.sin(angle);
    var last = 0;
    for (var d = 0.02; d <= far; d += 0.02) {
      if (!open(M, x + dx * d, y + dy * d, d < CLEAR ? 0 : SIDE)) {
        return Math.max(0, Math.min(far, last - CLEAR));
      }
      last = d;
    }
    // room for the camera to stand, a little past it
    return open(M, x + dx * (far + CLEAR), y + dy * (far + CLEAR), 0) ? far : far - CLEAR;
  }

  function wallAt(M, tx, ty) {
    return tx < 0 || ty < 0 || tx >= M.W || ty >= M.H || M.kind[ty * M.W + tx] === FG.world.WALL;
  }

  /* No wall at (x, y), and none nearer than side to it. */
  function open(M, x, y, side) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (wallAt(M, tx, ty)) {
      return false;
    }
    if (!side) {
      return true;
    }
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        if ((i || j) && wallAt(M, tx + i, ty + j)) {
          var ex = i < 0 ? x - tx : i > 0 ? tx + 1 - x : 0;
          var ey = j < 0 ? y - ty : j > 0 ? ty + 1 - y : 0;
          if (Math.hypot(ex, ey) < side) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /* The camera at distance back behind the mouse: {x, y, eye, horizon,
   * back}. prof: the heights of the camera behind another character (js/
   * characters.js: {eye, near, horizon}), as CAM_EYE, NEAR_EYE, HORIZON. */
  function camera(x, y, angle, back, prof) {
    var u = Math.max(0, Math.min(1, back / (prof ? prof.back * LOW / BACK : LOW)));
    var high = prof ? prof.eye : CAM_EYE, low = prof ? prof.near : NEAR_EYE, hz = prof ? prof.horizon : HORIZON;
    return {x: x - Math.cos(angle) * back, y: y - Math.sin(angle) * back, back: back,
      eye: low + (high - low) * u, horizon: 0.5 + (hz - 0.5) * u};
  }

  /* How much of a part of the mouse d tiles from the camera shows: parts
   * very near the camera fade out. */
  function nearFade(d) {
    return Math.max(0, Math.min(1, (d - 0.22) / 0.28));
  }

  var BEHIND_FUR = ["#a89c92", "#8a7e75", "#5e544d"];

  /* An ellipse with fur shading: lighter on top, darker below. */
  function furBall(g, x, y, rx, ry, tone) {
    if (rx < 0.5 || ry < 0.5) {
      return;
    }
    var grd = g.createRadialGradient(x - rx * 0.2, y - ry * 0.45, Math.min(rx, ry) * 0.1, x, y, Math.max(rx, ry) * 1.05);
    grd.addColorStop(0, tone[0]);
    grd.addColorStop(0.55, tone[1]);
    grd.addColorStop(1, tone[2]);
    g.fillStyle = grd;
    ellipse(g, x, y, rx, ry);
    g.fill();
  }

  /* The mouse seen from behind and a little above, as the camera of
   * cameraBack and camera sees it. P(f, s, u) gives the canvas place {x, y}
   * and the pixels per tile k of a point f tiles ahead of the middle of the
   * mouse, s to its right and u above the floor; st as for draw2d, with turn
   * (radians a second, + to the right) and alpha (1: all of it). */
  function drawBehind(g, P, st) {
    var ph = st.phase || 0, mv = clamp(st.move), t = st.t || 0;
    var s1 = Math.sin(ph), c1 = Math.cos(ph);
    var yaw = Math.max(-0.45, Math.min(0.45, (st.turn || 0) * 0.16));
    var breathe = 1 + (1 - mv) * 0.018 * Math.sin(t * 4.6);
    var bob = mv * 0.012 * Math.abs(c1), roll = mv * 0.012 * s1;
    var nib = st.eat ? Math.max(0, Math.sin(t * 21)) : 0;
    // the head looks about now and then while the mouse stands
    var look = (1 - mv) * 0.05 * Math.sin(t * 0.9) * (Math.sin(t * 0.37) > 0.2 ? 1 : 0);
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    function at(f, s, u) {
      // turned by yaw about the middle of the mouse
      return P(f * cy - s * sy, f * sy + s * cy + roll * u * 4, u);
    }
    var A = st.alpha === undefined ? 1 : st.alpha;
    function fade(p) {
      g.globalAlpha = A * nearFade(p.d);
      return p.k > 0 && g.globalAlpha > 0.01;
    }
    g.save();
    g.lineCap = "round";
    // the shadow
    var c = at(0, 0, 0), fr = at(0.42, 0, 0), bk = at(-0.42, 0, 0);
    fade(c);
    g.fillStyle = "rgba(0,0,0,0.3)";
    ellipse(g, c.x, (fr.y + bk.y) / 2, 0.24 * c.k, Math.abs(bk.y - fr.y) / 2);
    g.fill();
    // the front feet, mostly under the body
    [-1, 1].forEach(function (side) {
      var p = at(0.22 + side * 0.05 * s1 * mv, side * 0.1, 0.012);
      if (!fade(p)) {
        return;
      }
      g.fillStyle = PINK;
      ellipse(g, p.x, p.y, 0.035 * p.k, 0.02 * p.k);
      g.fill();
    });
    // the head, a little further than the body, and its ears
    var hd = at(0.34 + nib * 0.02, look, 0.12 + bob - nib * 0.03);
    if (fade(hd)) {
      furBall(g, hd.x, hd.y, 0.11 * hd.k, 0.095 * hd.k, BEHIND_FUR);
    }
    // the ears, seen from the back: fur, with a thin pink rim on the outside
    [-1, 1].forEach(function (side) {
      var flick = 1 + (1 - mv) * 0.25 * Math.max(0, Math.sin(t * 2.3 + side * 1.7) - 0.8);
      var e = at(0.31 + nib * 0.02, look + side * 0.105, 0.2 + bob - nib * 0.03 - mv * 0.012);
      if (!fade(e)) {
        return;
      }
      var r = 0.05 * e.k * flick;
      g.fillStyle = PINK;
      ellipse(g, e.x + side * r * 0.12, e.y, r * 1.02, r * 1.08);
      g.fill();
      furBall(g, e.x - side * r * 0.08, e.y + r * 0.04, r * 0.94, r * 1.02, ["#a2968c", "#867a71", "#665c55"]);
    });
    // whiskers out past the sides of the head
    [-1, 1].forEach(function (side) {
      var w0 = at(0.42, look + side * 0.06, 0.1 + bob);
      if (!fade(w0)) {
        return;
      }
      g.strokeStyle = "rgba(240,234,226,0.55)";
      g.lineWidth = Math.max(0.6, w0.k * 0.004);
      for (var i = 0; i < 3; i++) {
        var shake = (1 - mv) * 0.012 * Math.sin(t * 29 + i + side);
        var w1 = at(0.36 + 0.03 * i, look + side * (0.26 - 0.02 * i), 0.13 - 0.03 * i + shake + bob);
        g.beginPath();
        g.moveTo(w0.x, w0.y);
        g.quadraticCurveTo((w0.x + w1.x) / 2, Math.min(w0.y, w1.y) - w0.k * 0.01, w1.x, w1.y);
        g.stroke();
      }
    });
    // the body and the round rump, nearest the camera
    var bd = at(0.05, 0, 0.115 + bob);
    if (fade(bd)) {
      furBall(g, bd.x, bd.y, 0.14 * bd.k * breathe, 0.105 * bd.k * breathe, BEHIND_FUR);
    }
    // the back feet, taking turns as it runs
    [-1, 1].forEach(function (side) {
      var p = at(-0.2 - side * 0.06 * s1 * mv, side * 0.13, 0.015 + mv * 0.02 * Math.max(0, side * s1));
      if (!fade(p)) {
        return;
      }
      g.fillStyle = PINK;
      ellipse(g, p.x, p.y, 0.045 * p.k, 0.03 * p.k);
      g.fill();
      g.fillStyle = PINK_DEEP;
      for (var k = -1; k <= 1; k++) {
        ellipse(g, p.x + k * 0.016 * p.k, p.y + 0.02 * p.k, 0.009 * p.k, 0.008 * p.k);
        g.fill();
      }
    });
    var rp = at(-0.15, 0, 0.11 + bob);
    if (fade(rp)) {
      furBall(g, rp.x, rp.y, 0.16 * rp.k * breathe, 0.12 * rp.k * breathe, BEHIND_FUR);
    }
    // the light along its back
    var sh = at(-0.05, -0.03, 0.2 + bob);
    fade(sh);
    var shine = g.createRadialGradient(sh.x, sh.y, 1, sh.x, sh.y, 0.12 * sh.k);
    shine.addColorStop(0, "rgba(255,250,240,0.32)");
    shine.addColorStop(1, "rgba(255,250,240,0)");
    g.fillStyle = shine;
    ellipse(g, sh.x, sh.y, 0.14 * sh.k, 0.07 * sh.k);
    g.fill();
    // the tail, from under the rump along the floor towards the camera
    var swing = Math.sin(ph - 1.2) * 0.07 * mv + Math.sin(t * 1.2) * 0.05 * (1 - mv);
    var n = 10, prev = null;
    g.strokeStyle = TAIL;
    for (var i = 0; i <= n; i++) {
      var u = i / n;
      var q = at(-0.27 - 0.5 * u, swing * u * u * 3 + Math.sin(u * 3 + t * 1.5) * 0.015, 0.05 * (1 - u) + 0.006);
      if (!fade(q)) {
        break;
      }
      if (prev) {
        g.lineWidth = Math.max(1, q.k * (0.028 - 0.018 * u));
        g.beginPath();
        g.moveTo(prev.x, prev.y);
        g.lineTo(q.x, q.y);
        g.stroke();
      }
      prev = q;
    }
    g.restore();
  }

  FG.mouse = {LENGTH: LENGTH, PRINT_MS: PRINT_MS, EYE: EYE, BACK: BACK,
    cameraBack: cameraBack, camera: camera, drawBehind: drawBehind, draw2d: draw2d, print2d: print2d, overlay3d: overlay3d};
})(typeof window !== "undefined" ? window : globalThis);
