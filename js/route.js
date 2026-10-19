/* The way a player went, drawn at the end of a game: the rooms the player
 * knew at the end (only those, so the map shows no more of the maze than the
 * player saw), the moves from room to room as a line that runs from blue at
 * the start to red at the end, with an arrow on every move, a ring on every
 * room the player stayed in (thicker for more stays), the start and the end,
 * and the food rooms with what was eaten in each.
 *
 * check/draw_route.py draws the same map from a game file. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  // blue, cyan, green, orange, red: step 1 to the last step
  var RAMP = [[59, 76, 192], [47, 181, 212], [166, 217, 106], [253, 174, 97], [215, 48, 31]];

  function ramp(k) {
    k = Math.max(0, Math.min(1, k)) * (RAMP.length - 1);
    var i = Math.min(RAMP.length - 2, Math.floor(k)), f = k - i;
    var a = RAMP[i], b = RAMP[i + 1];
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * f) + "," + Math.round(a[1] + (b[1] - a[1]) * f) + "," +
      Math.round(a[2] + (b[2] - a[2]) * f) + ")";
  }

  /* What the map needs from a game record: the rooms known at the end, the
   * rooms step by step, the stays and the food eaten in each food room. */
  function summary(rec) {
    var R = FG.rules;
    var known = {};
    (rec.known_rooms || []).forEach(function (n) { known[n] = true; });
    if (!rec.known_rooms) {
      rec.steps.forEach(function (st) { (st.known_new || []).forEach(function (n) { known[n] = true; }); });
    }
    var path = rec.steps.map(function (st) { return st.room; });
    var stays = {}, eatenIn = {};
    rec.steps.forEach(function (st, i) {
      if (i > 0 && st.move === "STAY") {
        stays[st.room] = (stays[st.room] || 0) + 1;
      }
      if (st.paid > 0) {
        eatenIn[st.room] = (eatenIn[st.room] || 0) + st.paid;
      }
    });
    var food = Object.keys(rec.layout.food_rooms).map(function (n) {
      var r = rec.layout.food_rooms[n];
      return {name: n, room: r, kind: (rec.food_kinds || {})[n] || null, worth: rec.settings.food_rooms[n].worth,
        eaten: eatenIn[r] || 0};
    });
    return {known: Object.keys(known).map(R.roomFromName), path: path.map(R.roomFromName), stays: stays,
      food: food, names: known};
  }

  /* Draws the route of rec on canvas, w x h CSS pixels. */
  function draw(canvas, rec, w, h) {
    var R = FG.rules, Wd = FG.world, F = FG.food;
    var sm = summary(rec);
    var rooms = FG.MAZES[rec.layout.maze].rooms;
    var dpr = root.devicePixelRatio || 1;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!sm.known.length) {
      return;
    }
    var r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    sm.known.forEach(function (r) {
      r0 = Math.min(r0, r[0]); r1 = Math.max(r1, r[0]); c0 = Math.min(c0, r[1]); c1 = Math.max(c1, r[1]);
    });
    var legend = 34;
    var cell = Math.min((w - 16) / (c1 - c0 + 1), (h - 16 - legend) / (r1 - r0 + 1));
    var ox = (w - cell * (c1 - c0 + 1)) / 2, oy = 8 + (h - 16 - legend - cell * (r1 - r0 + 1)) / 2;
    function at(r) {
      return [ox + (r[1] - c0 + 0.5) * cell, oy + (r[0] - r0 + 0.5) * cell];
    }
    function isKnown(r) {
      return !!sm.names[R.roomName(r)];
    }
    var side = cell * 0.74;
    // corridors between known rooms, then the rooms
    g.fillStyle = "#3a4452";
    sm.known.forEach(function (r) {
      [[0, 1], [1, 0]].forEach(function (d) {
        var n = [r[0] + d[0], r[1] + d[1]];
        if (n[0] < rooms.length && n[1] < rooms[0].length && rooms[n[0]][n[1]] >= 0 && isKnown(n)) {
          var a = at(r), b = at(n);
          g.fillRect(Math.min(a[0], b[0]) - cell * 0.07, Math.min(a[1], b[1]) - cell * 0.07,
            Math.abs(b[0] - a[0]) + cell * 0.14, Math.abs(b[1] - a[1]) + cell * 0.14);
        }
      });
    });
    sm.known.forEach(function (r) {
      var p = at(r), rgb = Wd.PALETTE[rooms[r[0]][r[1]] % Wd.PALETTE.length];
      g.fillStyle = "rgb(" + Math.round(rgb[0] * 0.5 + 50) + "," + Math.round(rgb[1] * 0.5 + 50) + "," +
        Math.round(rgb[2] * 0.5 + 50) + ")";
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 1;
      g.beginPath();
      g.rect(p[0] - side / 2, p[1] - side / 2, side, side);
      g.fill();
      g.stroke();
    });
    // the food rooms: the food and what was eaten there
    sm.food.forEach(function (f) {
      var r = R.roomFromName(f.room);
      if (!isKnown(r)) {
        return;
      }
      var p = at(r);
      if (f.kind) {
        F.icon(g, f.kind, p[0] - side * 0.26, p[1] - side * 0.24, side * 0.4);
      }
      g.font = "600 " + Math.max(9, Math.round(cell * 0.17)) + "px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "right";
      g.textBaseline = "bottom";
      g.lineWidth = 3;
      g.strokeStyle = "rgba(10,14,20,0.85)";
      var label = "+" + (Math.round(f.eaten * 10) / 10).toFixed(1);
      g.strokeText(label, p[0] + side * 0.47, p[1] + side * 0.47);
      g.fillStyle = "#ffffff";
      g.fillText(label, p[0] + side * 0.47, p[1] + side * 0.47);
    });
    // the moves: a lane each time a corridor is used again, so that going
    // back and forth shows as lines side by side
    var moves = [], uses = {}, total = {};
    for (var i = 1; i < sm.path.length; i++) {
      var a = sm.path[i - 1], b = sm.path[i];
      if (a[0] !== b[0] || a[1] !== b[1]) {
        var k = [R.roomName(a), R.roomName(b)].sort().join("|");
        total[k] = (total[k] || 0) + 1;
        moves.push({a: a, b: b, step: i, k: k});
      }
    }
    var n = Math.max(1, sm.path.length - 1);
    var lane = Math.min(cell * 0.08, 5);
    moves.forEach(function (m) {
      var j = uses[m.k] = (uses[m.k] || 0) + 1;
      var lanes = Math.min(total[m.k], 7);
      var off = (((j - 1) % 7) - (lanes - 1) / 2) * lane;
      var p = at(m.a), q = at(m.b);
      var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len * off, ny = dx / len * off;
      var colour = ramp((m.step - 1) / Math.max(1, n - 1));
      g.strokeStyle = colour;
      g.lineWidth = Math.max(1.5, cell * 0.045);
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(p[0] + nx, p[1] + ny);
      g.lineTo(q[0] + nx, q[1] + ny);
      g.stroke();
      // the arrow, half way
      var mx = (p[0] + q[0]) / 2 + nx, my = (p[1] + q[1]) / 2 + ny, ux = dx / len, uy = dy / len;
      var s2 = Math.max(4, cell * 0.1);
      g.fillStyle = colour;
      g.beginPath();
      g.moveTo(mx + ux * s2, my + uy * s2);
      g.lineTo(mx - ux * s2 * 0.6 - uy * s2 * 0.7, my - uy * s2 * 0.6 + ux * s2 * 0.7);
      g.lineTo(mx - ux * s2 * 0.6 + uy * s2 * 0.7, my - uy * s2 * 0.6 - ux * s2 * 0.7);
      g.closePath();
      g.fill();
    });
    // stays: a ring, thicker for more
    Object.keys(sm.stays).forEach(function (name) {
      var p = at(R.roomFromName(name)), c = sm.stays[name];
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = Math.min(cell * 0.12, 1.2 + Math.sqrt(c) * 1.2);
      g.beginPath();
      g.arc(p[0], p[1], cell * 0.2, 0, 2 * Math.PI);
      g.stroke();
      if (c > 1) {
        g.font = "600 " + Math.max(9, Math.round(cell * 0.15)) + "px ui-sans-serif, system-ui, sans-serif";
        g.textAlign = "left";
        g.textBaseline = "top";
        g.fillStyle = "#ffffff";
        g.fillText(c + " stays", p[0] - side * 0.46, p[1] - side * 0.47);
      }
    });
    // the start and the end
    var sp = at(sm.path[0]), ep = at(sm.path[sm.path.length - 1]);
    var mk = Math.max(6, cell * 0.12);
    g.fillStyle = ramp(0);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(sp[0], sp[1], mk, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
    g.fillStyle = ramp(1);
    g.fillRect(ep[0] - mk, ep[1] - mk, 2 * mk, 2 * mk);
    g.strokeRect(ep[0] - mk, ep[1] - mk, 2 * mk, 2 * mk);
    g.font = "700 " + Math.round(mk * 1.2) + "px ui-sans-serif, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ffffff";
    g.fillText("S", sp[0], sp[1] + 0.5);
    g.fillText("E", ep[0], ep[1] + 0.5);
    // the key
    var ly = h - legend + 8, lx0 = w * 0.18, lx1 = w * 0.82;
    for (var x = lx0; x < lx1; x++) {
      g.fillStyle = ramp((x - lx0) / (lx1 - lx0));
      g.fillRect(x, ly, 1.5, 7);
    }
    g.font = "11px ui-sans-serif, system-ui, sans-serif";
    g.fillStyle = "#8b9bb0";
    g.textBaseline = "top";
    g.textAlign = "right";
    g.fillText("first", lx0 - 6, ly - 2);
    g.textAlign = "left";
    g.fillText("last", lx1 + 6, ly - 2);
    g.textAlign = "center";
    g.fillText("S start, E end, ring: stayed, +food eaten in the room; only the rooms you knew",
      w / 2, ly + 11);
  }

  FG.route = {draw: draw, summary: summary, ramp: ramp};
})(typeof window !== "undefined" ? window : globalThis);
