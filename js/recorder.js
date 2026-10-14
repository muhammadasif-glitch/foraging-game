/* What is recorded besides the steps: the session clock, every key press and
 * release, attention (the window or tab losing and getting back focus), and
 * the browser, so that times can be judged.
 *
 * All times are milliseconds since the session started (performance.now()),
 * on the clock of the browser's events. Keys typed into a text field are
 * recorded as "char", not as the letter: the text itself is recorded once,
 * when it is entered. A key held down makes the browser send the press again
 * and again; those repeats are counted on the press (repeats) rather than
 * recorded 1 by 1. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var t0 = 0;
  var phase = "start";
  var keys = [];
  var attention = [];
  var handler = null;
  var stopped = false;
  var pressed = {};          // key code -> its press, until it is let go

  function now() {
    return round3(performance.now() - t0);
  }

  function at(timeStamp) {
    return round3(timeStamp - t0);
  }

  function round3(x) {
    return Math.round(x * 1000) / 1000;
  }

  function start() {
    t0 = performance.now();
  }

  /* The part of the session keys and attention events belong to, for
   * example "game 3" or "memory 3". */
  function setPhase(name) {
    phase = name;
  }

  function isText(e) {
    var t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
  }

  var GAME_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter", "Tab",
    "Left", "Right", "Up", "Down", "Spacebar"];

  function onKey(e) {
    var text = isText(e);
    var code = e.code || e.key;
    if (e.type === "keydown" && e.repeat && pressed[code]) {
      pressed[code].repeats = (pressed[code].repeats || 0) + 1;
      if (!text && (GAME_KEYS.indexOf(e.key) >= 0 || /^[0-9]$/.test(e.key)) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
      }
      return;
    }
    var entry = {
      t: at(e.timeStamp), type: e.type === "keydown" ? "down" : "up",
      key: text && e.key.length === 1 ? "char" : e.key,
      code: text && e.key.length === 1 ? "" : e.code,
      repeat: !!e.repeat, phase: phase, outcome: null
    };
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
      entry.with = [e.shiftKey ? "Shift" : "", e.ctrlKey ? "Ctrl" : "", e.altKey ? "Alt" : "",
        e.metaKey ? "Meta" : ""].filter(Boolean).join("+");
    }
    keys.push(entry);
    if (e.type === "keydown") {
      pressed[code] = entry;
    } else {
      delete pressed[code];
    }
    if (!text && (GAME_KEYS.indexOf(e.key) >= 0 || /^[0-9]$/.test(e.key)) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();            // no scrolling with the arrows or Space, Tab keeps the focus here
    }
    if (handler) {
      var outcome = handler(e, entry);
      if (outcome !== undefined) {
        entry.outcome = outcome;
      }
    }
  }

  /* fn(event, entry) gets every key event; what it returns is recorded as
   * the key's outcome (for example "move", "wall", "ignored: repeat"). */
  function listen(fn) {
    handler = stopped ? null : fn;
  }

  /* After a failure: no key does anything any more (they are still recorded). */
  function stop() {
    stopped = true;
    handler = null;
  }

  /* Whether a press of key at time t still belongs to a run of presses that
   * began before since (a screen appeared): presses less than gapMs apart,
   * with no pause between since and t. A pause ends the run for good. */
  function stillTapping(key, since, t, gapMs) {
    var times = keys.filter(function (k) { return k.type === "down" && k.key === key && k.t <= t; })
      .map(function (k) { return k.t; });
    var before = times.filter(function (x) { return x < since; });
    var last = before.length ? before[before.length - 1] : -Infinity;
    var during = times.filter(function (x) { return x >= since; });
    for (var i = 0; i < during.length; i++) {
      if (during[i] - last >= gapMs) {
        return false;
      }
      last = during[i];
    }
    return true;
  }

  function onAttention(type) {
    attention.push({t: now(), type: type, phase: phase});
  }

  function install() {
    root.addEventListener("keydown", onKey, true);
    root.addEventListener("keyup", onKey, true);
    document.addEventListener("visibilitychange", function () {
      onAttention(document.visibilityState === "hidden" ? "hidden" : "visible");
    });
    root.addEventListener("blur", function () { onAttention("blur"); });
    root.addEventListener("focus", function () { onAttention("focus"); });
  }

  /* The keys and attention events of 1 phase (or of every phase not in a
   * list of phases). */
  /* Where the records are now, to take what came after it later. */
  function mark() {
    return {keys: keys.length, attention: attention.length};
  }

  function since(m) {
    return {keys: keys.slice(m.keys), attention: attention.slice(m.attention)};
  }

  function keysOf(phases) {
    return keys.filter(function (k) { return phases.indexOf(k.phase) >= 0; });
  }

  function attentionOf(phases) {
    return attention.filter(function (a) { return phases.indexOf(a.phase) >= 0; });
  }

  function keysNotIn(phases) {
    return keys.filter(function (k) { return phases.indexOf(k.phase) < 0; });
  }

  function attentionNotIn(phases) {
    return attention.filter(function (a) { return phases.indexOf(a.phase) < 0; });
  }

  /* When a change to the page reached the screen: the start of the frame
   * after the one that drew it (the browser draws a change at the end of
   * the frame it was made in, and shows it from the next one). */
  function shown() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function (ts) {
          resolve(at(ts));
        });
      });
    });
  }

  /* The browser: what a reader of the times needs to know. Takes about 1 s
   * (it counts screen frames). */
  function browser() {
    var info = {
      user_agent: navigator.userAgent,
      languages: navigator.languages ? Array.prototype.slice.call(navigator.languages) : [navigator.language],
      screen: {width: screen.width, height: screen.height, avail_width: screen.availWidth,
        avail_height: screen.availHeight, colour_depth: screen.colorDepth},
      window: {width: root.innerWidth, height: root.innerHeight},
      pixel_ratio: root.devicePixelRatio || 1,
      time_zone: (Intl && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
      utc_offset_minutes: -new Date().getTimezoneOffset(),
      cores: navigator.hardwareConcurrency || null,
      touch_points: navigator.maxTouchPoints || 0
    };
    // the smallest step of the clock
    var smallest = Infinity, last = performance.now(), until = last + 20;
    while (last < until) {
      var t = performance.now();
      if (t > last && t - last < smallest) {
        smallest = t - last;
      }
      last = t;
    }
    info.clock_step_ms = round3(smallest);
    return new Promise(function (resolve) {
      var frames = [];
      function frame(ts) {
        frames.push(ts);
        if (frames.length < 61) {
          requestAnimationFrame(frame);
        } else {
          var gaps = [];
          for (var i = 1; i < frames.length; i++) {
            gaps.push(frames[i] - frames[i - 1]);
          }
          gaps.sort(function (a, b) { return a - b; });
          var mid = gaps[Math.floor(gaps.length / 2)];
          info.frame_ms = round3(mid);
          info.refresh_hz = mid > 0 ? Math.round(1000 / mid) : null;
          resolve(info);
        }
      }
      requestAnimationFrame(frame);
    });
  }

  FG.recorder = {
    start: start, now: now, at: at, setPhase: setPhase, listen: listen, stop: stop,
    stillTapping: stillTapping,
    install: install, mark: mark, since: since,
    keysOf: keysOf, attentionOf: attentionOf, keysNotIn: keysNotIn, attentionNotIn: attentionNotIn,
    shown: shown, browser: browser,
    get phase() { return phase; }
  };
})(typeof window !== "undefined" ? window : globalThis);
