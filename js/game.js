/* 1 game, in the 2D or the 3D view. The world follows js/rules.js, which
 * gives the numbers of the model; every step and every key is recorded.
 *
 * The player walks freely, as in other games, while a key is held:
 *   2D  the arrow keys walk in their direction (2 at once: on the slant).
 *   3D  the up arrow walks where the player looks, the down arrow walks
 *       backwards, the left and right arrows turn (speeding up and slowing
 *       down: a tap turns a few degrees, a hold turns steadily).
 * The walk speeds up and slows down, slides along walls, and doors and
 * corridors guide the player to their middle. The food stands in the way.
 *
 * Steps. The moves are the model's: LEFT, RIGHT, UP, DOWN and STAY, 1 room
 * a step. A move is a step when the player walks onto the floor of the next
 * room: the world changes then, as in the model. Walking out into a door or
 * a corridor and back is no step (it is recorded in walks_back). A stay is a
 * step: every idle_stay_ms with no key held at all (standing still costs
 * energy), or Space, again every idle_stay_ms while it is held. A stay never
 * holds the player up. Turns, holding keys and walking into walls cost
 * nothing and are not steps; they are recorded.
 *
 * Eating. In a food room the player eats on every step, as in the model,
 * until the energy bar is full; then eating stops for the rest of that visit
 * (stomach.when_full "stop"): the food is left, the room does not run down,
 * and nothing is paid. "keep" eats on, as the model does.
 *
 * What the player is shown is what the model's agent knows: the rooms it has
 * been in and, from the first step on, the rooms next to the room it is in;
 * a food room among them shows its food and worth; the level only in the
 * room the player is in (check/map_check.py). New rooms come into light as
 * the player walks into the room they are next to.
 *
 * Paintings (3D). Every wall of every room has a painting (js/art.js), hung
 * anew every game, and beside it a Like plaque: L likes the painting in the
 * middle of the view, a click likes the painting of the plaque clicked, and
 * again un-likes it. Looking is recorded: which painting is in the middle
 * of the view, how far away and how big, every frame (looks) and with the
 * place of the player (track).
 *
 * The music room (both views). 1 room has a gramophone (js/gramophone.js):
 * near it, P or a click on it plays a record, again stops it.
 *
 * Liking and the music cost nothing and do not hold up the stays: standing
 * before a painting is standing still, a stay every idle_stay_ms as ever.
 *
 * The caller hears of every change (g.onChange(record)), so that the game so
 * far is kept and reaches the researchers even if the page is closed. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var R = FG.rules, Wd = FG.world, REC = FG.recorder;

  var KEY_MOVE = {ArrowLeft: "LEFT", ArrowRight: "RIGHT", ArrowUp: "UP", ArrowDown: "DOWN", " ": "STAY",
    Left: "LEFT", Right: "RIGHT", Up: "UP", Down: "DOWN", Spacebar: "STAY"};
  var FACING = ["RIGHT", "DOWN", "LEFT", "UP"];          // facing 0 east, 1 south, 2 west, 3 north
  // keys pressed sooner than this after a game starts are taken as left over
  // from the menu
  var TOO_SOON_MS = 300;
  // how the player moves; written into every game file
  var CONTROLS = {
    "2d": {walk_tiles_per_s: 7, speed_up_tiles_per_s2: 45, slow_down_tiles_per_s2: 60, body_radius_tiles: 0.3},
    "3d": {walk_tiles_per_s: 4.5, back_tiles_per_s: 2.5, speed_up_tiles_per_s2: 16, slow_down_tiles_per_s2: 22,
      turn_degrees_per_s: 130, turn_speed_up_degrees_per_s2: 1000, body_radius_tiles: 0.3}
  };
  // the food stands in the middle of its room, this wide (tiles)
  var FOOD_RADIUS = {cheese: 0.42, bread: 0.32};
  // a room is entered this far onto its floor (tiles)
  var ENTER_TILES = 0.3;
  // doors guide the player when they are this far ahead (tiles), the walk
  // goes nearly their way (cosine), with this pull (a second)
  var GUIDE_LOOK = [0, 0.6, 1.2], GUIDE_COS = 0.8, GUIDE_PULL = 4, GUIDE_SIDE = 1.4, GUIDE_TURN_MAX = 0.6;
  // walking into a wall within SLIDE_TILES of a door slides into the door
  var SLIDE_TILES = 2, SLIDE_SPEED = 3;
  var END_MS = 700;                          // the last step, then the end of the game
  var BOB = 0.011, BOB_TILES = 3.6;          // the head bob: its height and its length
  // the mouse (game.player "mouse", js/mouse.js): the length of its steps in
  // tiles, the small, smooth rise and sway of its view in 3D (once every 2
  // steps, so that the picture never shakes), the most paw prints in 2D, the
  // least time between 2 squeaks, and how long it nibbles
  var MOUSE_STEP = {"2d": 0.7, "3d": 0.6}, MOUSE_BOB = 0.0018, MOUSE_SWAY = 0.01;
  // a character of js/characters.js: the rise and sway of the view through its
  // eyes, and how long its prints stay in 2D
  var FIG_BOB = 0.006, FIG_SWAY = 0.006, PRINT_MS = 1600;
  var MAX_PRINTS = 60, SQUEAK_MS = 1200, EAT_MS = 900;
  var GROW_MS = 700, BITE_MS = 320;
  var LIGHT_MS = 450, HERE_MS = 400;         // new rooms coming into light, the food coming into view
  var QUARTER = Math.PI / 2;
  // the gramophone: how wide it stands, how high it is drawn in 3D, how near
  // the player must be to play it (tiles from its middle)
  var GRAMOPHONE_RADIUS = 0.3, GRAMOPHONE_SIZE = 0.62, GRAMOPHONE_NEAR = 3.2;
  // a frame this long (ms) or longer is counted as this long for looking
  // (after the page was hidden, for example)
  var LONGEST_FRAME_MS = 250;
  // looking at a painting (3D): standing (slower than TILT_STILL tiles a
  // second, turning slower than TILT_TURN radians a second) before a
  // painting up to TILT_FAR tiles away, the view tilts up until the middle
  // of the painting is in the middle of the screen (the horizon at most
  // TILT_MOST below the middle), and, through the eyes, steps back (at most
  // BACK_MOST tiles, never into a wall) until the painting and its plaque
  // fit on the screen with FIT room to spare; in about TILT_IN_S, back in
  // TILT_OUT_S. Only the view moves: the player stays where it is.
  var TILT_STILL = 0.35, TILT_TURN = 0.35, TILT_FAR = 3.5, TILT_MOST = 0.42, TILT_IN_S = 0.45, TILT_OUT_S = 0.25;
  var BACK_MOST = 1, FIT = 1.08;

  function $(id) {
    return document.getElementById(id);
  }

  function round(x, n) {
    var f = Math.pow(10, n);
    return Math.round(x * f) / f;
  }

  function copy(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function levelText(level, show, edges) {
    if (show.level === "bin") {
      return ["empty", "part full", "full"][R.binOf(level, edges)];
    }
    return Math.round(level * 100) + "%";
  }

  function energyColour(share) {
    return share >= 0.5 ? "#34c759" : share >= 0.25 ? "#ffb340" : "#ff5f57";
  }

  function nudge(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function modified(e) {
    return e.ctrlKey || e.altKey || e.metaKey;
  }

  function facingOf(move) {
    return FACING.indexOf(move);
  }

  /* The facing (0 to 3) nearest to an angle: the door within 45 degrees. */
  function quarterOf(angle) {
    return ((Math.round(angle / QUARTER) % 4) + 4) % 4;
  }

  function degrees(angle) {
    var d = round(angle * 180 / Math.PI % 360, 1) + 0;
    return d < 0 ? round(d + 360, 1) : d >= 360 ? 0 : d;
  }

  function smooth(k) {
    k = Math.max(0, Math.min(1, k));
    return k * k * (3 - 2 * k);
  }

  /* g: {number, view ("2d" or "3d"), renderer (draw(scene), and canvas,
   * look(), seen(), hit(x, y), mark(), renderInfo(mark)), settings, layout,
   * seed, layout_seed, gallery_seed, onChange(record)}. Resolves to the
   * record. */
  function play(g) {
    var s = g.settings;
    var three = g.view === "3d";
    // a character of js/characters.js (not the mouse, not the arrow): its
    // own speed (a person's, unless game.same_speed), eyes, steps and sounds
    var CH = FG.characters;
    var FIG = CH && CH.is(s.player) ? CH.INFO[s.player] : null;
    var C = Object.assign({}, CONTROLS[g.view]);
    // its top speed (metres a second) as a share of the game's in 3D (a
    // tile is CH.TILE metres); the same share in 2D
    var SPEED = FIG && !s.same_speed ? FIG.speed / (CH.TILE * CONTROLS["3d"].walk_tiles_per_s) : 1;
    ["walk_tiles_per_s", "back_tiles_per_s", "speed_up_tiles_per_s2", "slow_down_tiles_per_s2"].forEach(function (k) {
      if (C[k] !== undefined) {
        C[k] *= SPEED;
      }
    });
    var maze = R.maze(g.layout.maze);
    var M = Wd.build(g.layout.maze);
    var sp = FG.config.speeds(s.food);
    var names = Object.keys(s.food_rooms);
    var foodRooms = {}, kinds = {};
    names.forEach(function (n) {
      foodRooms[n] = {room: g.layout.food_rooms[n], value: s.food_rooms[n].worth, start: s.food_rooms[n].start_level};
      kinds[n] = FG.config.foodOf(s, n);
    });
    var rand = FG.random.make(g.seed);
    var draws = [];
    var world = new R.World({food_rooms: foodRooms, eat: sp.eat, refill: sp.refill, rule: s.food.rule,
      random_draw: s.food.random_refill, draw_rate: s.food.refill_chance, start_room: g.layout.start_room},
    function () { var d = rand(); draws.push(d); return d; });
    var stomach = new R.Stomach(s.stomach);
    var edges = [s.food.empty_below, s.food.full_above];
    var SND = FG.sound;
    var MOUSE = s.player === "mouse" && !!FG.mouse, VOICE = (MOUSE || FIG) && s.voice;
    // the 3D camera: through the player's eyes, or behind the mouse or the
    // character (a camera of its own height)
    var BEHIND = three && (MOUSE || !!FIG) && g.camera === "behind";
    var CAMERA = three ? (BEHIND ? "behind" : "eyes") : null;
    var CAM = FIG ? FIG.camera : null;
    var STEP = MOUSE_STEP;
    // tiles a metre for a character's steps: in 3D a tile is CH.TILE metres;
    // in 2D its top speed is as far as the view's top speed
    var PER_METRE = FIG ? (three ? 1 / CH.TILE : C.walk_tiles_per_s / FIG.speed) : null;
    if (SND && SND.space) {
      SND.space(three && (MOUSE || FIG) ? "room" : null);
    }
    // the character's own recorded sounds (js/characters.js), or none
    if (SND && SND.use) {
      var model = FIG ? CH.loaded(s.player) : null;
      SND.use(FIG ? s.player : null, model ? model.sounds : null);
    }
    var RAD = C.body_radius_tiles;
    var ART = FG.art, GRAM = FG.gramophone;
    var texts = Object.assign({music_play: "<kbd>P</kbd> play the gramophone", music_stop: "<kbd>P</kbd> stop the music"},
      (FG.SETTINGS && FG.SETTINGS.texts) || {});
    var gallerySeed = g.gallery_seed === undefined ? FG.random.derive(g.seed, 2) : g.gallery_seed;

    var room = g.layout.start_room.slice();
    var t = 0;
    var moves = 0;                // the steps that moved into the next room
    var visited = {}, known = {}, found = {};
    var foodAt = {};
    names.forEach(function (n) { foodAt[Wd.key(g.layout.food_rooms[n])] = n; });
    // the 3D view starts facing a door
    var facing0 = three ? facingOf(maze.legal(room).filter(function (m) { return m !== "STAY"; })[0]) : 0;
    var start = Wd.centre(M, room);
    var scene = {maze: M, x: start[0], y: start[1], angle: facing0 * QUARTER, facing: facing0, heading: 0,
      lit: null, light: new Float32Array(M.W * M.H), food: [], here: null, crumbs: [], bob: 0, sway: 0, tilt: 0,
      back: 0,
      eye: MOUSE ? FG.mouse.EYE : FIG ? FIG.eye : 0.5, camera: CAMERA, cam: null,
      mouse: MOUSE ? {phase: 0, move: 0, t: 0, eat: false, turn: 0} : null,
      figure: FIG ? {name: s.player, phase: 0, move: 0, t: 0, eat: false, turn: 0, back: false} : null, prints: [],
      now: 0};
    var eaten = 0;
    var steps = [], turns = [], back = [];
    var over = false;
    var shownAt = null;           // when the player could last act: the step before
    var walls = 0, others = 0, turnsBefore = 0, stops = 0;
    var holding = {};             // key code -> the rows its press made
    var down = {};                // key code -> {key, code, t, order}
    var order = 0;
    var vx = 0, vy = 0, omega = 0, bobPhase = 0, walked = 0;
    var gait = 0, lastEat = -1e9, lastSqueak = -1e9;
    var camBack = null;           // how far the camera is behind the mouse (BEHIND)
    if (BEHIND) {
      camBack = FG.mouse.cameraBack(M, scene.x, scene.y, scene.angle, CAM && CAM.back);
      scene.cam = FG.mouse.camera(scene.x, scene.y, scene.angle, camBack, CAM);
    }
    var moveStart = null;         // the walk since the player last stood still: {t, press, key, code, held, angle}
    var away = null;              // the player out of the floor of its room: {left_at, side, furthest}
    var leftAt = null;            // when the player last left the floor of its room
    var crossing = null;          // another room whose floor the player has been on since the last step
    var turning = null, ending = null;
    var IDLE_MS = s.idle_stay_ms;
    var keysDown = {};            // every key held now, for the idle clock
    var idleSince = null;         // since when no key has been held (performance.now)
    var lastSpace = null;         // when Space last made a stay
    var visitFull = false;        // the energy bar has been full during this visit of a food room
    var STOP_FULL = s.stomach.when_full !== "keep";
    var COUNT_MOVES = s.count_steps !== "all";
    var TRACK_MS = s.track_ms || 0;
    var track = {every_ms: TRACK_MS,
      fields: ["t", "x", "y", "angle", "step", "look", "look_d", "look_share", "music", "tilt", "back"],
      rows: []};
    var nextTrack = null;         // when the next place of the player is recorded (performance.now)
    var lastBump = -1e9;
    var fade = null;              // {from, to, t0}: new rooms coming into light
    var shown = {};               // food room -> {level, from, to, t0, ms}: the level drawn
    var left = {};                // food room -> its level when the player last left it
    var hereName = null, hereFade = 1, hereT0 = null;
    var lastFrame = null, dirty = true;
    var soundToggles = [];

    // the paintings (3D): the picture of every place, the places liked
    var places = three ? Wd.paintingPlaces(M) : null;
    var REAL = three && s.paintings && ART && ART.count() > 0;
    var gallery = three && ART ? {pics: ART.hang(places.list, FG.random.make(gallerySeed), REAL),
      liked: new Uint8Array(places.list.length), likes: REAL && s.likes} : null;
    scene.gallery = gallery;
    var looks = {}, lookAt = null, likes = [], clicks = [];
    var renderMark = three && g.renderer.mark ? g.renderer.mark() : 0;

    // the music room: a room that is neither the start nor a food room
    var musicRand = FG.random.make(FG.random.derive(gallerySeed, 1));
    var musicRoom = null, pieces = [], nextPiece = 0, playingNow = null, player = null;
    if (s.music_room && GRAM && FG.MUSIC && FG.MUSIC.length) {
      var notFree = [g.layout.start_room].concat(names.map(function (n) { return g.layout.food_rooms[n]; }));
      var freeRooms = maze.rooms().filter(function (r) {
        return !notFree.some(function (q) { return R.sameRoom(q, r); });
      });
      if (freeRooms.length) {
        musicRoom = musicRand.pick(freeRooms);
        pieces = FG.MUSIC.map(function (m, i) { return i; });
        for (var pi = pieces.length - 1; pi > 0; pi--) {
          var pj = musicRand.int(pi + 1), pt = pieces[pi];
          pieces[pi] = pieces[pj];
          pieces[pj] = pt;
        }
        player = GRAM.player();
      }
    }
    var musicAt = musicRoom ? Wd.centre(M, musicRoom) : null;
    scene.music = musicRoom ? {room: musicRoom, x: musicAt[0], y: musicAt[1], playing: false, t0: 0} : null;
    var music = musicRoom ? {room: R.roomName(musicRoom), pieces: pieces.map(function (i) { return FG.MUSIC[i].id; }),
      plays: []} : null;
    var record = {
      number: g.number, view: g.view, camera: CAMERA, maze: g.layout.maze, seed: g.seed, layout_seed: g.layout_seed,
      layout: layoutNames(g.layout), settings: s, speeds: sp, food_kinds: copy(kinds),
      controls: (function () {
        var c = copy(C);
        c.idle_stay_ms = s.idle_stay_ms;
        c.speed_factor = SPEED;
        c.eye = three ? scene.eye : null;
        // a character's steps grow with its speed: at full speed
        c.step_tiles = MOUSE ? STEP[g.view] : FIG ? CH.stepTiles(s.player, 1, PER_METRE) : null;
        return c;
      })(),
      started: new Date().toISOString(), started_at: REC.now(), ended: null, steps: steps, turns: turns,
      walks_back: back, draws: draws, sound: {on_at_start: SND ? SND.on : null, toggles: soundToggles},
      track: TRACK_MS ? track : null, maze_def: mazeDef(g.layout.maze), path: null, known_rooms: null,
      gallery_seed: gallerySeed, gallery: null, looks: null, likes: three ? likes : null, clicks: clicks,
      music: music, render: null,
      result: null
    };
    if (gallery) {
      record.gallery = {source: REAL ? "paintings" : "landscapes", likes: gallery.likes,
        places: places.list.map(function (pl, k) {
          var rm = M.list[pl.room], p = gallery.pics[k], info = ART.info(p);
          return {place: k, room: R.roomName([rm.i, rm.j]), side: Wd.SIDES[pl.side],
            painting: info ? info.id : "landscape_" + (-1 - p), artemis: info ? info.artemis : null};
        })};
    }

    function levels() {
      var out = {};
      names.forEach(function (n) { out[n] = world.level[n]; });
      return out;
    }

    function allowed() {
      if (t === 0 && s.first_step_stay) {
        return ["STAY"];
      }
      return maze.legal(room);
    }

    /* The steps used up: only the moves, or every step as in the model. */
    function used() {
      return COUNT_MOVES ? moves : t;
    }

    /* The room the player is in, and, after the first step, the rooms next
     * to it through a door, as the model's agent adds them to its map.
     * Returns the rooms new to the player and the food rooms among them. */
    function learn(near) {
      visited[Wd.key(room)] = true;
      var add = [room];
      if (near) {
        maze.legal(room).forEach(function (m) {
          if (m !== "STAY") {
            add.push(maze.next(room, m));
          }
        });
      }
      var out = {rooms: [], food: []};
      add.forEach(function (r) {
        var k = Wd.key(r);
        if (!known[k]) {
          known[k] = true;
          out.rooms.push(R.roomName(r));
          if (foodAt[k] !== undefined) {
            out.food.push(foodAt[k]);
          }
        }
      });
      return out;
    }

    /* What the player knows changed: the new rooms come into light over
     * the next moment (at once at the start), the food signs with them. */
    function knowledgeChanged(now) {
      scene.lit = Wd.lit(M, known, visited);
      var to = new Float32Array(scene.lit.length);
      for (var i = 0; i < to.length; i++) {
        to[i] = scene.lit[i];
      }
      if (now) {
        scene.light = to;
        fade = null;
      } else {
        fade = {from: scene.light.slice(), to: to, t0: performance.now()};
      }
      scene.food = names.filter(function (n) { return known[Wd.key(g.layout.food_rooms[n])]; })
        .map(function (n) { return {room: g.layout.food_rooms[n], worth: s.food_rooms[n].worth, kind: kinds[n]}; });
      wantImages();
    }

    /* The images of the paintings to have ready: those of the room the
     * player is in, sharp, and of the rooms next to it. */
    function wantImages() {
      if (!REAL) {
        return;
      }
      var list = [], here = M.index[Wd.key(room)];
      var mine = [0, 1, 2, 3].map(function (sd) { return gallery.pics[here * 4 + sd]; });
      mine.forEach(function (p) { list.push({p: p, size: "small"}); });
      mine.forEach(function (p) { list.push({p: p, size: "large"}); });
      maze.legal(room).forEach(function (m) {
        if (m === "STAY") {
          return;
        }
        var ri = M.index[Wd.key(maze.next(room, m))];
        for (var sd = 0; sd < 4; sd++) {
          list.push({p: gallery.pics[ri * 4 + sd], size: "small"});
        }
      });
      ART.want(list);
    }

    function updateLight(now) {
      if (!fade) {
        return;
      }
      var k = Math.min(1, (now - fade.t0) / LIGHT_MS), f = smooth(k), a = fade.from, b = fade.to, out = scene.light;
      for (var i = 0; i < out.length; i++) {
        out[i] = a[i] + (b[i] - a[i]) * f;
      }
      if (k >= 1) {
        fade = null;
      }
      dirty = true;
    }

    /* The level drawn for a food room moves to its level over ms. */
    function showLevel(n, from, to, ms) {
      shown[n] = {level: from, from: from, to: to, t0: performance.now(), ms: ms};
      dirty = true;
    }

    function setHere(n, fadeIn) {
      hereName = n;
      hereFade = fadeIn ? 0 : 1;
      hereT0 = fadeIn ? performance.now() : null;
      if (n !== null && !shown[n]) {
        showLevel(n, world.level[n], world.level[n], 0);
      }
    }

    function sceneHere() {
      scene.here = hereName === null ? null :
        {room: g.layout.food_rooms[hereName], level: shown[hereName].level, fade: hereFade, kind: kinds[hereName]};
    }

    function crumbs(n, count) {
      var c = Wd.centre(M, g.layout.food_rooms[n]);
      for (var i = 0; i < count; i++) {
        var a = (i * 2.4 + t * 0.7) % (2 * Math.PI), r = 0.05 + 0.04 * (i % 3);
        scene.crumbs.push({x: c[0] + Math.cos(a) * r, y: c[1] + Math.sin(a) * r, z: 0.16 + 0.02 * (i % 4),
          vx: Math.cos(a) * (0.5 + 0.15 * (i % 3)), vy: Math.sin(a) * (0.5 + 0.15 * (i % 3)), vz: 0.4 + 0.1 * (i % 2),
          kind: kinds[n], n: i, rest: 0});
      }
      dirty = true;
    }

    function hud() {
      var e = stomach.energy, share = e / stomach.size;
      $("energyBar").style.width = Math.max(0, Math.min(100, share * 100)) + "%";
      $("energyBar").style.background = energyColour(share);
      $("energy").textContent = round(e, 1).toFixed(1) + " / " + round(stomach.size, 1);
      $("eaten").textContent = round(eaten, 1).toFixed(1);
      $("steps").textContent = s.steps - used();
      $("stepsLabel").textContent = COUNT_MOVES ? "moves left" : "steps left";
      $("stepsItem").hidden = !s.show.steps_left;
      var n = world.nameAt(room);
      $("hereItem").hidden = n === null;
      // full in this food room: no more eating here until the player walks out
      // (the sign takes the place of the food's worth, to keep the bar short)
      var fullHere = n !== null && STOP_FULL && visitFull;
      $("fullSign").hidden = !fullHere;
      $("worth").hidden = fullHere;
      if (n !== null) {
        $("here").textContent = levelText(world.level[n], s.show, edges);
        $("worth").textContent = kinds[n] + ", worth " + s.food_rooms[n].worth;
      }
    }

    function draw() {
      sceneHere();
      g.renderer.draw(scene);
      dirty = false;
    }

    /* Only the mouse, which moves also while it stands (its whiskers, or all
     * of it with the camera behind it): the 3D view draws it anew over the
     * picture it has. */
    function drawMouse() {
      g.renderer.draw(scene, true);
    }

    function row(extra) {
      var n = world.nameAt(room);
      var base = {
        step: t, room: R.roomName(room), energy: stomach.energy, levels: levels(),
        in_food_room: n, seen: n === null ? null : world.level[n],
        shown: n === null ? null : levelText(world.level[n], s.show, edges),
        energy_shown: round(stomach.energy, 1), eaten: eaten, moves: moves, steps_left: s.steps - used(),
        facing: FACING[scene.facing]
      };
      Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
      return base;
    }

    var summed = null;            // brings the looking and the sharpness so far into the record
    function changed() {
      if (summed) {
        summed();
      }
      if (g.onChange) {
        g.onChange(record);
      }
    }

    // ---------------------------------------------------------- the body
    /* Where the player can be: not in a wall, not in the food of a room it
     * knows, and before the first stay not out of the start room when the
     * first step must be a stay. */
    function solidTile(x, y) {
      var cx = Math.floor(x), cy = Math.floor(y);
      if (cx < 0 || cy < 0 || cx >= M.W || cy >= M.H) {
        return true;
      }
      var kd = M.kind[cy * M.W + cx];
      if (kd === Wd.WALL) {
        return true;
      }
      return t === 0 && s.first_step_stay && kd !== Wd.FLOOR;
    }

    function free(x, y) {
      if (solidTile(x - RAD, y - RAD) || solidTile(x + RAD, y - RAD) || solidTile(x - RAD, y + RAD) ||
          solidTile(x + RAD, y + RAD)) {
        return false;
      }
      for (var i = 0; i < names.length; i++) {
        var fr = g.layout.food_rooms[names[i]];
        if (!known[Wd.key(fr)]) {
          continue;
        }
        var c = Wd.centre(M, fr), rr = (kinds[names[i]] === "bread" ? FOOD_RADIUS.bread : FOOD_RADIUS.cheese) + RAD;
        if ((x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1]) < rr * rr) {
          return false;
        }
      }
      if (musicRoom && known[Wd.key(musicRoom)]) {
        var gr = GRAMOPHONE_RADIUS + RAD;
        if ((x - musicAt[0]) * (x - musicAt[0]) + (y - musicAt[1]) * (y - musicAt[1]) < gr * gr) {
          return false;
        }
      }
      return true;
    }

    /* The room whose floor the player stands on, at least a little way in;
     * null in a door or a corridor. */
    function roomUnder(x, y) {
      var cx = Math.floor(x), cy = Math.floor(y);
      if (cx < 0 || cy < 0 || cx >= M.W || cy >= M.H || M.kind[cy * M.W + cx] !== Wd.FLOOR) {
        return null;
      }
      var rm = M.list[M.roomAt[cy * M.W + cx]];
      var m = ENTER_TILES;
      if (x < rm.c0 + m || x > rm.c0 + Wd.ROOM - m || y < rm.r0 + m || y > rm.r0 + Wd.ROOM - m) {
        return null;
      }
      return [rm.i, rm.j];
    }

    /* The room of the floor under the player, however little way in. */
    function floorRoom(x, y) {
      var cx = Math.floor(x), cy = Math.floor(y);
      if (cx < 0 || cy < 0 || cx >= M.W || cy >= M.H || M.kind[cy * M.W + cx] !== Wd.FLOOR) {
        return null;
      }
      var rm = M.list[M.roomAt[cy * M.W + cx]];
      return [rm.i, rm.j];
    }

    function onFloorOf(r, x, y) {
      var rm = M.list[M.index[Wd.key(r)]];
      return x >= rm.c0 && x <= rm.c0 + Wd.ROOM && y >= rm.r0 && y <= rm.r0 + Wd.ROOM;
    }

    /* Doors and corridors guide the player through: across them the player
     * is drawn to their middle line, and in 3D the view turns gently along
     * them, when it already looks nearly that way. */
    function guide(dt, speed) {
      if (speed < 0.2) {
        return;
      }
      var ux = vx / speed, uy = vy / speed;
      var best = null;
      for (var k = 0; k < GUIDE_LOOK.length; k++) {
        var ax = scene.x + ux * GUIDE_LOOK[k], ay = scene.y + uy * GUIDE_LOOK[k];
        var cx = Math.floor(ax), cy = Math.floor(ay);
        if (cx < 0 || cy < 0 || cx >= M.W || cy >= M.H) {
          break;
        }
        var kd = M.kind[cy * M.W + cx];
        if (kd === Wd.DOOR || kd === Wd.CORRIDOR) {
          best = {cx: cx, cy: cy, look: GUIDE_LOOK[k]};
          break;
        }
        if (kd === Wd.WALL) {
          break;
        }
      }
      if (!best) {
        return;
      }
      // which way the door runs: along x if open to its left and right
      var open = function (x, y) { return x >= 0 && y >= 0 && x < M.W && y < M.H && M.kind[y * M.W + x] !== Wd.WALL; };
      var alongX = open(best.cx - 1, best.cy) && open(best.cx + 1, best.cy);
      var dirAx = alongX ? (ux >= 0 ? 0 : Math.PI) : (uy >= 0 ? QUARTER : -QUARTER);
      var forward = alongX ? Math.abs(ux) : Math.abs(uy);
      if (forward < GUIDE_COS) {
        return;
      }
      // drawn to the middle line, at most GUIDE_SIDE tiles a second
      var most = GUIDE_SIDE * dt * Math.min(1, speed / C.walk_tiles_per_s);
      var off = alongX ? best.cy + 0.5 - scene.y : best.cx + 0.5 - scene.x;
      var by = Math.max(-most, Math.min(most, off * Math.min(1, dt * GUIDE_PULL)));
      if (alongX && free(scene.x, scene.y + by)) {
        scene.y += by;
      } else if (!alongX && free(scene.x + by, scene.y)) {
        scene.x += by;
      }
      if (three && !turning && Math.abs(omega) < 0.05) {
        var want = Math.abs(Math.atan2(Math.sin(dirAx - scene.angle), Math.cos(dirAx - scene.angle))) < QUARTER ?
          dirAx : dirAx + Math.PI;
        var diff = Math.atan2(Math.sin(want - scene.angle), Math.cos(want - scene.angle));
        if (Math.abs(diff) < GUIDE_TURN_MAX) {
          scene.angle += diff * Math.min(1, dt * 3.2);
        }
      }
    }

    // ---------------------------------------------------------- keys held
    function release(code, at, how) {
      var rows = holding[code];
      if (rows) {
        rows.forEach(function (r) {
          r.released_at = at;
          r.hold_ms = round(at - r.key_at, 3);
          if (how) {
            r.released_by = how;
          }
        });
        delete holding[code];
        changed();
      }
      if (turning && turning.code === code) {
        turning.held = false;
        turning.rec.held_ms = round(at - turning.rec.t, 3);
      }
      delete down[code];
    }

    function isDown(name) {
      return Object.keys(down).some(function (c) { return KEY_MOVE[down[c].key] === name; });
    }

    /* The movement key held down that was pressed last. */
    function lastMoveKey() {
      var best = null;
      Object.keys(down).forEach(function (c) {
        var d = down[c], key = KEY_MOVE[d.key];
        var moves = three ? key === "UP" || key === "DOWN" : key === "UP" || key === "DOWN" || key === "LEFT" ||
          key === "RIGHT";
        if (moves && (!best || d.order > best.order)) {
          best = d;
        }
      });
      return best;
    }

    // ---------------------------------------------------------- turning (3D)
    function startTurn(dir, e, entry) {
      if (turning) {
        endTurn();
      }
      var rec = {t: entry.t, step: t, key: e.key, from: FACING[quarterOf(scene.angle)], to: null,
        from_angle: degrees(scene.angle), to_angle: null, ms: null, held_ms: null};
      turns.push(rec);
      turnsBefore += 1;
      turning = {dir: dir, code: e.code || e.key, held: true, rec: rec};
      changed();
    }

    function endTurn() {
      var rec = turning.rec;
      rec.to = FACING[quarterOf(scene.angle)];
      rec.to_angle = degrees(scene.angle);
      rec.ms = round(REC.now() - rec.t, 3);
      turning = null;
      changed();
    }

    /* Turning speeds up while a turning key is held and slows down when it
     * is let go, so that a tap turns a few degrees and a hold turns
     * steadily. */
    function updateTurn(dt) {
      var want = 0;
      if (turning && turning.held) {
        want = turning.dir * C.turn_degrees_per_s * Math.PI / 180;
      }
      var acc = C.turn_speed_up_degrees_per_s2 * Math.PI / 180 * dt;
      omega += Math.max(-acc, Math.min(acc, want - omega));
      if (Math.abs(omega) > 1e-4) {
        scene.angle += omega * dt;
        scene.facing = quarterOf(scene.angle);
        dirty = true;
      } else {
        omega = 0;
      }
      if (turning && !turning.held && omega === 0) {
        endTurn();
      }
    }

    /* A step taken while a turn goes on: the turn so far ends at the step
     * (endAtStep, before it), and the rest is a turn of its own before the
     * next step (goOn, after it). */
    function endAtStep() {
      if (!turning) {
        return;
      }
      var old = turning.rec;
      old.to = FACING[quarterOf(scene.angle)];
      old.to_angle = degrees(scene.angle);
      old.ms = round(REC.now() - old.t, 3);
      old.split = true;
    }

    function goOn() {
      if (!turning) {
        return;
      }
      var old = turning.rec;
      var rec = {t: REC.now(), step: t, key: old.key, from: old.to, to: null, from_angle: old.to_angle,
        to_angle: null, ms: null, held_ms: null, continued: true};
      turns.push(rec);
      turnsBefore += 1;
      turning.rec = rec;
    }

    return new Promise(function (resolve) {
      REC.setPhase("game " + g.number);
      var first = learn(false);
      knowledgeChanged(true);
      steps.push(row({shown_at: null, key_at: null, decision_ms: null, entered_at: null, arrived_at: null,
        left_at: null, released_at: null, hold_ms: null, key: null, move: null, held: false, press_at: null,
        stops: 0, walked_tiles: 0, room_from: null, room_to: R.roomName(room), legal: allowed(),
        facing_before: null, angle_before: null, angle: three ? degrees(scene.angle) : null,
        turns_before: 0, walls_before: 0, other_keys_before: 0,
        paid: 0, cost: 0, food_lost: 0, change: null, draw: null,
        found: null, known_new: first.rooms, known_food_new: first.food, corner: false,
        events: first.food.map(function (n) { return {type: "known", room: n}; })}));
      if (world.nameAt(room) !== null) {
        found[Wd.key(room)] = true;
        steps[0].found = world.nameAt(room);
        steps[0].events.push({type: "found", room: world.nameAt(room)});
        setHere(world.nameAt(room), false);
        // stand before the food, facing it
        var p = Wd.standPoint(M, room, Wd.DIRS[FACING[facing0]]);
        scene.x = p[0];
        scene.y = p[1];
      }
      $("gain").textContent = "";
      hud();
      draw();
      changed();
      var stopSound = SND ? SND.listen(function (entry) {
        soundToggles.push({t: entry.t, step: t, on: entry.on, by: entry.by});
        changed();
      }) : function () {};
      var stopImages = ART ? ART.onLoad(function () { dirty = true; }) : function () {};
      summed = function () {
        record.looks = looksSummary();
        if (three && g.renderer.renderInfo) {
          record.render = g.renderer.renderInfo(renderMark);
        }
      };
      if (g.renderer.canvas) {
        g.renderer.canvas.addEventListener("mousedown", onClick);
        g.renderer.canvas.addEventListener("mousemove", onHover);
      }
      if (player) {
        player.onEnd(function () {
          if (playingNow) {
            stopMusic("ended", REC.now());
          }
        });
        player.onFail(function (piece, why) {
          if (playingNow) {
            stopMusic("failed: " + why, REC.now());
          }
        });
      }

      // ------------------------------------------------------ paintings
      function placeInfo(k) {
        var pl = places.list[k], rm = M.list[pl.room], info = ART.info(gallery.pics[k]);
        return {place: k, painting: info ? info.id : "landscape_" + (-1 - gallery.pics[k]),
          room: R.roomName([rm.i, rm.j]), side: Wd.SIDES[pl.side]};
      }

      function lookStats(k) {
        if (!looks[k]) {
          var o = placeInfo(k);
          o.look_ms = 0;
          o.looks = 0;
          o.seen_ms = 0;
          o.first_seen_at = null;
          o.first_look_at = null;
          o.nearest = null;
          o.liked = false;
          o.likes = 0;
          looks[k] = o;
        }
        return looks[k];
      }

      /* A painting liked or un-liked: by "L" (the painting in the middle of
       * the view) or "click" (its plaque). */
      function like(k, by, at, d) {
        gallery.liked[k] = gallery.liked[k] ? 0 : 1;
        var on = !!gallery.liked[k];
        var o = placeInfo(k);
        o.t = at;
        o.step = t;
        o.liked = on;
        o.by = by;
        o.d = d === null || d === undefined ? null : round(d, 2);
        likes.push(o);
        var st = lookStats(k);
        st.liked = on;
        st.likes += 1;
        dirty = true;
        changed();
        return on ? "like" : "unlike";
      }

      /* Looking: the painting in the middle of the view, and every painting
       * seen, for the time of this frame. */
      function updateLooks(ms) {
        if (!gallery || !g.renderer.look) {
          return;
        }
        var lk = g.renderer.look(), seen = g.renderer.seen ? g.renderer.seen() : {};
        var at = REC.now();
        Object.keys(seen).forEach(function (k) {
          if (seen[k] > 0) {
            var st = lookStats(Number(k));
            st.seen_ms += ms;
            if (st.first_seen_at === null) {
              st.first_seen_at = at;
            }
          }
        });
        var k = lk ? lk.place : null;
        if (k !== null) {
          var st = lookStats(k);
          st.look_ms += ms;
          if (lookAt !== k) {
            st.looks += 1;
          }
          if (st.first_look_at === null) {
            st.first_look_at = at;
          }
          st.nearest = st.nearest === null ? round(lk.d, 2) : Math.min(st.nearest, round(lk.d, 2));
        }
        lookAt = k;
      }

      function looksSummary() {
        if (!gallery) {
          return null;
        }
        return Object.keys(looks).map(Number).sort(function (a, b) { return a - b; }).map(function (k) {
          var o = copy(looks[k]);
          o.look_ms = round(o.look_ms, 1);
          o.seen_ms = round(o.seen_ms, 1);
          return o;
        });
      }

      // ------------------------------------------------------ the music
      function nearGramophone() {
        return musicRoom && known[Wd.key(musicRoom)] &&
          Math.hypot(scene.x - musicAt[0], scene.y - musicAt[1]) <= GRAMOPHONE_NEAR;
      }

      function startMusic(by, at) {
        var piece = FG.MUSIC[pieces[nextPiece % pieces.length]];
        nextPiece += 1;
        if (SND && !SND.on) {
          // the player asks for music: the sound comes on
          SND.set(true, by === "click" ? "gramophone" : "P");
        }
        playingNow = {piece: piece.id, started_at: at, step: t, by: by, stopped_at: null, stopped_by: null,
          played_s: null};
        music.plays.push(playingNow);
        scene.music.playing = true;
        scene.music.t0 = performance.now();
        player.play(piece);
        player.set(GRAM.loudness(Math.hypot(scene.x - musicAt[0], scene.y - musicAt[1])), SND && !SND.on);
        if (SND && SND.duck) {
          SND.duck(true);
        }
        $("nowPlaying").textContent = "\u266a " + piece.composer + ": " + piece.piece + " \u00b7 " + piece.performer +
          " \u00b7 " + piece.licence;
        $("nowPlaying").hidden = false;
        dirty = true;
        changed();
        return "music on";
      }

      function stopMusic(how, at) {
        var played = player ? player.at() : 0;
        if (player && how !== "ended") {
          player.stop();
        }
        if (SND && SND.duck) {
          SND.duck(false);
        }
        playingNow.stopped_at = at;
        playingNow.stopped_by = how;
        playingNow.played_s = round(played, 1);
        playingNow = null;
        scene.music.playing = false;
        $("nowPlaying").hidden = true;
        dirty = true;
        changed();
        return "music off";
      }

      function gramophone(by, at) {
        if (!musicRoom) {
          return "ignored: no music room";
        }
        if (!nearGramophone()) {
          return "ignored: not at the gramophone";
        }
        return playingNow ? stopMusic(by, at) : startMusic(by, at);
      }

      /* The keys of the paintings and the music: L, P. */
      function extraKey(low, entry) {
        if (low === "l") {
          if (!gallery || !gallery.likes) {
            return "ignored: no likes";
          }
          var lk = g.renderer.look ? g.renderer.look() : null;
          if (!lk) {
            return "ignored: no painting in view";
          }
          return like(lk.place, "L", entry.t, lk.d);
        }
        return gramophone("P", entry.t);
      }

      function onClick(e) {
        if (over || shownAt === null || e.button !== 0) {
          return;
        }
        var at = REC.at(e.timeStamp);
        var h = g.renderer.hit ? g.renderer.hit(e.offsetX, e.offsetY) : null;
        var c = {t: at, step: t, x: Math.round(e.offsetX), y: Math.round(e.offsetY), on: h ? h.kind : null,
          place: h && h.place !== null && h.place !== undefined ? h.place : null, outcome: null};
        clicks.push(c);
        if (h && h.kind === "plaque" && gallery && gallery.likes) {
          c.outcome = like(h.place, "click", at, h.d);
        } else if (h && h.kind === "gramophone") {
          c.outcome = gramophone("click", at);
        } else {
          c.outcome = "nothing";
        }
        e.preventDefault();
        changed();
      }

      function onHover(e) {
        var h = !over && g.renderer.hit ? g.renderer.hit(e.offsetX, e.offsetY) : null;
        var on = h && ((h.kind === "plaque" && gallery && gallery.likes) || (h.kind === "gramophone" && nearGramophone()));
        g.renderer.canvas.style.cursor = on ? "pointer" : "";
      }

      /* The gramophone and its notes, for the views; the music as loud as
       * the player is near; the hint to play it. */
      function updateMusic() {
        if (!musicRoom) {
          return;
        }
        var d = Math.hypot(scene.x - musicAt[0], scene.y - musicAt[1]);
        if (player && playingNow) {
          player.set(GRAM.loudness(d), SND && !SND.on);
        }
        var ex = [];
        if (three) {
          ex.push({x: musicAt[0], y: musicAt[1], pic: GRAM.sprite(), size: GRAMOPHONE_SIZE, hit: "gramophone"});
          if (playingNow) {
            GRAM.rising(musicAt[0], musicAt[1], scene.music.t0, performance.now()).forEach(function (n) {
              ex.push({x: n.x, y: n.y, pic: GRAM.note(n.n), size: n.size, lift: n.lift, fade: n.fade});
            });
          }
        }
        scene.extras = ex;
        if (playingNow && known[Wd.key(musicRoom)]) {
          dirty = true;                      // the notes rise
        }
        var near = nearGramophone() && !over;
        var hint = $("gameHint");
        if (near) {
          var txt = playingNow ? texts.music_stop : texts.music_play;
          if (hint.innerHTML !== txt) {
            hint.innerHTML = txt;
          }
        }
        hint.hidden = !near;
      }
      REC.shown().then(function (at) {
        shownAt = at;
        steps[0].shown_at = at;
        steps[0].arrived_at = at;
      });
      requestAnimationFrame(frame);

      function finish(how) {
        over = true;
        FG.game.where = function () { return null; };
        if (turning) {
          endTurn();
        }
        if (playingNow) {
          stopMusic("game over", REC.now());
        }
        if (player) {
          player.close();
        }
        REC.listen(null);
        stopSound();
        stopImages();
        if (g.renderer.canvas) {
          g.renderer.canvas.removeEventListener("mousedown", onClick);
          g.renderer.canvas.removeEventListener("mousemove", onHover);
          g.renderer.canvas.style.cursor = "";
        }
        $("nowPlaying").hidden = true;
        $("gameHint").hidden = true;
        root.removeEventListener("blur", onBlur);
        record.looks = looksSummary();
        if (three && g.renderer.renderInfo) {
          record.render = g.renderer.renderInfo(renderMark);
        }
        Object.keys(holding).forEach(function (code) { delete holding[code]; });
        record.ended = ended(record, how, REC.now());
        wayFields(record);
        record.result = modelResult(record);
        if (SND) {
          SND.end();
        }
        changed();
        resolve(record);
      }

      function bump() {
        if (SND) {
          SND.bump();
        }
        voice("oof");
      }

      /* A squeak of the mouse, at most 1 every SQUEAK_MS. */
      function voice(kind) {
        var now = performance.now();
        if (!VOICE || !SND || now - lastSqueak < SQUEAK_MS) {
          return;
        }
        lastSqueak = now;
        if (FIG && SND.voice) {
          SND.voice(FIG.sound.voice, kind);
        } else {
          SND.squeak(kind);
        }
      }

      /* A step of the mouse or a character: the sound of its feet (harder on
       * the stone of a corridor or door than on the floor of a room) and, in
       * 2D, its print. */
      function mouseStep(n) {
        var kd = M.kind[Math.floor(scene.y) * M.W + Math.floor(scene.x)];
        var hard = kd === Wd.CORRIDOR || kd === Wd.DOOR;
        if (SND) {
          if (FIG && SND.footstep) {
            SND.footstep(FIG.sound.steps, hard, Math.min(1, Math.hypot(vx, vy) / C.walk_tiles_per_s));
          } else {
            SND.patter(false, hard);
          }
          if (three) {
            SND.space(hard ? "corridor" : "room");
          }
        }
        if (!three) {
          var a = scene.heading, side = n % 2 ? 1 : -1;
          // (a character's feet about 0.1 m from its middle, as drawn in 2D)
          var wide = FIG ? 0.1 * Math.min(1, FIG.height / 1.2) * FIG.zoom2d / CH.TILE : 0.2, aback = FIG ? 0.05 : 0.3;
          scene.prints.push({x: scene.x - Math.sin(a) * side * wide - Math.cos(a) * aback,
            y: scene.y + Math.cos(a) * side * wide - Math.sin(a) * aback, a: a, t0: performance.now(),
            kind: FIG ? FIG.print : null});
          if (scene.prints.length > MAX_PRINTS) {
            scene.prints.shift();
          }
        }
      }

      /* Squeaks for what a step brought: a food room found, a full bar. */
      /* Eating: the mouse nibbles, a person crunches, a dog chomps. */
      function eatSound(amount) {
        var how = FIG ? FIG.sound.eat : MOUSE ? "nibble" : "crunch";
        if (SND.eat) {
          SND.eat(how, amount);
        } else if (SND[how]) {
          SND[how](amount);
        } else {
          SND.crunch(amount);
        }
      }

      function voiceFor(row) {
        if (row.found) {
          voice("found");
        } else if (row.events.some(function (ev) { return ev.type === "full"; })) {
          voice("full");
        }
      }

      // where the player is now, for the browser check (null between games)
      FG.game.where = function () {
        var lk = gallery && g.renderer.look ? g.renderer.look() : null;
        return over ? null : {x: scene.x, y: scene.y, angle: three ? degrees(scene.angle) : null, room: R.roomName(room),
          look: lk ? lk.place : null};
      };

      REC.listen(function (e, entry) {
        var code = e.code || e.key;
        var low = typeof e.key === "string" && e.key.length === 1 ? e.key.toLowerCase() : null;
        if (low === "l" || low === "p") {
          // free, and they do not hold up the stays: not kept as held keys
          if (e.type === "keyup") {
            return undefined;
          }
          if (e.repeat) {
            return "ignored: repeat";
          }
          if (modified(e)) {
            return "ignored: with Ctrl, Alt or Meta";
          }
          if (over || shownAt === null || ending) {
            return "ignored: busy";
          }
          return extraKey(low, entry);
        }
        if (e.type === "keyup") {
          delete keysDown[code];
          if (!Object.keys(keysDown).length) {
            idleSince = performance.now();
          }
          release(code, entry.t);
          return undefined;
        }
        if (e.repeat) {
          return "ignored: repeat";
        }
        keysDown[code] = true;
        idleSince = null;
        if (modified(e)) {
          return "ignored: with Ctrl, Alt or Meta";
        }
        if ((e.key === "m" || e.key === "M") && SND) {
          return SND.toggle("M") ? "sound on" : "sound off";
        }
        if (e.key === "Escape" && g.trial && !over) {
          // trying a maze in the editor: Escape goes back to it
          finish("stopped");
          return "stop";
        }
        var key = KEY_MOVE[e.key];
        if (!key) {
          others += 1;
          return "ignored: key";
        }
        if (over || shownAt === null) {
          return "ignored: busy";
        }
        if (t === 0 && entry.t - shownAt < TOO_SOON_MS) {
          return "ignored: too soon";
        }
        down[code] = {key: e.key, code: code, t: entry.t, order: ++order};
        if (ending) {
          return "ignored: busy";
        }
        if (three && (key === "LEFT" || key === "RIGHT")) {
          startTurn(key === "LEFT" ? -1 : 1, e, entry);
          return "turn";
        }
        if (key === "STAY") {
          stayStep({key: e.key, code: code, at: entry.t, press: entry.t, held: false, by: "Space"});
          lastSpace = performance.now();
          return "stay";
        }
        if (t === 0 && s.first_step_stay) {
          return "not allowed";
        }
        return three && key === "DOWN" ? "back" : "walk";
      });

      root.addEventListener("blur", onBlur);
      function onBlur() {
        // keys let go while the page had no keyboard are never heard
        Object.keys(down).forEach(function (code) { release(code, REC.now(), "blur"); });
        keysDown = {};
        idleSince = performance.now();
      }

      /* A step: the world changes now, as in the model. Returns its row. */
      function takeStep(move, h, extra) {
        endAtStep();
        var legal = allowed();
        t += 1;
        if (move !== "STAY") {
          moves += 1;
        }
        var from = room;
        var to = maze.next(room, move);
        crossing = null;
        var leftName = world.nameAt(from);
        var energyBefore = stomach.energy;
        // full in this food room: it is not eaten from, also on the way out
        var keep = STOP_FULL && visitFull && leftName !== null ? leftName : null;
        var what = world.advance(to, keep);
        var paid = world.paid();
        var nextFood = world.nameAt(to);
        var fullNow = STOP_FULL && nextFood !== null &&
          (move === "STAY" ? visitFull : energyBefore >= stomach.size);
        if (fullNow) {
          paid = 0;
        }
        var en = stomach.step(!R.sameRoom(to, from), paid);
        eaten += paid;
        room = to;
        var n = world.nameAt(room);
        var learned = learn(true);
        var events = learned.food.map(function (f) { return {type: "known", room: f}; });
        var newFound = null;
        if (n !== null && !found[Wd.key(room)]) {
          found[Wd.key(room)] = true;
          newFound = n;
          events.push({type: "found", room: n});
        }
        var before = steps[steps.length - 1].levels;
        names.forEach(function (name) {
          var lv = world.level[name];
          if (lv === 0 && before[name] > 0) {
            events.push({type: "empty", room: name});
          }
          if (lv === 1 && before[name] < 1) {
            events.push({type: "full again", room: name});
          }
          if (what.rooms[name] === "skipped") {
            events.push({type: "refill skipped", room: name});
          }
        });
        if (en.lost > 0) {
          events.push({type: "food lost", amount: en.lost});
        }
        if (move !== "STAY") {
          visitFull = false;
        }
        var wasFull = visitFull;
        if (STOP_FULL && n !== null && (fullNow || stomach.energy >= stomach.size)) {
          visitFull = true;
        }
        if (visitFull && !wasFull) {
          events.push({type: "full", room: n});
        }
        var now = REC.now();
        var r = row({
          shown_at: shownAt, key_at: h.at, decision_ms: round(h.at - shownAt, 3), entered_at: now, arrived_at: null,
          left_at: extra.left_at === undefined ? null : extra.left_at, released_at: null, hold_ms: null,
          key: h.key === " " || h.key === "Spacebar" ? "Space" : h.key, by: h.by || "walk",
          kept: keep, full: fullNow,
          move: move, held: h.held, press_at: h.press, stops: stops, walked_tiles: round(walked, 2),
          room_from: R.roomName(from), room_to: R.roomName(to),
          legal: legal, facing_before: extra.facing, angle_before: extra.angle,
          angle: three ? degrees(scene.angle) : null, turns_before: turnsBefore,
          walls_before: walls, other_keys_before: others,
          paid: paid, cost: en.cost, food_lost: en.lost, change: what.rooms, draw: what.draw,
          found: newFound, known_new: learned.rooms, known_food_new: learned.food, events: events,
          corner: !!extra.corner
        });
        walls = 0;
        others = 0;
        turnsBefore = 0;
        stops = 0;
        walked = 0;
        goOn();
        steps.push(r);
        if (h.code && down[h.code]) {
          (holding[h.code] = holding[h.code] || []).push(r);
        } else if (h.code) {
          r.released_at = now;
          r.hold_ms = round(now - r.key_at, 3);
        }
        shownAt = now;
        knowledgeChanged(false);
        hud();
        if (paid > 0 && s.show.food_gained) {
          // the food eaten; what did not fit into a full bar is shown apart,
          // so that the bar going up less is not a surprise
          $("gain").innerHTML = "+" + round(paid, 1).toFixed(1) + (en.lost >= 0.05 ?
            ' <span class="over">' + round(en.lost, 1).toFixed(1) + " over full</span>" : "");
          nudge($("gain"), "pop");
        } else if (fullNow && s.show.food_gained) {
          $("gain").textContent = "full";
          nudge($("gain"), "pop");
        } else {
          $("gain").textContent = "";
        }
        if (move !== "STAY" && leftName !== null) {
          left[leftName] = world.level[leftName];
        }
        if (gameOver()) {
          ending = {how: stomach.energy <= 0 && s.stomach.at_zero === "end" ? "starved" : "finished", row: r,
            t0: performance.now()};
        }
        changed();
        dirty = true;
        return {row: r, paid: paid, food: n};
      }

      function gameOver() {
        return used() >= s.steps || (stomach.energy <= 0 && s.stomach.at_zero === "end");
      }

      function stayStep(h) {
        var st = takeStep("STAY", h, {facing: FACING[scene.facing], angle: three ? degrees(scene.angle) : null});
        st.row.arrived_at = st.row.entered_at;
        if (st.food !== null) {
          setHere(st.food, false);
          var shownNow = shown[st.food] ? shown[st.food].level : world.level[st.food];
          if (world.level[st.food] < shownNow - 1e-9) {
            showLevel(st.food, shownNow, world.level[st.food], BITE_MS);
            crumbs(st.food, 7);
          } else {
            showLevel(st.food, shownNow, world.level[st.food], 200);
          }
        }
        if (st.paid > 0) {
          lastEat = performance.now();
          if (SND) {
            eatSound(st.paid);
          }
        }
        voiceFor(st.row);
      }

      /* The player has walked onto the floor of a room. Next to the room it
       * was in, that is a move. A room is only entered 0.3 tiles in, so a
       * player can cross the corner of a room whose 2 doors sit at that corner
       * without entering it, and arrive in the room after it: then the room
       * crossed is a move too (corner: true), as the model's agent passes
       * through it. */
      function enterRoom(next) {
        var path = pathTo(next);
        for (var i = 0; i < path.length && !over && !ending; i++) {
          enterOne(path[i], i < path.length - 1);
        }
      }

      function nextTo(a, b) {
        return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
      }

      /* The rooms from the room the player is in to next, next last: the room
       * crossed on the way, or else the shortest way through the maze. */
      function pathTo(next) {
        if (nextTo(room, next)) {
          return [next];
        }
        if (crossing && nextTo(room, crossing) && nextTo(crossing, next)) {
          return [crossing, next];
        }
        var from = {}, queue = [room], k = Wd.key(room);
        from[k] = null;
        while (queue.length) {
          var at = queue.shift();
          if (R.sameRoom(at, next)) {
            var way = [];
            for (var r = at; r && !R.sameRoom(r, room); r = from[Wd.key(r)]) {
              way.unshift(r);
            }
            return way;
          }
          maze.legal(at).forEach(function (m) {
            var to = maze.next(at, m);
            if (m !== "STAY" && from[Wd.key(to)] === undefined) {
              from[Wd.key(to)] = at;
              queue.push(to);
            }
          });
        }
        return [next];
      }

      function enterOne(next, corner) {
        var move = null;
        Object.keys(Wd.DIRS).forEach(function (m) {
          var d = Wd.DIRS[m];
          if (room[0] + d[0] === next[0] && room[1] + d[1] === next[1]) {
            move = m;
          }
        });
        var ms = moveStart || {t: REC.now(), press: REC.now(), key: "ArrowUp", code: "ArrowUp", held: true,
          facing: FACING[scene.facing], angle: three ? degrees(scene.angle) : null};
        var firstVisit = !visited[Wd.key(next)];
        var st = takeStep(move, {key: ms.key, code: ms.code, at: ms.t, press: ms.press, held: ms.held},
          {facing: ms.facing, angle: ms.angle, left_at: leftAt, corner: corner});
        away = null;
        // the walk goes on from here, with the key still held
        moveStart = {t: REC.now(), press: ms.press, key: ms.key, code: ms.code, held: true,
          facing: FACING[scene.facing], angle: three ? degrees(scene.angle) : null};
        if (st.food !== null) {
          setHere(st.food, true);
          var from = left[st.food] === undefined ? world.level[st.food] : left[st.food];
          showLevel(st.food, from, world.level[st.food], GROW_MS);
          if (world.level[st.food] > from + 1e-9 && SND) {
            SND.grown();
          }
          if (st.paid > 0) {
            crumbs(st.food, 5);
            lastEat = performance.now();
            if (SND) {
              eatSound(st.paid);
            }
          }
        } else {
          setHere(null, false);
        }
        if (!three && SND && !MOUSE && !FIG) {
          SND.step(true);
        }
        if ((MOUSE || (FIG && FIG.sound.sniff)) && SND && firstVisit && !st.row.found) {
          SND.sniff(FIG ? s.player : "mouse");
        }
        voiceFor(st.row);
      }

      /* Moves the player for the keys held: speeding up and slowing down,
       * sliding along walls, guided through doors. */
      function updateBody(dt) {
        var wx = 0, wy = 0, top = C.walk_tiles_per_s;
        if (!ending) {
          if (three) {
            var f = (isDown("UP") ? 1 : 0) - (isDown("DOWN") ? 1 : 0);
            if (f < 0) {
              top = C.back_tiles_per_s;
            }
            wx = Math.cos(scene.angle) * f;
            wy = Math.sin(scene.angle) * f;
          } else {
            wx = (isDown("RIGHT") ? 1 : 0) - (isDown("LEFT") ? 1 : 0);
            wy = (isDown("DOWN") ? 1 : 0) - (isDown("UP") ? 1 : 0);
            var l = Math.hypot(wx, wy);
            if (l > 0) {
              wx /= l;
              wy /= l;
            }
          }
        }
        wx *= top;
        wy *= top;
        var pushing = wx !== 0 || wy !== 0;
        var acc = (pushing ? C.speed_up_tiles_per_s2 : C.slow_down_tiles_per_s2) * dt;
        var dx = wx - vx, dy = wy - vy, dl = Math.hypot(dx, dy);
        if (dl > acc) {
          dx *= acc / dl;
          dy *= acc / dl;
        }
        vx += dx;
        vy += dy;
        var speed = Math.hypot(vx, vy);
        if (speed < 0.02 && !pushing) {
          vx = 0;
          vy = 0;
          speed = 0;
        }
        if (speed > 0 && pushing && !moveStart) {
          var k = lastMoveKey();
          moveStart = {t: REC.now(), press: k ? k.t : REC.now(), key: k ? k.key : "ArrowUp", code: k ? k.code : "",
            held: k ? k.t < shownAt : true, facing: FACING[scene.facing], angle: three ? degrees(scene.angle) : null};
        }
        if (speed === 0) {
          if (moveStart) {
            stops += 1;
          }
          moveStart = null;
        }
        if (speed > 0) {
          var x0 = scene.x, y0 = scene.y;
          var nx = scene.x + vx * dt;
          var hit = false;
          if (free(nx, scene.y)) {
            scene.x = nx;
          } else {
            hit = hit || Math.abs(vx) > 1;
            toDoor(0, vx, dt);
            vx = 0;
          }
          var ny = scene.y + vy * dt;
          if (free(scene.x, ny)) {
            scene.y = ny;
          } else {
            hit = hit || Math.abs(vy) > 1;
            toDoor(1, vy, dt);
            vy = 0;
          }
          if (hit && performance.now() - lastBump > 600) {
            lastBump = performance.now();
            walls += 1;
            bump();
          }
          guide(dt, Math.hypot(vx, vy));
          var moved = Math.hypot(scene.x - x0, scene.y - y0);
          walked += moved;
          if (!three) {
            if (Math.hypot(vx, vy) > 0.3) {
              scene.heading = Math.atan2(vy, vx);
              scene.facing = quarterOf(scene.heading);
            }
          }
          if (MOUSE || FIG) {
            // the gait: a step every STEP tiles walked, as a foot (or a pair
            // of feet) lands (drawn furthest apart at sin = +/-1)
            var n0 = Math.floor(gait / Math.PI - 0.5);
            // a character's steps are as long as its clips' at this speed
            var stepNow = FIG ? CH.stepTiles(s.player, speed / C.walk_tiles_per_s, PER_METRE) : STEP[g.view];
            gait += moved * Math.PI / stepNow;
            var n1 = Math.floor(gait / Math.PI - 0.5);
            if (n1 !== n0) {
              mouseStep(n1);
            }
            var mv = Math.min(1, speed / C.walk_tiles_per_s);
            if (three && !BEHIND && MOUSE) {
              scene.bob = Math.sin(gait) * MOUSE_BOB * mv;
              scene.sway = Math.cos(gait) * MOUSE_SWAY * mv;
            } else if (three && !BEHIND) {
              // the view rises and falls with the steps, more for the heavy ones
              scene.bob = -Math.abs(Math.cos(gait)) * FIG_BOB * (FIG.height / 1.8 + 0.3) * mv;
              scene.sway = Math.cos(gait) * FIG_SWAY * mv;
            }
          } else if (three) {
            var phase = bobPhase + moved * 2 * Math.PI / BOB_TILES;
            if (Math.floor(phase / Math.PI) !== Math.floor(bobPhase / Math.PI) && SND) {
              SND.step(false);
            }
            bobPhase = phase;
            scene.bob = Math.sin(bobPhase) * BOB * Math.min(1, speed / C.walk_tiles_per_s);
          }
          dirty = true;
          rooms();
        } else if (three && (scene.bob !== 0 || scene.sway !== 0)) {
          scene.bob *= Math.max(0, 1 - dt * 10);
          scene.sway *= Math.max(0, 1 - dt * 10);
          if (Math.abs(scene.bob) < 1e-4 && Math.abs(scene.sway) < 1e-4) {
            scene.bob = 0;
            scene.sway = 0;
          }
          dirty = true;
        }
        if (FIG) {
          var fg = scene.figure, nowF = performance.now();
          fg.phase = gait;
          fg.move += (Math.min(1, speed / C.walk_tiles_per_s) - fg.move) * Math.min(1, dt * 10);
          // walking backwards (3D): the clips run backwards
          fg.back = three && speed > 0.05 && vx * Math.cos(scene.angle) + vy * Math.sin(scene.angle) < 0;
          fg.t = nowF / 1000;
          fg.eat = nowF - lastEat < EAT_MS && speed < 0.2;
          fg.turn += (omega - fg.turn) * Math.min(1, dt * 8);
          scene.now = nowF;
          while (scene.prints.length && nowF - scene.prints[0].t0 > PRINT_MS) {
            scene.prints.shift();
          }
          if (!three || BEHIND) {
            dirty = true;          // the character breathes and looks around all the time
          }
        }
        if (MOUSE) {
          var m = scene.mouse, now = performance.now();
          m.phase = gait;
          m.move += (Math.min(1, speed / C.walk_tiles_per_s) - m.move) * Math.min(1, dt * 12);
          m.t = now / 1000;
          m.eat = now - lastEat < EAT_MS && speed < 0.2;
          m.turn += (omega - m.turn) * Math.min(1, dt * 8);
          scene.now = now;
          while (scene.prints.length && now - scene.prints[0].t0 > FG.mouse.PRINT_MS) {
            scene.prints.shift();
          }
          if (!three) {
            dirty = true;          // the mouse moves its nose, ears and tail all the time
          }
        }
      }

      /* Walking into a wall next to a door slides the player along the wall
       * into the door. axis 0: the wall is across x (pushed with v along x). */
      function toDoor(axis, v, dt) {
        var side = v > 0 ? 1 : -1;
        var cx = Math.floor(scene.x), cy = Math.floor(scene.y);
        var best = null;
        for (var k = -SLIDE_TILES; k <= SLIDE_TILES; k++) {
          var tx = axis === 0 ? cx + side : cx + k, ty = axis === 0 ? cy + k : cy + side;
          if (tx < 0 || ty < 0 || tx >= M.W || ty >= M.H) {
            continue;
          }
          var kd = M.kind[ty * M.W + tx];
          if ((kd === Wd.DOOR || kd === Wd.CORRIDOR) && (best === null || Math.abs(k) < Math.abs(best))) {
            best = k;
          }
        }
        if (best === null) {
          return;
        }
        var target = axis === 0 ? cy + best + 0.5 : cx + best + 0.5;
        var at = axis === 0 ? scene.y : scene.x;
        var by = Math.max(-SLIDE_SPEED * dt, Math.min(SLIDE_SPEED * dt, target - at));
        by *= Math.min(1, Math.abs(v) / 1.5 + 0.3);
        if (axis === 0 && free(scene.x, scene.y + by)) {
          scene.y += by;
        } else if (axis === 1 && free(scene.x + by, scene.y)) {
          scene.x += by;
        }
      }

      /* Whether the player has left the floor of its room, come back to it,
       * or walked onto the floor of the next room. */
      function rooms() {
        // a room next to the player's whose floor it is on, however little way in
        var fl = floorRoom(scene.x, scene.y);
        if (fl && nextTo(fl, room)) {
          crossing = fl;
        }
        var under = roomUnder(scene.x, scene.y);
        if (under && !R.sameRoom(under, room)) {
          enterRoom(under);
          return;
        }
        var onFloor = onFloorOf(room, scene.x, scene.y);
        if (!onFloor && !away) {
          leftAt = REC.now();
          away = {left_at: leftAt, furthest: 0, toward: null};
        }
        if (away) {
          // how far towards the next room: from the edge of this room's floor
          var rm = M.list[M.index[Wd.key(room)]];
          var ex = Math.max(rm.c0 - scene.x, scene.x - (rm.c0 + Wd.ROOM), 0);
          var ey = Math.max(rm.r0 - scene.y, scene.y - (rm.r0 + Wd.ROOM), 0);
          var out = Math.max(ex, ey);
          if (out > away.furthest) {
            away.furthest = out;
            var cx = rm.c0 + Wd.ROOM / 2, cy = rm.r0 + Wd.ROOM / 2;
            var m = Math.abs(scene.x - cx) > Math.abs(scene.y - cy) ? (scene.x > cx ? "RIGHT" : "LEFT") :
              (scene.y > cy ? "DOWN" : "UP");
            away.toward = m;
          }
          if (onFloor && roomUnder(scene.x, scene.y)) {
            if (away.furthest > 0.3) {
              var d = away.toward ? Wd.DIRS[away.toward] : null;
              back.push({left_at: away.left_at, back_at: REC.now(), step: t, room: R.roomName(room),
                toward: d ? R.roomName([room[0] + d[0], room[1] + d[1]]) : null, move: away.toward,
                furthest: round(Math.min(1, away.furthest / (Wd.ROOM - 1 + 2 * ENTER_TILES)), 3)});
              changed();
            }
            away = null;
          }
        }
      }

      function updateFood(now, dt) {
        Object.keys(shown).forEach(function (n) {
          var a = shown[n];
          if (a.level !== a.to) {
            var k = a.ms > 0 ? Math.min(1, (now - a.t0) / a.ms) : 1;
            a.level = a.from + (a.to - a.from) * smooth(k);
            if (k >= 1) {
              a.level = a.to;
            }
            dirty = true;
          }
        });
        if (hereT0 !== null) {
          hereFade = Math.min(1, (now - hereT0) / HERE_MS);
          if (hereFade >= 1) {
            hereT0 = null;
          }
          dirty = true;
        }
        if (scene.crumbs.length) {
          scene.crumbs = scene.crumbs.filter(function (c) {
            if (c.z > 0) {
              c.x += c.vx * dt * 0.6;
              c.y += c.vy * dt * 0.6;
              c.vz -= 2.2 * dt;
              c.z = Math.max(0, c.z + c.vz * dt);
            } else {
              c.rest += dt;
            }
            return c.rest < 0.9;
          });
          dirty = true;
        }
      }

      /* The camera behind the mouse: pulled in at once where a wall comes
       * behind it, out again slowly. */
      function updateCamera(dt) {
        var want = FG.mouse.cameraBack(M, scene.x, scene.y, scene.angle, CAM && CAM.back);
        var b = camBack === null || want < camBack ? want : camBack + (want - camBack) * Math.min(1, dt * 3);
        if (camBack === null || Math.abs(b - camBack) > 1e-4) {
          dirty = true;
        }
        camBack = b;
        scene.cam = FG.mouse.camera(scene.x, scene.y, scene.angle, b, CAM);
      }

      /* How far the view can step back from the player, looking the way it
       * looks, before it comes near a wall (at most BACK_MOST). */
      function roomBehind() {
        var cx = -Math.cos(scene.angle), cy = -Math.sin(scene.angle);
        for (var b = 0.05; b <= BACK_MOST + 0.2; b += 0.05) {
          var x = Math.floor(scene.x + cx * b), y = Math.floor(scene.y + cy * b);
          if (x < 0 || y < 0 || x >= M.W || y >= M.H || M.kind[y * M.W + x] === Wd.WALL) {
            return Math.max(0, Math.min(BACK_MOST, b - 0.2));
          }
        }
        return BACK_MOST;
      }

      /* Looking at the painting in the middle of the view while the player
       * stands before it (TILT_*): up to it, and back from it when it is too
       * near to be seen whole; as before on walking or turning. */
      function updateTilt(dt) {
        var wantTilt = 0, wantBack = 0;
        var still = Math.hypot(vx, vy) < TILT_STILL && Math.abs(omega) < TILT_TURN && !ending;
        var lk = still && gallery && g.renderer.look ? g.renderer.look() : null;
        if (lk && lk.d > 0.05 && lk.d <= TILT_FAR) {
          var D = ART.layout(gallery.pics[lk.place]);
          if (!BEHIND) {
            var c = $("c3d"), ar = c && c.clientHeight ? c.clientWidth / c.clientHeight : 16 / 9;
            var fov = Math.tan(33 * Math.PI / 180) * ar / (4 / 3);
            var fw = (gallery.likes ? D.qx1 : D.fx1) - D.fx0, fh = D.fv1 - D.fv0;
            wantBack = Math.min(roomBehind(), Math.max(0, Math.max(fh * FIT, fw * FIT / (2 * fov)) - lk.d));
          }
          // (lk.d is from the player; the camera is further away)
          var eye = scene.cam ? scene.cam.eye : scene.eye;
          var d = lk.d + (scene.cam ? scene.cam.back : Math.max(scene.back, wantBack));
          wantTilt = Math.max(0, Math.min(TILT_MOST, (1 - (D.fv0 + D.fv1) / 2 - eye) / d));
        }
        var ease = function (now, want) {
          var t = now + (want - now) * (1 - Math.exp(-dt * 3 / (want > now ? TILT_IN_S : TILT_OUT_S)));
          return Math.abs(want - t) < 1e-4 ? want : t;
        };
        var tilt = ease(scene.tilt, wantTilt), back = ease(scene.back, wantBack);
        if (tilt !== scene.tilt || back !== scene.back) {
          scene.tilt = tilt;
          scene.back = back;
          dirty = true;
        }
      }

      function frame(ts) {
        if (over) {
          return;
        }
        var frameMs = lastFrame === null ? 0 : Math.min(LONGEST_FRAME_MS, ts - lastFrame);
        var dt = lastFrame === null ? 0 : Math.min(0.05, (ts - lastFrame) / 1000);
        lastFrame = ts;
        if (shownAt !== null && frameMs > 0) {
          updateLooks(frameMs);
        }
        var now = performance.now();
        if (three) {
          updateTurn(dt);
        }
        updateLight(now);
        updateFood(now, dt);
        if (shownAt !== null) {
          updateBody(dt);
        }
        if (BEHIND) {
          updateCamera(dt);
        }
        if (three) {
          updateTilt(dt);
        }
        if (shownAt !== null && !ending && IDLE_MS) {
          if (isDown("STAY")) {
            // Space held: a stay every idle_stay_ms
            if (lastSpace !== null && now - lastSpace >= IDLE_MS) {
              var sk = Object.keys(down).filter(function (c) { return KEY_MOVE[down[c].key] === "STAY"; })[0];
              stayStep({key: down[sk].key, code: sk, at: REC.now(), press: down[sk].t, held: true, by: "Space"});
              // counted from when the stay was taken, as its time is recorded
              lastSpace = performance.now();
            }
          } else if (!Object.keys(keysDown).length) {
            // no key held: standing still is a stay every idle_stay_ms
            if (idleSince === null) {
              idleSince = now;
            } else if (now - idleSince >= IDLE_MS) {
              stayStep({key: null, code: null, at: REC.now(), press: null, held: false, by: "idle"});
              // counted from when the stay was taken, as its time is recorded
              idleSince = performance.now();
            }
          }
        }
        updateMusic();
        if (TRACK_MS && shownAt !== null && (nextTrack === null || now >= nextTrack)) {
          // the place and the view of the player, at the first frame from each mark on; the
          // painting looked at; how loud the music is where the player is
          var lk = gallery && g.renderer.look ? g.renderer.look() : null;
          track.rows.push([round(REC.now(), 1), round(scene.x, 2), round(scene.y, 2),
            three ? degrees(scene.angle) : null, t, lk ? lk.place : null, lk ? round(lk.d, 2) : null,
            lk ? round(lk.share, 3) : null,
            playingNow ? round(GRAM.loudness(Math.hypot(scene.x - musicAt[0], scene.y - musicAt[1])), 2) : null,
            three ? round(scene.tilt, 3) : null, three ? round(scene.back, 3) : null]);
          nextTrack = (nextTrack === null || now - nextTrack >= TRACK_MS ? now : nextTrack) + TRACK_MS;
        }
        if (ending && now - ending.t0 >= END_MS) {
          var e = ending;
          ending = null;
          REC.shown().then(function (at) {
            if (e.row.arrived_at === null && e.row.move === "STAY") {
              e.row.arrived_at = at;
            }
            finish(e.how);
          });
        }
        if (dirty && !over) {
          draw();
        } else if (MOUSE && !over) {
          drawMouse();
        }
        requestAnimationFrame(frame);
      }
    });
  }

  /* How a game ended, with its moves and stays counted from the steps (also
   * for a game cut short). */
  function ended(rec, how, at) {
    var out = {how: how, step: rec.steps.length - 1, moves: 0, idle_stays: 0, space_stays: 0, at: at};
    rec.steps.slice(1).forEach(function (st) {
      if (st.move !== "STAY") {
        out.moves += 1;
      } else if (st.by === "idle") {
        out.idle_stays += 1;
      } else {
        out.space_stays += 1;
      }
    });
    return out;
  }

  /* The way the player went and the rooms known at the end, from the steps
   * (also for a game cut short). */
  function wayFields(rec) {
    rec.path = rec.steps.map(function (st) { return st.room; });
    var known = {};
    rec.steps.forEach(function (st) { (st.known_new || []).forEach(function (n) { known[n] = true; }); });
    rec.known_rooms = Object.keys(known).sort();
  }

  /* The maze as the game had it: its rooms (colour numbers, -1 for no room)
   * and, for a maze of the team, how it was drawn and saved. */
  function mazeDef(name) {
    var m = FG.MAZES[name];
    return {rooms: copy(m.rooms), team: m.team ? copy(m.team) : null};
  }

  function layoutNames(lay) {
    var f = {};
    Object.keys(lay.food_rooms).forEach(function (n) { f[n] = R.roomName(lay.food_rooms[n]); });
    return {maze: lay.maze, start_room: R.roomName(lay.start_room), food_rooms: f};
  }

  /* The game as a model run's result (forage.v3.record rows), so that
   * forage.lab.measures.of_run() can score it. */
  function modelResult(rec) {
    var maze = R.maze(rec.layout.maze);
    var lay = {maze: rec.layout.maze, start_room: FG.config.roomOf(rec.layout.start_room, maze, "start"),
      food_rooms: {}};
    Object.keys(rec.layout.food_rooms).forEach(function (n) {
      lay.food_rooms[n] = FG.config.roomOf(rec.layout.food_rooms[n], maze, n);
    });
    var settings = FG.config.modelSettings(rec.settings, lay);
    // when only moves use up the steps, a game can have more steps of the
    // model's world than settings.steps
    settings.run.steps = Math.max(settings.run.steps, rec.steps.length - 1);
    var rows = rec.steps.map(function (st) {
      var food = {};
      Object.keys(st.levels).forEach(function (n) { food[n] = {"true": st.levels[n], memory: null}; });
      return {step: st.step, room: R.roomFromName(st.room), move: st.move, paid: st.paid,
        food: food, energy: st.energy};
    });
    return {settings: settings, rows: rows, summary: {food_not_as_predicted: null}};
  }

  /* A shorter form of a game cut short, for the send on closing when the
   * whole file is too long: only the moves and their times. */
  function shortForm(rec) {
    var out = {};
    Object.keys(rec).forEach(function (k) {
      if (k !== "steps" && k !== "result" && k !== "track") {
        out[k] = rec[k];
      }
    });
    out.steps_short = {fields: ["step", "move", "room", "held", "shown_at", "key_at", "entered_at", "released_at"],
      rows: rec.steps.map(function (st) {
        return [st.step, st.move, st.room, !!st.held, st.shown_at, st.key_at, st.entered_at, st.released_at];
      })};
    return copy(out);
  }

  FG.game = {play: play, modelResult: modelResult, shortForm: shortForm, wayFields: wayFields, ended: ended,
    FACING: FACING,
    CONTROLS: CONTROLS,
    quarterOf: quarterOf};
})(typeof window !== "undefined" ? window : globalThis);
