/* The music room: 1 room of every game (never the start room or a food
 * room) has a gramophone. In that room the player plays a record with P or
 * a click on the gramophone, and stops it the same way; each record is
 * another famous piece of js/music.js, in an order shuffled for the game.
 * The music is loudest in the room and fades out on the way to the rooms
 * around it (HEAR_FULL, HEAR_GONE). M (the sound switch) mutes it as it
 * does every sound; while a record plays the game's own quiet music rests.
 *
 * Here: the gramophone as the views draw it, the notes that rise from its
 * horn while it plays, and the record player (an audio element). */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  // the music at full strength up to HEAR_FULL tiles from the gramophone,
  // gone at HEAR_GONE
  var HEAR_FULL = 2.6, HEAR_GONE = 9;
  var pic = null, notes = [];

  /* The gramophone from the side: {w, h, canvas}, standing on the bottom
   * edge, its horn up to the left. */
  function sprite() {
    if (pic) {
      return pic;
    }
    var c = document.createElement("canvas");
    c.width = 200;
    c.height = 230;
    var g = c.getContext("2d");
    // the shadow on the floor
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.beginPath();
    g.ellipse(110, 224, 78, 6, 0, 0, 2 * Math.PI);
    g.fill();
    // the cabinet
    var wood = g.createLinearGradient(40, 0, 180, 0);
    wood.addColorStop(0, "#5c3417");
    wood.addColorStop(0.45, "#9a5f31");
    wood.addColorStop(1, "#4e2c12");
    g.fillStyle = wood;
    g.fillRect(44, 150, 132, 72);
    g.fillStyle = "#3a1f0c";
    g.fillRect(44, 150, 132, 6);
    g.fillRect(44, 216, 132, 6);
    g.strokeStyle = "rgba(255,220,170,0.35)";
    g.lineWidth = 2;
    g.strokeRect(56, 163, 108, 46);
    // the crank
    g.strokeStyle = "#c9a24b";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(176, 186);
    g.lineTo(190, 186);
    g.lineTo(190, 200);
    g.stroke();
    // the record on its turntable
    g.fillStyle = "#16130f";
    g.beginPath();
    g.ellipse(110, 146, 62, 11, 0, 0, 2 * Math.PI);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 1;
    for (var r = 18; r < 60; r += 8) {
      g.beginPath();
      g.ellipse(110, 146, r, r * 0.18, 0, 0, 2 * Math.PI);
      g.stroke();
    }
    g.fillStyle = "#b5322b";
    g.beginPath();
    g.ellipse(110, 146, 12, 2.6, 0, 0, 2 * Math.PI);
    g.fill();
    // the horn: from the sound box on the record, up and open to the left
    var brass = g.createLinearGradient(20, 10, 150, 140);
    brass.addColorStop(0, "#f3d27a");
    brass.addColorStop(0.5, "#c8922e");
    brass.addColorStop(1, "#7c5216");
    g.fillStyle = brass;
    g.beginPath();
    g.moveTo(138, 134);
    g.quadraticCurveTo(128, 104, 98, 92);
    g.lineTo(18, 74);
    g.quadraticCurveTo(28, 20, 74, 8);
    g.quadraticCurveTo(102, 62, 146, 128);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(90,58,12,0.8)";
    g.lineWidth = 2;
    g.stroke();
    // the open bell of the horn
    g.fillStyle = "#4a300c";
    g.beginPath();
    g.ellipse(46, 41, 14, 37, -0.62, 0, 2 * Math.PI);
    g.fill();
    g.strokeStyle = "#f3d27a";
    g.lineWidth = 4;
    g.stroke();
    // the arm and the sound box
    g.strokeStyle = "#d8b25a";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(166, 140);
    g.lineTo(144, 132);
    g.stroke();
    g.fillStyle = "#e0c070";
    g.beginPath();
    g.arc(141, 133, 7, 0, 2 * Math.PI);
    g.fill();
    pic = {w: c.width, h: c.height, canvas: c};
    return pic;
  }

  /* A music note rising from the horn: {w, h, canvas}; 2 kinds. */
  function note(n) {
    var k = n % 2;
    if (!notes[k]) {
      var c = document.createElement("canvas");
      c.width = 48;
      c.height = 56;
      var g = c.getContext("2d");
      var shape = function (wide) {
        g.lineWidth = wide;
        g.beginPath();
        g.ellipse(14, 46, 8, 6, -0.4, 0, 2 * Math.PI);
        if (k === 1) {
          g.moveTo(45, 40);
          g.ellipse(38, 40, 8, 6, -0.4, 0, 2 * Math.PI);
        }
        g.fill();
        g.stroke();
        g.beginPath();
        g.moveTo(21, 44);
        g.lineTo(21, 7);
        if (k === 0) {
          g.quadraticCurveTo(36, 14, 35, 28);
        } else {
          g.lineTo(45, 4);
          g.lineTo(45, 38);
        }
        g.stroke();
      };
      // gold, edged dark, to be seen on light walls and on dark floors
      g.lineJoin = "round";
      g.lineCap = "round";
      g.fillStyle = "#2a2111";
      g.strokeStyle = "#2a2111";
      shape(8);
      g.fillStyle = "#f5c542";
      g.strokeStyle = "#f5c542";
      shape(3.5);
      notes[k] = {w: c.width, h: c.height, canvas: c};
    }
    return notes[k];
  }

  /* The notes over a gramophone at (x, y) that plays since t0 (ms), at time
   * now: [{x, y, lift, size, n, fade}] for the 3D view (lift: how high, in
   * tiles), 3 at a time, each rising for 2.4 s. */
  function rising(x, y, t0, now) {
    var out = [], RISE = 2400;
    for (var i = 0; i < 3; i++) {
      var age = (now - t0 + i * RISE / 3) % RISE, k = age / RISE;
      var turn = Math.floor((now - t0 + i * RISE / 3) / RISE) + i;
      out.push({x: x - 0.18 + 0.12 * Math.sin(turn * 1.7 + k * 3), y: y + 0.05 * Math.cos(turn * 2.3),
        lift: 0.5 + k * 0.42, size: 0.09, n: turn, fade: Math.min(1, k * 5, (1 - k) * 3)});
    }
    return out;
  }

  /* How loud the music is d tiles from the gramophone (0 to 1). */
  function loudness(d) {
    if (d <= HEAR_FULL) {
      return 1;
    }
    var k = Math.max(0, 1 - (d - HEAR_FULL) / (HEAR_GONE - HEAR_FULL));
    return k * k;
  }

  // ------------------------------------------------------------ the player
  /* The record player: play(piece) starts a record of js/music.js from its
   * beginning, stop() stops it; onEnd(fn) hears when a record has played to
   * its end, onFail(fn) when it could not be played. */
  function Player() {
    this.audio = null;
    this.piece = null;
    this.playing = false;
    this.ends = [];
    this.fails = [];
  }

  Player.prototype.play = function (piece) {
    var self = this;
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = "auto";
      this.audio.addEventListener("ended", function () {
        if (self.playing) {
          self.playing = false;
          self.ends.forEach(function (fn) { fn(self.piece); });
        }
      });
      this.audio.addEventListener("error", function () {
        if (self.playing) {
          self.playing = false;
          self.fails.forEach(function (fn) { fn(self.piece, "the file could not be played"); });
        }
      });
    }
    this.piece = piece;
    this.playing = true;
    this.audio.src = piece.src;
    try {
      this.audio.currentTime = 0;
    } catch (err) {
      // not yet loaded: it starts at 0 anyway
    }
    var started = this.audio.play();
    if (started && started.catch) {
      started.catch(function (err) {
        if (self.playing && self.piece === piece) {
          self.playing = false;
          self.fails.forEach(function (fn) { fn(piece, String(err && err.name || err)); });
        }
      });
    }
  };

  Player.prototype.stop = function () {
    this.playing = false;
    if (this.audio) {
      this.audio.pause();
    }
  };

  /* The seconds played of the record now. */
  Player.prototype.at = function () {
    return this.audio ? this.audio.currentTime : 0;
  };

  Player.prototype.set = function (volume, muted) {
    if (this.audio) {
      this.audio.volume = Math.max(0, Math.min(1, volume));
      this.audio.muted = !!muted;
    }
  };

  Player.prototype.onEnd = function (fn) {
    this.ends.push(fn);
  };

  Player.prototype.onFail = function (fn) {
    this.fails.push(fn);
  };

  Player.prototype.close = function () {
    this.stop();
    this.ends = [];
    this.fails = [];
    if (this.audio) {
      this.audio.removeAttribute("src");
      try {
        this.audio.load();
      } catch (err) {
        // nothing to let go
      }
    }
  };

  FG.gramophone = {sprite: sprite, note: note, rising: rising, loudness: loudness,
    player: function () { return new Player(); }, HEAR_FULL: HEAR_FULL, HEAR_GONE: HEAR_GONE};
})(typeof window !== "undefined" ? window : globalThis);
