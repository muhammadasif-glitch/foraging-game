/* The 2D view: the same maze as the 3D view, seen from above. The same
 * colours, food and food signs; rooms the player does not know yet are dark,
 * and come into light as the player learns of them. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var Wd = FG.world, F = FG.food;

  var BG = "#0c1016";

  function rgb(c, f) {
    return "rgb(" + Math.round(c[0] * f) + "," + Math.round(c[1] * f) + "," + Math.round(c[2] * f) + ")";
  }

  function View(canvas) {
    this.canvas = canvas;
    this.brick = null;
    this.brickSize = 0;
  }

  /* w x h: the area to draw in, in CSS pixels; top and bottom: the room
   * kept free for the panel and the keys. */
  View.prototype.resize = function (w, h, top, bottom) {
    this.area = {w: w, h: h, top: top || 0, bottom: bottom || 0};
    this.fitted = null;
  };

  View.prototype.fit = function (M) {
    if (this.fitted && this.fitted.name === M.name) {
      return this.fitted;
    }
    var a = this.area, pad = 16;
    var room = a.h - a.top - a.bottom;
    var T = Math.max(4, Math.floor(Math.min((a.w - 2 * pad) / M.W, (room - 2 * pad) / M.H)));
    var dpr = root.devicePixelRatio || 1;
    var cw = M.W * T, ch = M.H * T;
    this.canvas.style.width = cw + "px";
    this.canvas.style.height = ch + "px";
    this.canvas.style.left = Math.round((a.w - cw) / 2) + "px";
    this.canvas.style.top = Math.round(a.top + (room - ch) / 2) + "px";
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    this.fitted = {name: M.name, T: T, dpr: dpr};
    return this.fitted;
  };

  /* A wall tile seen from above: grey plaster. */
  View.prototype.brickTile = function (T) {
    if (this.brickSize === T) {
      return this.brick;
    }
    var c = document.createElement("canvas");
    var n = Math.max(8, Math.round(T * (root.devicePixelRatio || 1)));
    c.width = c.height = n;
    var g = c.getContext("2d");
    var img = g.createImageData(n, n), B = Wd.textures().plaster;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        // the plain part of the plaster, without its skirting board and moulding
        var s = B[(4 + Math.floor(y / n * 52)) * 64 + (Math.floor(x / n * 64) & 63)];
        var o = (y * n + x) * 4;
        img.data[o] = 104 * s; img.data[o + 1] = 110 * s; img.data[o + 2] = 122 * s; img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.brick = c;
    this.brickSize = T;
    return c;
  };

  function label(g, text, cx, top, size) {
    g.font = "bold " + size + "px ui-sans-serif, system-ui, sans-serif";
    var w = g.measureText(text).width;
    g.fillStyle = "#f4f6fa";
    g.strokeStyle = "#1d2633";
    g.lineWidth = Math.max(1, size / 10);
    g.fillRect(cx - w / 2 - 5, top, w + 10, size + 8);
    g.strokeRect(cx - w / 2 - 5, top, w + 10, size + 8);
    g.fillStyle = "#121820";
    g.textBaseline = "top";
    g.fillText(text, cx - w / 2, top + 4);
  }

  function lightOf(scene, at) {
    return scene.light ? scene.light[at] : (scene.lit[at] ? 1 : 0);
  }

  /* scene: {maze, x, y, facing (0 east, 1 south, 2 west, 3 north), lit or
   * light, food, here, crumbs} */
  View.prototype.draw = function (scene) {
    var M = scene.maze;
    var f = this.fit(M), T = f.T;
    var g = this.canvas.getContext("2d");
    g.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
    g.fillStyle = BG;
    g.fillRect(0, 0, M.W * T, M.H * T);
    var brick = this.brickTile(T);
    var line = Math.max(1, Math.round(T / 12));
    for (var y = 0; y < M.H; y++) {
      for (var x = 0; x < M.W; x++) {
        var at = y * M.W + x, kd = M.kind[at];
        if (kd === Wd.WALL) {
          var near = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              var nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < M.W && ny < M.H && M.kind[ny * M.W + nx] !== Wd.WALL) {
                near = Math.max(near, lightOf(scene, ny * M.W + nx));
              }
            }
          }
          if (near > 0) {
            g.globalAlpha = near;
            g.drawImage(brick, x * T, y * T, T, T);
            g.globalAlpha = 1;
          }
          continue;
        }
        var L = lightOf(scene, at);
        if (L <= 0) {
          continue;                 // not known: dark, like the background
        }
        var c = kd === Wd.FLOOR ? M.list[M.roomAt[at]].rgb : null;
        g.globalAlpha = L;
        g.fillStyle = c ? rgb([c[0] * 0.42 + 40, c[1] * 0.42 + 40, c[2] * 0.42 + 40], 1) : "rgb(118,120,126)";
        g.fillRect(x * T, y * T, T, T);
        g.fillStyle = "rgba(0,0,0,0.22)";
        g.fillRect(x * T, y * T, T, line);
        g.fillRect(x * T, y * T, line, T);
        g.globalAlpha = 1;
      }
    }

    // food: the food and its worth on every food room the player knows; in
    // the room it is in, the food itself, its 10 pieces showing the level
    var size = Math.max(10, Math.round(T * 0.62));
    (scene.food || []).forEach(function (fd) {
      var rm = M.list[M.index[Wd.key(fd.room)]];
      var x0 = rm.c0 * T, y0 = rm.r0 * T, side = Wd.ROOM * T;
      var here = scene.here && Wd.key(scene.here.room) === Wd.key(fd.room);
      var L = lightOf(scene, (rm.r0 + 1) * M.W + rm.c0 + 1);
      if (L <= 0) {
        return;
      }
      g.globalAlpha = L;
      label(g, "food " + fd.worth, x0 + side / 2, y0 + T * 0.2, size);
      var top = y0 + T * 0.2 + size + 10, room2 = y0 + side - top;
      if (!here) {
        F.icon(g, fd.kind, x0 + side / 2, top + room2 * 0.45, Math.min(side * 0.42, room2 * 0.9));
      } else {
        g.globalAlpha = L * (scene.here.fade === undefined ? 1 : scene.here.fade);
        F.topView(g, fd.kind, x0 + side / 2, top + room2 * 0.48, Math.min(side * 0.42, room2 * 0.8), scene.here.level);
      }
      g.globalAlpha = 1;
    });
    (scene.crumbs || []).forEach(function (cr) {
      g.fillStyle = cr.kind === "bread" ? "#c58a4a" : "#e9b93c";
      var cs = Math.max(2, T * 0.09);
      g.fillRect(cr.x * T - cs / 2, (cr.y - cr.z * 0.8) * T - cs / 2, cs, cs);
    });

    // the player
    var px = scene.x * T, py = scene.y * T, pr = Math.max(4, T * 0.42);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.arc(px + pr * 0.12, py + pr * 0.18, pr, 0, 2 * Math.PI);
    g.fill();
    g.fillStyle = "#ffffff";
    g.strokeStyle = "#0c1016";
    g.lineWidth = Math.max(2, pr * 0.22);
    g.beginPath();
    g.arc(px, py, pr, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
    g.fillStyle = "#1a9fd6";
    g.beginPath();
    g.arc(px, py, pr * 0.42, 0, 2 * Math.PI);
    g.fill();
    var a = (scene.facing || 0) * Math.PI / 2;
    g.fillStyle = "#0c1016";
    g.beginPath();
    g.moveTo(px + Math.cos(a) * pr * 1.55, py + Math.sin(a) * pr * 1.55);
    g.lineTo(px + Math.cos(a + 0.55) * pr * 1.05, py + Math.sin(a + 0.55) * pr * 1.05);
    g.lineTo(px + Math.cos(a - 0.55) * pr * 1.05, py + Math.sin(a - 0.55) * pr * 1.05);
    g.closePath();
    g.fill();
  };

  FG.view2d = {create: function (canvas) { return new View(canvas); }};
})(typeof window !== "undefined" ? window : globalThis);
