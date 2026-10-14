/* The 3D view: the maze seen from inside, drawn by ray casting on a canvas
 * (no library, so the game also works offline and from a file).
 *
 * Walls are brick, in the colour of the room they face; corridors are grey.
 * Rooms the player does not know yet, and their walls, are dark. The food of
 * the room the player is in lies on the floor, 1 apple per tenth of its
 * level; a food room the player knows but is not in shows a sign with its
 * worth. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var Wd = FG.world;

  var SKY_TOP = [92, 146, 205], SKY_LOW = [196, 210, 224];
  var FOG = [196, 210, 224];
  var FOG_FAR = 15;
  var DARK_WALL = [38, 44, 54], DARK_FLOOR = [24, 28, 35];

  function pixels(canvas) {
    var d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    return {w: canvas.width, h: canvas.height, data: d.data};
  }

  function View(canvas) {
    this.canvas = canvas;
    this.buf = document.createElement("canvas");
    this.apple = pixels(Wd.appleCanvas());
    this.signs = {};
    this.tex = Wd.textures();
  }

  View.prototype.resize = function (w, h) {
    var dpr = root.devicePixelRatio || 1;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvas.style.left = "0px";
    this.canvas.style.top = "0px";
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.rw = Math.max(240, Math.min(640, Math.round(w / 2)));
    this.rh = Math.max(150, Math.round(this.rw * h / w));
    this.buf.width = this.rw;
    this.buf.height = this.rh;
    this.image = this.buf.getContext("2d").createImageData(this.rw, this.rh);
    this.zbuf = new Float32Array(this.rw);
  };

  View.prototype.sign = function (text) {
    if (!this.signs[text]) {
      this.signs[text] = pixels(Wd.signCanvas(text));
    }
    return this.signs[text];
  };

  function fogMix(c, d, out) {
    var f = Math.max(0, Math.min(1, 1 - d / FOG_FAR));
    f = f * f * (3 - 2 * f);
    out[0] = FOG[0] + (c[0] - FOG[0]) * f;
    out[1] = FOG[1] + (c[1] - FOG[1]) * f;
    out[2] = FOG[2] + (c[2] - FOG[2]) * f;
  }

  /* The sprites of a scene: apples in the room the player is in, signs on
   * the other food rooms it knows. */
  View.prototype.sprites = function (scene) {
    var out = [], self = this, M = scene.maze;
    (scene.food || []).forEach(function (f) {
      var c = Wd.centre(M, f.room);
      if (scene.here && Wd.key(scene.here.room) === Wd.key(f.room)) {
        var tenths = Math.round(scene.here.level * 10 * 1e6) / 1e6;
        var whole = Math.floor(tenths), part = tenths - whole;
        for (var k = 0; k < 10; k++) {
          var size = k < whole ? 0.16 : (k === whole && part > 1e-6 ? 0.16 * Math.max(0.3, part) : 0);
          if (size > 0) {
            var a = (k + 0.5) / 10 * 2 * Math.PI;
            out.push({x: c[0] + Math.cos(a) * 1.6, y: c[1] + Math.sin(a) * 1.6, pic: self.apple, size: size});
          }
        }
      } else {
        out.push({x: c[0], y: c[1], pic: self.sign("food " + f.worth), size: 0.18, lift: 0.62});
      }
    });
    return out;
  };

  /* scene: {maze, x, y, angle (0 east, pi/2 south), lit, food, here} */
  View.prototype.draw = function (scene) {
    var M = scene.maze, lit = scene.lit, w = this.rw, h = this.rh;
    var data = this.image.data, z = this.zbuf, T = this.tex;
    var dirX = Math.cos(scene.angle), dirY = Math.sin(scene.angle);
    var fov = Math.tan(33 * Math.PI / 180) * (w / h) / (4 / 3);
    var planeX = -dirY * fov, planeY = dirX * fov;
    var px = scene.x, py = scene.y, half = h / 2;
    var col = [0, 0, 0], tmp = [0, 0, 0];
    var x, y, o;

    for (y = 0; y < half; y++) {
      var t = Math.pow(y / half, 1.6);
      var cr = SKY_TOP[0] + (SKY_LOW[0] - SKY_TOP[0]) * t;
      var cg = SKY_TOP[1] + (SKY_LOW[1] - SKY_TOP[1]) * t;
      var cb = SKY_TOP[2] + (SKY_LOW[2] - SKY_TOP[2]) * t;
      for (x = 0; x < w; x++) {
        o = (y * w + x) * 4;
        data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255;
      }
    }

    var rx0 = dirX - planeX, ry0 = dirY - planeY, rx1 = dirX + planeX, ry1 = dirY + planeY;
    for (y = Math.ceil(half); y < h; y++) {
      var dist = (0.5 * h) / (y - half + 0.5);
      var sx = dist * (rx1 - rx0) / w, sy = dist * (ry1 - ry0) / w;
      var fx = px + dist * rx0, fy = py + dist * ry0;
      for (x = 0; x < w; x++, fx += sx, fy += sy) {
        var cx = Math.floor(fx), cy = Math.floor(fy);
        var tx = T.floor[(Math.floor((fy - cy) * 64) & 63) * 64 + (Math.floor((fx - cx) * 64) & 63)];
        tmp[0] = DARK_FLOOR[0] * tx; tmp[1] = DARK_FLOOR[1] * tx; tmp[2] = DARK_FLOOR[2] * tx;
        if (cx >= 0 && cy >= 0 && cx < M.W && cy < M.H) {
          var at = cy * M.W + cx, kd = M.kind[at];
          if (lit[at] && kd === Wd.FLOOR) {
            var rgb = M.list[M.roomAt[at]].rgb;
            tmp[0] = (rgb[0] * 0.42 + 40) * tx; tmp[1] = (rgb[1] * 0.42 + 40) * tx; tmp[2] = (rgb[2] * 0.42 + 40) * tx;
          } else if (lit[at] && kd !== Wd.WALL) {
            tmp[0] = 118 * tx; tmp[1] = 120 * tx; tmp[2] = 126 * tx;
          }
        }
        fogMix(tmp, dist, col);
        o = (y * w + x) * 4;
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
      }
    }

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
        if (mx < 0 || my < 0 || mx >= M.W || my >= M.H || M.kind[my * M.W + mx] === Wd.WALL) {
          break;
        }
      }
      var perp = Math.max(side === 0 ? sdx - ddx : sdy - ddy, 0.0001);
      z[x] = perp;
      // the wall takes the colour of the tile in front of it
      var fx2 = side === 0 ? mx - stepX : mx, fy2 = side === 1 ? my - stepY : my;
      var base = DARK_WALL, front = fy2 * M.W + fx2;
      if (fx2 >= 0 && fy2 >= 0 && fx2 < M.W && fy2 < M.H && lit[front]) {
        if (M.roomAt[front] >= 0) {
          var rc = M.list[M.roomAt[front]].rgb;
          base = [rc[0] * 0.72 + 50, rc[1] * 0.72 + 50, rc[2] * 0.72 + 50];
        } else {
          base = [120, 122, 128];
        }
      }
      var shade = side === 1 ? 0.78 : 1;
      var wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
      wallX -= Math.floor(wallX);
      var u = Math.floor(wallX * 64) & 63;
      var lineH = h / perp;
      var top = Math.max(0, Math.floor(half - lineH / 2)), bot = Math.min(h, Math.ceil(half + lineH / 2));
      for (y = top; y < bot; y++) {
        var v = (y - (half - lineH / 2)) / lineH;
        var s = shade * T.brick[(Math.floor(v * 64) & 63) * 64 + u] * (v > 0.92 ? 0.55 : 1) * (0.9 + 0.1 * (1 - v));
        tmp[0] = base[0] * s; tmp[1] = base[1] * s; tmp[2] = base[2] * s;
        fogMix(tmp, perp, col);
        o = (y * w + x) * 4;
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2];
      }
    }

    var invDet = 1 / (planeX * dirY - dirX * planeY);
    var list = this.sprites(scene).map(function (sp) {
      var dx = sp.x - px, dy = sp.y - py;
      return {sp: sp, tx: invDet * (dirY * dx - dirX * dy), ty: invDet * (-planeY * dx + planeX * dy)};
    }).filter(function (e) { return e.ty > 0.15; });
    list.sort(function (a, b) { return b.ty - a.ty; });
    list.forEach(function (e) {
      var pic = e.sp.pic, ty = e.ty;
      var screenX = Math.floor((w / 2) * (1 + e.tx / ty));
      var hgt = Math.abs(h / ty) * e.sp.size;
      var wid = hgt * pic.w / pic.h;
      var bottom = half + (0.5 * h) / ty - (e.sp.lift || 0) * h / ty;
      var y0 = Math.floor(bottom - hgt), x0 = Math.floor(screenX - wid / 2);
      for (var sx2 = Math.max(0, x0); sx2 < Math.min(w, x0 + wid); sx2++) {
        if (ty >= z[sx2]) {
          continue;
        }
        var uu = Math.floor((sx2 - x0) / wid * pic.w);
        for (var sy2 = Math.max(0, y0); sy2 < Math.min(h, y0 + hgt); sy2++) {
          var q = (Math.floor((sy2 - y0) / hgt * pic.h) * pic.w + uu) * 4;
          if (pic.data[q + 3] < 128) {
            continue;
          }
          tmp[0] = pic.data[q]; tmp[1] = pic.data[q + 1]; tmp[2] = pic.data[q + 2];
          fogMix(tmp, ty, col);
          var oo = (sy2 * w + sx2) * 4;
          data[oo] = col[0]; data[oo + 1] = col[1]; data[oo + 2] = col[2];
        }
      }
    });
    this.buf.getContext("2d").putImageData(this.image, 0, 0);
    var g = this.canvas.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.drawImage(this.buf, 0, 0, this.canvas.width, this.canvas.height);
  };

  FG.view3d = {create: function (canvas) { return new View(canvas); }};
})(typeof window !== "undefined" ? window : globalThis);
