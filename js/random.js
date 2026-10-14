/* Seeded random numbers, so that every layout and every random refill of a
 * game can be made again from the seed recorded with it. sfc32, seeded
 * through splitmix32; each number in [0, 1) has 53 random bits. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  function splitmix32(a) {
    return function () {
      a = (a + 0x9e3779b9) | 0;
      var z = a;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
  }

  function make(seed) {
    var init = splitmix32(seed >>> 0);
    var a = init(), b = init(), c = init(), d = init();
    function next32() {
      var t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return t >>> 0;
    }
    for (var i = 0; i < 12; i++) {
      next32();
    }
    var rand = function () {
      var hi = next32() >>> 5, lo = next32() >>> 6;
      return (hi * 67108864 + lo) / 9007199254740992;
    };
    rand.int = function (n) {
      return Math.floor(rand() * n);
    };
    rand.pick = function (list) {
      return list[rand.int(list.length)];
    };
    return rand;
  }

  /* A seed from 2 numbers: the session's seed and, for example, a game's
   * number. */
  function derive(seed, k) {
    var f = splitmix32(((seed >>> 0) ^ Math.imul((k >>> 0) + 1, 0x27d4eb2d)) >>> 0);
    f();
    return f();
  }

  /* A seed nobody can guess, from the browser's own generator. */
  function freshSeed() {
    var c = root.crypto || (root.window && root.window.crypto);
    if (c && c.getRandomValues) {
      var a = new Uint32Array(1);
      c.getRandomValues(a);
      return a[0];
    }
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }

  function freshId(n) {
    var out = "";
    var digits = "0123456789abcdef";
    for (var i = 0; i < n; i++) {
      out += digits[freshSeed() % 16];
    }
    return out;
  }

  FG.random = {make: make, derive: derive, freshSeed: freshSeed, freshId: freshId};
})(typeof window !== "undefined" ? window : globalThis);
