/* The session: the first page (the view and the maze), the games, the end
 * of each game, and the files sent to DataPipe.
 *
 * Link options: ?condition=NAME or auto, ?view=2d or 3d and ?maze=NAME to
 * choose for the player at first (they can still change it), ?test=1 marks
 * every file as a test (TEST_ in front of its name), ?send=0 sends nothing
 * (the files are printed to the browser console), ?set.<key>=<value>
 * changes a setting of every game, for trying things out, and ?edit=1 adds
 * the maze editor to the first page (js/editor.js; its files are tests).
 *
 * The team's mazes (js/my_mazes.js, see js/maze_tools.js) come after the
 * mazes of settings.js on the first page, for every player.
 *
 * The player code is made by the game and kept in the browser, so that a
 * player who comes back with the same browser keeps it.
 *
 * Files, 1 per game, each complete on its own:
 *   <player>_<session>_<n>.json                game n
 *   <player>_<session>_<n>.partial.json        game n, cut short
 *   <player>_<session>_<n>.partial-short.json  the same, shortened (sent on closing)
 */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var REC = FG.recorder, Wd = FG.world;

  FG.VERSION = "2.3.0";
  var FORMAT = "foraging-game";
  var FORMAT_VERSION = 5;
  var TRIAL_TYPE = "foraging-game";
  // keys sooner than this after the first page or the end of a game appear
  // are taken as left over from the screen before
  var MENU_GUARD_MS = 400, END_GUARD_MS = 450;
  var MAZE_TEXT = {
    grid_4x4: ["4 &times; 4", "16 rooms"],
    grid_6x6: ["6 &times; 6", "36 rooms"],
    grid_two_4x4: ["Two 4 &times; 4", "33 rooms, joined by a bridge"]
  };

  /* The name and size of a maze on the first page: an environment of the
   * model is named after its file, "ring_5x5" as "Ring 5 x 5", and so is a
   * maze of the team. */
  function mazeText(name) {
    if (MAZE_TEXT[name]) {
      return MAZE_TEXT[name];
    }
    var rooms = FG.MAZES[name].rooms, n = 0;
    rooms.forEach(function (row) { row.forEach(function (v) { n += v >= 0 ? 1 : 0; }); });
    var words = String(name).split("_").map(function (w) {
      var m = /^(\d+)x(\d+)$/.exec(w);
      return m ? m[1] + " &times; " + m[2] : escape(w);
    });
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    return [words.join(" "), n + " rooms"];
  }

  function $(id) {
    return document.getElementById(id);
  }

  function escape(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function text(name) {
    return (FG.SETTINGS.texts || {})[name] || "";
  }

  function only(id) {
    ["menu", "end", "message", "editor"].forEach(function (o) { $(o).hidden = o !== id; });
  }

  function message(title, body) {
    $("hud").hidden = true;
    $("gameKeys").hidden = true;
    $("msgTitle").textContent = title;
    $("msgBody").innerHTML = body;
    only("message");
  }

  /* What the game needs from the browser. */
  function missing() {
    var need = {
      "fetch": typeof root.fetch === "function",
      "Promise": typeof root.Promise === "function",
      "URLSearchParams": typeof root.URLSearchParams === "function",
      "performance.now": !!(root.performance && root.performance.now),
      "requestAnimationFrame": typeof root.requestAnimationFrame === "function",
      "BigInt": typeof root.BigInt === "function",
      "canvas": !!document.createElement("canvas").getContext
    };
    return Object.keys(need).filter(function (k) { return !need[k]; });
  }

  /* A phone or tablet without a keyboard. */
  function touchOnly() {
    try {
      return root.matchMedia("(pointer: coarse)").matches && !root.matchMedia("(pointer: fine)").matches;
    } catch (err) {
      return false;
    }
  }

  function chooseCondition(all, asked) {
    var names = Object.keys(all.conditions || {});
    if (!names.length) {
      return Promise.resolve({name: null, how: "no conditions", datapipe: null, error: null});
    }
    if (asked && asked !== "auto") {
      return Promise.resolve({name: asked, how: "link", datapipe: null, error: null});
    }
    return FG.datapipe.condition().then(function (r) {
      if (r.condition !== null) {
        return {name: names[r.condition % names.length], how: "datapipe", datapipe: r.condition,
          error: r.condition >= names.length ? "DataPipe has more conditions than settings.js" : null};
      }
      if (all.datapipe.if_no_condition === "stop") {
        message(text("title"), "The game could not be started. Please try again later.");
        throw "stopped";
      }
      var pick = FG.random.make(FG.random.freshSeed()).pick(names);
      return {name: pick, how: "random", datapipe: null, error: r.error};
    });
  }

  /* The player code: made once and kept in this browser. */
  function playerCode(expId) {
    var k = "foraging-game:" + expId + ":player";
    try {
      var v = root.localStorage.getItem(k);
      if (v && /^[0-9a-f]{8}$/.test(v)) {
        return {code: v, how: "kept in this browser"};
      }
    } catch (err) {
      // no storage: a new code each time
    }
    var code = FG.random.freshId(8);
    try {
      root.localStorage.setItem(k, code);
    } catch (err) {
      return {code: code, how: "new, not kept"};
    }
    return {code: code, how: "new"};
  }

  /* The settings with the team's mazes after the mazes of the menu. A maze
   * the settings do not fit is left out (listed in the editor). */
  function withTeamMazes(settings, link) {
    var mazes = settings.menu.mazes.slice();
    FG.mazeTools.register().forEach(function (m) {
      if (mazes.indexOf(m) >= 0) {
        return;
      }
      try {
        FG.config.checkMaze(settings, m, link);
        mazes.push(m);
      } catch (err) {
        FG.mazeTools.leaveOut(m, "the settings do not fit it: " + err.message);
      }
    });
    var out = Object.assign({}, settings);
    out.menu = Object.assign({}, settings.menu, {mazes: mazes});
    return out;
  }

  function run() {
    var lacking = missing();
    if (lacking.length) {
      message(text("title"), "This game needs a recent browser (Chrome, Edge, Firefox or Safari). " +
        "This one lacks: " + escape(lacking.join(", ")) + ".");
      return Promise.resolve(null);
    }
    if (touchOnly()) {
      message(text("title"), "This game is played with a keyboard. Please open this page on a computer.");
      return Promise.resolve(null);
    }
    var p = new URLSearchParams(root.location.search);
    var edit = p.get("edit") === "1";
    var test = p.get("test") === "1" || edit;
    var send = p.get("send") !== "0";
    var all = FG.SETTINGS;
    var link;
    try {
      link = FG.config.fromLink(p);
      all = withTeamMazes(FG.SETTINGS, link);
      FG.config.checkAll(all, link);
      var asked = p.get("condition");
      if (asked && asked !== "auto" && !(all.conditions && Object.prototype.hasOwnProperty.call(all.conditions, asked))) {
        throw new FG.config.SettingsError("the link names the condition '" + asked + "'; the conditions are " +
          Object.keys(all.conditions || {}).join(", "));
      }
    } catch (err) {
      message("Settings error", escape(err.message) + "<br>Fix settings.js or the link and open the page again.");
      return Promise.resolve(null);
    }
    REC.start();
    REC.install();

    var player = playerCode(all.datapipe.experiment_id);
    var session = {
      session_id: FG.random.freshId(12), player: player.code, player_code: player.how, test: test,
      started: new Date().toISOString(), condition: null, link: p.toString(), browser: null,
      seed: FG.random.freshSeed()
    };
    FG.datapipe.init(all.datapipe.experiment_id, session.session_id, {send: send});
    if (test) {
      $("test-banner").hidden = false;
    }
    FG.datapipe.flush();

    var views = {"2d": FG.view2d.create($("c2d")), "3d": FG.view3d.create($("c3d"))};
    var current = null;           // the view on the screen
    var scene = null;             // what it shows
    var playing = false, failed = false, games = 0;
    var mark = REC.mark();
    var soundMark = 0;
    var refreshGame = null;       // keeps the game in progress again, with the time of closing
    var ready = false;

    function sizeViews() {
      views["2d"].resize(root.innerWidth, root.innerHeight, 70, 46);
      views["3d"].resize(root.innerWidth, root.innerHeight);
      if (current && scene) {
        views[current].draw(scene);
      }
    }

    function useView(v) {
      current = v;
      $("c2d").hidden = v !== "2d";
      $("c3d").hidden = v !== "3d";
      return views[v];
    }

    /* The maze behind the first page: every room in light, no food. */
    function preview(name, v) {
      var M = Wd.build(name), all2 = {};
      M.list.forEach(function (r) { all2[r.i + "," + r.j] = true; });
      var start = FG.rules.maze(name).rooms()[0];
      var first = FG.rules.maze(name).legal(start).filter(function (m) { return m !== "STAY"; })[0];
      var facing = FG.game.FACING.indexOf(first);
      var c = Wd.centre(M, start);
      scene = {maze: M, x: c[0], y: c[1], angle: facing * Math.PI / 2, facing: facing,
        lit: Wd.lit(M, all2, all2), food: [], here: null};
      useView(v).draw(scene);
    }

    function header(kind) {
      return {format: FORMAT, format_version: FORMAT_VERSION, file: kind, trial_type: TRIAL_TYPE,
        game_version: FG.VERSION, player: session.player, player_code: session.player_code,
        session_id: session.session_id, test: session.test, session_started: session.started,
        condition: session.condition, link: session.link, browser: session.browser};
    }

    function fileName(rest) {
      return (test ? "TEST_" : "") + session.player + "_" + session.session_id + "_" + rest + ".json";
    }

    // ---------------------------------------------------------- status
    var watching = null;
    function status(r) {
      var line;
      if (r === "saving") {
        line = text("saving");
      } else if (r === "slow") {
        line = text("still_saving");
      } else if (r.ok) {
        line = text("saved");
      } else {
        line = text(FG.datapipe.state().kept ? "not_saved" : "not_saved_open");
        if (!watching) {
          watching = setInterval(function () {
            if (FG.datapipe.state().left === 0) {
              clearInterval(watching);
              watching = null;
              status({ok: true});
            }
          }, 5000);
        }
      }
      $("endStatus").textContent = line;
      $("menuStatus").textContent = games ? line : "";
    }

    // ---------------------------------------------------------- page 1
    var choice = {
      view: Math.max(0, all.menu.views.indexOf(p.get("view"))),
      maze: Math.max(0, all.menu.mazes.indexOf(p.get("maze"))),
      row: 0
    };

    function buildMenu() {
      $("title").textContent = text("title");
      $("intro").textContent = text("intro");
      $("menuKeys").innerHTML = text("menu_keys");
      $("views").innerHTML = all.menu.views.map(function (v) {
        return '<div class="card"><div class="card-size">' + v.toUpperCase() + '</div>' +
          '<div class="card-meta">' + text("view_" + v) + '</div></div>';
      }).join("");
      $("views").className = "grid" + (all.menu.views.length === 2 ? " two" : "");
      $("mazes").innerHTML = all.menu.mazes.map(function (m, k) {
        var t = mazeText(m), team = FG.MAZES[m].team;
        var by = edit && team && team.saved_by ? " &middot; " + escape(team.saved_by) : "";
        return '<div class="card"><div class="card-size">' + t[0] + '</div>' +
          '<div class="card-meta">' + t[1] + by + '</div><div class="card-meta">' +
          (k < 9 ? '<kbd>' + (k + 1) + '</kbd>' : "&nbsp;") + '</div></div>';
      }).join("") + (edit ? '<div class="card new" id="newMaze"><div class="card-size">+ New maze</div>' +
        '<div class="card-meta">draw your own</div><div class="card-meta"><kbd>N</kbd></div></div>' : "");
      if (edit) {
        $("newMaze").addEventListener("click", function () {
          if (toEditor) {
            toEditor();
          }
        });
        var left = FG.mazeTools.problems();
        $("menuProblems").hidden = !left.length;
        $("menuProblems").innerHTML = left.map(function (q) {
          return "Left out of the game: " + escape(q.name || "js/my_mazes.js") + ": " + escape(q.problem);
        }).join("<br>");
      }
    }

    var toEditor = null;          // while the first page is shown in edit mode: opens the editor
    function drawMenu() {
      Array.prototype.forEach.call($("views").children, function (c, k) { c.classList.toggle("on", k === choice.view); });
      Array.prototype.forEach.call($("mazes").children, function (c, k) { c.classList.toggle("on", k === choice.maze); });
      $("viewLabel").classList.toggle("active", choice.row === 0);
      $("mazeLabel").classList.toggle("active", choice.row === 1);
      $("play").disabled = !ready;
      preview(all.menu.mazes[choice.maze], all.menu.views[choice.view]);
    }

    function menu() {
      return new Promise(function (resolve) {
        $("hud").hidden = true;
        $("gameKeys").hidden = true;
        only("menu");
        REC.setPhase("menu");
        drawMenu();
        var rec = {shown_at: null, chosen_at: null, view: null, maze: null, actions: []};
        toEditor = edit ? function () {
          if (!ready) {
            return false;
          }
          toEditor = null;
          REC.listen(null);
          resolve({editor: true});
          return true;
        } : null;
        REC.shown().then(function (at) {
          rec.shown_at = at;
          REC.listen(function (e, entry) {
            if (e.type !== "keydown") {
              return undefined;
            }
            if (e.repeat) {
              return "ignored: repeat";
            }
            if (entry.t - at < MENU_GUARD_MS) {
              return "ignored: too soon";
            }
            if ((e.key === "m" || e.key === "M") && FG.sound) {
              return FG.sound.toggle("M") ? "sound on" : "sound off";
            }
            if (edit && (e.key === "n" || e.key === "N")) {
              return toEditor && toEditor() ? "editor" : "ignored: not ready";
            }
            var n = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : undefined;
            var rows = [all.menu.views.length, all.menu.mazes.length];
            var what = null;
            if (n !== undefined && n < all.menu.mazes.length) {
              choice.maze = n;
              choice.row = 1;
              what = "maze";
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              choice.row = 1 - choice.row;
              what = "row";
            } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              var d = e.key === "ArrowLeft" ? -1 : 1;
              if (choice.row === 0) {
                choice.view = (choice.view + d + rows[0]) % rows[0];
              } else {
                choice.maze = (choice.maze + d + rows[1]) % rows[1];
              }
              what = choice.row === 0 ? "view" : "maze";
            } else if (e.key === "Enter") {
              if (!ready) {
                return "ignored: not ready";
              }
              toEditor = null;
              REC.listen(null);
              rec.chosen_at = entry.t;
              rec.view = all.menu.views[choice.view];
              rec.maze = all.menu.mazes[choice.maze];
              resolve(rec);
              return "play";
            } else {
              return "ignored: key";
            }
            rec.actions.push({t: entry.t, key: e.key, row: choice.row === 0 ? "view" : "maze",
              view: all.menu.views[choice.view], maze: all.menu.mazes[choice.maze]});
            drawMenu();
            return what;
          });
        });
      });
    }

    // ---------------------------------------------------------- a game
    /* A game; trial: a try of the maze being drawn in the editor, which is
     * neither saved nor sent. */
    function playGame(menuRec, trial) {
      var n = trial ? 0 : games + 1;
      var settings = FG.config.gameSettings(all, session.condition.name, menuRec.maze, link);
      var layoutSeed = FG.random.derive(session.seed, n);
      var seed = FG.random.derive(session.seed, 1000 + n);
      var lay = FG.config.layout(settings, null, FG.random.make(layoutSeed));
      var view = useView(menuRec.view);
      only(null);
      $("hud").hidden = false;
      $("gameKeys").innerHTML = text("keys_" + menuRec.view);
      $("gameKeys").hidden = false;
      playing = true;

      function gameFile(rec, kind) {
        var f = header(kind);
        f.menu = menuRec;
        f.game = rec;
        var got = REC.since(mark);
        f.keys = got.keys;
        f.attention = got.attention;
        f.sound_log = FG.sound ? FG.sound.log.slice(soundMark) : [];
        return JSON.parse(JSON.stringify(f));
      }

      function keepGame(rec) {
        var f = gameFile(rec, "partial game");
        if (!f.game.ended) {
          f.game.ended = FG.game.ended(f.game, "page closed", REC.now());
        } else {
          f.game.ended.page_closed_at = REC.now();
        }
        if (!f.game.result) {
          f.game.result = FG.game.modelResult(f.game);
        }
        if (!f.game.path) {
          FG.game.wayFields(f.game);
        }
        var short = header("partial game");
        short.menu = menuRec;
        short.game = FG.game.shortForm(f.game);
        FG.datapipe.keepSlot("game", fileName(n + ".partial"), f,
          {filename: fileName(n + ".partial-short"), obj: short});
      }

      var latest = null;
      refreshGame = function () {
        if (latest) {
          keepGame(latest);
        }
      };
      var g = {number: n, view: menuRec.view, renderer: {draw: function (sc) { scene = sc; view.draw(sc); }},
        settings: settings, layout: lay, seed: seed, layout_seed: layoutSeed, trial: !!trial,
        onChange: trial ? null : function (rec) { latest = rec; keepGame(rec); }};
      if (trial) {
        refreshGame = null;
        $("gameKeys").innerHTML = text("keys_" + menuRec.view) + " &middot; <kbd>Esc</kbd> back to the editor";
      }
      return FG.game.play(g).then(function (rec) {
        playing = false;
        if (trial) {
          // nothing of a try goes into the next game's file
          mark = REC.mark();
          soundMark = FG.sound ? FG.sound.log.length : 0;
          return rec.ended.how === "stopped" ? null : endOfGame(rec, null);
        }
        games = n;
        refreshGame = null;
        var saving = FG.datapipe.save(fileName(String(n)), gameFile(rec, "game"));
        FG.datapipe.dropSlot("game");
        mark = REC.mark();
        soundMark = FG.sound ? FG.sound.log.length : 0;
        if (!send) {
          root.console.log("send=0: game " + n, root.FG_SENT[root.FG_SENT.length - 1]);
        }
        return endOfGame(rec, saving);
      });
    }

    /* The end of a game: the food eaten, and Enter back to the first page. */
    function endOfGame(rec, saving) {
      var eaten = rec.steps.reduce(function (a, st) { return a + st.paid; }, 0);
      $("endTitle").textContent = text(rec.ended.how === "starved" ? "starved" : "finished");
      $("endScore").textContent = (Math.round(eaten * 10) / 10).toFixed(1);
      $("endLabel").textContent = text("eaten") + " in " +
        (rec.settings.count_steps === "all" ? rec.ended.step + " steps" : rec.ended.moves + " moves");
      $("endAgain").innerHTML = text("again");
      $("routeTitle").textContent = text("route");
      var rw = Math.max(260, Math.min(520, root.innerWidth - 90)), rh = Math.round(rw * 0.62);
      $("hud").hidden = true;
      $("gameKeys").hidden = true;
      only("end");
      FG.route.draw($("route"), rec, rw, rh);
      if (saving) {
        status("saving");
        var slow = setTimeout(function () { status("slow"); }, 25000);
        saving.then(function (r) {
          clearTimeout(slow);
          status(r);
        });
      } else {
        $("endStatus").textContent = "A try of the maze: nothing is saved or sent.";
        $("endAgain").innerHTML = "Press <kbd>Enter</kbd> to go back to the editor.";
      }
      REC.setPhase(saving ? "end " + rec.number : "end of a try");
      return new Promise(function (resolve) {
        REC.shown().then(function (at) {
          REC.listen(function (e, entry) {
            if (e.type !== "keydown") {
              return undefined;
            }
            if (e.key === "Enter" && !e.repeat && entry.t - at >= END_GUARD_MS) {
              REC.listen(null);
              resolve();
              return "menu";
            }
            return entry.t - at < END_GUARD_MS ? "ignored: too soon" : "ignored: key";
          });
        });
      });
    }

    // ---------------------------------------------------------- the editor
    var drawing = null;           // the maze being drawn, kept while it is tried
    var T = FG.mazeTools;

    /* The maze being drawn, as a maze of the game, for the settings check
     * and the tries. */
    function useDraft(shape, moves) {
      var c = T.check("draft", {shape: shape, moves: moves});
      if (c.problems.length) {
        delete FG.MAZES[T.DRAFT];
        return c.problems.join(" ");
      }
      FG.MAZES[T.DRAFT] = T.entry({shape: shape, moves: moves}, c.info);
      return null;
    }

    function editor() {
      $("hud").hidden = true;
      $("gameKeys").hidden = true;
      only("editor");
      REC.setPhase("editor");
      return new Promise(function (resolve) {
        REC.listen(function (e) { return FG.editor.key(e); });
        FG.editor.open({
          draft: drawing,
          moves: typeof all.game.steps === "number" ? all.game.steps : 120,
          // saving needs the game's online page (it waits for GitHub Pages)
          demo: !!FG.DEMO || root.location.protocol === "file:",
          taken: function (name) { return Object.prototype.hasOwnProperty.call(FG.MAZES, name); },
          fits: function (shape, moves) {
            var bad = useDraft(shape, moves);
            if (bad) {
              return bad;
            }
            try {
              FG.config.checkMaze(all, T.DRAFT, link);
              return null;
            } catch (err) {
              return err.message.replace(T.DRAFT + ": ", "").replace(T.DRAFT + " ", "");
            }
          },
          tryIt: function (view, shape, moves) {
            drawing = FG.editor.draft();
            useDraft(shape, moves);
            REC.listen(null);
            resolve({view: view});
          },
          back: function () {
            drawing = FG.editor.draft();
            REC.listen(null);
            resolve(null);
          },
          saved: function (name) {
            // the game has the maze: open the page again, with it chosen
            var q = new URLSearchParams(root.location.search);
            q.set("maze", name);
            q.set("edit", "1");
            root.location.replace(root.location.pathname + "?" + q.toString());
          }
        });
      }).then(function (r) {
        if (!r) {
          mark = REC.mark();
          return null;
        }
        var rec = {shown_at: null, chosen_at: REC.now(), view: r.view, maze: T.DRAFT, actions: [], trial: true};
        return playGame(rec, true).then(editor);
      });
    }

    function loop() {
      return menu().then(function (r) {
        return r.editor ? editor() : playGame(r);
      }).then(loop);
    }

    // ---------------------------------------------------------- the page
    root.addEventListener("resize", sizeViews);
    root.addEventListener("pagehide", function () {
      if (refreshGame) {
        refreshGame();
      }
      FG.datapipe.closeSlots();
    });
    root.addEventListener("beforeunload", function (e) {
      if (playing) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    root.addEventListener("blur", function () {
      if (playing) {
        $("focus-note").hidden = false;
      }
    });
    root.addEventListener("focus", function () {
      $("focus-note").hidden = true;
    });

    function fatal(err) {
      if (failed) {
        return;
      }
      failed = true;
      playing = false;
      REC.stop();
      if (root.console) {
        root.console.error("the game stopped:", err && err.stack ? err.stack : err);
      }
      try {
        if (refreshGame) {
          refreshGame();
        }
        FG.datapipe.closeSlots();
      } catch (e2) {
        // nothing more can be kept
      }
      message(text("title"), "Something went wrong, and the game cannot go on. What was played so far is " +
        "kept. Please tell the researchers: " + escape(err && err.message ? err.message : err));
    }

    // only the game's own errors stop it, not those of other scripts in the
    // page (a browser extension, for example)
    var here = root.location.href.replace(/[?#].*$/, "").replace(/[^\/]*$/, "");
    root.addEventListener("error", function (e) {
      if (typeof e.filename === "string" && e.filename.indexOf(here) === 0) {
        fatal(e.error || e.message);
      }
    });
    root.addEventListener("unhandledrejection", function (e) {
      var stack = e.reason && e.reason.stack;
      if (typeof stack === "string" && stack.indexOf(here) >= 0) {
        fatal(e.reason);
      }
    });

    // sound: as settings.js says at first, then as the player switches it;
    // it can play from the first key on
    if (FG.sound) {
      FG.sound.start(all.game.sound !== false);
      root.addEventListener("keydown", function () { FG.sound.unlock(); }, true);
      var btn = $("soundBtn");
      var show = function () {
        btn.classList.toggle("off", !FG.sound.on);
        btn.setAttribute("aria-label", FG.sound.on ? "sound on, press M to turn off" : "sound off, press M to turn on");
        btn.title = btn.getAttribute("aria-label");
      };
      FG.sound.listen(show);
      show();
      btn.hidden = false;
      btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        FG.sound.unlock();
        FG.sound.toggle("button");
        btn.blur();
      });
    }

    buildMenu();
    sizeViews();
    var start = loop();
    return Promise.all([REC.browser(), chooseCondition(all, p.get("condition")),
      FG.art ? FG.art.load() : Promise.resolve(0)]).then(function (both) {
      session.browser = both[0];
      session.condition = both[1];
      ready = true;
      if (!$("menu").hidden) {
        $("play").disabled = false;
      }
      return start;
    }).catch(function (err) {
      if (err !== "stopped") {
        fatal(err);
      }
    });
  }

  /* Loads a script of the game that can change while the game is online
   * (js/my_mazes.js and js/team_key.js are written by the editor), always
   * fresh rather than from the browser's cache; at once when the page has it
   * already (the demo page has them inline). */
  function loadFresh(path, there) {
    return new Promise(function (resolve) {
      if (there()) {
        resolve(true);
        return;
      }
      var tag = document.createElement("script");
      tag.src = path + "?t=" + Date.now();
      tag.onload = function () { resolve(true); };
      tag.onerror = function () { resolve(false); };
      document.head.appendChild(tag);
    });
  }

  FG.run = run;
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      Promise.all([
        loadFresh("js/my_mazes.js", function () { return FG.TEAM_MAZES !== undefined; }),
        loadFresh("js/team_key.js", function () { return FG.TEAM_KEY !== undefined; })
      ]).then(function () {
        run();
      });
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
