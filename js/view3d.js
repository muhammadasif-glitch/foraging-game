/* The 3D view: the maze seen from inside, drawn by ray casting on a canvas
 * (no library, so the game also works offline and from a file).
 *
 * Walls are plaster in the colour of the room they face, with a framed
 * painting on each side of the room (the same painting for the same colour,
 * js/art.js); corridors are grey. Rooms the player does not know yet, and
 * their walls, are dark; rooms come into light as the player learns of them
 * (scene.light, 0 to 1 per tile). The food of the room the player is in
 * stands in its middle (js/food.js); a food room the player knows but is not
 * in shows a sign with its food and worth. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var Wd = FG.world, F = FG.food, A = FG.art;

  var SKY_TOP = [92, 146, 205], SKY_LOW = [196, 210, 224];
  var FOG = [196, 210, 224];
  var FOG_FAR = 15;
  var DARK_WALL = [38, 44, 54], DARK_FLOOR = [24, 28, 35];
  var CORRIDOR_WALL = [150, 152, 158];
  // the painting on its 2 wall tiles: across (u) and down (v, 0 at the top)
  var PIC_U0 = 0.31, PIC_U1 = 0.69, PIC_V0 = 0.14, PIC_V1 = 0.74;
  var FOOD_SIZE = {cheese: 0.5, bread: 0.4};

  function View(canvas) {
    this.canvas = canvas;
    this.buf = document.createElement("canvas");
    this.tex = Wd.textures();
    this.places = null;
    this.placesOf = null;
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

  function fogMix(c, d, out) {
    var f = Math.max(0, Math.min(1, 1 - d / FOG_FAR));
    f = f * f * (3 - 2 * f);
    out[0] = FOG[0] + (c[0] - FOG[0]) * f;
    out[1] = FOG[1] + (c[1] - FOG[1]) * f;
    out[2] = FOG[2] + (c[2] - FOG[2]) * f;
  }

  function lightOf(scene, at) {
    return scene.light ? scene.light[at] : (scene.lit[at] ? 1 : 0);
  }

  /* The sprites of a scene: the food of the room the player is in, crumbs,
   * and signs on the other food rooms it knows. */
  View.prototype.sprites = function (scene) {
    var out = [], M = scene.maze;
    (scene.food || []).forEach(function (f) {
      var c = Wd.centre(M, f.room);
      if (scene.here && Wd.key(scene.here.room) === Wd.key(f.room)) {
        out.push({x: c[0], y: c[1], pic: F.sideView(f.kind, scene.here.level), size: FOOD_SIZE[f.kind] || 0.45,
          fade: scene.here.fade === undefined ? 1 : scene.here.fade});
      } else {
        var at = Math.floor(c[1]) * M.W + Math.floor(c[0]);
        var L = lightOf(scene, at);
        if (L > 0.5) {
          out.push({x: c[0], y: c[1], pic: F.sign(f.kind, f.worth), size: 0.18, lift: 0.62});
        }
      }
    });
    (scene.crumbs || []).forEach(function (cr) {
      out.push({x: cr.x, y: cr.y, pic: F.crumb(cr.kind, cr.n), size: 0.022, lift: cr.z});
    });
    return out;
  };

  View.prototype.ensurePlaces = function (M) {
    if (this.placesOf !== M) {
      this.places = Wd.paintingPlaces(M);
      this.placesOf = M;
    }
    return this.places;
  };

  /* scene: {maze, x, y, angle (0 east, pi/2 south), lit or light, food,
   * here, crumbs, bob} */
  View.prototype.draw = function (scene) {
    var M = scene.maze, w = this.rw, h = this.rh;
    var data = this.image.data, z = this.zbuf, T = this.tex;
    var places = this.ensurePlaces(M);
    var dirX = Math.cos(scene.angle), dirY = Math.sin(scene.angle);
    var fov = Math.tan(33 * Math.PI / 180) * (w / h) / (4 / 3);
    var planeX = -dirY * fov, planeY = dirX * fov;
    var px = scene.x, py = scene.y, half = h / 2 + (scene.bob || 0) * h;
    var col = [0, 0, 0], tmp = [0, 0, 0], lit3 = [0, 0, 0];
    var x, y, o, L;

    for (y = 0; y < Math.min(h, Math.ceil(half)); y++) {
      var t = Math.pow(Math.max(0, y / half), 1.6);
      var cr = SKY_TOP[0] + (SKY_LOW[0] - SKY_TOP[0]) * t;
      var cg = SKY_TOP[1] + (SKY_LOW[1] - SKY_TOP[1]) * t;
      var cb = SKY_TOP[2] + (SKY_LOW[2] - SKY_TOP[2]) * t;
      for (x = 0; x < w; x++) {
        o = (y * w + x) * 4;
        data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255;
      }
    }

    var rx0 = dirX - planeX, ry0 = dirY - planeY, rx1 = dirX + planeX, ry1 = dirY + planeY;
    for (y = Math.max(0, Math.ceil(half)); y < h; y++) {
      var dist = (0.5 * h) / (y - half + 0.5);
      var sx = dist * (rx1 - rx0) / w, sy = dist * (ry1 - ry0) / w;
      var fx = px + dist * rx0, fy = py + dist * ry0;
      for (x = 0; x < w; x++, fx += sx, fy += sy) {
        var cx = Math.floor(fx), cy = Math.floor(fy);
        var tx = T.floor[(Math.floor((fy - cy) * 64) & 63) * 64 + (Math.floor((fx - cx) * 64) & 63)];
        tmp[0] = DARK_FLOOR[0] * tx; tmp[1] = DARK_FLOOR[1] * tx; tmp[2] = DARK_FLOOR[2] * tx;
        if (cx >= 0 && cy >= 0 && cx < M.W && cy < M.H) {
          var at = cy * M.W + cx, kd = M.kind[at];
          L = kd === Wd.WALL ? 0 : lightOf(scene, at);
          if (L > 0) {
            if (kd === Wd.FLOOR) {
              var rgb = M.list[M.roomAt[at]].rgb;
              lit3[0] = rgb[0] * 0.42 + 40; lit3[1] = rgb[1] * 0.42 + 40; lit3[2] = rgb[2] * 0.42 + 40;
            } else {
              lit3[0] = 118; lit3[1] = 120; lit3[2] = 126;
            }
            tmp[0] = (DARK_FLOOR[0] + (lit3[0] - DARK_FLOOR[0]) * L) * tx;
            tmp[1] = (DARK_FLOOR[1] + (lit3[1] - DARK_FLOOR[1]) * L) * tx;
            tmp[2] = (DARK_FLOOR[2] + (lit3[2] - DARK_FLOOR[2]) * L) * tx;
          }
        }
        fogMix(tmp, dist, col);
        o = (y * w + x) * 4;
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
      }
    }

    var base = [0, 0, 0];
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
      var front = fy2 * M.W + fx2, inside = fx2 >= 0 && fy2 >= 0 && fx2 < M.W && fy2 < M.H;
      L = inside ? lightOf(scene, front) : 0;
      var place = null;
      base[0] = DARK_WALL[0]; base[1] = DARK_WALL[1]; base[2] = DARK_WALL[2];
      if (L > 0) {
        var lw;
        if (M.roomAt[front] >= 0) {
          var rc = M.list[M.roomAt[front]].rgb;
          lw = [rc[0] * 0.62 + 78, rc[1] * 0.62 + 78, rc[2] * 0.62 + 78];
          var face = side === 0 ? (stepX > 0 ? 0 : 2) : (stepY > 0 ? 1 : 3);
          var k = places.at[front * 4 + face];
          if (k >= 0) {
            place = places.list[k];
          }
        } else {
          lw = CORRIDOR_WALL;
        }
        base[0] = DARK_WALL[0] + (lw[0] - DARK_WALL[0]) * L;
        base[1] = DARK_WALL[1] + (lw[1] - DARK_WALL[1]) * L;
        base[2] = DARK_WALL[2] + (lw[2] - DARK_WALL[2]) * L;
      }
      var shade = side === 1 ? 0.8 : 1;
      var along = side === 0 ? py + perp * rdy : px + perp * rdx;
      var wallX = along - Math.floor(along);
      var u = Math.floor(wallX * 64) & 63;
      var pic = null, pu = 0;
      if (place) {
        var su = (along - place.start) / 2;
        if (place.flip) {
          su = 1 - su;
        }
        if (su >= PIC_U0 && su < PIC_U1) {
          pic = A.painting(place.colour);
          pu = Math.min(pic.w - 1, Math.floor((su - PIC_U0) / (PIC_U1 - PIC_U0) * pic.w));
        }
      }
      var lineH = h / perp;
      var wallTop = half - lineH / 2;
      var top = Math.max(0, Math.floor(wallTop)), bot = Math.min(h, Math.ceil(half + lineH / 2));
      for (y = top; y < bot; y++) {
        var v = (y - wallTop) / lineH;
        if (pic && v >= PIC_V0 && v < PIC_V1) {
          var pv = Math.min(pic.h - 1, Math.floor((v - PIC_V0) / (PIC_V1 - PIC_V0) * pic.h));
          var q = (pv * pic.w + pu) * 4;
          var ps = shade * (0.85 + 0.15 * L);
          tmp[0] = (DARK_WALL[0] + (pic.data[q] - DARK_WALL[0]) * L) * ps;
          tmp[1] = (DARK_WALL[1] + (pic.data[q + 1] - DARK_WALL[1]) * L) * ps;
          tmp[2] = (DARK_WALL[2] + (pic.data[q + 2] - DARK_WALL[2]) * L) * ps;
        } else {
          var s = shade * T.plaster[(Math.floor(v * 64) & 63) * 64 + u] * (0.92 + 0.08 * (1 - v));
          if (pic && v >= PIC_V1 && v < PIC_V1 + 0.03) {
            s *= 0.82;                         // the painting's shadow on the wall
          }
          tmp[0] = base[0] * s; tmp[1] = base[1] * s; tmp[2] = base[2] * s;
        }
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
      var pic = e.sp.pic, ty = e.ty, fade = e.sp.fade === undefined ? 1 : e.sp.fade;
      if (fade <= 0) {
        return;
      }
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
          if (fade < 1) {
            data[oo] += (col[0] - data[oo]) * fade;
            data[oo + 1] += (col[1] - data[oo + 1]) * fade;
            data[oo + 2] += (col[2] - data[oo + 2]) * fade;
          } else {
            data[oo] = col[0]; data[oo + 1] = col[1]; data[oo + 2] = col[2];
          }
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
