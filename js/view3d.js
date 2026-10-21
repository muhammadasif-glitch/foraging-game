/* The 3D view: the maze seen from inside, drawn by ray casting on a canvas
 * (no library, so the game also works offline and from a file).
 *
 * Walls are plaster in the colour of the room they face, with a framed
 * painting on each side of the room and its Like plaque beside the frame
 * (js/art.js; the game hangs them, scene.gallery); corridors are grey. Rooms
 * the player does not know yet, and their walls, are dark; rooms come into
 * light as the player learns of them (scene.light, 0 to 1 per tile). The
 * food of the room the player is in stands in its middle (js/food.js); a
 * food room the player knows but is not in shows a sign with its food and
 * worth; the music room has its gramophone (scene.extras).
 *
 * Sharpness. The ray casting draws into a picture of its own, LEVELS of the
 * screen's pixels: as sharp as the computer can draw it quickly. It starts
 * at the sharpest level of at most START_PIXELS pixels, goes down a level
 * when drawing takes longer than SLOW_MS and up again when the level above
 * would take less than BUDGET_MS (the ray casting takes longer the more
 * pixels it has; what is drawn over it does not); a level it had to leave
 * is not tried again for BLOCK_UP_MS. Every change is kept (changes). On top
 * of that picture, at the screen's own pixels: the paintings near enough
 * to be at least NEAR_PX pixels high, from their own images (sharp also
 * when the level is low), the food, signs and gramophone, and the mouse.
 *
 * Looking. Every drawing notes which painting is in the middle of the view
 * (look: its place, how far the player is from it and how much of the
 * screen it covers) and how much of each painting is seen (seen). */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var Wd = FG.world, F = FG.food, A = FG.art;

  var SKY_TOP = [92, 146, 205], SKY_LOW = [196, 210, 224];
  var FOG = [196, 210, 224];
  var FOG_FAR = 15;
  var DARK_WALL = [38, 44, 54], DARK_FLOOR = [24, 28, 35];
  var CORRIDOR_WALL = [150, 152, 158];
  var FOOD_SIZE = {cheese: 0.5, bread: 0.4};
  // with the camera behind the mouse, food this much nearer than the mouse
  // is drawn over it; at the same place the mouse is in front, at the food
  var MOUSE_AHEAD = 0.3;
  // the sharpness levels: parts of the screen's pixels across
  var LEVELS = [1, 0.84, 0.71, 0.59, 0.45, 0.32];
  var START_PIXELS = 520000, MAX_WIDTH = 2400, MIN_WIDTH = 200;
  var SLOW_MS = 13, BUDGET_MS = 10.5, DOWN_AFTER_MS = 700, UP_AFTER_MS = 3000, BLOCK_UP_MS = 30000;
  var NEAR_PX = 90;
  // a painting in the middle of the view is looked at up to LOOK_FAR tiles away
  var LOOK_FAR = 6;
  var SHADOW = 0.025;
  var LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  var RS = LITTLE ? 0 : 24, GS = LITTLE ? 8 : 16, BS = LITTLE ? 16 : 8, AL = LITTLE ? 0xff000000 : 0xff;

  function now() {
    return FG.recorder ? FG.recorder.now() : null;
  }

  function View(canvas) {
    this.canvas = canvas;
    this.buf = document.createElement("canvas");
    this.temp = document.createElement("canvas");
    this.tex = Wd.textures();
    this.places = null;
    this.placesOf = null;
    this.level = -1;
    this.cost = null;             // ms a drawing takes: the ray casting (buf) and the rest (over)
    this.costBuf = null;
    this.costOver = null;
    this.samples = 0;
    this.changedAt = 0;
    this.blockUp = null;
    this.changes = [];
    this.costs = [];
    this.look = null;
    this.seen = {};
    this.near = [];
    this.hits = [];
    this.rw = 0;
    this.rh = 0;
  }

  View.prototype.resize = function (w, h) {
    var dpr = root.devicePixelRatio || 1;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvas.style.left = "0px";
    this.canvas.style.top = "0px";
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.W = this.canvas.width;
    this.H = this.canvas.height;
    this.dpr = dpr;
    var k = this.level;
    if (k < 0) {
      k = LEVELS.length - 1;
      for (var i = 0; i < LEVELS.length; i++) {
        if (this.W * this.H * LEVELS[i] * LEVELS[i] <= START_PIXELS) {
          k = i;
          break;
        }
      }
    }
    this.setLevel(k, this.level < 0 ? "start" : "window size");
  };

  /* The ray casting's own picture at sharpness level k. */
  View.prototype.setLevel = function (k, why) {
    this.level = k;
    var s = LEVELS[k];
    var rw = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(this.W * s)));
    var rh = Math.max(120, Math.round(rw * this.H / this.W));
    if (rw !== this.rw || rh !== this.rh) {
      this.rw = rw;
      this.rh = rh;
      this.buf.width = rw;
      this.buf.height = rh;
      this.image = this.buf.getContext("2d").createImageData(rw, rh);
      this.p32 = new Uint32Array(this.image.data.buffer);
      this.zbuf = new Float32Array(rw);
      this.colPlace = new Int32Array(rw);
    }
    this.samples = 0;
    this.changedAt = performance.now();
    this.changes.push({t: now(), level: k, scale: s, width: rw, height: rh, why: why,
      draw_ms: this.cost === null ? null : Math.round(this.cost * 100) / 100});
    this.drawn = false;
  };

  /* After each drawing: how long its ray casting (buf) and the rest (over)
   * took (ms), and a level down or up. */
  View.prototype.adapt = function (buf, over) {
    var t = performance.now();
    this.costs.push(buf + over);
    if (this.costs.length > 4000) {
      this.costs.splice(0, 2000);
    }
    this.samples += 1;
    if (this.samples <= 3) {
      return;                              // the first drawings after a change set things up
    }
    this.costBuf = this.costBuf === null ? buf : this.costBuf * 0.85 + buf * 0.15;
    this.costOver = this.costOver === null ? over : this.costOver * 0.85 + over * 0.15;
    this.cost = this.costBuf + this.costOver;
    if (this.samples < 8) {
      return;
    }
    var k = this.level, ratio;
    if (this.cost > SLOW_MS && k < LEVELS.length - 1 && t - this.changedAt > DOWN_AFTER_MS) {
      this.blockUp = {level: k, until: t + BLOCK_UP_MS};
      ratio = LEVELS[k + 1] / LEVELS[k];
      this.costBuf *= ratio * ratio;
      this.setLevel(k + 1, "slow");
    } else if (k > 0 && t - this.changedAt > UP_AFTER_MS &&
        !(this.blockUp && this.blockUp.level === k - 1 && t < this.blockUp.until)) {
      ratio = LEVELS[k - 1] / LEVELS[k];
      if (this.costBuf * ratio * ratio + this.costOver < BUDGET_MS) {
        this.costBuf *= ratio * ratio;
        this.setLevel(k - 1, "fast");
      }
    }
  };

  /* What the game keeps of the sharpness: the levels, every change since
   * change number from, and the drawing times. */
  View.prototype.renderInfo = function (from) {
    var c = this.costs.slice().sort(function (a, b) { return a - b; });
    var q = function (f) { return c.length ? Math.round(c[Math.floor(f * (c.length - 1))] * 100) / 100 : null; };
    return {renderer: "canvas", gpu: null, webgl: this.webgl || null, levels: LEVELS.slice(),
      screen: {width: this.W, height: this.H, pixel_ratio: this.dpr},
      at_start: this.atMark || null, level: this.level, width: this.rw, height: this.rh,
      changes: this.changes.slice(from || 0),
      draw_ms: {median: q(0.5), p90: q(0.9), drawings: c.length,
        ray_casting: this.costBuf === null ? null : Math.round(this.costBuf * 100) / 100,
        over: this.costOver === null ? null : Math.round(this.costOver * 100) / 100},
      frame_ms: null};
  };

  /* From now on (a game starts): returns the mark for renderInfo. */
  View.prototype.mark = function () {
    this.costs = [];
    this.atMark = {level: this.level, width: this.rw, height: this.rh};
    return this.changes.length;
  };

  /* How much of a colour at distance d is left in the fog (0 to 1). */
  function fog(d) {
    var f = Math.max(0, Math.min(1, 1 - d / FOG_FAR));
    return f * f * (3 - 2 * f);
  }

  function lightOf(scene, at) {
    return scene.light ? scene.light[at] : (scene.lit[at] ? 1 : 0);
  }

  /* The sprites of a scene: the food of the room the player is in, crumbs,
   * signs on the other food rooms it knows, and the extras (the gramophone
   * and its notes). */
  View.prototype.sprites = function (scene) {
    var out = [], M = scene.maze;
    (scene.food || []).forEach(function (f) {
      var c = Wd.centre(M, f.room);
      if (scene.here && Wd.key(scene.here.room) === Wd.key(f.room)) {
        out.push({x: c[0], y: c[1], pic: F.sideView(f.kind, scene.here.level), size: FOOD_SIZE[f.kind] || 0.45,
          fade: scene.here.fade === undefined ? 1 : scene.here.fade});
      } else {
        var at = Math.floor(c[1]) * M.W + Math.floor(c[0]);
        if (lightOf(scene, at) > 0.5) {
          out.push({x: c[0], y: c[1], pic: F.sign(f.kind, f.worth), size: 0.18, lift: 0.62});
        }
      }
    });
    (scene.crumbs || []).forEach(function (cr) {
      out.push({x: cr.x, y: cr.y, pic: F.crumb(cr.kind, cr.n), size: 0.022, lift: cr.z});
    });
    (scene.extras || []).forEach(function (e) {
      var at = Math.floor(e.y) * M.W + Math.floor(e.x);
      var L = lightOf(scene, at);
      if (L > 0.05) {
        out.push({x: e.x, y: e.y, pic: e.pic, size: e.size, lift: e.lift || 0,
          fade: (e.fade === undefined ? 1 : e.fade) * Math.min(1, L * 1.5), hit: e.hit || null});
      }
    });
    return out;
  };

  /* The floor colour of every room of a maze, kept with the maze. */
  View.prototype.floorColours = function (M) {
    if (!M.floorColours) {
      var fc = new Float32Array(M.list.length * 3);
      M.list.forEach(function (r, i) {
        fc[i * 3] = r.rgb[0] * 0.42 + 40; fc[i * 3 + 1] = r.rgb[1] * 0.42 + 40; fc[i * 3 + 2] = r.rgb[2] * 0.42 + 40;
      });
      M.floorColours = fc;
    }
    return M.floorColours;
  };

  View.prototype.ensurePlaces = function (M) {
    if (this.placesOf !== M) {
      this.places = Wd.paintingPlaces(M);
      this.placesOf = M;
    }
    return this.places;
  };

  /* scene: {maze, x, y, angle (0 east, pi/2 south), lit or light, food,
   * here, crumbs, extras, bob, sway (tiles to the right), eye (the height of
   * the eyes, as part of the height of a wall; 0.5 if not given), horizon
   * (where the eyes look, as part of the screen from the top; 0.5); gallery
   * {pics: the picture of each place (js/art.js), liked: 1 for each place
   * liked, likes: whether plaques hang}; with the mouse: mouse (js/mouse.js),
   * and for the camera behind it camera "behind" and cam {x, y, eye,
   * horizon, back} (FG.mouse.camera). again: only the mouse is drawn anew,
   * over the picture drawn last. */
  View.prototype.draw = function (scene, again) {
    if (again) {
      if (scene.mouse && FG.mouse && this.drawn) {
        this.show(scene);
      }
      return;
    }
    var t0 = performance.now();
    var M = scene.maze, w = this.rw, h = this.rh;
    var p32 = this.p32, z = this.zbuf, T = this.tex, colPlace = this.colPlace;
    var places = this.ensurePlaces(M);
    var gal = scene.gallery || null, likes = !!(gal && gal.likes);
    var dirX = Math.cos(scene.angle), dirY = Math.sin(scene.angle);
    var fov = Math.tan(33 * Math.PI / 180) * (w / h) / (4 / 3);
    var planeX = -dirY * fov, planeY = dirX * fov;
    var sway = scene.sway || 0, eye = scene.eye || 0.5;
    // through the eyes, stepped back to see a near painting whole (scene.back)
    var stepBack = scene.back || 0;
    var px = scene.x - dirY * sway - dirX * stepBack, py = scene.y + dirX * sway - dirY * stepBack;
    var half = h * ((scene.horizon || 0.5) + (scene.tilt || 0)) + (scene.bob || 0) * h;
    var cam = scene.camera === "behind" ? scene.cam : null;
    if (cam) {
      px = cam.x;
      py = cam.y;
      eye = cam.eye;
      half = h * (cam.horizon + (scene.tilt || 0));
    }
    this.front = [];
    var x, y, o, L, f, f0, f1, f2, r, gg, bb;
    var light = scene.light, lit = scene.lit;
    var fc = this.floorColours(M);

    // the sky: 1 colour a row
    for (y = 0; y < Math.min(h, Math.ceil(half)); y++) {
      var ts = Math.pow(Math.max(0, y / half), 1.6);
      r = SKY_TOP[0] + (SKY_LOW[0] - SKY_TOP[0]) * ts;
      gg = SKY_TOP[1] + (SKY_LOW[1] - SKY_TOP[1]) * ts;
      bb = SKY_TOP[2] + (SKY_LOW[2] - SKY_TOP[2]) * ts;
      p32.fill((r << RS) | (gg << GS) | (bb << BS) | AL, y * w, y * w + w);
    }

    // the floor: 1 distance, so 1 fog, for each row of the screen
    var rx0 = dirX - planeX, ry0 = dirY - planeY, rx1 = dirX + planeX, ry1 = dirY + planeY;
    var FL = T.floor, kind = M.kind, roomAt = M.roomAt, MW = M.W, MH = M.H, WALL = Wd.WALL, FLOOR = Wd.FLOOR;
    for (y = Math.max(0, Math.ceil(half)); y < h; y++) {
      var dist = (eye * h) / (y - half + 0.5);
      f = fog(dist);
      f0 = FOG[0] * (1 - f); f1 = FOG[1] * (1 - f); f2 = FOG[2] * (1 - f);
      var sx = dist * (rx1 - rx0) / w, sy = dist * (ry1 - ry0) / w;
      var fx = px + dist * rx0, fy = py + dist * ry0;
      for (x = 0, o = y * w; x < w; x++, fx += sx, fy += sy, o++) {
        var cx = Math.floor(fx), cy = Math.floor(fy);
        var tx = FL[(((fy - cy) * 64) & 63) * 64 + (((fx - cx) * 64) & 63)] * f;
        r = DARK_FLOOR[0]; gg = DARK_FLOOR[1]; bb = DARK_FLOOR[2];
        if (cx >= 0 && cy >= 0 && cx < MW && cy < MH) {
          var at = cy * MW + cx, kd = kind[at];
          L = kd === WALL ? 0 : (light ? light[at] : (lit[at] ? 1 : 0));
          if (L > 0) {
            var ri = kd === FLOOR ? roomAt[at] * 3 : -1;
            var lr = ri >= 0 ? fc[ri] : 118, lg = ri >= 0 ? fc[ri + 1] : 120, lb = ri >= 0 ? fc[ri + 2] : 126;
            r += (lr - r) * L; gg += (lg - gg) * L; bb += (lb - bb) * L;
          }
        }
        p32[o] = ((f0 + r * tx) << RS) | ((f1 + gg * tx) << GS) | ((f2 + bb * tx) << BS) | AL;
      }
    }

    // the paintings near enough to be drawn sharp from their own images,
    // over this picture (paintings): here only the wall behind them
    var near = this.nearPaintings(scene, places, gal, px, py, dirX, dirY);
    var sharp = {};
    near.forEach(function (n) { sharp[n.k] = true; });

    // the walls: 1 distance, so 1 fog, for each column
    var PL = T.plaster;
    var b0, b1, b2;
    var seenCols = {};
    var mid = w >> 1, look = null;
    var FR = A.FRAME_RGB, PQ = A.PLAQUE_RGB, LK = A.LIKED_RGB;
    for (x = 0; x < w; x++) {
      var camX = 2 * x / w - 1;
      var rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      var mx = Math.floor(px), my = Math.floor(py);
      var ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      var stepX = rdx < 0 ? -1 : 1, stepY = rdy < 0 ? -1 : 1;
      var sdx = rdx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx;
      var sdy = rdy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy;
      var side = 0, guard = 0;
      while (guard++ < 400) {
        if (sdx < sdy) {
          sdx += ddx; mx += stepX; side = 0;
        } else {
          sdy += ddy; my += stepY; side = 1;
        }
        if (mx < 0 || my < 0 || mx >= MW || my >= MH || kind[my * MW + mx] === WALL) {
          break;
        }
      }
      var perp = Math.max(side === 0 ? sdx - ddx : sdy - ddy, 0.0001);
      z[x] = perp;
      colPlace[x] = -1;
      // the wall takes the colour of the tile in front of it
      var fx2 = side === 0 ? mx - stepX : mx, fy2 = side === 1 ? my - stepY : my;
      var front = fy2 * MW + fx2, inside = fx2 >= 0 && fy2 >= 0 && fx2 < MW && fy2 < MH;
      L = inside ? (light ? light[front] : (lit[front] ? 1 : 0)) : 0;
      var k = -1;
      b0 = DARK_WALL[0]; b1 = DARK_WALL[1]; b2 = DARK_WALL[2];
      if (L > 0) {
        var l0, l1, l2;
        if (roomAt[front] >= 0) {
          var rc = M.list[roomAt[front]].rgb;
          l0 = rc[0] * 0.62 + 78; l1 = rc[1] * 0.62 + 78; l2 = rc[2] * 0.62 + 78;
          var face = side === 0 ? (stepX > 0 ? 0 : 2) : (stepY > 0 ? 1 : 3);
          k = places.at[front * 4 + face];
        } else {
          l0 = CORRIDOR_WALL[0]; l1 = CORRIDOR_WALL[1]; l2 = CORRIDOR_WALL[2];
        }
        b0 += (l0 - b0) * L; b1 += (l1 - b1) * L; b2 += (l2 - b2) * L;
      }
      f = fog(perp);
      f0 = FOG[0] * (1 - f); f1 = FOG[1] * (1 - f); f2 = FOG[2] * (1 - f);
      var shade = (side === 1 ? 0.8 : 1) * f;
      var along = side === 0 ? py + perp * rdy : px + perp * rdx;
      var u = ((along - Math.floor(along)) * 64) & 63;
      var lineH = h / perp;
      var wallTop = half - (1 - eye) * lineH;
      var top = Math.max(0, Math.floor(wallTop)), bot = Math.min(h, Math.ceil(half + eye * lineH));
      // the painting, its frame and its plaque on this column
      var inFrame = false, inPic = false, inPlaque = false, liked = false, drawFrame = false, drawPlaque = false;
      var yf0 = 0, yf1 = 0, yp0 = 0, yp1 = 0, yq0 = 0, yq1 = 0, ys1 = 0;
      var pix = null, pcol = 0, prow = 0, ph = 1, pc = null;
      if (k >= 0) {
        var place = places.list[k];
        var pic = gal ? gal.pics[k] : -1 - (place.colour % 48);
        var su = (along - place.start) / 2;
        if (place.flip) {
          su = 1 - su;
        }
        var ax = su * 2, D = A.layout(pic);
        colPlace[x] = k;
        inFrame = ax >= D.fx0 && ax < D.fx1;
        inPlaque = likes && ax >= D.qx0 && ax < D.qx1;
        drawFrame = inFrame && !sharp[k];
        drawPlaque = inPlaque && !sharp[k];
        if (inFrame) {
          yf0 = wallTop + D.fv0 * lineH; yf1 = wallTop + D.fv1 * lineH; ys1 = yf1 + SHADOW * lineH;
          inPic = ax >= D.px0 && ax < D.px1;
          if (inPic) {
            yp0 = wallTop + D.pv0 * lineH; yp1 = wallTop + D.pv1 * lineH;
            if (drawFrame) {
              pix = A.pixels(pic);
              if (pix) {
                pcol = pix.x0 + Math.min(pix.w - 1, Math.floor((ax - D.px0) / (D.px1 - D.px0) * pix.w));
                prow = pix.y0;
                ph = pix.h;
              } else {
                pc = A.colour(pic);
              }
            }
            if (bot > yp0 && top < yp1) {
              seenCols[k] = (seenCols[k] || 0) + 1;
            }
          }
        }
        if (drawPlaque) {
          yq0 = wallTop + D.qv0 * lineH; yq1 = wallTop + D.qv1 * lineH;
          liked = !!(gal.liked && gal.liked[k]);
        }
        if (x === mid && inFrame) {
          var hx = px + perp * rdx, hy = py + perp * rdy;
          var d = Math.hypot(hx - scene.x, hy - scene.y);
          if (d <= LOOK_FAR) {
            look = {place: k, d: d};
          }
        }
      }
      var ps = shade * (0.85 + 0.15 * L);
      var dk0 = DARK_WALL[0], dk1 = DARK_WALL[1], dk2 = DARK_WALL[2];
      for (y = top, o = top * w + x; y < bot; y++, o += w) {
        var c0, c1, c2;
        if (drawFrame && y >= yf0 && y < yf1) {
          if (inPic && y >= yp0 && y < yp1) {
            if (pix) {
              var q = ((prow + Math.min(ph - 1, Math.floor((y - yp0) / (yp1 - yp0) * ph))) * pix.stride + pcol) * 4;
              c0 = pix.data[q]; c1 = pix.data[q + 1]; c2 = pix.data[q + 2];
            } else {
              c0 = pc[0]; c1 = pc[1]; c2 = pc[2];
            }
          } else {
            // the gilded frame, lighter at the top
            var gl = 1.1 - 0.25 * (y - yf0) / (yf1 - yf0);
            c0 = FR[0] * gl; c1 = FR[1] * gl; c2 = FR[2] * gl;
          }
          p32[o] = ((f0 + (dk0 + (c0 - dk0) * L) * ps) << RS) | ((f1 + (dk1 + (c1 - dk1) * L) * ps) << GS) |
            ((f2 + (dk2 + (c2 - dk2) * L) * ps) << BS) | AL;
        } else if (drawPlaque && y >= yq0 && y < yq1) {
          var pq = liked ? LK : PQ;
          p32[o] = ((f0 + (dk0 + (pq[0] - dk0) * L) * ps) << RS) | ((f1 + (dk1 + (pq[1] - dk1) * L) * ps) << GS) |
            ((f2 + (dk2 + (pq[2] - dk2) * L) * ps) << BS) | AL;
        } else {
          var v = (y - wallTop) / lineH;
          var sh = shade * PL[((v * 64) & 63) * 64 + u] * (0.92 + 0.08 * (1 - v));
          if (inFrame && y >= yf1 && y < ys1) {
            sh *= 0.82;                        // the painting's shadow on the wall
          }
          p32[o] = ((f0 + b0 * sh) << RS) | ((f1 + b1 * sh) << GS) | ((f2 + b2 * sh) << BS) | AL;
        }
      }
    }

    // looking: the painting in the middle of the view, and all those seen
    this.seen = {};
    var seen = this.seen;
    Object.keys(seenCols).forEach(function (k) { seen[k] = seenCols[k] / w; });
    if (look) {
      look.share = seen[look.place] || 0;
    }
    this.look = look;
    this.near = near;

    var invDet = 1 / (planeX * dirY - dirX * planeY);
    var list = this.sprites(scene).map(function (sp) {
      var dx = sp.x - px, dy = sp.y - py;
      return {sp: sp, tx: invDet * (dirY * dx - dirX * dy), ty: invDet * (-planeY * dx + planeX * dy)};
    }).filter(function (e) { return e.ty > 0.15; });
    list.sort(function (a, b) { return b.ty - a.ty; });
    var back = [], frontList = this.front;
    list.forEach(function (e) {
      var pic = e.sp.pic, ty = e.ty, fade = e.sp.fade === undefined ? 1 : e.sp.fade;
      if (fade <= 0) {
        return;
      }
      var screenX = (w / 2) * (1 + e.tx / ty);
      var hgt = Math.abs(h / ty) * e.sp.size;
      var wid = hgt * pic.w / pic.h;
      var bottom = half + (eye * h) / ty - (e.sp.lift || 0) * h / ty;
      var item = {pic: pic, x: screenX - wid / 2, y: bottom - hgt, w: wid, h: hgt, ty: ty, fade: fade, hit: e.sp.hit};
      if (cam && ty < cam.back - MOUSE_AHEAD) {
        frontList.push(item);              // between the camera and the mouse: drawn over the mouse (show)
      } else {
        back.push(item);
      }
    });
    this.back = back;
    this.camera = {px: px, py: py, dirX: dirX, dirY: dirY, planeX: planeX, planeY: planeY, eye: eye, half: half,
      light: scene.light, lit: scene.lit, gallery: gal, places: places};
    this.buf.getContext("2d").putImageData(this.image, 0, 0);
    this.drawn = true;
    var t1 = performance.now();
    this.show(scene);
    this.adapt(t1 - t0, performance.now() - t1);
  };

  /* The paintings to draw sharp: lit, in front of the camera, their
   * picture at least NEAR_PX pixels high on the screen (at its middle), and
   * an image of them ready. [{k: place, pic, px: how high}] */
  View.prototype.nearPaintings = function (scene, places, gal, px, py, dirX, dirY) {
    var out = [], H = this.H;
    var light = scene.light, lit = scene.lit;
    for (var k = 0; k < places.list.length; k++) {
      var place = places.list[k];
      var L = light ? light[place.front] : (lit[place.front] ? 1 : 0);
      if (L <= 0) {
        continue;
      }
      var pic = gal ? gal.pics[k] : -1 - (place.colour % 48), D = A.layout(pic);
      var ax = (D.px0 + D.px1) / 2, along = place.start + (place.flip ? 2 - ax : ax);
      var qx = place.alongX ? along : place.wall, qy = place.alongX ? place.wall : along;
      var perp = (qx - px) * dirX + (qy - py) * dirY;
      if (perp < 0.05) {
        // beside or behind the camera: only its edge can show
        perp = 0.05;
        if ((qx - px) * dirX + (qy - py) * dirY < -1.5) {
          continue;
        }
      }
      var hpx = (D.pv1 - D.pv0) * H / perp;
      if (hpx < NEAR_PX) {
        continue;
      }
      if (A.image(pic, hpx)) {
        out.push({k: k, pic: pic, px: hpx});
      }
    }
    return out;
  };

  function canvasOf(pic) {
    if (!pic.canvas) {
      var c = document.createElement("canvas");
      c.width = pic.w;
      c.height = pic.h;
      c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(pic.data), pic.w, pic.h), 0, 0);
      pic.canvas = c;
    }
    return pic.canvas;
  }

  /* The columns of the screen where nothing nearer than d stands, as a
   * path (only what is behind no wall is drawn). */
  View.prototype.openPath = function (d, x0, x1) {
    var z = this.zbuf, rw = this.rw, sx = this.W / rw, H = this.H;
    var path = new Path2D(), any = false;
    var a = Math.max(0, Math.floor(x0 / sx)), b = Math.min(rw, Math.ceil(x1 / sx) + 1);
    for (var x = a; x < b;) {
      if (z[x] < d) {
        x++;
        continue;
      }
      var s = x;
      while (x < b && z[x] >= d) {
        x++;
      }
      path.rect(s * sx, 0, (x - s) * sx, H);
      any = true;
    }
    return any ? path : null;
  };

  /* A sprite over the picture, at the screen's own pixels, in the fog of
   * its distance, behind the walls nearer than it. */
  View.prototype.sprite = function (g, e, hits) {
    var sx = this.W / this.rw, sy = this.H / this.rh;
    var x = e.x * sx, y = e.y * sy, w = e.w * sx, h = e.h * sy;
    if (x > this.W || x + w < 0 || y > this.H || y + h < 0) {
      return;
    }
    var path = this.openPath(e.ty, x, x + w);
    if (!path) {
      return;
    }
    var src = canvasOf(e.pic), f = fog(e.ty);
    if (f < 0.995) {
      var t = this.temp;
      if (t.width !== src.width || t.height !== src.height) {
        t.width = src.width;
        t.height = src.height;
      }
      var tg = t.getContext("2d");
      tg.globalCompositeOperation = "copy";
      tg.drawImage(src, 0, 0);
      tg.globalCompositeOperation = "source-atop";
      tg.fillStyle = "rgba(" + FOG[0] + "," + FOG[1] + "," + FOG[2] + "," + (1 - f) + ")";
      tg.fillRect(0, 0, t.width, t.height);
      tg.globalCompositeOperation = "source-over";
      src = t;
    }
    g.save();
    g.clip(path);
    g.globalAlpha = e.fade;
    g.drawImage(src, x, y, w, h);
    g.restore();
    if (e.hit && hits) {
      hits.push({kind: e.hit, x0: x, y0: y, x1: x + w, y1: y + h, d: e.ty, path: path});
    }
  };

  /* The paintings near enough, sharp from their own images, as the walls
   * are drawn: column by column of the screen, columns of nearly the same
   * height drawn together (MERGE_PX), then their light and fog over them.
   * Their plaques can be clicked (hits). */
  var MERGE_PX = 0.6, MERGE_SHARE = 0.006, MERGE_MOST = 96;

  /* The picture pic for px pixels high on the screen: itself, or a copy
   * halved (and halved again) down to no less than px, made once: drawing
   * many strips from a picture far larger than they are costs the most. */
  var smaller = typeof WeakMap === "function" ? new WeakMap() : null;
  function sourceFor(pic, px) {
    var k = 1;
    while (pic.height / (k * 2) >= px * 1.15 && k < 8) {
      k *= 2;
    }
    if (k === 1 || !smaller) {
      return pic;
    }
    var kept = smaller.get(pic) || {};
    if (!kept[k]) {
      var c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(pic.width / k));
      c.height = Math.max(1, Math.round(pic.height / k));
      var g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(pic, 0, 0, c.width, c.height);
      kept[k] = c;
      smaller.set(pic, kept);
    }
    return kept[k];
  }

  View.prototype.paintings = function (g, hits) {
    var c = this.camera, W = this.W, H = this.H, rw = this.rw, rh = this.rh, colPlace = this.colPlace;
    var half = c.half * H / rh, eye = c.eye;
    var level = LEVELS[this.level];
    var sw = level >= 0.84 ? 1 : level >= 0.59 ? 2 : 3;
    var gal = c.gallery, likes = !!(gal && gal.likes);
    this.near.forEach(function (n) {
      var place = c.places.list[n.k], D = A.layout(n.pic);
      var pic = A.image(n.pic, n.px);
      if (!pic) {
        return;
      }
      pic = sourceFor(pic, n.px * (D.fv1 - D.fv0) / (D.pv1 - D.pv0));
      var cw = pic.width, ch = pic.height;
      var liked = !!(gal && gal.liked && gal.liked[n.k]);
      var plaque = likes ? A.plaque(liked) : null;
      var first = -1, last = -1, xb;
      for (xb = 0; xb < rw; xb++) {
        if (colPlace[xb] === n.k) {
          if (first < 0) {
            first = xb;
          }
          last = xb;
        }
      }
      if (first < 0) {
        return;
      }
      // the columns of the screen on the frame and on the plaque: [x, across, distance]
      var frameCols = [], plaqueCols = [];
      for (xb = first; xb <= last; xb++) {
        if (colPlace[xb] !== n.k) {
          continue;
        }
        var xd1 = Math.floor((xb + 1) * W / rw);
        for (var xd = Math.floor(xb * W / rw); xd < xd1; xd += sw) {
          var camX = 2 * (xd + sw / 2) / W - 1;
          var rdx = c.dirX + c.planeX * camX, rdy = c.dirY + c.planeY * camX;
          var t = place.alongX ? (place.wall - c.py) / rdy : (place.wall - c.px) / rdx;
          if (!(t > 0.01)) {
            continue;
          }
          var su = ((place.alongX ? c.px + t * rdx : c.py + t * rdy) - place.start) / 2;
          var ax = (place.flip ? 1 - su : su) * 2;
          if (ax >= D.fx0 && ax < D.fx1) {
            frameCols.push([xd, ax, t]);
          } else if (plaque && ax >= D.qx0 && ax < D.qx1) {
            plaqueCols.push([xd, ax, t]);
          }
        }
      }
      var path = new Path2D(), xmin = Infinity, xmax = -Infinity, tmin = 0, tmax = 0;
      var spans = function (cols, a0, a1, v0, v1, src) {
        var box = null;
        for (var i = 0; i < cols.length;) {
          var x0 = cols[i][0], t0 = cols[i][2], lh0 = H / t0, top0 = half - (1 - eye - v0) * lh0;
          var hh0 = (v1 - v0) * lh0;
          // (a big picture seen at a slant: strips a little longer, so that
          // there are not hundreds of them)
          var tol = Math.max(MERGE_PX, hh0 * MERGE_SHARE);
          var j = i + 1;
          while (j < cols.length && cols[j][0] === cols[j - 1][0] + sw && cols[j][0] - x0 < MERGE_MOST) {
            var lh = H / cols[j][2], top = half - (1 - eye - v0) * lh;
            if (Math.abs(top - top0) > tol || Math.abs((v1 - v0) * lh - hh0) > tol) {
              break;
            }
            j++;
          }
          var xEnd = cols[j - 1][0] + sw;
          // the image across the span: from the first column's place to the end of the last one
          // (seen from its room, a wall's picture runs left to right on the screen)
          var k1 = j - 1, step = k1 + 1 < cols.length ? cols[k1 + 1][1] - cols[k1][1] :
            (k1 > 0 ? cols[k1][1] - cols[k1 - 1][1] : 0);
          var s0 = Math.max(0, Math.min(1, (cols[i][1] - a0) / (a1 - a0))) * src.width;
          var s1 = Math.max(0, Math.min(1, (cols[k1][1] + Math.max(0, step) - a0) / (a1 - a0))) * src.width;
          if (s1 - s0 < 1) {
            s0 = Math.max(0, Math.min(src.width - 1, s0));
            s1 = s0 + 1;
          }
          g.drawImage(src, s0, 0, s1 - s0, src.height, x0, top0, xEnd - x0, hh0);
          path.rect(x0, top0, xEnd - x0, hh0);
          if (x0 < xmin) {
            xmin = x0;
            tmin = t0;
          }
          if (xEnd > xmax) {
            xmax = xEnd;
            tmax = cols[j - 1][2];
          }
          if (!box) {
            box = {x0: x0, y0: top0, x1: xEnd, y1: top0 + hh0, t: t0};
          } else {
            box.x0 = Math.min(box.x0, x0);
            box.x1 = Math.max(box.x1, xEnd);
            box.y0 = Math.min(box.y0, top0);
            box.y1 = Math.max(box.y1, top0 + hh0);
          }
          i = j;
        }
        return box;
      };
      spans(frameCols, D.fx0, D.fx1, D.fv0, D.fv1, pic);
      var q = plaque ? spans(plaqueCols, D.qx0, D.qx1, D.qv0, D.qv1, plaque) : null;
      if (xmin === Infinity) {
        return;
      }
      // the light of the room and the side of the wall, then the fog
      var L = c.light ? c.light[place.front] : (c.lit[place.front] ? 1 : 0);
      var dark = 1 - (place.alongX ? 0.8 : 1) * (0.85 + 0.15 * L) * L;
      var tmid = (tmin + tmax) / 2;
      g.save();
      g.clip(path);
      if (dark > 0.003) {
        g.fillStyle = "rgba(0,0,0," + dark.toFixed(3) + ")";
        g.fillRect(xmin, 0, xmax - xmin, H);
      }
      var fa = 1 - fog(tmin), fb = 1 - fog(tmid), fz = 1 - fog(tmax);
      if (Math.max(fa, fb, fz) > 0.003) {
        var grad = g.createLinearGradient(xmin, 0, Math.max(xmin + 1, xmax), 0);
        var fogc = FOG[0] + "," + FOG[1] + "," + FOG[2] + ",";
        grad.addColorStop(0, "rgba(" + fogc + fa.toFixed(3) + ")");
        grad.addColorStop(0.5, "rgba(" + fogc + fb.toFixed(3) + ")");
        grad.addColorStop(1, "rgba(" + fogc + fz.toFixed(3) + ")");
        g.fillStyle = grad;
        g.fillRect(xmin, 0, xmax - xmin, H);
      }
      g.restore();
      if (q && hits) {
        hits.push({kind: "plaque", place: n.k, x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1, d: q.t});
      }
    });
    if (hits && likes) {
      // the plaques too far to be drawn sharp can be clicked too, from their
      // place in the ray casting's picture
      this.farPlaques(hits);
    }
  };

  /* The plaques of the paintings not drawn sharp, where they are on the
   * screen (for clicks). */
  View.prototype.farPlaques = function (hits) {
    var c = this.camera, W = this.W, H = this.H, rw = this.rw, rh = this.rh, sx = W / rw, sy = H / rh;
    var done = {};
    this.near.forEach(function (n) { done[n.k] = true; });
    var boxes = {};
    for (var x = 0; x < rw; x++) {
      var k = this.colPlace[x];
      if (k < 0 || done[k]) {
        continue;
      }
      var place = c.places.list[k], pic = c.gallery.pics[k], D = A.layout(pic);
      var camX = 2 * x / rw - 1;
      var rdx = c.dirX + c.planeX * camX, rdy = c.dirY + c.planeY * camX;
      var t = place.alongX ? (place.wall - c.py) / rdy : (place.wall - c.px) / rdx;
      if (!(t > 0.01)) {
        continue;
      }
      var along = place.alongX ? c.px + t * rdx : c.py + t * rdy;
      var su = (along - place.start) / 2;
      if (place.flip) {
        su = 1 - su;
      }
      var ax = su * 2;
      if (ax < D.qx0 || ax >= D.qx1) {
        continue;
      }
      var lineH = rh / t, wallTop = c.half - (1 - c.eye) * lineH;
      var b = boxes[k] || (boxes[k] = {kind: "plaque", place: k, x0: Infinity, x1: -Infinity, y0: Infinity,
        y1: -Infinity, d: t});
      b.x0 = Math.min(b.x0, x * sx);
      b.x1 = Math.max(b.x1, (x + 1) * sx);
      b.y0 = Math.min(b.y0, (wallTop + D.qv0 * lineH) * sy);
      b.y1 = Math.max(b.y1, (wallTop + D.qv1 * lineH) * sy);
    }
    Object.keys(boxes).forEach(function (k) { hits.push(boxes[k]); });
  };

  /* The picture on the screen: the ray casting's picture, the paintings
   * near enough, the sprites, and the mouse: its whiskers through its eyes,
   * or all of it in front of the camera behind it. */
  View.prototype.show = function (scene) {
    var g = this.canvas.getContext("2d");
    var W = this.canvas.width, H = this.canvas.height;
    var hits = [];
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "low";
    g.drawImage(this.buf, 0, 0, W, H);
    g.imageSmoothingQuality = "high";
    this.paintings(g, hits);
    var self = this;
    (this.back || []).forEach(function (e) { self.sprite(g, e, hits); });
    this.hits = hits;
    if (!scene.mouse || !FG.mouse) {
      return;
    }
    if (scene.camera !== "behind" || !scene.cam) {
      FG.mouse.overlay3d(g, W, H, scene.mouse);
      return;
    }
    var cam = scene.cam, back = cam.back, z = this.zbuf, rw = this.rw, sx = W / rw;
    var fov = Math.tan(33 * Math.PI / 180) * (rw / this.rh) / (4 / 3);
    var P = function (f, s, u) {
      var d = back + f;
      if (d < 0.08) {
        return {x: 0, y: 0, k: 0, d: d};
      }
      return {x: W / 2 * (1 + s / (fov * d)), y: H * (cam.horizon + (scene.tilt || 0)) + (cam.eye - u) * H / d,
        k: H / d, d: d};
    };
    g.save();
    // only where no wall stands between the camera and the mouse
    g.beginPath();
    for (var x = 0; x < rw;) {
      if (z[x] < back - 0.05) {
        x++;
        continue;
      }
      var x0 = x;
      while (x < rw && z[x] >= back - 0.05) {
        x++;
      }
      g.rect(x0 * sx, 0, (x - x0) * sx, H);
    }
    g.clip();
    FG.mouse.drawBehind(g, P, scene.mouse);
    g.restore();
    // food nearer than the mouse goes over it
    (this.front || []).forEach(function (e) { self.sprite(g, e, hits); });
  };

  /* What is at (x, y), CSS pixels on the canvas: {kind: "plaque", place} or
   * {kind: "gramophone"}, the nearest, or null. */
  View.prototype.hit = function (x, y) {
    var X = x * this.dpr, Y = y * this.dpr, best = null;
    var ctx = this.canvas.getContext("2d");
    (this.hits || []).forEach(function (h) {
      if (X < h.x0 || X > h.x1 || Y < h.y0 || Y > h.y1) {
        return;
      }
      if (h.path && !ctx.isPointInPath(h.path, X, Y)) {
        return;
      }
      if (!best || h.d < best.d) {
        best = h;
      }
    });
    return best ? {kind: best.kind, place: best.place === undefined ? null : best.place, d: best.d} : null;
  };

  /* The 3D view on canvas: drawn by the graphics card (js/gl3d.js) where
   * the browser has one, else by the ray casting here. opts.gl: "auto",
   * "off" (always the ray casting: the link ?gl=0) or "always" (WebGL also
   * when the processor draws it: ?gl=1, for the checks). */
  function create(canvas, opts) {
    var how = opts && opts.gl || "auto";
    if (how !== "off" && FG.gl3d) {
      var g = FG.gl3d.create(canvas, how === "always");
      if (g) {
        return g;
      }
    }
    var v = new View(canvas);
    v.webgl = how === "off" ? "off" : FG.gl3d ? FG.gl3d.refused || "none" : "none";
    return v;
  }

  FG.view3d = {create: create, View: View, LEVELS: LEVELS, LOOK_FAR: LOOK_FAR, NEAR_PX: NEAR_PX,
    fog: fog, lightOf: lightOf, canvasOf: canvasOf, MOUSE_AHEAD: MOUSE_AHEAD, FOOD_SIZE: FOOD_SIZE,
    colours: {SKY_TOP: SKY_TOP, SKY_LOW: SKY_LOW, FOG: FOG, FOG_FAR: FOG_FAR, DARK_WALL: DARK_WALL,
      DARK_FLOOR: DARK_FLOOR, CORRIDOR_WALL: CORRIDOR_WALL}};
})(typeof window !== "undefined" ? window : globalThis);
