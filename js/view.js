/* Drawing the maze as SVG: the rooms the player has been in (or all of
 * them), the player, the open sides of the player's room, the food rooms
 * found, and for the memory test a frame and the rooms marked. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var R = FG.rules;
  var NS = "http://www.w3.org/2000/svg";

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) {
      parent.appendChild(e);
    }
    return e;
  }

  function key(room) {
    return room[0] + "," + room[1];
  }

  /* state: {maze, seen: {key: true}, at: room or null, legal: [moves],
   * food: {key: true} (found food rooms), cursor: room or null,
   * marked: {key: true}, asking: room or null, all: bool (whole map)} */
  function draw(svg, state) {
    var maze = state.maze;
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    var box = svg.parentNode.getBoundingClientRect();
    var cell = Math.max(24, Math.min(110, Math.floor(Math.min(
      (box.width - 20) / maze.cols, (Math.max(box.height, 300) - 20) / maze.rows))));
    var pad = 10;
    var w = maze.cols * cell + 2 * pad, h = maze.rows * cell + 2 * pad;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    var gap = Math.max(4, Math.round(cell * 0.12));
    var size = cell - gap;
    function x(c) { return pad + c * cell + gap / 2; }
    function y(r) { return pad + r * cell + gap / 2; }

    // rooms next to the player's room through an open side, not yet seen
    var near = {};
    if (state.at) {
      (state.legal || []).forEach(function (m) {
        if (m !== "STAY") {
          near[key(maze.next(state.at, m))] = true;
        }
      });
    }

    maze.rooms().forEach(function (room) {
      var k = key(room);
      var seen = state.all || state.seen[k];
      if (seen) {
        el("rect", {x: x(room[1]), y: y(room[0]), width: size, height: size, rx: size * 0.12,
          fill: maze.colourOf(room), stroke: "#2b2b2b", "stroke-width": 1.5}, svg);
      } else if (near[k]) {
        el("rect", {x: x(room[1]), y: y(room[0]), width: size, height: size, rx: size * 0.12,
          fill: "none", stroke: "#8a8a8a", "stroke-width": 1.5, "stroke-dasharray": "6 5"}, svg);
      }
    });

    // the open sides of the player's room
    if (state.at) {
      var r = state.at[0], c = state.at[1];
      var cx = x(c) + size / 2, cy = y(r) + size / 2, a = Math.max(5, gap * 0.9);
      (state.legal || []).forEach(function (m) {
        var p;
        if (m === "LEFT") {
          p = [[x(c) - gap / 2 - a * 0.2, cy], [x(c) + a * 0.5, cy - a], [x(c) + a * 0.5, cy + a]];
        } else if (m === "RIGHT") {
          p = [[x(c) + size + gap / 2 + a * 0.2, cy], [x(c) + size - a * 0.5, cy - a], [x(c) + size - a * 0.5, cy + a]];
        } else if (m === "UP") {
          p = [[cx, y(r) - gap / 2 - a * 0.2], [cx - a, y(r) + a * 0.5], [cx + a, y(r) + a * 0.5]];
        } else if (m === "DOWN") {
          p = [[cx, y(r) + size + gap / 2 + a * 0.2], [cx - a, y(r) + size - a * 0.5], [cx + a, y(r) + size - a * 0.5]];
        }
        if (p) {
          el("polygon", {points: p.map(function (q) { return q.join(","); }).join(" "),
            fill: "#1d1d1d", stroke: "#ffffff", "stroke-width": 1.5}, svg);
        }
      });
    }

    // food rooms found
    Object.keys(state.food || {}).forEach(function (k) {
      var rc = k.split(",").map(Number);
      foodMark(svg, x(rc[1]) + size * 0.78, y(rc[0]) + size * 0.22, size * 0.15, false);
    });

    // memory test: rooms marked, the room asked about, the frame
    Object.keys(state.marked || {}).forEach(function (k) {
      var rc = k.split(",").map(Number);
      foodMark(svg, x(rc[1]) + size * 0.5, y(rc[0]) + size * 0.5, size * 0.2, true);
    });
    if (state.asking) {
      el("rect", {x: x(state.asking[1]) - 3, y: y(state.asking[0]) - 3, width: size + 6, height: size + 6,
        rx: size * 0.14, fill: "none", stroke: "#e07b00", "stroke-width": 5}, svg);
    }
    if (state.cursor) {
      el("rect", {x: x(state.cursor[1]) - 4, y: y(state.cursor[0]) - 4, width: size + 8, height: size + 8,
        rx: size * 0.14, fill: "none", stroke: "#1450c8", "stroke-width": 5, "stroke-dasharray": "10 6"}, svg);
    }

    // the player
    if (state.at) {
      var px = x(state.at[1]) + size / 2, py = y(state.at[0]) + size / 2;
      el("rect", {x: x(state.at[1]) - 2, y: y(state.at[0]) - 2, width: size + 4, height: size + 4,
        rx: size * 0.14, fill: "none", stroke: "#000000", "stroke-width": 4}, svg);
      el("circle", {cx: px, cy: py, r: size * 0.2, fill: "#ffffff", stroke: "#000000", "stroke-width": 3}, svg);
      el("circle", {cx: px, cy: py, r: size * 0.07, fill: "#000000"}, svg);
    }
  }

  function foodMark(svg, cx, cy, r, big) {
    el("circle", {cx: cx, cy: cy, r: r, fill: "#ffffff", stroke: "#1d1d1d", "stroke-width": 2}, svg);
    el("circle", {cx: cx, cy: cy + r * 0.12, r: r * 0.55, fill: big ? "#e07b00" : "#c0392b"}, svg);
    el("line", {x1: cx, y1: cy - r * 0.42, x2: cx + r * 0.25, y2: cy - r * 0.8,
      stroke: "#2e7d32", "stroke-width": Math.max(1.5, r * 0.18), "stroke-linecap": "round"}, svg);
  }

  FG.view = {draw: draw, key: key};
})(typeof window !== "undefined" ? window : globalThis);
