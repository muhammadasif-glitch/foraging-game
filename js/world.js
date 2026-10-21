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

  // REPO_PALETTE of forage/base/renderer.py: the colour of room colour i;
  // js/mazes.js holds the whole list (FG.FILM_PALETTE), these are its first 36
  var PALETTE = FG.FILM_PALETTE || [
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

  /* A game that starts in a food room starts STAND tiles back from its
   * food, which stands in the middle, facing it. */
  var STAND = 1.25;

  function standPoint(M, room, d) {
    var c = centre(M, room);
    return [c[0] - d[1] * STAND, c[1] - d[0] * STAND];
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

  /* Light and shade of a plastered wall, 64 x 64, with a skirting board at
   * the bottom and a moulding at the top. */
  function plasterTexture() {
    var out = new Float32Array(64 * 64), rnd = noise(23);
    var coarse = [];
    for (var k = 0; k < 64; k++) {
      coarse.push(rnd());
    }
    for (var y = 0; y < 64; y++) {
      for (var x = 0; x < 64; x++) {
        var a = coarse[(Math.floor(y / 8) * 8 + Math.floor(x / 8)) % 64];
        var b = coarse[(Math.floor(y / 8) * 8 + Math.floor(x / 8) + 1) % 64];
        var f = (x % 8) / 8;
        var v = 0.9 + 0.06 * (a + (b - a) * f) + 0.035 * rnd();
        if (y >= 58) {
          v = y === 58 ? 0.55 : 0.7 + 0.03 * rnd();
        } else if (y <= 2) {
          v = y === 2 ? 0.78 : 1.02;
        }
        out[y * 64 + x] = v;
      }
    }
    return out;
  }

  /* Where the paintings hang: on every side of every room, 1 painting
   * across 2 wall tiles, in the middle of the wall or beside its door.
   * Returns {at: Int16Array over (tile * 4 + side) giving the place's index
   * or -1, list: [place]}: the tile in front of the wall, the side the wall
   * is on from it (0 east, 1 south, 2 west, 3 north). A place: the room
   * (its index in M.list) and its colour, the side, where the 2 tiles start
   * along the wall, whether the picture runs against the wall's coordinate
   * when seen from the room (flip), the wall itself (on x = wall for east and
   * west, y = wall for south and north) and the first tile in front of it.
   * Place k is side k % 4 of room k / 4 (sides in the order east, south,
   * west, north). */
  var SIDES = ["east", "south", "west", "north"];

  function paintingPlaces(M) {
    var at = new Int16Array(M.W * M.H * 4).fill(-1), list = [];
    M.list.forEach(function (rm, ri) {
      var colour = M.rooms[rm.i][rm.j];
      [[0, 1, 0], [1, 0, 1], [0, -1, 2], [-1, 0, 3]].forEach(function (d) {
        var door = -1;
        if (isRoom(M, rm.i + d[0], rm.j + d[1])) {
          var t = doorAndCorridor(rm.i, rm.j, rm.i + d[0], rm.j + d[1], M.rs, M.cs);
          door = d[1] !== 0 ? t[0][0] - rm.r0 : t[0][1] - rm.c0;
        }
        var from = door === 1 ? 2 : door === 2 ? 0 : 1;
        var side = d[2];
        var k = list.length;
        var wall = side === 0 ? rm.c0 + ROOM : side === 2 ? rm.c0 : side === 1 ? rm.r0 + ROOM : rm.r0;
        var place = {room: ri, colour: colour, side: side, start: (d[1] !== 0 ? rm.r0 : rm.c0) + from,
          // east and north walls run with the coordinate, seen from inside
          flip: side === 1 || side === 2, wall: wall, alongX: d[1] === 0, front: -1};
        list.push(place);
        for (var n = from; n < from + 2; n++) {
          var tile = d[1] !== 0 ? (rm.r0 + n) * M.W + (d[1] > 0 ? rm.c0 + ROOM - 1 : rm.c0) :
            (d[0] > 0 ? rm.r0 + ROOM - 1 : rm.r0) * M.W + rm.c0 + n;
          at[tile * 4 + side] = k;
          if (place.front < 0) {
            place.front = tile;
          }
        }
      });
    });
    return {at: at, list: list};
  }

  var textures = null;
  function tex() {
    if (!textures) {
      textures = {brick: brickTexture(), floor: floorTexture(), plaster: plasterTexture()};
    }
    return textures;
  }

  FG.world = {
    ROOM: ROOM, PALETTE: PALETTE, DIRS: DIRS, WALL: WALL, FLOOR: FLOOR, DOOR: DOOR, CORRIDOR: CORRIDOR,
    key: key, build: build, isRoom: isRoom, centre: centre, STAND: STAND, standPoint: standPoint,
    paintingPlaces: paintingPlaces, SIDES: SIDES, lit: lit, doorAndCorridor: doorAndCorridor, textures: tex
  };
})(typeof window !== "undefined" ? window : globalThis);
