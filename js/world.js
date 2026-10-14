/* The maze as the player sees it, shared by the 2D and the 3D view.
 *
 * The rooms and their neighbours are those of the model (js/mazes.js, from
 * forage.v3.settings). They are laid out as in the model's films
 * (forage/base/renderer.py): every room is 4 x 4 tiles, and 2 neighbouring
 * rooms are joined by a door, a corridor tile and a door, at the same places
 * as in the films. Each room has the colour the films give it.
 *
 * What the player is shown is what the model's agent knows (see
 * check/map_check.py): the rooms it has been in and the rooms next to them,
 * in their colours; everything else is dark. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var ROOM = 4, CORR = 1;

  // REPO_PALETTE of forage/base/renderer.py: the colour of room colour i
  var PALETTE = [
    [255, 0, 0], [0, 255, 0], [0, 0, 255], [112, 39, 195], [255, 255, 0], [100, 100, 100],
    [115, 60, 60], [255, 0, 255], [80, 145, 80], [201, 132, 226], [75, 182, 220], [255, 153, 51],
    [255, 204, 229], [153, 153, 0], [229, 255, 204], [204, 204, 255], [0, 153, 153],
    [0, 0, 105], [150, 255, 90], [0, 75, 0], [240, 45, 120], [45, 255, 135], [0, 255, 255],
    [0, 105, 255], [255, 240, 105], [105, 255, 0], [180, 165, 120], [0, 165, 30], [135, 255, 195],
    [75, 0, 0], [210, 75, 30], [150, 0, 120], [165, 0, 0], [30, 60, 165], [120, 105, 255],
    [165, 0, 255]
  ];
  var WALL = 0, FLOOR = 1, DOOR = 2, CORRIDOR = 3;
  // a move's direction as [row, column] of the next room
  var DIRS = {RIGHT: [0, 1], DOWN: [1, 0], LEFT: [0, -1], UP: [-1, 0]};

  function key(room) {
    return room[0] + "," + room[1];
  }

  // ------------------------------------------------------------ layout
  function axisStarts(n) {
    var starts = [], pos = 1;
    for (var r = 0; r < n; r++) {
      starts.push(pos);
      pos += ROOM;
      if (r < n - 1) {
        pos += 1 + CORR + 1;
      }
    }
    return {starts: starts, length: pos + 1};
  }

  /* door_offset of the renderer: where along the wall a door sits. */
  function doorOffset(i, j, ni, nj) {
    var h = i * 31 + j * 17 + ni * 13 + nj * 7 + i * ni * 5 + j * nj * 3;
    h = (h * 2654435761) % 4294967296;
    h = (h ^ (h >>> 13)) >>> 0;
    return (h >>> 4) % ROOM;
  }

  /* door_and_corridor of the renderer: the door of room 1, the corridor tile
   * and the door of room 2, as [row, col], from room (i1, j1) to (i2, j2). */
  function doorAndCorridor(i1, j1, i2, j2, rs, cs) {
    var r, c;
    if (i2 === i1 && j2 === j1 + 1) {
      r = rs[i1] + doorOffset(i1, j1, i2, j2);
      return [[r, cs[j1] + ROOM], [r, cs[j1] + ROOM + 1], [r, cs[j1] + ROOM + 2]];
    }
    if (i2 === i1 && j2 === j1 - 1) {
      r = rs[i2] + doorOffset(i2, j2, i1, j1);
      return [[r, cs[j2] + ROOM + 2], [r, cs[j2] + ROOM + 1], [r, cs[j2] + ROOM]];
    }
    if (i2 === i1 + 1 && j2 === j1) {
      c = cs[j1] + doorOffset(i1, j1, i2, j2);
      return [[rs[i1] + ROOM, c], [rs[i1] + ROOM + 1, c], [rs[i1] + ROOM + 2, c]];
    }
    if (i2 === i1 - 1 && j2 === j1) {
      c = cs[j2] + doorOffset(i2, j2, i1, j1);
      return [[rs[i2] + ROOM + 2, c], [rs[i2] + ROOM + 1, c], [rs[i2] + ROOM, c]];
    }
    return null;
  }

  function isRoom(M, i, j) {
    return i >= 0 && j >= 0 && i < M.R && j < M.C && M.rooms[i][j] >= 0;
  }

  /* The tiles of a maze: kind (wall, floor, door, corridor) and the room of
   * each floor tile, in rows of W tiles. */
  function build(name) {
    var rooms = FG.MAZES[name].rooms;
    var R = rooms.length, C = rooms[0].length;
    var ay = axisStarts(R), ax = axisStarts(C);
    var W = ax.length, H = ay.length, rs = ay.starts, cs = ax.starts;
    var kind = new Uint8Array(W * H);
    var roomAt = new Int16Array(W * H).fill(-1);
    var list = [], index = {};
    var M = {name: name, rooms: rooms, R: R, C: C, W: W, H: H, rs: rs, cs: cs,
      kind: kind, roomAt: roomAt, list: list, index: index};
    for (var i = 0; i < R; i++) {
      for (var j = 0; j < C; j++) {
        if (rooms[i][j] < 0) {
          continue;
        }
        var k = list.length;
        index[i + "," + j] = k;
        list.push({i: i, j: j, rgb: PALETTE[rooms[i][j] % PALETTE.length], r0: rs[i], c0: cs[j]});
        for (var dr = 0; dr < ROOM; dr++) {
          for (var dc = 0; dc < ROOM; dc++) {
            kind[(rs[i] + dr) * W + cs[j] + dc] = FLOOR;
            roomAt[(rs[i] + dr) * W + cs[j] + dc] = k;
          }
        }
      }
    }
    for (i = 0; i < R; i++) {
      for (j = 0; j < C; j++) {
        if (rooms[i][j] < 0) {
          continue;
        }
        [[0, 1], [1, 0]].forEach(function (d) {
          if (isRoom(M, i + d[0], j + d[1])) {
            var t = doorAndCorridor(i, j, i + d[0], j + d[1], rs, cs);
            kind[t[0][0] * W + t[0][1]] = DOOR;
            kind[t[1][0] * W + t[1][1]] = CORRIDOR;
            kind[t[2][0] * W + t[2][1]] = DOOR;
          }
        });
      }
    }
    return M;
  }

  /* The middle of a room, as [x, y] in tiles (x along the columns). */
  function centre(M, room) {
    return [M.cs[room[1]] + ROOM / 2, M.rs[room[0]] + ROOM / 2];
  }

  /* The way from the middle of a room to the middle of its neighbour in
   * direction d ([row, col]): along the room to the door, through the
   * corridor, and on to the middle of the next room. Points as [x, y]. */
  function pathTo(M, room, d) {
    var i = room[0], j = room[1];
    var t = doorAndCorridor(i, j, i + d[0], j + d[1], M.rs, M.cs);
    var a = centre(M, room), b = centre(M, [i + d[0], j + d[1]]);
    function mid(tile) {
      return [tile[1] + 0.5, tile[0] + 0.5];
    }
    var first = mid(t[0]), last = mid(t[2]);
    var pts = [a];
    if (d[1] !== 0) {
      pts.push([a[0], first[1]], [first[0] - d[1] * 0.9, first[1]]);
    } else {
      pts.push([first[0], a[1]], [first[0], first[1] - d[0] * 0.9]);
    }
    pts.push(first, mid(t[1]), last);
    if (d[1] !== 0) {
      pts.push([last[0] + d[1] * 0.9, last[1]], [b[0], last[1]]);
    } else {
      pts.push([last[0], last[1] + d[0] * 0.9], [last[0], b[1]]);
    }
    pts.push(b);
    return pts;
  }

  /* Where along a path a share t (0 to 1) of its length is. */
  function along(pts, t) {
    var lens = [], total = 0;
    for (var k = 1; k < pts.length; k++) {
      var l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      lens.push(l);
      total += l;
    }
    var at = t * total;
    for (k = 0; k < lens.length; k++) {
      if (at <= lens[k] || k === lens.length - 1) {
        var f = lens[k] ? Math.min(1, at / lens[k]) : 1;
        return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
      }
      at -= lens[k];
    }
    return pts[pts.length - 1];
  }

  function pathLength(pts) {
    var total = 0;
    for (var k = 1; k < pts.length; k++) {
      total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    }
    return total;
  }

  /* The tiles shown in light: the floor of every room the player knows, and
   * the doors and corridors of the rooms it has been in. known and visited:
   * {"i,j": true}. */
  function lit(M, known, visited) {
    var out = new Uint8Array(M.W * M.H);
    Object.keys(known).forEach(function (k) {
      var rm = M.list[M.index[k]];
      if (!rm) {
        return;
      }
      for (var dr = 0; dr < ROOM; dr++) {
        for (var dc = 0; dc < ROOM; dc++) {
          out[(rm.r0 + dr) * M.W + rm.c0 + dc] = 1;
        }
      }
    });
    Object.keys(visited).forEach(function (k) {
      var rm = M.list[M.index[k]];
      if (!rm) {
        return;
      }
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) {
        if (isRoom(M, rm.i + d[0], rm.j + d[1])) {
          doorAndCorridor(rm.i, rm.j, rm.i + d[0], rm.j + d[1], M.rs, M.cs).forEach(function (t) {
            out[t[0] * M.W + t[1]] = 1;
          });
        }
      });
    });
    return out;
  }

  // ------------------------------------------------------------ pictures
  function noise(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Light and shade (0 to 1) of a brick wall and of a tiled floor, 64 x 64;
   * the colour of the room is laid over them. */
  function brickTexture() {
    var out = new Float32Array(64 * 64), rnd = noise(7), shade = [];
    for (var b = 0; b < 64; b++) {
      shade.push(0.86 + 0.14 * rnd());
    }
    for (var y = 0; y < 64; y++) {
      var row = Math.floor(y / 16), off = (row % 2) * 16;
      for (var x = 0; x < 64; x++) {
        var mortar = (y % 16) < 2 || ((x + off) % 32) < 2;
        out[y * 64 + x] = mortar ? 0.62 : shade[row * 2 + Math.floor(((x + off) % 64) / 32)] * (0.95 + 0.05 * rnd());
      }
    }
    return out;
  }

  function floorTexture() {
    var out = new Float32Array(64 * 64), rnd = noise(11);
    for (var y = 0; y < 64; y++) {
      for (var x = 0; x < 64; x++) {
        out[y * 64 + x] = ((y % 32) < 2 || (x % 32) < 2) ? 0.7 : 0.93 + 0.07 * rnd();
      }
    }
    return out;
  }

  /* The food: a red apple, as in the films' food icon. */
  function drawApple(g, cx, cy, r) {
    g.fillStyle = "rgb(214,58,43)";
    g.strokeStyle = "rgb(70,16,12)";
    g.lineWidth = Math.max(1, r * 0.1);
    g.beginPath();
    g.ellipse(cx, cy + r * 0.05, r, r * 0.95, 0, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
    g.fillStyle = "rgb(246,170,160)";
    g.beginPath();
    g.ellipse(cx - r * 0.35, cy - r * 0.3, r * 0.25, r * 0.25, 0, 0, 2 * Math.PI);
    g.fill();
    g.strokeStyle = "rgb(92,58,26)";
    g.lineWidth = Math.max(1, r * 0.2);
    g.beginPath();
    g.moveTo(cx, cy - r * 0.9);
    g.lineTo(cx + r * 0.15, cy - r * 1.5);
    g.stroke();
    g.fillStyle = "rgb(54,150,60)";
    g.beginPath();
    g.ellipse(cx + r * 0.55, cy - r * 1.45, r * 0.4, r * 0.22, -0.4, 0, 2 * Math.PI);
    g.fill();
  }

  function appleCanvas() {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    drawApple(c.getContext("2d"), 32, 40, 20);
    return c;
  }

  /* A sign with the worth of a food room: "food 8". */
  function signCanvas(text) {
    var c = document.createElement("canvas");
    var g = c.getContext("2d");
    var font = "bold 40px ui-sans-serif, system-ui, sans-serif";
    g.font = font;
    var w = Math.ceil(g.measureText(text).width) + 36;
    c.width = w;
    c.height = 64;
    g = c.getContext("2d");
    g.fillStyle = "#f4f6fa";
    g.strokeStyle = "#1d2633";
    g.lineWidth = 4;
    g.fillRect(2, 2, w - 4, 60);
    g.strokeRect(2, 2, w - 4, 60);
    g.fillStyle = "#121820";
    g.font = font;
    g.textBaseline = "middle";
    g.fillText(text, 18, 34);
    return c;
  }

  var textures = null;
  function tex() {
    if (!textures) {
      textures = {brick: brickTexture(), floor: floorTexture()};
    }
    return textures;
  }

  FG.world = {
    ROOM: ROOM, PALETTE: PALETTE, DIRS: DIRS, WALL: WALL, FLOOR: FLOOR, DOOR: DOOR, CORRIDOR: CORRIDOR,
    key: key, build: build, isRoom: isRoom, centre: centre, pathTo: pathTo, along: along,
    pathLength: pathLength, lit: lit, doorAndCorridor: doorAndCorridor, textures: tex,
    drawApple: drawApple, appleCanvas: appleCanvas, signCanvas: signCanvas
  };
})(typeof window !== "undefined" ? window : globalThis);
