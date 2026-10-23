/* Zip files in the browser, for the team's data page (js/analysis.js):
 * reading the zip a storage gives for a folder of game files, and writing
 * the Excel workbook (itself a zip) and the CSV files. Deflate is the
 * browser's own (CompressionStream, DecompressionStream); where a browser
 * has no CompressionStream the files are stored as they are. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function streamed(bytes, stream) {
    var out = new Blob([bytes]).stream().pipeThrough(stream);
    return new Response(out).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function canDeflate() {
    return typeof root.CompressionStream === "function";
  }

  function inflate(bytes) {
    if (typeof root.DecompressionStream !== "function") {
      return Promise.reject(new Error("this browser cannot open compressed zip files"));
    }
    return streamed(bytes, new root.DecompressionStream("deflate-raw"));
  }

  /* The files of a zip: Promise of [{name, bytes}] (folders left out). */
  function read(buffer) {
    var b = new Uint8Array(buffer), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var end = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
      if (v.getUint32(i, true) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) {
      return Promise.reject(new Error("not a zip file"));
    }
    var count = v.getUint16(end + 10, true), at = v.getUint32(end + 16, true);
    var dec = new TextDecoder("utf-8"), jobs = [];
    for (var n = 0; n < count; n++) {
      if (v.getUint32(at, true) !== 0x02014b50) {
        return Promise.reject(new Error("the zip's list of files is broken"));
      }
      var method = v.getUint16(at + 10, true), size = v.getUint32(at + 20, true);
      var nameLen = v.getUint16(at + 28, true), extraLen = v.getUint16(at + 30, true), noteLen = v.getUint16(at + 32, true);
      var local = v.getUint32(at + 42, true);
      var name = dec.decode(b.subarray(at + 46, at + 46 + nameLen));
      at += 46 + nameLen + extraLen + noteLen;
      if (/\/$/.test(name)) {
        continue;
      }
      var start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      var data = b.subarray(start, start + size);
      jobs.push((function (name, method, data) {
        var got = method === 0 ? Promise.resolve(data) : method === 8 ? inflate(data) :
          Promise.reject(new Error(name + ": a kind of zip packing this page cannot open"));
        return got.then(function (bytes) { return {name: name, bytes: bytes}; });
      })(name, method, data));
    }
    return Promise.all(jobs);
  }

  /* A zip of files [{name, bytes or text}]: Promise of a Uint8Array. */
  function write(files) {
    var enc = new TextEncoder(), now = new Date();
    var time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    return Promise.all(files.map(function (f) {
      var raw = typeof f.bytes === "string" ? enc.encode(f.bytes) : f.bytes;
      var packed = canDeflate() ? streamed(raw, new root.CompressionStream("deflate-raw")) : Promise.resolve(raw);
      return packed.then(function (data) {
        var deflated = canDeflate() && data.length < raw.length;
        return {name: enc.encode(f.name), raw: raw, data: deflated ? data : raw, method: deflated ? 8 : 0, crc: crc32(raw)};
      });
    })).then(function (items) {
      var parts = [], dir = [], offset = 0;
      items.forEach(function (it) {
        var h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint16(6, 0x0800, true);
        h.setUint16(8, it.method, true);
        h.setUint16(10, time, true);
        h.setUint16(12, date, true);
        h.setUint32(14, it.crc, true);
        h.setUint32(18, it.data.length, true);
        h.setUint32(22, it.raw.length, true);
        h.setUint16(26, it.name.length, true);
        parts.push(new Uint8Array(h.buffer), it.name, it.data);
        var c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true);
        c.setUint16(10, it.method, true);
        c.setUint16(12, time, true);
        c.setUint16(14, date, true);
        c.setUint32(16, it.crc, true);
        c.setUint32(20, it.data.length, true);
        c.setUint32(24, it.raw.length, true);
        c.setUint16(28, it.name.length, true);
        c.setUint32(42, offset, true);
        dir.push(new Uint8Array(c.buffer), it.name);
        offset += 30 + it.name.length + it.data.length;
      });
      var dirSize = dir.reduce(function (a, p) { return a + p.length; }, 0);
      var e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true);
      e.setUint16(8, items.length, true);
      e.setUint16(10, items.length, true);
      e.setUint32(12, dirSize, true);
      e.setUint32(16, offset, true);
      var all = parts.concat(dir, [new Uint8Array(e.buffer)]);
      var out = new Uint8Array(all.reduce(function (a, p) { return a + p.length; }, 0)), pos = 0;
      all.forEach(function (p) {
        out.set(p, pos);
        pos += p.length;
      });
      return out;
    });
  }

  FG.zipfile = {read: read, write: write, crc32: crc32};
})(typeof window !== "undefined" ? window : globalThis);
