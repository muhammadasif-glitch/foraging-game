/* The session: consent, player code, condition, instructions, the games of
 * settings.js in order with the memory test after each, the end question,
 * and the files sent to DataPipe.
 *
 * Link options: ?player=CODE fills in the code, ?condition=NAME or auto,
 * ?test=1 marks every file as a test (TEST_ in front of its name),
 * ?send=0 sends nothing (the files are printed to the browser console), and
 * ?set.<key>=<value> changes a setting of every game, for trying things out.
 *
 * Files, each complete on its own:
 *   <player>_<session>_<n>-<kind>.json             game n, with its memory test
 *   <player>_<session>_<n>-<kind>.partial.json     game n, cut short
 *   <player>_<session>_<n>-<kind>.partial-short.json  the same, shortened (sent on closing)
 *   <player>_<session>_end.json                    the rest of the session
 *   <player>_<session>_end.partial.json            the same, for a session cut short
 */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var REC = FG.recorder, S = FG.screens;

  FG.VERSION = "1.1.0";
  var FORMAT = "foraging-game";
  var FORMAT_VERSION = 1;

  function escape(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function stop(title, message) {
    S.page(title, "<p>" + message + "</p>", "");
  }

  /* What the game needs from the browser. */
  function missing() {
    var need = {
      "fetch": typeof root.fetch === "function",
      "Promise": typeof root.Promise === "function",
      "URLSearchParams": typeof root.URLSearchParams === "function",
      "performance.now": !!(root.performance && root.performance.now),
      "requestAnimationFrame": typeof root.requestAnimationFrame === "function",
      "BigInt": typeof root.BigInt === "function"
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
        stop(FG.text("title"), "The game could not be started. Please try again later.");
        throw "stopped";
      }
      var pick = FG.random.make(FG.random.freshSeed()).pick(names);
      return {name: pick, how: "random", datapipe: null, error: r.error};
    });
  }

  function textVars(all, s) {
    return {start: s.stomach.start, size: s.stomach.size, move_cost: s.stomach.move_cost,
      stay_cost: s.stomach.stay_cost, steps: s.steps,
      at_zero_text: FG.text(s.stomach.at_zero === "end" ? "at_zero_end" : "at_zero_continue", {}),
      map_text: FG.text(s.show.near ? "map_near" : "map_visited", {}),
      worth_text: s.show.worth ? FG.text("worth", {}) : "",
      start_text: FG.text(all.session[0].kind === "practice" ? "start_practice" : "start_first", {}),
      first_game_text: all.session[0].kind === "practice" ? FG.text("first_practice", {}) : ""};
  }

  function label(all, number) {
    var plan = all.session[number - 1];
    if (plan.kind === "practice") {
      return "Practice game";
    }
    var real = all.session.filter(function (q) { return q.kind !== "practice"; }).length;
    var before = all.session.slice(0, number).filter(function (q) { return q.kind !== "practice"; }).length;
    return "Game " + before + " of " + real;
  }

  function run() {
    var lacking = missing();
    if (lacking.length) {
      stop("Food rooms", "This game needs a recent browser (Chrome, Edge, Firefox or Safari). " +
        "This one lacks: " + escape(lacking.join(", ")) + ".");
      return Promise.resolve(null);
    }
    if (touchOnly()) {
      stop("Food rooms", "This game is played with a keyboard. Please open this page on a computer.");
      return Promise.resolve(null);
    }
    var p = new URLSearchParams(root.location.search);
    var all = FG.SETTINGS;
    var test = p.get("test") === "1";
    var send = p.get("send") !== "0";
    var link;
    try {
      link = FG.config.fromLink(p);
      FG.config.checkAll(all, link);
      var asked = p.get("condition");
      if (asked && asked !== "auto" && !(all.conditions && Object.prototype.hasOwnProperty.call(all.conditions, asked))) {
        throw new FG.config.SettingsError("the link names the condition '" + asked + "'; the conditions are " +
          Object.keys(all.conditions || {}).join(", "));
      }
    } catch (err) {
      stop("Settings error", escape(err.message) + "<br>Fix settings.js or the link and open the page again.");
      return Promise.resolve(null);
    }
    REC.start();
    REC.install();

    var session = {
      session_id: FG.random.freshId(12), player: null, test: test,
      started: new Date().toISOString(), condition: null, link: p.toString(),
      browser: null, seed: FG.random.freshSeed()
    };
    FG.datapipe.init(all.datapipe.experiment_id, session.session_id, {send: send});
    if (test) {
      document.getElementById("test-banner").hidden = false;
    }
    var earlier = {left: null};
    FG.datapipe.flush().then(function (left) { earlier.left = left; });

    var consentRecord = null, codeRecord = null, visits = null, answer = null;
    var games = [], breaks = [], sent = [];
    var phases = [];
    var running = false;
    var refreshGame = null;      // keeps the game in progress again, with the time of closing

    function header(kind) {
      return {format: FORMAT, format_version: FORMAT_VERSION, file: kind, game_version: FG.VERSION,
        player: session.player, session_id: session.session_id, test: session.test,
        session_started: session.started, condition: session.condition, link: session.link,
        browser: session.browser};
    }

    function fileName(rest) {
      return (test ? "TEST_" : "") + session.player + "_" + session.session_id + "_" + rest + ".json";
    }

    function endFile(kind) {
      var f = header(kind);
      f.session = {seed: session.seed, settings_file: all, consent: consentRecord, code: codeRecord,
        instructions: visits, games: games, breaks: breaks, end_question: answer,
        ended: kind === "end" ? new Date().toISOString() : null, ended_at: REC.now(),
        earlier_files_left: earlier.left, sending: FG.datapipe.log.slice()};
      f.keys = REC.keysNotIn(phases);
      f.attention = REC.attentionNotIn(phases);
      return JSON.parse(JSON.stringify(f));
    }

    /* The session so far, kept for the case the page is closed. */
    function keepSession() {
      if (session.player) {
        FG.datapipe.keepSlot("session", fileName("end.partial"), endFile("partial session"));
      }
    }

    root.addEventListener("pagehide", function () {
      if (running) {
        if (refreshGame) {
          refreshGame();
        }
        keepSession();
      }
      FG.datapipe.closeSlots();
    });
    root.addEventListener("beforeunload", function (e) {
      if (running) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
    root.addEventListener("blur", function () {
      if (running) {
        document.getElementById("focus-note").hidden = false;
      }
    });
    root.addEventListener("focus", function () {
      document.getElementById("focus-note").hidden = true;
    });

    var failed = false;
    function fatal(err) {
      if (failed) {
        return;
      }
      failed = true;
      running = false;
      REC.stop();
      try {
        keepSession();
        FG.datapipe.closeSlots();
      } catch (e2) {
        // nothing more can be kept
      }
      stop(FG.text("title"), "Something went wrong, and the game cannot go on. What was played so far is " +
        "kept. Please tell the researchers: " + escape(err && err.message ? err.message : err));
    }

    // only the game's own errors stop it, not those of other scripts in the
    // page (a browser extension, for example)
    function ours(where) {
      return typeof where === "string" && where.indexOf(root.location.href.replace(/[?#].*$/, "").replace(/[^\/]*$/, "")) === 0;
    }
    root.addEventListener("error", function (e) {
      if (ours(e.filename)) {
        fatal(e.error || e.message);
      }
    });
    root.addEventListener("unhandledrejection", function (e) {
      var stack = e.reason && e.reason.stack;
      if (typeof stack === "string" && stack.indexOf(root.location.href.replace(/[?#].*$/, "").replace(/[^\/]*$/, "")) >= 0) {
        fatal(e.reason);
      }
    });

    return S.consent().then(function (c) {
      consentRecord = c;
      if (!c.agreed) {
        throw "declined";
      }
      running = true;
      return S.code(p.get("player"));
    }).then(function (c) {
      codeRecord = c;
      session.player = c.code;
      if (c.code.toLowerCase() === "test") {
        test = session.test = true;
        document.getElementById("test-banner").hidden = false;
      }
      S.page(FG.text("title"), "<p>Getting ready...</p>", "");
      return Promise.all([REC.browser(), chooseCondition(all, p.get("condition"))]);
    }).then(function (both) {
      session.browser = both[0];
      session.condition = both[1];
      keepSession();
      var firstReal = all.session.filter(function (q) { return q.kind !== "practice"; })[0] || all.session[0];
      var vars = textVars(all, FG.config.gameSettings(all, session.condition.name, firstReal, link));
      return S.instructions(vars);
    }).then(function (v) {
      visits = v;
      keepSession();
      var chain = Promise.resolve();
      var layouts = [];
      all.session.forEach(function (plan, i) {
        chain = chain.then(function () {
          var number = i + 1;
          var settings = FG.config.gameSettings(all, session.condition.name, plan, link);
          var lay, seed, layoutSeed;
          if (plan.kind === "repeat") {
            lay = layouts[plan.of - 1].layout;
            seed = layouts[plan.of - 1].seed;
            layoutSeed = layouts[plan.of - 1].layoutSeed;
          } else if (plan.kind === "new") {
            seed = plan.seed !== undefined ? plan.seed : FG.random.derive(session.seed, 1000 + number);
            layoutSeed = FG.random.derive(session.seed, number);
            lay = FG.config.layout(settings, null, FG.random.make(layoutSeed));
          } else {
            seed = plan.seed !== undefined ? plan.seed : FG.random.derive(session.seed, 1000 + number);
            layoutSeed = FG.config.fixedLayoutSeed(plan, number);
            lay = FG.config.layout(settings, plan.layout, FG.random.make(layoutSeed));
          }
          layouts.push({layout: lay, seed: seed, layoutSeed: layoutSeed});
          var rest = number + "-" + plan.kind;
          var phaseNames = ["game " + number, "memory " + number];
          phases.push.apply(phases, phaseNames);

          function gameFile(rec, kind) {
            var f = header(kind);
            f.game = rec;
            f.keys = REC.keysOf(phaseNames);
            f.attention = REC.attentionOf(phaseNames);
            return JSON.parse(JSON.stringify(f));
          }

          function keepGame(rec) {
            var f = gameFile(rec, "partial game");
            if (!f.game.ended) {
              f.game.ended = {how: "page closed", step: f.game.steps.length - 1, at: REC.now()};
            } else {
              f.game.ended.page_closed_at = REC.now();
            }
            if (!f.game.result) {
              f.game.result = FG.game.modelResult(f.game);
            }
            var short = header("partial game");
            short.game = FG.game.shortForm(f.game);
            FG.datapipe.keepSlot("game", fileName(rest + ".partial"), f,
              {filename: fileName(rest + ".partial-short"), obj: short});
          }

          var latest = null;
          function changed(rec) {
            latest = rec;
            keepGame(rec);
          }
          refreshGame = function () {
            if (latest) {
              keepGame(latest);
            }
          };
          var g = {number: number, kind: plan.kind, label: label(all, number),
            repeat_of: plan.kind === "repeat" ? plan.of : null, settings: settings, layout: lay,
            seed: seed, layout_seed: layoutSeed, onChange: changed};
          return FG.game.play(g).then(function (rec) {
            var after = settings.memory_test ?
              FG.game.memoryTest(g, rec, function (test) { rec.memory_test = test; changed(rec); }) :
              Promise.resolve(null);
            return after.then(function (memory) {
              rec.memory_test = memory;
              games.push({number: number, kind: plan.kind, file: fileName(rest), ended: rec.ended});
              sent.push(FG.datapipe.save(fileName(rest), gameFile(rec, "game")));
              FG.datapipe.dropSlot("game");
              refreshGame = null;
              keepSession();
              if (i < all.session.length - 1) {
                return S.pause(number, g.label).then(function (b) {
                  breaks.push(b);
                  keepSession();
                });
              }
              return null;
            });
          });
        });
      });
      return chain;
    }).then(function () {
      return S.endQuestion();
    }).then(function (a) {
      answer = a;
      running = false;
      S.thanks();
      S.status(FG.text("saving", {}));
      var slow = setTimeout(function () { S.status(FG.text("still_saving", {})); }, 25000);
      sent.push(FG.datapipe.save(fileName("end"), endFile("end")));
      FG.datapipe.dropSlot("session");
      return Promise.all(sent).then(function (results) {
        clearTimeout(slow);
        return results;
      });
    }).then(function (results) {
      if (!results) {
        return results;
      }
      var ok = results.every(function (r) { return r.ok; });
      var st = FG.datapipe.state();
      S.status(FG.text(ok ? "saved" : (st.kept ? "not_saved" : "not_saved_open"), {}));
      if (!ok) {
        // the queue keeps trying; say so when it has got through
        var watch = setInterval(function () {
          if (FG.datapipe.state().left === 0) {
            clearInterval(watch);
            S.status(FG.text("saved", {}));
          }
        }, 5000);
      }
      if (!send) {
        root.console.log("send=0: the files of this session", root.FG_SENT);
      }
      return results;
    }).catch(function (err) {
      if (err === "stopped") {
        running = false;
        FG.datapipe.dropSlot("session");
      } else if (err !== "declined") {
        fatal(err);
      }
    });
  }

  FG.run = run;
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      run();
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
