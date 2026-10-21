/* The food of the food rooms: a cheese wheel or a loaf of bread, in 10
 * pieces. The level of a room is the share of its pieces left: at 0.73 there
 * are 7 whole pieces and a thinner eighth that is 0.3 of a piece. Which food a
 * room shows is set in settings.js (food_rooms.<name>.food).
 *
 *   3D  the food stands in the middle of its room, seen from the side and a
 *       little from above.
 *   2D  the food seen from above.
 *
 * Every picture is drawn on a canvas and kept, 1 per food, view and level
 * (in hundredths). */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var PIECES = 10;
  var CHEESE = {top: "#f6cf55", topDark: "#e9b93c", rind: "#d99a2b", rindDark: "#b97818", cut: "#f9dc7a",
    hole: "#d8a838", line: "#c8962c"};
  var BREAD = {crust: "#b8702f", crustDark: "#8a4d1d", crustLight: "#d18f4c", crumb: "#f4e0b4", pore: "#d9bf8d",
    board: "#a7794a", boardDark: "#7d5530"};

  function pieces(level) {
    var tenths = Math.round(Math.max(0, Math.min(1, level)) * PIECES * 1e6) / 1e6;
    var whole = Math.floor(tenths);
    return {whole: whole, part: tenths - whole};
  }

  function noise(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------ cheese
  /* The wedges left, as angle intervals on the top of the wheel. The gap
   * the eaten wedges leave faces the viewer, so that every bite shows. */
  function wedges(level) {
    var p = pieces(level), out = [], step = 2 * Math.PI / PIECES;
    var start = Math.PI / 2 + 0.32;                      // just right of the front
    for (var k = 0; k < p.whole; k++) {
      out.push([start + k * step, start + (k + 1) * step]);
    }
    if (p.part > 1e-6) {
      out.push([start + p.whole * step, start + (p.whole + p.part) * step]);
    }
    return out;
  }

  function onRim(cx, cy, r, k, a) {
    return [cx + r * Math.cos(a), cy + r * k * Math.sin(a)];
  }

  /* A cheese wheel seen from the side and above, on a plate. (cx, cy) is the
   * middle of its top, r its radius. */
  function cheeseSide(g, cx, cy, r, level) {
    var k = 0.42, thick = r * 0.36;
    // the plate
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.beginPath();
    g.ellipse(cx, cy + thick + r * 0.16, r * 1.25, r * 1.25 * k, 0, 0, 2 * Math.PI);
    g.fill();
    g.fillStyle = "#eef1f4";
    g.strokeStyle = "#b9c1ca";
    g.lineWidth = Math.max(1, r * 0.04);
    g.beginPath();
    g.ellipse(cx, cy + thick + r * 0.08, r * 1.2, r * 1.2 * k, 0, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
    g.strokeStyle = "#d3d9df";
    g.beginPath();
    g.ellipse(cx, cy + thick + r * 0.08, r * 0.95, r * 0.95 * k, 0, 0, 2 * Math.PI);
    g.stroke();
    var ws = wedges(level);
    if (!ws.length) {
      return;
    }
    var first = ws[0][0], last = ws[ws.length - 1][1];
    // the side of the wheel where it faces the viewer (the lower half of the
    // top's outline)
    ws.forEach(function (w) {
      var a = Math.max(w[0], 0), b = Math.min(w[1], Math.PI);
      var spans = [[a, b]];
      // a wedge may also reach the front again after a full turn
      spans.push([Math.max(w[0], 2 * Math.PI), Math.min(w[1], 3 * Math.PI)]);
      spans.forEach(function (s) {
        if (s[1] <= s[0]) {
          return;
        }
        var grad = g.createLinearGradient(cx - r, 0, cx + r, 0);
        grad.addColorStop(0, CHEESE.rindDark);
        grad.addColorStop(0.45, CHEESE.rind);
        grad.addColorStop(1, CHEESE.rindDark);
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(cx, cy, r, r * k, 0, s[0], s[1]);
        g.ellipse(cx, cy + thick, r, r * k, 0, s[1], s[0], true);
        g.closePath();
        g.fill();
      });
    });
    // the cut faces at both ends of what is left, the nearer one last
    if (last - first < 2 * Math.PI - 1e-6) {
      [first, last].sort(function (a, b) { return Math.sin(a) - Math.sin(b); }).forEach(function (a) {
        var p = onRim(cx, cy, r, k, a);
        g.fillStyle = CHEESE.cut;
        g.strokeStyle = CHEESE.line;
        g.lineWidth = Math.max(1, r * 0.025);
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(p[0], p[1]);
        g.lineTo(p[0], p[1] + thick);
        g.lineTo(cx, cy + thick);
        g.closePath();
        g.fill();
        g.stroke();
        // holes in the cut
        g.fillStyle = CHEESE.hole;
        for (var h = 1; h <= 2; h++) {
          var f = h / 3;
          g.beginPath();
          g.ellipse(cx + (p[0] - cx) * f, cy + (p[1] - cy) * f + thick * (0.35 + 0.25 * (h % 2)),
            r * 0.05, thick * 0.12, 0, 0, 2 * Math.PI);
          g.fill();
        }
      });
    }
    // the top
    ws.forEach(function (w, i) {
      var grad = g.createRadialGradient(cx - r * 0.25, cy - r * k * 0.3, r * 0.1, cx, cy, r * 1.05);
      grad.addColorStop(0, CHEESE.top);
      grad.addColorStop(1, CHEESE.topDark);
      g.fillStyle = grad;
      g.strokeStyle = CHEESE.line;
      g.lineWidth = Math.max(1, r * 0.022);
      g.beginPath();
      g.moveTo(cx, cy);
      g.ellipse(cx, cy, r, r * k, 0, w[0], w[1]);
      g.closePath();
      g.fill();
      g.stroke();
      // a hole or 2 on each wedge
      var rnd = noise(31 + i * 7);
      g.fillStyle = CHEESE.hole;
      for (var h = 0; h < 2; h++) {
        var a = w[0] + (w[1] - w[0]) * (0.25 + 0.5 * rnd()), d = 0.35 + 0.45 * rnd();
        if (w[1] - w[0] < 0.25) {
          break;
        }
        g.beginPath();
        g.ellipse(cx + r * d * Math.cos(a), cy + r * k * d * Math.sin(a), r * 0.055, r * 0.055 * k, 0, 0, 2 * Math.PI);
        g.fill();
      }
    });
    // the rind's edge
    g.strokeStyle = CHEESE.rindDark;
    g.lineWidth = Math.max(1, r * 0.03);
    ws.forEach(function (w) {
      g.beginPath();
      g.ellipse(cx, cy, r, r * k, 0, w[0], w[1]);
      g.stroke();
    });
  }

  /* The cheese from above, for the 2D view. */
  function cheeseTop(g, cx, cy, r, level) {
    g.fillStyle = "#eef1f4";
    g.strokeStyle = "#b9c1ca";
    g.lineWidth = Math.max(1, r * 0.05);
    g.beginPath();
    g.arc(cx, cy, r * 1.18, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
    wedges(level).forEach(function (w, i) {
      g.fillStyle = CHEESE.rind;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, r, w[0], w[1]);
      g.closePath();
      g.fill();
      g.fillStyle = CHEESE.top;
      g.strokeStyle = CHEESE.line;
      g.lineWidth = Math.max(1, r * 0.03);
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, r * 0.86, w[0], w[1]);
      g.closePath();
      g.fill();
      g.stroke();
      if (w[1] - w[0] > 0.3) {
        var a = (w[0] + w[1]) / 2 + 0.12 * ((i % 3) - 1);
        g.fillStyle = CHEESE.hole;
        g.beginPath();
        g.arc(cx + r * 0.52 * Math.cos(a), cy + r * 0.52 * Math.sin(a), r * 0.08, 0, 2 * Math.PI);
        g.fill();
      }
    });
  }

  // ------------------------------------------------------------ bread
  /* A sliced loaf on a board, seen from the side and a little from above.
   * (x0, base) is the left end of its bottom, len its length when whole. */
  function breadSide(g, x0, base, len, level) {
    var p = pieces(level), sw = len / PIECES;
    var hgt = len * 0.44, dx = len * 0.12, dy = -len * 0.08;
    var n = p.whole + (p.part > 1e-6 ? 1 : 0);
    var widths = [];
    for (var k = 0; k < p.whole; k++) {
      widths.push(sw);
    }
    if (p.part > 1e-6) {
      widths.push(sw * p.part);
    }
    var l = widths.reduce(function (a, b) { return a + b; }, 0);
    // the board
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.fillRect(x0 - len * 0.08, base + len * 0.03, len * 1.32, len * 0.07);
    g.fillStyle = BREAD.board;
    g.strokeStyle = BREAD.boardDark;
    g.lineWidth = Math.max(1, len * 0.012);
    g.beginPath();
    g.moveTo(x0 - len * 0.1, base);
    g.lineTo(x0 + len * 1.1, base);
    g.lineTo(x0 + len * 1.1 + dx * 1.3, base + dy * 1.3);
    g.lineTo(x0 - len * 0.1 + dx * 1.3, base + dy * 1.3);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = BREAD.boardDark;
    g.fillRect(x0 - len * 0.1, base, len * 1.2, len * 0.035);
    if (!n) {
      return;
    }
    var top = base - hgt, shoulder = top + hgt * 0.22;
    // the long side: every slice has its own rounded top
    var grad = g.createLinearGradient(0, top, 0, base);
    grad.addColorStop(0, BREAD.crustLight);
    grad.addColorStop(0.35, BREAD.crust);
    grad.addColorStop(1, BREAD.crustDark);
    g.fillStyle = grad;
    g.strokeStyle = "rgba(60,30,10,0.6)";
    g.lineWidth = Math.max(1, len * 0.009);
    var x = x0;
    widths.forEach(function (w) {
      g.beginPath();
      g.moveTo(x, base);
      g.lineTo(x, shoulder);
      g.bezierCurveTo(x, top - hgt * 0.05, x + w, top - hgt * 0.05, x + w, shoulder);
      g.lineTo(x + w, base);
      g.closePath();
      g.fill();
      g.stroke();
      x += w;
    });
    // a shine along the top
    g.strokeStyle = "rgba(255,225,170,0.45)";
    g.lineWidth = Math.max(1, len * 0.02);
    g.beginPath();
    g.moveTo(x0 + sw * 0.3, top + hgt * 0.1);
    g.lineTo(x0 + l - sw * 0.3, top + hgt * 0.1);
    g.stroke();
    // the cut face of the last slice, soft inside
    var xr = x0 + l;
    g.fillStyle = BREAD.crumb;
    g.strokeStyle = BREAD.crust;
    g.lineWidth = Math.max(1.5, len * 0.024);
    g.beginPath();
    g.moveTo(xr, base);
    g.lineTo(xr, shoulder);
    g.bezierCurveTo(xr, top - hgt * 0.05 + dy * 0.3, xr + dx, top - hgt * 0.05 + dy, xr + dx, shoulder + dy);
    g.lineTo(xr + dx, base + dy);
    g.closePath();
    g.fill();
    g.stroke();
    var rnd = noise(5);
    g.fillStyle = BREAD.pore;
    for (k = 0; k < 10; k++) {
      var fx = 0.2 + 0.6 * rnd(), fy = 0.15 + 0.7 * rnd();
      g.beginPath();
      g.ellipse(xr + dx * fx, shoulder + (base - shoulder) * fy + dy * fx, len * 0.008,
        len * 0.015, 0, 0, 2 * Math.PI);
      g.fill();
    }
  }

  /* The loaf from above, for the 2D view: (cx, cy) its middle when whole. */
  function breadTop(g, cx, cy, len, level) {
    var p = pieces(level), sw = len / PIECES, wid = len * 0.42;
    var x0 = cx - len / 2;
    g.fillStyle = BREAD.board;
    g.strokeStyle = BREAD.boardDark;
    g.lineWidth = Math.max(1, len * 0.02);
    g.beginPath();
    g.rect(x0 - len * 0.1, cy - wid * 0.85, len * 1.2, wid * 1.7);
    g.fill();
    g.stroke();
    var widths = [];
    for (var k = 0; k < p.whole; k++) {
      widths.push(sw);
    }
    if (p.part > 1e-6) {
      widths.push(sw * p.part);
    }
    var x = x0;
    widths.forEach(function (w, i) {
      var grad = g.createLinearGradient(0, cy - wid / 2, 0, cy + wid / 2);
      grad.addColorStop(0, BREAD.crust);
      grad.addColorStop(0.5, BREAD.crustLight);
      grad.addColorStop(1, BREAD.crust);
      g.fillStyle = grad;
      g.strokeStyle = BREAD.crustDark;
      g.lineWidth = Math.max(1, len * 0.012);
      var rr = Math.min(w / 2, wid * 0.3);
      g.beginPath();
      g.moveTo(x + rr, cy - wid / 2);
      g.arcTo(x + w, cy - wid / 2, x + w, cy + wid / 2, rr);
      g.arcTo(x + w, cy + wid / 2, x, cy + wid / 2, rr);
      g.arcTo(x, cy + wid / 2, x, cy - wid / 2, rr);
      g.arcTo(x, cy - wid / 2, x + w, cy - wid / 2, rr);
      g.closePath();
      g.fill();
      g.stroke();
      if (i === widths.length - 1) {
        g.fillStyle = BREAD.crumb;
        g.fillRect(x + w - Math.max(1, w * 0.25), cy - wid * 0.38, Math.max(1, w * 0.22), wid * 0.76);
      }
      x += w;
    });
  }

  // ------------------------------------------------------------ pictures
  var kept = {};

  function pixels(c) {
    var d = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    return {w: c.width, h: c.height, data: d.data};
  }

  /* Pictures kept: the most of the food at its levels (they are big). */
  var SIDE_KEPT = 24, sides = [];

  /* The food of a room as the 3D view's picture: {w, h, canvas}, 160 x 120
   * drawn SIDE_SCALE times as fine (sharp near), the food standing on the
   * bottom edge. */
  var SIDE_SCALE = 3;
  function sideView(kind, level) {
    var lv = Math.round(Math.max(0, Math.min(1, level)) * 100);
    var k = "s" + kind + lv;
    if (!kept[k]) {
      sides.push(k);
      if (sides.length > SIDE_KEPT) {
        delete kept[sides.shift()];
      }
      var c = document.createElement("canvas");
      c.width = 160 * SIDE_SCALE;
      c.height = 120 * SIDE_SCALE;
      var g = c.getContext("2d");
      g.scale(SIDE_SCALE, SIDE_SCALE);
      if (kind === "bread") {
        breadSide(g, 34, 108, 84, lv / 100);
      } else {
        cheeseSide(g, 80, 62, 62, lv / 100);
      }
      // the canvas itself: copying its pixels out (and back in) took longer
      // than drawing it, at every level the food goes through
      kept[k] = {w: c.width, h: c.height, canvas: c};
    }
    return kept[k];
  }

  /* The food from above at a level, drawn on g. */
  function topView(g, kind, cx, cy, size, level) {
    if (kind === "bread") {
      breadTop(g, cx, cy, size * 1.5, level);
    } else {
      cheeseTop(g, cx, cy, size * 0.62, level);
    }
  }

  /* A small picture of the whole food, for signs and the map. */
  function icon(g, kind, cx, cy, size) {
    if (kind === "bread") {
      breadSide(g, cx - size * 0.42, cy + size * 0.22, size * 0.72, 1);
    } else {
      cheeseSide(g, cx, cy - size * 0.05, size * 0.36, 1);
    }
  }

  /* The sign over a food room the player knows but is not in: the food and
   * the worth, never the level. */
  function sign(kind, worth) {
    var k = "sign" + kind + worth;
    if (!kept[k]) {
      var text = "food " + worth;
      var c = document.createElement("canvas");
      var g = c.getContext("2d");
      var font = "bold 40px ui-sans-serif, system-ui, sans-serif";
      g.font = font;
      var w = Math.ceil(g.measureText(text).width) + 36 + 64;
      // twice as fine, to be sharp near
      c.width = w * 2;
      c.height = 128;
      g = c.getContext("2d");
      g.scale(2, 2);
      g.fillStyle = "#f4f6fa";
      g.strokeStyle = "#1d2633";
      g.lineWidth = 4;
      g.fillRect(2, 2, w - 4, 60);
      g.strokeRect(2, 2, w - 4, 60);
      icon(g, kind, 38, 34, 54);
      g.fillStyle = "#121820";
      g.font = font;
      g.textBaseline = "middle";
      g.fillText(text, 74, 34);
      kept[k] = {w: c.width, h: c.height, canvas: c};
    }
    return kept[k];
  }

  /* A crumb, 4 x 4. */
  function crumb(kind, n) {
    var k = "crumb" + kind + (n % 3);
    if (!kept[k]) {
      var c = document.createElement("canvas");
      c.width = c.height = 4;
      var g = c.getContext("2d");
      g.fillStyle = kind === "bread" ? [BREAD.crust, BREAD.crumb, BREAD.crustLight][n % 3] :
        [CHEESE.top, CHEESE.rind, CHEESE.cut][n % 3];
      g.fillRect(0, 0, 4, 4);
      kept[k] = pixels(c);
    }
    return kept[k];
  }

  FG.food = {PIECES: PIECES, pieces: pieces, wedges: wedges, sideView: sideView, topView: topView,
    icon: icon, sign: sign, crumb: crumb, cheeseSide: cheeseSide, breadSide: breadSide};
})(typeof window !== "undefined" ? window : globalThis);
