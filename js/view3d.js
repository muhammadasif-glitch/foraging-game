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
  // with the camera behind the mouse, food this much nearer than the mouse
  // is drawn over it; at the same place the mouse is in front, at the food
  var MOUSE_AHEAD = 0.3;

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
    this.drawn = false;
  };

  /* How much of a colour at distance d is left in the fog (0 to 1). */
  function fog(d) {
    var f = Math.max(0, Math.min(1, 1 - d / FOG_FAR));
    return f * f * (3 - 2 * f);
  }

  function fogMix(c, d, out) {
    var f = fog(d);
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
   * here, crumbs, bob, sway (tiles to the right), eye (the height of the
   * eyes, as part of the height of a wall; 0.5 if not given), horizon (where
   * the eyes look, as part of the screen from the top; 0.5); with the mouse:
   * mouse (js/mouse.js), and for the camera behind it camera "behind" and
   * cam {x, y, eye, horizon, back} (FG.mouse.camera). again: only the mouse
   * is drawn anew, over the picture drawn last. */
  View.prototype.draw = function (scene, again) {
    if (again) {
      if (scene.mouse && FG.mouse && this.drawn) {
        this.show(scene);
      }
      return;
    }
    var M = scene.maze, w = this.rw, h = this.rh;
    var data = this.image.data, z = this.zbuf, T = this.tex;
    var places = this.ensurePlaces(M);
    var dirX = Math.cos(scene.angle), dirY = Math.sin(scene.angle);
    var fov = Math.tan(33 * Math.PI / 180) * (w / h) / (4 / 3);
    var planeX = -dirY * fov, planeY = dirX * fov;
    var sway = scene.sway || 0, eye = scene.eye || 0.5;
    var px = scene.x - dirY * sway, py = scene.y + dirX * sway;
    var half = h * (scene.horizon || 0.5) + (scene.bob || 0) * h;
    var cam = scene.camera === "behind" ? scene.cam : null;
    if (cam) {
      px = cam.x;
      py = cam.y;
      eye = cam.eye;
      half = h * cam.horizon;
    }
    this.front = [];
    var col = [0, 0, 0], tmp = [0, 0, 0];
    var x, y, o, L, f, f0, f1, f2;
    var light = scene.light, lit = scene.lit;
    var fc = this.floorColours(M);

    for (y = 0; y < Math.min(h, Math.ceil(half)); y++) {
      var t = Math.pow(Math.max(0, y / half), 1.6);
      var cr = SKY_TOP[0] + (SKY_LOW[0] - SKY_TOP[0]) * t;
      var cg = SKY_TOP[1] + (SKY_LOW[1] - SKY_TOP[1]) * t;
      var cb = SKY_TOP[2] + (SKY_LOW[2] - SKY_TOP[2]) * t;
      for (x = 0, o = y * w * 4; x < w; x++, o += 4) {
        data[o] = cr; data[o + 1] = cg; data[o + 2] = cb; data[o + 3] = 255;
      }
    }

    // the floor: 1 distance, so 1 fog, for each row of the screen
    var rx0 = dirX - planeX, ry0 = dirY - planeY, rx1 = dirX + planeX, ry1 = dirY + planeY;
    var FL = T.floor, kind = M.kind, roomAt = M.roomAt, MW = M.W, MH = M.H;
    for (y = Math.max(0, Math.ceil(half)); y < h; y++) {
      var dist = (eye * h) / (y - half + 0.5);
      f = fog(dist);
      f0 = FOG[0] * (1 - f); f1 = FOG[1] * (1 - f); f2 = FOG[2] * (1 - f);
      var sx = dist * (rx1 - rx0) / w, sy = dist * (ry1 - ry0) / w;
      var fx = px + dist * rx0, fy = py + dist * ry0;
      for (x = 0, o = y * w * 4; x < w; x++, fx += sx, fy += sy, o += 4) {
        var cx = Math.floor(fx), cy = Math.floor(fy);
        var tx = FL[(((fy - cy) * 64) & 63) * 64 + (((fx - cx) * 64) & 63)] * f;
        var r = DARK_FLOOR[0], gg = DARK_FLOOR[1], bb = DARK_FLOOR[2];
        if (cx >= 0 && cy >= 0 && cx < MW && cy < MH) {
          var at = cy * MW + cx, kd = kind[at];
          L = kd === Wd.WALL ? 0 : (light ? light[at] : (lit[at] ? 1 : 0));
          if (L > 0) {
            var ri = kd === Wd.FLOOR ? roomAt[at] * 3 : -1;
            var lr = ri >= 0 ? fc[ri] : 118, lg = ri >= 0 ? fc[ri + 1] : 120, lb = ri >= 0 ? fc[ri + 2] : 126;
            r += (lr - r) * L; gg += (lg - gg) * L; bb += (lb - bb) * L;
          }
        }
        data[o] = f0 + r * tx; data[o + 1] = f1 + gg * tx; data[o + 2] = f2 + bb * tx; data[o + 3] = 255;
      }
    }

    // the walls: 1 distance, so 1 fog, for each column
    var PL = T.plaster;
    var b0, b1, b2;
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
        if (mx < 0 || my < 0 || mx >= MW || my >= MH || kind[my * MW + mx] === Wd.WALL) {
          break;
        }
      }
      var perp = Math.max(side === 0 ? sdx - ddx : sdy - ddy, 0.0001);
      z[x] = perp;
      // the wall takes the colour of the tile in front of it
      var fx2 = side === 0 ? mx - stepX : mx, fy2 = side === 1 ? my - stepY : my;
      var front = fy2 * MW + fx2, inside = fx2 >= 0 && fy2 >= 0 && fx2 < MW && fy2 < MH;
      L = inside ? (light ? light[front] : (lit[front] ? 1 : 0)) : 0;
      var place = null;
      b0 = DARK_WALL[0]; b1 = DARK_WALL[1]; b2 = DARK_WALL[2];
      if (L > 0) {
        var l0, l1, l2;
        if (roomAt[front] >= 0) {
          var rc = M.list[roomAt[front]].rgb;
          l0 = rc[0] * 0.62 + 78; l1 = rc[1] * 0.62 + 78; l2 = rc[2] * 0.62 + 78;
          var face = side === 0 ? (stepX > 0 ? 0 : 2) : (stepY > 0 ? 1 : 3);
          var k = places.at[front * 4 + face];
          if (k >= 0) {
            place = places.list[k];
          }
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
      var wallTop = half - (1 - eye) * lineH;
      var top = Math.max(0, Math.floor(wallTop)), bot = Math.min(h, Math.ceil(half + eye * lineH));
      var ps = shade * (0.85 + 0.15 * L), pd = pic ? pic.data : null;
      for (y = top, o = (top * w + x) * 4; y < bot; y++, o += w * 4) {
        var v = (y - wallTop) / lineH;
        if (pd && v >= PIC_V0 && v < PIC_V1) {
          var q = (Math.min(pic.h - 1, Math.floor((v - PIC_V0) / (PIC_V1 - PIC_V0) * pic.h)) * pic.w + pu) * 4;
          data[o] = f0 + (DARK_WALL[0] + (pd[q] - DARK_WALL[0]) * L) * ps;
          data[o + 1] = f1 + (DARK_WALL[1] + (pd[q + 1] - DARK_WALL[1]) * L) * ps;
          data[o + 2] = f2 + (DARK_WALL[2] + (pd[q + 2] - DARK_WALL[2]) * L) * ps;
        } else {
          var sh = shade * PL[((v * 64) & 63) * 64 + u] * (0.92 + 0.08 * (1 - v));
          if (pd && v >= PIC_V1 && v < PIC_V1 + 0.03) {
            sh *= 0.82;                        // the painting's shadow on the wall
          }
          data[o] = f0 + b0 * sh; data[o + 1] = f1 + b1 * sh; data[o + 2] = f2 + b2 * sh;
        }
      }
    }

    var invDet = 1 / (planeX * dirY - dirX * planeY);
    var list = this.sprites(scene).map(function (sp) {
      var dx = sp.x - px, dy = sp.y - py;
      return {sp: sp, tx: invDet * (dirY * dx - dirX * dy), ty: invDet * (-planeY * dx + planeX * dy)};
    }).filter(function (e) { return e.ty > 0.15; });
    list.sort(function (a, b) { return b.ty - a.ty; });
    var front = this.front;
    list.forEach(function (e) {
      var pic = e.sp.pic, ty = e.ty, fade = e.sp.fade === undefined ? 1 : e.sp.fade;
      if (fade <= 0) {
        return;
      }
      var screenX = Math.floor((w / 2) * (1 + e.tx / ty));
      var hgt = Math.abs(h / ty) * e.sp.size;
      var wid = hgt * pic.w / pic.h;
      var bottom = half + (eye * h) / ty - (e.sp.lift || 0) * h / ty;
      var y0 = Math.floor(bottom - hgt), x0 = Math.floor(screenX - wid / 2);
      if (cam && ty < cam.back - MOUSE_AHEAD) {
        // between the camera and the mouse: drawn over the mouse (show)
        front.push({pic: pic, x: x0, y: y0, w: wid, h: hgt, ty: ty, fade: fade});
        return;
      }
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
    this.drawn = true;
    this.show(scene);
  };

  /* The picture on the screen, with the mouse over it: its whiskers through
   * its eyes, or all of it in front of the camera behind it. */
  View.prototype.show = function (scene) {
    var g = this.canvas.getContext("2d");
    var W = this.canvas.width, H = this.canvas.height;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.buf, 0, 0, W, H);
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
      return {x: W / 2 * (1 + s / (fov * d)), y: H * cam.horizon + (cam.eye - u) * H / d, k: H / d, d: d};
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
    var sy = H / this.rh;
    this.front.forEach(function (e) {
      var c = e.pic.canvas;
      if (!c) {
        c = e.pic.canvas = document.createElement("canvas");
        c.width = e.pic.w;
        c.height = e.pic.h;
        c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(e.pic.data), e.pic.w, e.pic.h), 0, 0);
      }
      g.save();
      g.globalAlpha = e.fade;
      g.beginPath();
      for (var x = 0; x < rw;) {
        if (z[x] < e.ty) {
          x++;
          continue;
        }
        var x0 = x;
        while (x < rw && z[x] >= e.ty) {
          x++;
        }
        g.rect(x0 * sx, 0, (x - x0) * sx, H);
      }
      g.clip();
      g.drawImage(c, e.x * sx, e.y * sy, e.w * sx, e.h * sy);
      g.restore();
    });
  };

  FG.view3d = {create: function (canvas) { return new View(canvas); }};
})(typeof window !== "undefined" ? window : globalThis);
