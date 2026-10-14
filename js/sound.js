/* Music and sounds, made in the browser (Web Audio, no sound files): quiet
 * music, footsteps, eating, a bump at a wall, a chime when food has grown
 * back, and a short tune at the end of a game.
 *
 * Sound starts with the first key the player presses (browsers allow sound
 * only after one). The player turns it on and off with M or the button in
 * the corner; settings.js gives how a session starts (game.sound). Every
 * switch is kept in log, with its time and how it was made. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var ctx = null, master = null, music = null, effects = null, noiseBuf = null;
  var on = true, unlocked = false;
  var log = [];
  var listeners = [];
  var timer = null, nextBeat = 0, beat = 0;
  var steps = 0;

  var BPM = 68;
  // 8 bars, 1 chord a bar (MIDI notes): Cmaj7 Am7 Fmaj7 G6 Em7 Am7 Dm7 Gsus
  var CHORDS = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 52, 59],
    [40, 47, 50, 55], [45, 52, 55, 60], [38, 45, 48, 53], [43, 50, 53, 60]];
  var ARP = [0, 2, 1, 3, 2, 1, 3, 2];
  var ARP_ON = [1, 0, 1, 1, 0, 1, 1, 0];

  function hz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function make() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) {
      return false;
    }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 1 : 0;
    master.connect(ctx.destination);
    music = ctx.createGain();
    music.gain.value = 0.55;
    effects = ctx.createGain();
    effects.gain.value = 0.9;
    // a soft echo for the music
    var delay = ctx.createDelay(1);
    delay.delayTime.value = 60 / BPM * 0.75;
    var fb = ctx.createGain();
    fb.gain.value = 0.28;
    var tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2200;
    music.connect(master);
    music.connect(delay);
    delay.connect(tone);
    tone.connect(fb);
    fb.connect(delay);
    tone.connect(master);
    effects.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0), a = 12345;
    for (var i = 0; i < d.length; i++) {
      a = (a * 1103515245 + 12345) % 2147483648;
      d[i] = a / 1073741824 - 1;
    }
    return true;
  }

  function note(dest, f, at, len, vol, type, attack) {
    var o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = f;
    gn.gain.setValueAtTime(0, at);
    gn.gain.linearRampToValueAtTime(vol, at + (attack || 0.01));
    gn.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(gn);
    gn.connect(dest);
    o.start(at);
    o.stop(at + len + 0.05);
  }

  function noise(at, len, vol, freq, q, type) {
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gn = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = type || "bandpass";
    f.frequency.value = freq;
    f.Q.value = q || 1;
    gn.gain.setValueAtTime(vol, at);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(f);
    f.connect(gn);
    gn.connect(effects);
    src.start(at, (at * 7.3) % 0.8, len + 0.05);
  }

  // ------------------------------------------------------------ music
  function schedule() {
    var spb = 60 / BPM;
    while (nextBeat < ctx.currentTime + 0.5) {
      var bar = Math.floor(beat / 4) % CHORDS.length, inBar = beat % 4, chord = CHORDS[bar];
      if (inBar === 0) {
        // the chord, held for the bar, and its root below
        chord.forEach(function (m, i) {
          note(music, hz(m + 12), nextBeat, spb * 4.4, 0.022 + (i === 0 ? 0.006 : 0), "triangle", 0.9);
          note(music, hz(m + 12) * 1.003, nextBeat, spb * 4.4, 0.012, "sine", 1.1);
        });
        note(music, hz(chord[0]), nextBeat, spb * 2, 0.05, "sine", 0.02);
      }
      if (inBar === 2) {
        note(music, hz(chord[0]), nextBeat, spb * 1.6, 0.035, "sine", 0.02);
      }
      // a slow broken chord above
      for (var half = 0; half < 2; half++) {
        var k = (inBar * 2 + half) % 8;
        if (ARP_ON[(k + bar) % 8]) {
          note(music, hz(chord[ARP[k]] + 24), nextBeat + half * spb / 2, spb * 1.4, 0.016, "sine", 0.01);
        }
      }
      nextBeat += spb;
      beat += 1;
    }
  }

  function startMusic() {
    if (!ctx || timer) {
      return;
    }
    nextBeat = ctx.currentTime + 0.15;
    timer = setInterval(schedule, 120);
    schedule();
  }

  function stopMusic() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // ------------------------------------------------------------ the switch
  /* The first key: from now on sound can play. */
  function unlock() {
    if (unlocked) {
      return;
    }
    unlocked = true;
    try {
      if (!make()) {
        return;
      }
      if (ctx.state === "suspended" && ctx.resume) {
        ctx.resume();
      }
      if (on) {
        startMusic();
      }
    } catch (err) {
      ctx = null;
    }
  }

  function set(value, by) {
    value = !!value;
    if (value === on) {
      return on;
    }
    on = value;
    if (ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
      if (on) {
        startMusic();
      } else {
        stopMusic();
      }
    }
    var entry = {t: FG.recorder ? FG.recorder.now() : null, phase: FG.recorder ? FG.recorder.phase : null,
      on: on, by: by || null};
    log.push(entry);
    listeners.forEach(function (fn) { fn(entry); });
    return on;
  }

  /* How a session starts; not a switch by the player, so not logged. */
  function start(value) {
    on = !!value;
  }

  function toggle(by) {
    return set(!on, by);
  }

  function listen(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (f) { return f !== fn; });
    };
  }

  function ready() {
    return !!(ctx && on);
  }

  // ------------------------------------------------------------ sounds
  function step(soft) {
    if (!ready()) {
      return;
    }
    var at = ctx.currentTime + 0.005;
    steps += 1;
    var f = steps % 2 ? 900 : 760;
    noise(at, soft ? 0.05 : 0.09, soft ? 0.18 : 0.32, f, 1.4);
    noise(at, 0.05, soft ? 0.1 : 0.18, 180, 0.8, "lowpass");
  }

  function crunch(amount) {
    if (!ready()) {
      return;
    }
    var at = ctx.currentTime + 0.01, n = 4 + Math.min(4, Math.round(amount || 1));
    for (var i = 0; i < n; i++) {
      noise(at + i * 0.045 + (i % 2) * 0.012, 0.04, 0.32, 2400 + (i % 3) * 900, 3);
    }
  }

  function bump() {
    if (!ready()) {
      return;
    }
    var at = ctx.currentTime + 0.005;
    var o = ctx.createOscillator(), gn = ctx.createGain();
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(50, at + 0.18);
    gn.gain.setValueAtTime(0.4, at);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    o.connect(gn);
    gn.connect(effects);
    o.start(at);
    o.stop(at + 0.25);
    noise(at, 0.08, 0.2, 300, 0.7, "lowpass");
  }

  function grown() {
    if (!ready()) {
      return;
    }
    var at = ctx.currentTime + 0.01;
    note(effects, hz(84), at, 0.5, 0.05);
    note(effects, hz(91), at + 0.08, 0.6, 0.04);
  }

  function end() {
    if (!ready()) {
      return;
    }
    var at = ctx.currentTime + 0.05;
    [72, 76, 79, 84].forEach(function (m, i) {
      note(effects, hz(m), at + i * 0.16, 1.2, 0.07);
      note(effects, hz(m) * 2, at + i * 0.16, 0.6, 0.015);
    });
  }

  FG.sound = {
    unlock: unlock, set: set, start: start, toggle: toggle, listen: listen,
    step: step, crunch: crunch, bump: bump, grown: grown, end: end,
    get on() { return on; },
    get playing() { return ready(); },
    get log() { return log.slice(); }
  };
})(typeof window !== "undefined" ? window : globalThis);
