/* Music and sounds, made in the browser (Web Audio, no sound files): quiet
 * music, footsteps, eating, a bump at a wall, a chime when food has grown
 * back, and a short tune at the end of a game. For the mouse (game.player
 * "mouse"): the patter of its feet (2 feet landing a moment apart, with the
 * tick of their claws; harder on the stone of a corridor than on the floor
 * of a room), nibbling, sniffing in a new room, and its squeaks (game.voice):
 * finding a food room, bumping into a wall, a full energy bar, each a little
 * different every time. In 3D the mouse's sounds have a short echo of the
 * room or corridor it is in (space).
 *
 * The characters of js/characters.js have their own: recorded steps (shoes,
 * bare feet, armour, a robot's), voices for the same 3 moments (found,
 * oof, full) and eating, from the character's file (use; recordings under
 * CC0 from Freesound, characters/CREDITS.md), each played a little
 * differently every time; and, made here, the claws of a dog, sniffing, a
 * robot's whirr while eating, and the moments a character has no recording
 * for.
 *
 * While the gramophone of the music room plays (js/gramophone.js), the quiet
 * music rests (duck).
 *
 * Sound starts with the first key the player presses (browsers allow sound
 * only after one). The player turns it on and off with M or the button in
 * the corner; settings.js gives how a session starts (game.sound). Every
 * switch is kept in log, with its time and how it was made. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var ctx = null, master = null, music = null, effects = null, noiseBuf = null;
  var mouseBus = null, echo = null;           // the mouse's sounds, and their echo in 3D
  var on = true, unlocked = false, ducked = false;
  var log = [];
  var listeners = [];
  var timer = null, nextBeat = 0, beat = 0;
  var steps = 0;

  var BPM = 68, MUSIC_GAIN = 0.55;
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
    music.gain.value = ducked ? 0 : MUSIC_GAIN;
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
    // the mouse: straight to the effects, and through a short echo (a small
    // room: 0.4 s of fading noise, the highs fading first)
    mouseBus = ctx.createGain();
    mouseBus.connect(effects);
    var conv = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 0.4);
    var ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var data = ir.getChannelData(ch), lp = 0;
      for (i = 0; i < len; i++) {
        a = (a * 1103515245 + 12345) % 2147483648;
        var k = i / len;
        lp += ((a / 1073741824 - 1) - lp) * (0.9 - 0.75 * k);
        data[i] = lp * Math.pow(1 - k, 2.6) * (i < ctx.sampleRate * 0.006 ? 0 : 1);
      }
    }
    conv.buffer = ir;
    echo = ctx.createGain();
    echo.gain.value = 0;
    mouseBus.connect(echo);
    echo.connect(conv);
    conv.connect(effects);
    return true;
  }

  /* Where the mouse is, for the echo of its sounds: "room", "corridor" (a
   * narrow space of stone: more echo), or null (none, as in 2D). */
  function space(kind) {
    if (!ctx || !echo) {
      return;
    }
    var v = kind === "corridor" ? 0.5 : kind === "room" ? 0.3 : 0;
    echo.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
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

  /* The game's own music rests (on true) while the gramophone plays. */
  function duck(value) {
    ducked = !!value;
    if (ctx && music) {
      music.gain.cancelScheduledValues(ctx.currentTime);
      music.gain.setTargetAtTime(ducked ? 0 : MUSIC_GAIN, ctx.currentTime, ducked ? 0.25 : 0.8);
    }
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

  /* 1 step of the mouse: a pair of small feet landing a moment apart (a
   * front foot and the back foot on the other side), each a soft tap with
   * the tick of its claws; the steps take turns left and right and are
   * never twice quite the same. hard: on stone (a corridor), brighter and
   * clearer than on the floor of a room. */
  function patter(soft, hard) {
    if (!ready()) {
      return;
    }
    var at = ctx.currentTime + 0.003 + Math.random() * 0.006;
    steps += 1;
    var side = steps % 2 ? 1 : -1, wobble = 0.85 + Math.random() * 0.3;
    var vol = (soft ? 0.07 : 0.1) * (0.8 + Math.random() * 0.4);
    var bright = hard ? 1.3 : 1, thud = hard ? 0.3 : 0.55;
    [0, 0.011 + Math.random() * 0.008].forEach(function (late, n) {
      var v = n ? vol * 0.6 : vol, p = (n ? -side : side) * 0.18;
      tap(at + late, 0.02, v, 3000 * wobble * bright, 2.2, p);
      tap(at + late, 0.028, v * thud, 420 * wobble, 0.9, p, "lowpass");
      // the claws: a very short, high tick just before the pad
      tap(at + late - 0.002, 0.005, v * (hard ? 0.55 : 0.3), 7800 * wobble, 5, p);
    });
  }

  /* A short filtered noise, panned a little to one side. */
  function tap(at, len, vol, freq, q, pan, type) {
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gn = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = type || "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.linearRampToValueAtTime(vol, at + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(f);
    f.connect(gn);
    var out = gn;
    if (ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = pan || 0;
      gn.connect(p);
      out = p;
    }
    out.connect(mouseBus);
    src.start(at, Math.random() * 0.8, len + 0.05);
  }

  /* 1 squeak: a high, quick sweep from f0 to f1 with a little trill, a
   * flutter of its loudness and a breath of noise under it. */
  function chirp(at, len, f0, f1, vol) {
    var breath = ctx.createBufferSource(), bf = ctx.createBiquadFilter(), bg = ctx.createGain();
    breath.buffer = noiseBuf;
    bf.type = "bandpass";
    bf.frequency.setValueAtTime(f0, at);
    bf.frequency.exponentialRampToValueAtTime(f1, at + len * 0.7);
    bf.Q.value = 7;
    bg.gain.setValueAtTime(0.0001, at);
    bg.gain.linearRampToValueAtTime(vol * 1.6, at + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.0001, at + len);
    breath.connect(bf);
    bf.connect(bg);
    bg.connect(mouseBus);
    breath.start(at, Math.random() * 0.8, len + 0.05);
    // the flutter: the loudness going 35% up and down, 28 to 46 times a second
    var flutter = ctx.createOscillator(), fd = ctx.createGain(), fl = ctx.createGain();
    flutter.frequency.value = 28 + Math.random() * 18;
    fd.gain.value = 0.35;
    fl.gain.value = 1;
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), gn = ctx.createGain(), g2 = ctx.createGain();
    var lfo = ctx.createOscillator(), depth = ctx.createGain();
    o.type = "sine";
    o2.type = "triangle";
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + len * 0.7);
    o.frequency.exponentialRampToValueAtTime(f1 * 0.94, at + len);
    o2.frequency.setValueAtTime(f0 * 2, at);
    o2.frequency.exponentialRampToValueAtTime(f1 * 2, at + len * 0.7);
    lfo.frequency.value = 38;
    depth.gain.value = f0 * 0.035;
    lfo.connect(depth);
    depth.connect(o.frequency);
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.linearRampToValueAtTime(vol, at + 0.012);
    gn.gain.setValueAtTime(vol, at + len * 0.6);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + len);
    g2.gain.value = 0.18;
    flutter.connect(fd);
    fd.connect(fl.gain);
    o.connect(gn);
    o2.connect(g2);
    g2.connect(gn);
    gn.connect(fl);
    fl.connect(mouseBus);
    [o, o2, lfo, flutter].forEach(function (x) {
      x.start(at);
      x.stop(at + len + 0.05);
    });
  }

  /* The mouse's voice: "found" (a food room found), "oof" (into a wall),
   * "full" (the energy bar full); 1 of a few ways of saying it, each time a
   * little higher or lower. Each way: [start, length, from, to, loudness]. */
  var VOICES = {
    found: [
      [[0, 0.07, 3000, 4600, 0.045], [0.11, 0.09, 3300, 5200, 0.05]],
      [[0, 0.05, 3400, 4300, 0.04], [0.07, 0.05, 3600, 4700, 0.04], [0.15, 0.08, 3500, 5000, 0.045]],
      [[0, 0.12, 2900, 5000, 0.05]]
    ],
    oof: [
      [[0.04, 0.1, 4200, 2700, 0.036]],
      [[0.03, 0.06, 4600, 3300, 0.032], [0.1, 0.05, 3600, 2800, 0.025]],
      [[0.05, 0.08, 3900, 3000, 0.034]]
    ],
    full: [
      [[0, 0.06, 2900, 3500, 0.032], [0.09, 0.06, 3400, 4100, 0.032], [0.18, 0.09, 3900, 4800, 0.036]],
      [[0, 0.07, 3100, 3900, 0.03], [0.12, 0.1, 3600, 4700, 0.034]],
      [[0, 0.05, 3000, 3400, 0.028], [0.07, 0.05, 3300, 3800, 0.03], [0.14, 0.05, 3600, 4200, 0.03],
        [0.21, 0.08, 3900, 4700, 0.034]]
    ]
  };

  function squeak(kind) {
    if (!ready() || !VOICES[kind]) {
      return;
    }
    var ways = VOICES[kind], way = ways[Math.floor(Math.random() * ways.length)];
    var at = ctx.currentTime + 0.01, j = 0.92 + Math.random() * 0.16;
    way.forEach(function (c) {
      chirp(at + c[0], c[1] * (0.9 + Math.random() * 0.2), c[2] * j, c[3] * j, c[4]);
    });
  }

  /* Quick sniffs, as the mouse (or who: the dog) comes into a room it does
   * not know. */
  function sniff(who) {
    if (!ready()) {
      return;
    }
    var at = ctx.currentTime + 0.02;
    if (who === "dog") {
      for (var k = 0; k < 4; k++) {
        tap(at + k * 0.11, 0.08, 0.12 * (1 - k * 0.1), 2600 + Math.random() * 900, 0.8, 0);
        tap(at + k * 0.11, 0.06, 0.06, 900, 0.7, 0);
      }
      return;
    }
    for (var i = 0; i < 3; i++) {
      tap(at + i * 0.085, 0.06, 0.075 - i * 0.012, 5200 + Math.random() * 1400, 0.9, 0);
      tap(at + i * 0.085, 0.05, 0.03, 1800, 0.7, 0);
    }
  }

  // ------------------------------------------------------------ the characters
  /* A tone on the characters' sounds (with their echo): frequency from f0 to
   * f1, type, loudness vol, from at for len s; filter: [type, frequency, Q]
   * or null. */
  function tone(at, len, f0, f1, vol, type, filter, attack) {
    var o = ctx.createOscillator(), gn = ctx.createGain(), out = gn;
    o.type = type || "sine";
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + len);
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.linearRampToValueAtTime(vol, at + (attack || 0.008));
    gn.gain.exponentialRampToValueAtTime(0.0001, at + len);
    if (filter) {
      var f = ctx.createBiquadFilter();
      f.type = filter[0];
      f.frequency.value = filter[1];
      f.Q.value = filter[2] || 1;
      o.connect(f);
      f.connect(gn);
    } else {
      o.connect(gn);
    }
    out.connect(mouseBus);
    o.start(at);
    o.stop(at + len + 0.05);
  }

  /* A voice: a buzz at f0 to f1 through 2 resonances of a vowel (the mouth),
   * with a little vibrato. */
  var VOWELS = {ah: [800, 1200], uh: [620, 1100], oh: [480, 860], mm: [280, 1200]};
  function vocal(at, len, f0, f1, vol, vowel) {
    var o = ctx.createOscillator(), gn = ctx.createGain(), vib = ctx.createOscillator(), vd = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + len);
    vib.frequency.value = 5.5;
    vd.gain.value = f0 * 0.02;
    vib.connect(vd);
    vd.connect(o.frequency);
    var fm = VOWELS[vowel] || VOWELS.ah;
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.linearRampToValueAtTime(vol, at + 0.03);
    gn.gain.setValueAtTime(vol, at + len * 0.6);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + len);
    fm.forEach(function (fq, k) {
      var f = ctx.createBiquadFilter();
      f.type = vowel === "mm" && k === 0 ? "lowpass" : "bandpass";
      f.frequency.value = fq;
      f.Q.value = vowel === "mm" ? 0.9 : 5;
      var lv = ctx.createGain();
      lv.gain.value = k ? 0.45 : 1;
      o.connect(f);
      f.connect(lv);
      lv.connect(gn);
    });
    gn.connect(mouseBus);
    [o, vib].forEach(function (x) {
      x.start(at);
      x.stop(at + len + 0.05);
    });
  }

  /* The jingle and clank of armour (or of a robot's metal). */
  function clank(at, vol, metal) {
    tone(at, 0.14, metal ? 640 : 1180, metal ? 600 : 1150, vol * 0.5, "sine");
    tone(at, 0.1, metal ? 950 : 1730, metal ? 900 : 1700, vol * 0.3, "sine");
    if (!metal) {
      for (var i = 0; i < 4; i++) {
        tap(at + 0.01 + Math.random() * 0.06, 0.02, vol * 0.35, 6000 + Math.random() * 3000, 4, (Math.random() - 0.5) * 0.4);
      }
    }
  }

  // ------------------------------------------------------------ recordings
  // the recorded sounds of the character played (js/characters.js): kind
  // (steps, found, oof, full, eat) -> base64 mp3s, decoded when first
  // wanted (into AudioBuffers); until then the sounds made here play
  var own = {name: null, files: {}, buffers: {}, last: {}};
  var OWN_PITCH = {knight: 0.86};
  var STEP_VOLUME = {shoes: 0.42, bare: 1.1, armour: 0.4, robot: 0.3};

  /* The recordings of character name (its file's sounds), or none. */
  function use(name, sounds) {
    own = {name: name, files: sounds || {}, buffers: {}, last: {}};
  }

  /* The recordings of kind, decoded; null while they are not (yet). */
  function recorded(kind) {
    var b = own.buffers[kind];
    if (b) {
      return b.length ? b : null;
    }
    var files = own.files[kind];
    if (!files || !files.length || !ctx) {
      return null;
    }
    var list = own.buffers[kind] = [], mine = own;
    files.forEach(function (b64) {
      var s = root.atob(b64), bytes = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) {
        bytes[i] = s.charCodeAt(i);
      }
      try {
        ctx.decodeAudioData(bytes.buffer, function (buf) {
          if (own === mine) {
            list.push(buf);
          }
        }, function () {});
      } catch (err) {
        // (not decoded: the sound made here plays instead)
      }
    });
    return null;
  }

  /* 1 of the recordings of kind, not the one played last; null if none. */
  function pick(kind) {
    var list = recorded(kind);
    if (!list) {
      return null;
    }
    var i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === own.last[kind]) {
      i = (i + 1) % list.length;
    }
    own.last[kind] = i;
    return list[i];
  }

  /* Plays buf at time at: vol, rate (pitch and speed), filter [type, hz, q]. */
  function play(buf, at, vol, rate, filter, pan) {
    var src = ctx.createBufferSource(), gn = ctx.createGain(), last = gn;
    src.buffer = buf;
    src.playbackRate.value = rate;
    gn.gain.value = vol;
    src.connect(gn);
    if (filter) {
      var f = ctx.createBiquadFilter();
      f.type = filter[0];
      f.frequency.value = filter[1];
      if (filter[0] === "highshelf" || filter[0] === "lowshelf") {
        f.gain.value = filter[2];
      } else {
        f.Q.value = filter[2];
      }
      gn.connect(f);
      last = f;
    }
    if (pan && ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = pan;
      last.connect(p);
      last = p;
    }
    last.connect(mouseBus);
    src.start(at);
  }

  /* 1 step of a character of js/characters.js: kind (INFO sound.steps),
   * hard (on stone), mv (0 slow to 1 running). */
  function footstep(kind, hard, mv) {
    if (!ready()) {
      return;
    }
    if (kind === "patter") {
      patter(false, hard);
      return;
    }
    var buf = STEP_VOLUME[kind] ? pick("steps") : null;
    if (buf) {
      steps += 1;
      var when = ctx.currentTime + 0.002 + Math.random() * 0.006;
      var vol = STEP_VOLUME[kind] * (0.65 + 0.4 * Math.min(1, mv)) * (0.85 + Math.random() * 0.3);
      // bare feet: the soft part of a step; on stone the steps ring brighter
      var filter = kind === "bare" ? ["lowpass", 620, 0.7] : hard ? ["highshelf", 2400, 4] : null;
      play(buf, when, vol, 0.93 + Math.random() * 0.14, filter, (steps % 2 ? 1 : -1) * 0.12);
      return;
    }
    var at = ctx.currentTime + 0.003 + Math.random() * 0.006;
    steps += 1;
    var side = steps % 2 ? 1 : -1, w = 0.9 + Math.random() * 0.2, run = mv > 0.6;
    var p = side * 0.15, b = hard ? 1.25 : 1;
    if (kind === "shoes" || kind === "light_shoes") {
      var light = kind === "light_shoes";
      var v = (light ? 0.13 : 0.16) * (0.85 + Math.random() * 0.3) * (run ? 1.2 : 1);
      // the heel, then the toe (together when running)
      tap(at, 0.03, v, (light ? 2600 : 1600) * w * b, 1.3, p);
      tap(at, 0.06, v * 0.9, (light ? 230 : 140) * w, 0.8, p, "lowpass");
      if (light) {
        tap(at, 0.012, v * 0.6, 5200 * w, 4, p);
      }
      if (!run) {
        tap(at + 0.05 + Math.random() * 0.02, 0.025, v * 0.55, (light ? 3400 : 2100) * w * b, 1.5, p);
      }
    } else if (kind === "armour") {
      var va = 0.2 * (0.85 + Math.random() * 0.3);
      tap(at, 0.09, va * 1.4, 95 * w, 0.8, p, "lowpass");
      tap(at, 0.04, va * 0.6, 1300 * w * b, 1.2, p);
      clank(at + 0.012, va * (run ? 1 : 0.7), false);
    } else if (kind === "robot") {
      var vr = 0.16 * (0.9 + Math.random() * 0.2);
      tap(at, 0.07, vr * 1.2, 120 * w, 0.8, p, "lowpass");
      clank(at, vr, true);
      // the servo of the knee
      tone(at - 0.05, 0.12, 330 * w, 430 * w, vr * 0.12, "sawtooth", ["lowpass", 1400, 1]);
    } else if (kind === "claws") {
      var vd = 0.11 * (0.8 + Math.random() * 0.4);
      tap(at, 0.04, vd, 260 * w, 0.8, p, "lowpass");
      [0, 0.014 + Math.random() * 0.01].forEach(function (late, n) {
        tap(at + late, 0.008, vd * (hard ? 0.9 : 0.55) * (n ? 0.7 : 1), 6200 * w, 5, (n ? -p : p));
      });
    } else {
      // soft paws: hardly a sound, a tiny tick on stone
      var vc = 0.05 * (0.8 + Math.random() * 0.4);
      tap(at, 0.05, vc, 320 * w, 0.7, p, "lowpass");
      if (hard) {
        tap(at + 0.01, 0.006, vc * 0.5, 7000 * w, 5, p);
      }
    }
  }

  /* The voice of a character (INFO sound.voice) for "found" (a food room
   * found), "oof" (into a wall), "full" (the energy bar full); a little
   * different every time. */
  function voice(who, kind) {
    if (!ready()) {
      return;
    }
    if (who === "mouse") {
      squeak(kind);
      return;
    }
    var said = own.name ? pick(kind) : null;
    if (said) {
      play(said, ctx.currentTime + 0.01, kind === "full" ? 0.42 : 0.5,
        (OWN_PITCH[own.name] || 1) * (0.97 + Math.random() * 0.06), null, 0);
      if (kind === "oof" && who === "knight") {
        clank(ctx.currentTime, 0.18, false);
      }
      return;
    }
    var at = ctx.currentTime + 0.01, j = 0.93 + Math.random() * 0.14;
    var pitch = {man: 125, woman: 215, knight: 98}[who];
    if (pitch) {
      var f = pitch * j, v = who === "knight" ? 0.08 : 0.07;
      if (kind === "found") {
        vocal(at, 0.24, f * 1.1, f * 1.6, v, "ah");
      } else if (kind === "oof") {
        tap(at, 0.06, 0.05, 900, 0.7, 0);
        vocal(at + 0.01, 0.17, f * 1.25, f * 0.8, v, "uh");
        if (who === "knight") {
          clank(at, 0.18, false);
        }
      } else {
        vocal(at, 0.16, f, f * 0.96, v * 0.9, "mm");
        vocal(at + 0.2, 0.22, f * 0.95, f * 1.3, v * 0.9, "mm");
      }
    } else if (who === "robot") {
      if (kind === "found") {
        tone(at, 0.08, 880 * j, 880 * j, 0.06, "square", ["lowpass", 3000, 1]);
        tone(at + 0.11, 0.12, 1320 * j, 1320 * j, 0.06, "square", ["lowpass", 3000, 1]);
      } else if (kind === "oof") {
        tone(at, 0.22, 330 * j, 110 * j, 0.07, "sawtooth", ["lowpass", 1800, 2]);
        clank(at, 0.15, true);
      } else {
        [660, 880, 1320].forEach(function (fq, k) {
          tone(at + k * 0.09, 0.09, fq * j, fq * j, 0.05, "square", ["lowpass", 3200, 1]);
        });
      }
    } else if (who === "dog") {
      var bark = function (t0, f0, vol) {
        tone(t0, 0.13, f0, f0 * 0.62, vol, "sawtooth", ["bandpass", 900, 2.5], 0.004);
        tap(t0, 0.09, vol * 1.3, 1300, 1.2, 0);
      };
      if (kind === "found") {
        bark(at, 420 * j, 0.11);
        bark(at + 0.2, 400 * j, 0.1);
      } else if (kind === "oof") {
        tone(at, 0.14, 1400 * j, 760 * j, 0.06, "triangle", ["bandpass", 1300, 2]);
      } else {
        bark(at, 520 * j, 0.06);
        for (var k = 0; k < 4; k++) {
          tap(at + 0.25 + k * 0.17, 0.09, 0.05, 1600 + (k % 2) * 500, 0.8, 0);
        }
      }
    }
  }

  /* A dog eating: big chomps. */
  function chomp(amount) {
    if (!ready()) {
      return;
    }
    var at = ctx.currentTime + 0.01, n = 3 + Math.min(3, Math.round(amount || 1));
    for (var i = 0; i < n; i++) {
      tap(at + i * 0.13, 0.07, 0.2, 1000 + Math.random() * 500, 1.2, 0);
      tap(at + i * 0.13, 0.06, 0.15, 160, 0.8, 0, "lowpass");
    }
  }

  /* A robot taking in food: a whirr and a click. */
  function whirr(amount) {
    if (!ready()) {
      return;
    }
    var at = ctx.currentTime + 0.01, len = 0.3 + Math.min(0.4, 0.08 * (amount || 1));
    tone(at, len, 180, 240, 0.06, "sawtooth", ["lowpass", 900, 2]);
    tap(at + len, 0.015, 0.12, 3500, 3, 0);
  }

  /* The mouse nibbling: small, quick bites. */
  function nibble(amount) {
    if (!ready()) {
      return;
    }
    var at = ctx.currentTime + 0.01, n = 5 + Math.min(4, Math.round(amount || 1));
    for (var i = 0; i < n; i++) {
      tap(at + i * 0.034 + Math.random() * 0.008, 0.025, 0.2, 4200 + Math.random() * 2400, 3.2, (i % 2 ? 0.1 : -0.1));
    }
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

  /* Eating: how (crunch, chomp, whirr, nibble: made here) or the
   * character's recorded bites, a few, a moment apart. */
  function eat(how, amount) {
    if (!ready()) {
      return;
    }
    if (own.name && recorded("eat")) {
      var n = 2 + Math.min(2, Math.round(amount || 1)), at = ctx.currentTime + 0.01;
      var rate = own.name === "dog" ? 0.85 : 1;
      for (var i = 0; i < n; i++) {
        play(pick("eat"), at, 0.32 * (0.8 + Math.random() * 0.3), rate * (0.94 + Math.random() * 0.12), null,
          (i % 2 ? 0.08 : -0.08));
        at += 0.26 + Math.random() * 0.12;
      }
      return;
    }
    (({crunch: crunch, chomp: chomp, whirr: whirr, nibble: nibble})[how] || crunch)(amount);
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
    unlock: unlock, set: set, start: start, toggle: toggle, listen: listen, duck: duck,
    step: step, crunch: crunch, bump: bump, grown: grown, end: end,
    patter: patter, squeak: squeak, sniff: sniff, nibble: nibble, space: space,
    footstep: footstep, voice: voice, chomp: chomp, whirr: whirr, eat: eat, use: use,
    get on() { return on; },
    get playing() { return ready(); },
    get log() { return log.slice(); }
  };
})(typeof window !== "undefined" ? window : globalThis);
