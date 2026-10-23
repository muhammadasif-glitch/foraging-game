/* The 3D view drawn by the graphics card (WebGL), at the screen's own
 * pixels, with smooth edges. It shows the same maze as the ray casting of
 * js/view3d.js, which stays for browsers without WebGL or with WebGL drawn
 * by the processor only (and the link ?gl=0): the same camera (eyes or behind the mouse, the same field of
 * view), the same colours, light and fog, the paintings in their frames
 * with their plaques, the food, signs and gramophone. The mouse is drawn
 * over it on a canvas of its own, as before.
 *
 * Each drawing also casts 1 ray for each column of the screen (no pixels):
 * how far the wall is (the mouse and the food in front of it are cut off by
 * nearer walls), which painting is in the middle of the view and how much
 * of each is seen (looking), as js/view3d.js does.
 *
 * Sharpness. The picture has the screen's pixels (at most PIXEL_RATIO_MOST
 * a CSS pixel). Only when the screen frames come more than SLOW_FRAME_MS
 * apart while the player moves (a weak graphics card on a large screen)
 * does it go down to the next of view3d's LEVELS (sooner when they come
 * more than twice that apart), and up again after UP_AFTER_MS of fast
 * frames; every change is kept (changes). */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var Wd = FG.world, A = FG.art, V = FG.view3d;
  if (!V || !Wd) {
    return;
  }
  var C = V.colours, LEVELS = V.LEVELS, fog = V.fog, lightOf = V.lightOf;
  var LOOK_FAR = V.LOOK_FAR, MOUSE_AHEAD = V.MOUSE_AHEAD;

  var COLUMNS_MOST = 1600;           // rays a drawing at most (1 per column)
  var PIXEL_RATIO_MOST = 2;
  var NEAR = 0.03, FAR = 90;
  var TEX = 1024;                    // the wall and floor textures, pixels a side (a tile)
  var LIFT = 0.0015;                 // a painting stands this far out of its wall
  var SHADOW = 0.025, SHADOW_ALPHA = 0.18;
  var SLOW_FRAME_MS = 34, FAST_FRAME_MS = 20, DOWN_AFTER = 45, UP_AFTER_MS = 12000, BLOCK_UP_MS = 60000;
  var HIDDEN_MS = 600;
  var TEXTURES_MOST = 48;            // pictures kept on the graphics card that are not in view
  var BIG_PICTURE = 700 * 700;       // pixels: a picture this big goes to the graphics card alone in a frame

  function rgb(c) {
    return [c[0] / 255, c[1] / 255, c[2] / 255];
  }

  function now() {
    return FG.recorder ? FG.recorder.now() : null;
  }

  // ------------------------------------------------------------ shaders
  var HEAD = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  var FOG_FN = "uniform vec3 u_fog;\nuniform float u_fogFar;\n" +
    "float fogOf(float d) { float f = clamp(1.0 - d / u_fogFar, 0.0, 1.0); return f * f * (3.0 - 2.0 * f); }\n";
  // the camera of js/view3d.js: x across the screen is tx / (fov ty), the
  // height z is up from the eyes, the screen's middle line at u_k
  var PROJECT = "uniform vec3 u_cam;\nuniform vec2 u_dir;\nuniform float u_fov;\nuniform float u_k;\n" +
    "uniform vec2 u_depth;\nvarying float v_d;\n" +
    "vec4 project(vec3 p) {\n" +
    "  vec2 d = p.xy - u_cam.xy;\n" +
    "  float tx = dot(d, vec2(-u_dir.y, u_dir.x));\n" +
    "  float ty = dot(d, u_dir);\n" +
    "  v_d = ty;\n" +
    "  return vec4(tx / u_fov, 2.0 * (p.z - u_cam.z) + u_k * ty, u_depth.x * ty + u_depth.y, ty);\n" +
    "}\n";

  var WORLD_VS = HEAD + PROJECT +
    "attribute vec3 a_pos;\nattribute vec2 a_uv;\nattribute vec3 a_col;\nattribute vec2 a_tile;\n" +
    "attribute float a_kind;\nattribute float a_shade;\n" +
    "varying vec2 v_uv;\nvarying vec3 v_col;\nvarying vec2 v_tile;\nvarying float v_kind;\nvarying float v_shade;\n" +
    "varying float v_v;\n" +
    "void main() {\n" +
    "  v_uv = a_uv; v_col = a_col; v_tile = a_tile; v_kind = a_kind; v_shade = a_shade; v_v = 1.0 - a_pos.z;\n" +
    "  gl_Position = project(a_pos);\n" +
    "}\n";
  // kind 0 a floor tile, 1 a wall, 2 the ground outside the maze
  var WORLD_FS = HEAD + FOG_FN +
    "uniform sampler2D u_floor;\nuniform sampler2D u_wall;\nuniform sampler2D u_light;\nuniform vec2 u_lsize;\n" +
    "uniform vec3 u_darkFloor;\nuniform vec3 u_darkWall;\n" +
    "varying vec2 v_uv;\nvarying vec3 v_col;\nvarying vec2 v_tile;\nvarying float v_kind;\nvarying float v_shade;\n" +
    "varying float v_v;\nvarying float v_d;\n" +
    "void main() {\n" +
    "  float f = fogOf(v_d);\n" +
    "  vec3 c;\n" +
    "  if (v_kind < 0.5 || v_kind > 1.5) {\n" +
    "    float L = v_kind > 1.5 ? 0.0 : texture2D(u_light, v_tile / u_lsize).r;\n" +
    "    float t = texture2D(u_floor, v_uv).r * 1.25;\n" +
    "    c = mix(u_darkFloor, v_col, L) * t;\n" +
    "  } else {\n" +
    "    float L = texture2D(u_light, v_tile / u_lsize).r;\n" +
    "    float vv = clamp(v_v, 0.0, 1.0);\n" +
    "    float t = texture2D(u_wall, vec2(v_uv.x, vv)).r * 1.25 * (0.92 + 0.08 * (1.0 - vv)) * v_shade;\n" +
    "    c = mix(u_darkWall, v_col, L) * t;\n" +
    "  }\n" +
    "  gl_FragColor = vec4(mix(u_fog, c, f), 1.0);\n" +
    "}\n";

  // on the walls (sprite 0): a picture in the light of its room; sprites
  // (1): the food, signs and gramophone, in the fog only
  var DECAL_VS = HEAD + PROJECT +
    "attribute vec3 a_pos;\nattribute vec2 a_uv;\nattribute vec3 a_col;\nattribute vec2 a_tile;\n" +
    "attribute float a_shade;\nattribute float a_alpha;\n" +
    "varying vec2 v_uv;\nvarying vec3 v_col;\nvarying vec2 v_tile;\nvarying float v_shade;\nvarying float v_alpha;\n" +
    "void main() {\n" +
    "  v_uv = a_uv; v_col = a_col; v_tile = a_tile; v_shade = a_shade; v_alpha = a_alpha;\n" +
    "  gl_Position = project(a_pos);\n" +
    "}\n";
  var DECAL_FS = HEAD + FOG_FN +
    "uniform sampler2D u_tex;\nuniform sampler2D u_light;\nuniform vec2 u_lsize;\nuniform vec3 u_darkWall;\n" +
    "uniform float u_sprite;\n" +
    "varying vec2 v_uv;\nvarying vec3 v_col;\nvarying vec2 v_tile;\nvarying float v_shade;\nvarying float v_alpha;\n" +
    "varying float v_d;\n" +
    "void main() {\n" +
    "  vec4 c = texture2D(u_tex, v_uv);\n" +
    "  float f = fogOf(v_d);\n" +
    "  float a = c.a * v_alpha;\n" +
    "  if (a < 0.004) { discard; }\n" +
    "  vec3 own = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);\n" +
    "  if (u_sprite > 0.5) {\n" +
    "    gl_FragColor = vec4(mix(u_fog, own, f) * a, a);\n" +
    "  } else {\n" +
    "    float L = texture2D(u_light, v_tile / u_lsize).r;\n" +
    "    vec3 lit = mix(u_darkWall, own * v_col, L) * v_shade * (0.85 + 0.15 * L);\n" +
    "    gl_FragColor = vec4(mix(u_fog, lit, f) * a, a);\n" +
    "  }\n" +
    "}\n";

  var SKY_VS = "attribute vec2 a_pos;\nvoid main() { gl_Position = vec4(a_pos, 0.0, 1.0); }\n";
  var SKY_FS = HEAD + "uniform float u_half;\nuniform float u_h;\nuniform vec3 u_top;\nuniform vec3 u_low;\n" +
    "void main() {\n" +
    "  float y = u_h - gl_FragCoord.y;\n" +
    "  float t = pow(clamp(y / max(1.0, u_half), 0.0, 1.0), 1.6);\n" +
    "  gl_FragColor = vec4(mix(u_top, u_low, t), 1.0);\n" +
    "}\n";

  // a picture drawn at a lower level, spread over the whole canvas
  var BLIT_VS = "attribute vec2 a_pos;\nvarying vec2 v_uv;\n" +
    "void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }\n";
  var BLIT_FS = HEAD + "uniform sampler2D u_tex;\nvarying vec2 v_uv;\n" +
    "void main() { gl_FragColor = vec4(texture2D(u_tex, v_uv).rgb, 1.0); }\n";

  function compile(gl, vs, fs) {
    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error("shader: " + gl.getShaderInfoLog(s));
      }
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("program: " + gl.getProgramInfoLog(p));
    }
    var out = {program: p, a: {}, u: {}};
    var n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveAttrib(p, i);
      out.a[info.name] = gl.getAttribLocation(p, info.name);
    }
    n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (i = 0; i < n; i++) {
      var u = gl.getActiveUniform(p, i);
      out.u[u.name] = gl.getUniformLocation(p, u.name);
    }
    return out;
  }

  // ------------------------------------------------------------ textures
  function noise(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Smooth noise over a TEX x TEX tile that repeats: cells of n pixels (n
   * divides TEX); x, y from 0 to TEX - 1. */
  function smoothNoise(rnd, n) {
    var g = TEX / n, grid = new Float32Array(g * g);
    for (var i = 0; i < g * g; i++) {
      grid[i] = rnd();
    }
    return function (x, y) {
      var x0 = (x / n) | 0, y0 = (y / n) | 0;
      var fx = x / n - x0, fy = y / n - y0;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      var x1 = x0 + 1 === g ? 0 : x0 + 1, r0 = y0 * g, r1 = (y0 + 1 === g ? 0 : y0 + 1) * g;
      var top = grid[r0 + x0] + (grid[r0 + x1] - grid[r0 + x0]) * fx;
      var bot = grid[r1 + x0] + (grid[r1 + x1] - grid[r1 + x0]) * fx;
      return top + (bot - top) * fy;
    };
  }

  /* The plaster of the walls (a skirting board at the bottom, a moulding
   * at the top) and the tiles of the floor, as js/world.js has them, 16
   * times as fine (S = 4 times across), with a fine grain of their own;
   * light and shade 0 to 1.25, stored / 1.25. */
  var S = TEX / 256;
  function plaster() {
    var out = new Uint8Array(TEX * TEX * 4), rnd = noise(23);
    var big = smoothNoise(rnd, 32 * S), mid = smoothNoise(rnd, 8 * S), fine = smoothNoise(rnd, 2 * S);
    for (var y = 0; y < TEX; y++) {
      for (var x = 0; x < TEX; x++) {
        var v;
        if (y >= 236 * S) {
          v = 0.7 + 0.03 * mid(x, y) + 0.01 * fine(x, y);
        } else if (y >= 232 * S) {
          v = 0.55;
        } else if (y < 8 * S) {
          v = 1.02;
        } else if (y < 12 * S) {
          v = 0.78;
        } else {
          v = 0.9 + 0.06 * big(x, y) + 0.025 * mid(x, y) + 0.012 * fine(x, y) + 0.01 * rnd();
        }
        var b = Math.max(0, Math.min(255, Math.round(v / 1.25 * 255)));
        var o = (y * TEX + x) * 4;
        out[o] = out[o + 1] = out[o + 2] = b;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  function floorTiles() {
    var out = new Uint8Array(TEX * TEX * 4), rnd = noise(11);
    var mid = smoothNoise(rnd, 16 * S), fine = smoothNoise(rnd, 4 * S);
    var half = 128 * S;
    for (var y = 0; y < TEX; y++) {
      for (var x = 0; x < TEX; x++) {
        var ty = y % half, tx = x % half;
        var line = ty < 6 * S || tx < 6 * S;
        var v = line ? 0.7 + 0.02 * fine(x, y) : 0.93 + 0.05 * mid(x, y) + 0.015 * fine(x, y) + 0.015 * rnd();
        if (!line && (ty < 8 * S || tx < 8 * S)) {
          v -= 0.06;                       // the edge of a tile, a little lower
        }
        var b = Math.max(0, Math.min(255, Math.round(v / 1.25 * 255)));
        var o = (y * TEX + x) * 4;
        out[o] = out[o + 1] = out[o + 2] = b;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  function pot(n) {
    var p = 1;
    while (p * 2 <= n) {
      p *= 2;
    }
    return n - p > p * 2 - n ? p * 2 : p;
  }

  // ------------------------------------------------------------ the view
  function GLView(canvas, gl, gl2) {
    V.View.call(this, canvas);
    this.gl = gl;
    this.gl2 = gl2;
    this.kind = gl2 ? "webgl2" : "webgl";
    this.over = document.createElement("canvas");
    this.over.className = "over3d";
    canvas.parentNode.insertBefore(this.over, canvas.nextSibling);
    this.scale = 0;                    // the level of LEVELS the picture has
    this.frames = [];
    this.slowFrames = 0;
    this.fastSince = null;
    this.waiting = false;
    this.textures = new Map();         // canvas -> {tex, used}
    this.refused = new WeakSet();      // canvases that cannot be textures
    this.decalKey = null;
    this.ready = false;
    this.lost = false;
    var self = this;
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      self.lost = true;
      self.ready = false;
    });
    canvas.addEventListener("webglcontextrestored", function () {
      self.lost = false;
      self.target = null;
      self.painter = null;
      self.textures = new Map();
      self.mazeOf = null;
      self.decalKey = null;
      self.init();
    });
    this.init();
  }
  GLView.prototype = Object.create(V.View.prototype);

  GLView.prototype.init = function () {
    var gl = this.gl;
    this.world = compile(gl, WORLD_VS, WORLD_FS);
    this.decal = compile(gl, DECAL_VS, DECAL_FS);
    this.sky = compile(gl, SKY_VS, SKY_FS);
    this.blit = compile(gl, BLIT_VS, BLIT_FS);
    this.target = null;
    // asked once: a question to the graphics card waits for all its work
    this.aniso = gl.getExtension("EXT_texture_filter_anisotropic") ||
      gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
    this.anisoMost = this.aniso ? gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1 : 1;
    if (this.gpu === undefined) {
      try {
        var dbg = gl.getExtension("WEBGL_debug_renderer_info");
        this.gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).slice(0, 120) : null;
      } catch (err) {
        this.gpu = null;
      }
    }
    this.uint = this.gl2 || !!gl.getExtension("OES_element_index_uint");
    this.floorTex = this.rawTexture(floorTiles(), TEX, TEX, true, true);
    this.wallTex = this.rawTexture(plaster(), TEX, TEX, true, false);
    this.white = this.rawTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, false, false);
    this.lightTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // the characters of js/characters.js (three.js), made when one is first drawn
    this.painter = null;
    this.skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.decalBuf = gl.createBuffer();
    this.spriteBuf = gl.createBuffer();
    this.atlasTex = null;
    this.atlasOf = null;
    this.mazeOf = null;
    this.ready = true;
  };

  /* A texture from RGBA bytes: repeat (or clamp) across, mipmapped. */
  GLView.prototype.rawTexture = function (data, w, h, mip, repeatT) {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    if (mip) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeatT ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      if (this.aniso) {
        gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT,
          Math.min(8, this.anisoMost));
      }
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  };

  /* The texture of a canvas (a picture in its frame, a plaque, a sprite),
   * made once, mipmapped (WebGL 1: from a copy of it with sides that are
   * powers of 2). Null for a canvas the browser does not let the graphics
   * card have (a picture from another origin: the page opened as a file). */
  GLView.prototype.texture = function (c, frame) {
    var e = this.textures.get(c);
    if (e) {
      e.used = frame;
      return e.tex;
    }
    if (this.refused.has(c)) {
      return null;
    }
    // a big picture (a near painting) at most 1 a frame, so that pictures
    // coming in together do not hold up a frame; the others the next frames
    if (c.width * c.height > BIG_PICTURE) {
      if (this.bigFrame === frame) {
        this.deferred = true;
        return null;
      }
      this.bigFrame = frame;
    }
    var gl = this.gl, src = c;
    if (!this.gl2 && ((c.width & (c.width - 1)) || (c.height & (c.height - 1)))) {
      src = document.createElement("canvas");
      src.width = Math.min(2048, pot(c.width));
      src.height = Math.min(2048, pot(c.height));
      var g = src.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(c, 0, 0, src.width, src.height);
    }
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (err) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.deleteTexture(t);
      this.refused.add(c);
      return null;
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) {
      gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(4, this.anisoMost));
    }
    this.textures.set(c, {tex: t, used: frame});
    return t;
  };

  /* Lets go of the textures not used for a while, beyond TEXTURES_MOST. */
  GLView.prototype.tidyTextures = function (frame) {
    if (this.textures.size <= TEXTURES_MOST) {
      return;
    }
    var gl = this.gl, old = [];
    this.textures.forEach(function (e, c) {
      if (frame - e.used > 120) {
        old.push([e.used, c]);
      }
    });
    old.sort(function (a, b) { return a[0] - b[0]; });
    for (var i = 0; i < old.length && this.textures.size > TEXTURES_MOST; i++) {
      gl.deleteTexture(this.textures.get(old[i][1]).tex);
      this.textures.delete(old[i][1]);
    }
  };

  /* The small pictures of all paintings (js/art.js ATLAS), as 1 texture. */
  GLView.prototype.atlas = function () {
    var at = A && A.atlas ? A.atlas() : null;
    if (!at) {
      return null;
    }
    if (this.atlasOf !== at) {
      var c = document.createElement("canvas");
      c.width = at.w;
      c.height = at.h;
      c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(at.data), at.w, at.h), 0, 0);
      if (this.atlasTex) {
        this.gl.deleteTexture(this.atlasTex);
        this.textures.delete(this.atlasCanvas);
      }
      this.atlasCanvas = c;
      this.atlasTex = this.texture(c, Infinity);
      this.atlasOf = at;
    }
    return this.atlasTex;
  };

  // ------------------------------------------------------------ the maze
  /* The floor, the walls and the ground of a maze, once: 12 numbers a
   * corner (place 3, texture 2, colour 3, the tile whose light it has 2,
   * kind, side shade). */
  GLView.prototype.buildMaze = function (M) {
    var gl = this.gl, v = [], idx = [];
    var fc = this.floorColours(M);
    var CW = rgb(C.CORRIDOR_WALL);
    function quad(p, uv, col, tile, kind, shade) {
      var n = v.length / 12;
      for (var i = 0; i < 4; i++) {
        v.push(p[i][0], p[i][1], p[i][2], uv[i][0], uv[i][1], col[0], col[1], col[2], tile[0], tile[1], kind, shade);
      }
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    }
    var G = 40;
    quad([[-G, -G, 0], [M.W + G, -G, 0], [M.W + G, M.H + G, 0], [-G, M.H + G, 0]],
      [[-G, -G], [M.W + G, -G], [M.W + G, M.H + G], [-G, M.H + G]], rgb(C.DARK_FLOOR), [0, 0], 2, 1);
    this.groundCount = 6;
    for (var y = 0; y < M.H; y++) {
      for (var x = 0; x < M.W; x++) {
        var at = y * M.W + x, kd = M.kind[at];
        if (kd === Wd.WALL) {
          continue;
        }
        var ri = kd === Wd.FLOOR ? M.roomAt[at] : -1;
        var floorCol = ri >= 0 ? [fc[ri * 3] / 255, fc[ri * 3 + 1] / 255, fc[ri * 3 + 2] / 255] : [118 / 255, 120 / 255, 126 / 255];
        var tile = [x + 0.5, y + 0.5];
        quad([[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]],
          [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], floorCol, tile, 0, 1);
        var wallCol = ri >= 0 ? (function (c) { return [(c[0] * 0.62 + 78) / 255, (c[1] * 0.62 + 78) / 255, (c[2] * 0.62 + 78) / 255]; })(M.list[ri].rgb) : CW;
        var solid = function (xx, yy) {
          return xx < 0 || yy < 0 || xx >= M.W || yy >= M.H || M.kind[yy * M.W + xx] === Wd.WALL;
        };
        // a wall on each side where the tile next to it is a wall, seen from this tile
        if (solid(x + 1, y)) {
          quad([[x + 1, y, 1], [x + 1, y + 1, 1], [x + 1, y + 1, 0], [x + 1, y, 0]],
            [[y, 0], [y + 1, 0], [y + 1, 1], [y, 1]], wallCol, tile, 1, 1);
        }
        if (solid(x - 1, y)) {
          quad([[x, y + 1, 1], [x, y, 1], [x, y, 0], [x, y + 1, 0]],
            [[y + 1, 0], [y, 0], [y, 1], [y + 1, 1]], wallCol, tile, 1, 1);
        }
        if (solid(x, y + 1)) {
          quad([[x + 1, y + 1, 1], [x, y + 1, 1], [x, y + 1, 0], [x + 1, y + 1, 0]],
            [[x + 1, 0], [x, 0], [x, 1], [x + 1, 1]], wallCol, tile, 1, 0.8);
        }
        if (solid(x, y - 1)) {
          quad([[x, y, 1], [x + 1, y, 1], [x + 1, y, 0], [x, y, 0]],
            [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1]], wallCol, tile, 1, 0.8);
        }
      }
    }
    if (this.mazeBuf) {
      gl.deleteBuffer(this.mazeBuf);
      gl.deleteBuffer(this.mazeIdx);
    }
    this.mazeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mazeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    this.mazeIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mazeIdx);
    var big = v.length / 12 > 65535;
    if (big && !this.uint) {
      throw new Error("the maze is too big for this browser's WebGL");
    }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(idx) : new Uint16Array(idx), gl.STATIC_DRAW);
    this.mazeType = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    this.mazeCount = idx.length;
    this.lightBytes = new Uint8Array(M.W * M.H);
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, M.W, M.H, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.lightBytes);
    this.mazeOf = M;
    this.decalKey = null;
  };

  // ------------------------------------------------------------ the size
  GLView.prototype.resize = function (w, h) {
    var dpr = Math.min(PIXEL_RATIO_MOST, root.devicePixelRatio || 1);
    [this.canvas, this.over].forEach(function (c) {
      c.style.width = w + "px";
      c.style.height = h + "px";
      c.style.left = "0px";
      c.style.top = "0px";
    });
    this.W = Math.round(w * dpr);
    this.H = Math.round(h * dpr);
    this.dpr = dpr;
    this.over.width = this.W;
    this.over.height = this.H;
    // the canvas has the screen's pixels whatever the level: a canvas made
    // smaller or bigger is empty until drawn again, which shows as a flash
    if (this.canvas.width !== this.W || this.canvas.height !== this.H) {
      this.canvas.width = this.W;
      this.canvas.height = this.H;
    }
    // the rays: 1 a column, at most COLUMNS_MOST
    this.rw = Math.max(200, Math.min(COLUMNS_MOST, this.W));
    this.rh = Math.max(120, Math.round(this.rw * this.H / this.W));
    this.zbuf = new Float32Array(this.rw);
    this.colPlace = new Int32Array(this.rw);
    this.setScale(this.scale, this.changes.length ? "window size" : "start");
  };

  /* The picture at level k of LEVELS of the screen's pixels: below level 0
   * drawn into a buffer of its own (target) and spread over the canvas. */
  GLView.prototype.setScale = function (k, why) {
    this.scale = k;
    this.bw = Math.max(1, Math.round(this.W * LEVELS[k]));
    this.bh = Math.max(1, Math.round(this.H * LEVELS[k]));
    this.level = k;
    this.changes.push({t: now(), level: k, scale: LEVELS[k], width: this.bw, height: this.bh,
      why: why, frame_ms: this.frameMs === undefined ? null : Math.round(this.frameMs * 10) / 10});
    this.slowFrames = 0;
    this.fastSince = null;
    this.drawn = false;
  };

  /* After each drawing (begun at t0): the time to the next screen frame,
   * which comes late when the graphics card is still at work on this one; a
   * level down when frames come too slowly, up again after a long time of
   * fast frames. */
  GLView.prototype.adapt = function (t0) {
    this.costs.push(performance.now() - t0);
    if (this.costs.length > 4000) {
      this.costs.splice(0, 2000);
    }
    if (this.waiting) {
      return;
    }
    var self = this;
    this.waiting = true;
    root.requestAnimationFrame(function () {
      self.waiting = false;
      self.frameDone(performance.now() - t0);
      if (self.redraw && self.lastScene) {
        self.redraw = false;
        self.draw(self.lastScene);
      }
    });
  };

  GLView.prototype.frameDone = function (gap) {
    var t = performance.now();
    if (this.fixed !== undefined) {
      this.frames.push(gap);
      return;
    }
    // longer: the tab was hidden
    if (gap > HIDDEN_MS) {
      return;
    }
    this.frames.push(gap);
    if (this.frames.length > 4000) {
      this.frames.splice(0, 2000);
    }
    this.frameMs = this.frameMs === undefined ? gap : this.frameMs * 0.9 + gap * 0.1;
    var k = this.scale;
    if (this.frameMs > SLOW_FRAME_MS) {
      this.slowFrames += 1;
      this.fastSince = null;
      if (this.slowFrames > (this.frameMs > 2 * SLOW_FRAME_MS ? DOWN_AFTER / 3 : DOWN_AFTER) &&
          k < LEVELS.length - 1) {
        this.blockUp = {level: k, until: t + BLOCK_UP_MS};
        this.setScale(k + 1, "slow");
        this.draw(this.lastScene);
      }
    } else {
      this.slowFrames = 0;
      if (this.frameMs < FAST_FRAME_MS && k > 0) {
        if (this.fastSince === null) {
          this.fastSince = t;
        } else if (t - this.fastSince > UP_AFTER_MS &&
            !(this.blockUp && this.blockUp.level === k - 1 && t < this.blockUp.until)) {
          this.setScale(k - 1, "fast");
          this.draw(this.lastScene);
        }
      } else {
        this.fastSince = null;
      }
    }
  };

  GLView.prototype.renderInfo = function (from) {
    var q = function (list, f) {
      var c = list.slice().sort(function (a, b) { return a - b; });
      return c.length ? Math.round(c[Math.floor(f * (c.length - 1))] * 100) / 100 : null;
    };
    return {renderer: this.kind, gpu: this.gpu === undefined ? null : this.gpu, webgl: null, levels: LEVELS.slice(),
      fixed_level: this.fixed === undefined ? null : this.fixed,
      screen: {width: this.W, height: this.H, pixel_ratio: this.dpr},
      at_start: this.atMark || null, level: this.scale, width: this.bw, height: this.bh,
      changes: this.changes.slice(from || 0),
      draw_ms: {median: q(this.costs, 0.5), p90: q(this.costs, 0.9), drawings: this.costs.length,
        ray_casting: null, over: null},
      frame_ms: {median: q(this.frames, 0.5), p90: q(this.frames, 0.9), frames: this.frames.length}};
  };

  GLView.prototype.mark = function () {
    this.costs = [];
    this.frames = [];
    this.atMark = {level: this.scale, width: this.bw, height: this.bh};
    return this.changes.length;
  };

  // ------------------------------------------------------------ drawing
  GLView.prototype.draw = function (scene, again) {
    // a canvas of a new size is empty: drawn anew in full
    if (again && this.drawn) {
      this.show(scene);
      return;
    }
    this.lastScene = scene;
    var t0 = performance.now();
    var M = scene.maze, w = this.rw, h = this.rh;
    var places = this.ensurePlaces(M);
    var gal = scene.gallery || null;
    var dirX = Math.cos(scene.angle), dirY = Math.sin(scene.angle);
    var fov = Math.tan(33 * Math.PI / 180) * (w / h) / (4 / 3);
    var planeX = -dirY * fov, planeY = dirX * fov;
    var sway = scene.sway || 0, eye = scene.eye || 0.5;
    // through the eyes, stepped back to see a near painting whole (scene.back)
    var stepBack = scene.back || 0;
    var px = scene.x - dirY * sway - dirX * stepBack, py = scene.y + dirX * sway - dirY * stepBack;
    var hor = (scene.horizon || 0.5) + (scene.bob || 0) + (scene.tilt || 0);
    var cam = scene.camera === "behind" ? scene.cam : null;
    if (cam) {
      px = cam.x;
      py = cam.y;
      eye = cam.eye;
      hor = cam.horizon + (scene.tilt || 0);
    }
    var half = h * hor;
    this.rays(scene, M, places, gal, px, py, dirX, dirY, planeX, planeY, eye, half);
    this.camera = {px: px, py: py, dirX: dirX, dirY: dirY, planeX: planeX, planeY: planeY, eye: eye, half: half,
      light: scene.light, lit: scene.lit, gallery: gal, places: places};
    // the sprites: in the picture, or (behind the mouse, nearer than it) over the mouse
    var invDet = 1 / (planeX * dirY - dirX * planeY);
    var list = this.sprites(scene).map(function (sp) {
      var dx = sp.x - px, dy = sp.y - py;
      return {sp: sp, tx: invDet * (dirY * dx - dirX * dy), ty: invDet * (-planeY * dx + planeX * dy)};
    }).filter(function (e) { return e.ty > 0.15; });
    list.sort(function (a, b) { return b.ty - a.ty; });
    var back = [], front = [];
    list.forEach(function (e) {
      var pic = e.sp.pic, ty = e.ty, fade = e.sp.fade === undefined ? 1 : e.sp.fade;
      if (fade <= 0) {
        return;
      }
      var screenX = (w / 2) * (1 + e.tx / ty);
      var hgt = Math.abs(h / ty) * e.sp.size, wid = hgt * pic.w / pic.h;
      var bottom = half + (eye * h) / ty - (e.sp.lift || 0) * h / ty;
      var item = {sp: e.sp, pic: pic, x: screenX - wid / 2, y: bottom - hgt, w: wid, h: hgt, ty: ty, fade: fade,
        hit: e.sp.hit};
      (cam && ty < cam.back - MOUSE_AHEAD ? front : back).push(item);
    });
    this.front = front;
    this.back = [];
    if (this.ready && !this.lost) {
      this.render(scene, M, places, gal, px, py, dirX, dirY, eye, hor, back);
    }
    this.drawn = true;
    this.show(scene);
    this.adapt(t0);
  };

  /* 1 ray a column: how far the wall is, the painting there, the painting
   * in the middle of the view, how much of each picture is seen. */
  GLView.prototype.rays = function (scene, M, places, gal, px, py, dirX, dirY, planeX, planeY, eye, half) {
    var w = this.rw, h = this.rh, z = this.zbuf, colPlace = this.colPlace;
    var kind = M.kind, MW = M.W, MH = M.H, WALL = Wd.WALL, roomAt = M.roomAt;
    var light = scene.light, lit = scene.lit;
    var seenCols = {}, mid = w >> 1, look = null;
    for (var x = 0; x < w; x++) {
      var camX = 2 * x / w - 1;
      var rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      var mx = Math.floor(px), my = Math.floor(py);
      var ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      var stepX = rdx < 0 ? -1 : 1, stepY = rdy < 0 ? -1 : 1;
      var sdx = rdx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx;
      var sdy = rdy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy;
      var side = 0, guard = 0;
      while (guard++ < 400) {
        if (sdx < sdy) {
          sdx += ddx; mx += stepX; side = 0;
        } else {
          sdy += ddy; my += stepY; side = 1;
        }
        if (mx < 0 || my < 0 || mx >= MW || my >= MH || kind[my * MW + mx] === WALL) {
          break;
        }
      }
      var perp = Math.max(side === 0 ? sdx - ddx : sdy - ddy, 0.0001);
      z[x] = perp;
      colPlace[x] = -1;
      var fx2 = side === 0 ? mx - stepX : mx, fy2 = side === 1 ? my - stepY : my;
      var front = fy2 * MW + fx2, inside = fx2 >= 0 && fy2 >= 0 && fx2 < MW && fy2 < MH;
      var L = inside ? (light ? light[front] : (lit[front] ? 1 : 0)) : 0;
      if (L <= 0 || roomAt[front] < 0) {
        continue;
      }
      var face = side === 0 ? (stepX > 0 ? 0 : 2) : (stepY > 0 ? 1 : 3);
      var k = places.at[front * 4 + face];
      if (k < 0) {
        continue;
      }
      var place = places.list[k];
      var pic = gal ? gal.pics[k] : -1 - (place.colour % 48);
      var along = side === 0 ? py + perp * rdy : px + perp * rdx;
      var su = (along - place.start) / 2;
      var ax = (place.flip ? 1 - su : su) * 2, D = A.layout(pic);
      colPlace[x] = k;
      if (ax >= D.px0 && ax < D.px1) {
        var lineH = h / perp, wallTop = half - (1 - eye) * lineH;
        var top = Math.max(0, wallTop), bot = Math.min(h, half + eye * lineH);
        if (bot > wallTop + D.pv0 * lineH && top < wallTop + D.pv1 * lineH) {
          seenCols[k] = (seenCols[k] || 0) + 1;
        }
      }
      if (x === mid && ax >= D.fx0 && ax < D.fx1) {
        var d = Math.hypot(px + perp * rdx - scene.x, py + perp * rdy - scene.y);
        if (d <= LOOK_FAR) {
          look = {place: k, d: d};
        }
      }
    }
    var seen = this.seen = {};
    Object.keys(seenCols).forEach(function (k) { seen[k] = seenCols[k] / w; });
    if (look) {
      look.share = seen[look.place] || 0;
    }
    this.look = look;
  };

  /* The picture on the graphics card. */
  GLView.prototype.render = function (scene, M, places, gal, px, py, dirX, dirY, eye, hor, back) {
    var gl = this.gl, bw = this.bw, bh = this.bh;
    var fbo = bw < this.canvas.width || bh < this.canvas.height ? this.buffer(bw, bh) : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    this.deferred = false;
    this.frame = (this.frame || 0) + 1;
    if (this.mazeOf !== M) {
      this.buildMaze(M);
    }
    // the light of every tile
    var lb = this.lightBytes, light = scene.light, lit = scene.lit, n = M.W * M.H;
    for (var i = 0; i < n; i++) {
      lb[i] = Math.round(Math.max(0, Math.min(1, light ? light[i] : (lit[i] ? 1 : 0))) * 255);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, M.W, M.H, gl.LUMINANCE, gl.UNSIGNED_BYTE, lb);

    gl.viewport(0, 0, bw, bh);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.clearColor(C.FOG[0] / 255, C.FOG[1] / 255, C.FOG[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // the sky down to the horizon
    var S = this.sky;
    gl.useProgram(S.program);
    gl.uniform1f(S.u.u_half, bh * hor);
    gl.uniform1f(S.u.u_h, bh);
    gl.uniform3fv(S.u.u_top, rgb(C.SKY_TOP));
    gl.uniform3fv(S.u.u_low, rgb(C.SKY_LOW));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    this.attribs(S, [["a_pos", 2]], 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // the ground, the floor and the walls; the camera a hair off the lines
    // of the tiles (a corner exactly in its plane comes out wrong on some
    // graphics cards)
    px += 3.1e-5;
    py -= 2.3e-5;
    var fov = Math.tan(33 * Math.PI / 180) * (bw / bh) / (4 / 3);
    var cam = {cam: [px, py, eye], dir: [dirX, dirY], fov: fov, k: 1 - 2 * hor,
      depth: [(FAR + NEAR) / (FAR - NEAR), -2 * FAR * NEAR / (FAR - NEAR)]};
    var P = this.world;
    gl.useProgram(P.program);
    this.cameraUniforms(P, cam);
    gl.uniform1i(P.u.u_floor, 0);
    gl.uniform1i(P.u.u_wall, 1);
    gl.uniform1i(P.u.u_light, 2);
    gl.uniform2f(P.u.u_lsize, M.W, M.H);
    gl.uniform3fv(P.u.u_darkFloor, rgb(C.DARK_FLOOR));
    gl.uniform3fv(P.u.u_darkWall, rgb(C.DARK_WALL));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.floorTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.wallTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mazeBuf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mazeIdx);
    this.attribs(P, [["a_pos", 3], ["a_uv", 2], ["a_col", 3], ["a_tile", 2], ["a_kind", 1], ["a_shade", 1]], 12);
    gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, this.groundCount, this.mazeType, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    var sz = this.mazeType === gl.UNSIGNED_INT ? 4 : 2;
    gl.drawElements(gl.TRIANGLES, this.mazeCount - this.groundCount, this.mazeType, this.groundCount * sz);

    // the character, seen from behind it
    if (scene.figure && scene.camera === "behind" && scene.cam) {
      this.drawFigure(scene, M, cam, fbo, bw, bh);
      // three.js leaves its own state: the maze's again
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, bw, bh);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
    }

    // the paintings, their frames and plaques, on the walls
    var D = this.decal;
    gl.useProgram(D.program);
    this.cameraUniforms(D, cam);
    gl.uniform1i(D.u.u_tex, 0);
    gl.uniform1i(D.u.u_light, 2);
    gl.uniform2f(D.u.u_lsize, M.W, M.H);
    gl.uniform3fv(D.u.u_darkWall, rgb(C.DARK_WALL));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -4);
    gl.depthMask(false);
    gl.uniform1f(D.u.u_sprite, 0);
    var batches = this.decals(scene, M, places, gal);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.decalBuf);
    this.attribs(D, [["a_pos", 3], ["a_uv", 2], ["a_col", 3], ["a_tile", 2], ["a_shade", 1], ["a_alpha", 1]], 12);
    var self = this;
    batches.forEach(function (b) {
      var t = b.tex === "white" ? self.white : b.tex === "atlas" ? self.atlasTex : self.texture(b.tex, self.frame);
      if (t) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.drawArrays(gl.TRIANGLES, b.first, b.count);
      }
    });
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // the food, signs, crumbs and gramophone, far to near
    gl.uniform1f(D.u.u_sprite, 1);
    var right = [-dirY, dirX], k0 = Math.tan(33 * Math.PI / 180) * 3 / 4 * 2;
    var sv = [], spr = [];
    back.forEach(function (e) {
      var sp = e.sp, size = sp.size, bwid = k0 * size * e.pic.w / e.pic.h;
      var z0 = sp.lift || 0, z1 = z0 + size;
      var ax = sp.x - right[0] * bwid / 2, ay = sp.y - right[1] * bwid / 2;
      var bx = sp.x + right[0] * bwid / 2, by = sp.y + right[1] * bwid / 2;
      var first = sv.length / 12;
      var a = e.fade;
      [[ax, ay, z1, 0, 0], [bx, by, z1, 1, 0], [bx, by, z0, 1, 1], [ax, ay, z1, 0, 0], [bx, by, z0, 1, 1],
        [ax, ay, z0, 0, 1]].forEach(function (c) {
        sv.push(c[0], c[1], c[2], c[3], c[4], 1, 1, 1, 0, 0, 1, a);
      });
      spr.push({tex: V.canvasOf(e.pic), first: first, count: 6});
      if (e.hit) {
        self.spriteHit(e, cam);
      }
    });
    if (sv.length) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sv), gl.DYNAMIC_DRAW);
      this.attribs(D, [["a_pos", 3], ["a_uv", 2], ["a_col", 3], ["a_tile", 2], ["a_shade", 1], ["a_alpha", 1]], 12);
      spr.forEach(function (s) {
        var t = self.texture(s.tex, self.frame);
        if (t) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.drawArrays(gl.TRIANGLES, s.first, s.count);
        }
      });
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    if (fbo) {
      this.spread();
    }
    this.tidyTextures(this.frame);
    if (this.deferred) {
      // a picture waits for the next frame: the walls made anew then
      this.decalKey = null;
      this.redraw = true;
    }
  };

  /* The character of the scene where the player stands, in the light of
   * its tile and the fog; fading out when the camera is very near it. Into
   * framebuffer fbo (null: the canvas) of w x h pixels. */
  GLView.prototype.drawFigure = function (scene, M, cam, fbo, w, h) {
    var F = FG.characters, fig = scene.figure, model = F ? F.loaded(fig.name) : null;
    if (!model) {
      return;
    }
    if (!this.painter) {
      try {
        this.painter = F.painter(this.gl);
      } catch (err) {
        this.painter = false;
      }
    }
    if (!this.painter) {
      return;
    }
    var at = Math.floor(scene.y) * M.W + Math.floor(scene.x);
    var L = Math.max(0, Math.min(1, lightOf(scene, at)));
    var far = F.INFO[fig.name].camera.back;
    var alpha = Math.max(0.3, Math.min(1, (scene.cam.back - 0.1 * far) / (0.22 * far)));
    this.painter.draw(model, fig, scene.x, scene.y, scene.angle, cam, fbo, w, h,
      {light: L, fog: rgb(C.FOG), fogFar: C.FOG_FAR, alpha: alpha});
  };

  /* The buffer a picture below level 0 is drawn into: w x h, with depth. */
  GLView.prototype.buffer = function (w, h) {
    var gl = this.gl, t = this.target;
    if (t && t.w === w && t.h === h) {
      return t.fbo;
    }
    if (t) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
      gl.deleteRenderbuffer(t.depth);
    }
    t = this.target = {w: w, h: h, fbo: gl.createFramebuffer(), tex: gl.createTexture(), depth: gl.createRenderbuffer()};
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, t.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, this.gl2 ? gl.DEPTH_COMPONENT24 : gl.DEPTH_COMPONENT16, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return t.fbo;
  };

  /* The picture in the buffer, spread over the whole canvas. */
  GLView.prototype.spread = function () {
    var gl = this.gl, B = this.blit;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(B.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.target.tex);
    gl.uniform1i(B.u.u_tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    this.attribs(B, [["a_pos", 2]], 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  GLView.prototype.cameraUniforms = function (P, c) {
    var gl = this.gl;
    gl.uniform3fv(P.u.u_cam, c.cam);
    gl.uniform2fv(P.u.u_dir, c.dir);
    gl.uniform1f(P.u.u_fov, c.fov);
    gl.uniform1f(P.u.u_k, c.k);
    gl.uniform2fv(P.u.u_depth, c.depth);
    gl.uniform3fv(P.u.u_fog, rgb(C.FOG));
    gl.uniform1f(P.u.u_fogFar, C.FOG_FAR);
  };

  GLView.prototype.attribs = function (P, list, stride) {
    var gl = this.gl, off = 0;
    for (var i = 0; i < 8; i++) {
      gl.disableVertexAttribArray(i);
    }
    list.forEach(function (a) {
      var at = P.a[a[0]];
      if (at !== undefined && at >= 0) {
        gl.enableVertexAttribArray(at);
        gl.vertexAttribPointer(at, a[1], gl.FLOAT, false, stride * 4, off * 4);
      }
      off += a[1];
    });
  };

  /* The pictures on the walls of the rooms in light, in batches of 1
   * texture: near ones in their frames from their own images, the others
   * from the atlas in a frame of gold; the plaques; the shadows under the
   * frames. Made anew only when something changed. */
  GLView.prototype.decals = function (scene, M, places, gal) {
    var light = scene.light, lit = scene.lit;
    var likes = !!(gal && gal.likes);
    var litKey = [], i;
    for (i = 0; i < places.list.length; i++) {
      var L = light ? light[places.list[i].front] : (lit[places.list[i].front] ? 1 : 0);
      if (L > 0) {
        litKey.push(i);
      }
    }
    var liked = gal && gal.liked ? Array.prototype.join.call(gal.liked, "") : "";
    var key = litKey.join(",") + "|" + liked + "|" + (A.changes ? A.changes() : 0) + "|" + likes;
    if (key === this.decalKey && this.decalGallery === gal) {
      return this.decalBatches;
    }
    var gl = this.gl, groups = {}, order = [], self = this;
    var atlasTex = this.atlas();
    var at = A.atlas ? A.atlas() : null;
    function group(tex) {
      var k = tex === "white" || tex === "atlas" ? tex : null;
      var g = k ? groups[k] : null;
      if (!g) {
        g = {tex: tex, v: []};
        if (k) {
          groups[k] = g;
        }
        order.push(g);
      }
      return g;
    }
    var white = group("white");
    var atlasG = atlasTex ? group("atlas") : null;
    var plaqueOff = likes ? {tex: A.plaque(false), v: []} : null, plaqueOn = likes ? {tex: A.plaque(true), v: []} : null;
    litKey.forEach(function (k) {
      var place = places.list[k], pic = gal ? gal.pics[k] : -1 - (place.colour % 48), D = A.layout(pic);
      var tile = [place.front % M.W + 0.5, Math.floor(place.front / M.W) + 0.5];
      var shade = place.alongX ? 0.8 : 1;
      var out = place.side === 0 ? [-LIFT, 0] : place.side === 2 ? [LIFT, 0] : place.side === 1 ? [0, -LIFT] : [0, LIFT];
      var pos = function (ax, v) {
        var along = place.start + (place.flip ? 2 - ax : ax), zz = 1 - v;
        return place.alongX ? [along + out[0], place.wall + out[1], zz] : [place.wall + out[0], along + out[1], zz];
      };
      var rect = function (g, x0, x1, v0, v1, uv, col, alpha) {
        var c = [pos(x0, v0), pos(x1, v0), pos(x1, v1), pos(x0, v1)];
        var cols = col.length === 2 ? [col[0], col[0], col[1], col[1]] : [col, col, col, col];
        [0, 1, 2, 0, 2, 3].forEach(function (j) {
          g.v.push(c[j][0], c[j][1], c[j][2], uv[j][0], uv[j][1], cols[j][0], cols[j][1], cols[j][2],
            tile[0], tile[1], shade, alpha);
        });
      };
      var full = [[0, 0], [1, 0], [1, 1], [0, 1]];
      var framed = A.image(pic, 1e9);
      if (framed && !self.texture(framed, self.frame)) {
        framed = null;
      }
      if (framed) {
        rect(group(framed), D.fx0, D.fx1, D.fv0, D.fv1, full, [1, 1, 1], 1);
      } else {
        var gold = rgb(A.FRAME_RGB);
        rect(white, D.fx0, D.fx1, D.fv0, D.fv1, full, [[gold[0] * 1.1, gold[1] * 1.1, gold[2] * 1.1],
          [gold[0] * 0.85, gold[1] * 0.85, gold[2] * 0.85]], 1);
        var cell = pic >= 0 && at ? A.info(pic).cell : null;
        if (cell && atlasG) {
          var u0 = (cell[0] + 0.5) / at.w, u1 = (cell[0] + cell[2] - 0.5) / at.w;
          var w0 = (cell[1] + 0.5) / at.h, w1 = (cell[1] + cell[3] - 0.5) / at.h;
          rect(atlasG, D.px0, D.px1, D.pv0, D.pv1, [[u0, w0], [u1, w0], [u1, w1], [u0, w1]], [1, 1, 1], 1);
        } else {
          rect(white, D.px0, D.px1, D.pv0, D.pv1, full, rgb(A.colour(pic)), 1);
        }
      }
      rect(white, D.fx0, D.fx1, D.fv1, D.fv1 + SHADOW, full, [0, 0, 0], SHADOW_ALPHA);
      if (likes) {
        rect(gal.liked && gal.liked[k] ? plaqueOn : plaqueOff, D.qx0, D.qx1, D.qv0, D.qv1, full, [1, 1, 1], 1);
      }
    });
    if (plaqueOff) {
      order.push(plaqueOff, plaqueOn);
    }
    var all = [], batches = [];
    order.forEach(function (g) {
      if (!g.v.length) {
        return;
      }
      batches.push({tex: g.tex, first: all.length / 12, count: g.v.length / 12});
      Array.prototype.push.apply(all, g.v);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.decalBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(all), gl.DYNAMIC_DRAW);
    this.decalKey = key;
    this.decalGallery = gal;
    this.decalBatches = batches;
    this.plaqueRects = likes ? litKey : [];
    return batches;
  };

  /* Where a sprite that can be clicked is on the screen (device pixels). */
  GLView.prototype.spriteHit = function (e) {
    var sx = this.W / this.rw, sy = this.H / this.rh;
    this.spriteHits.push({kind: e.hit, x0: e.x * sx, y0: e.y * sy, x1: (e.x + e.w) * sx, y1: (e.y + e.h) * sy, d: e.ty});
  };

  /* Where each plaque in light is on the screen (device pixels). */
  GLView.prototype.plaqueHits = function () {
    var c = this.camera, out = [];
    if (!c || !c.gallery || !c.gallery.likes) {
      return out;
    }
    var W = this.W, H = this.H, rw = this.rw, rh = this.rh, sxk = W / rw, syk = H / rh;
    var inv = 1 / (c.planeX * c.dirY - c.dirX * c.planeY);
    (this.plaqueRects || []).forEach(function (k) {
      var place = c.places.list[k], D = A.layout(c.gallery.pics[k]);
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, dsum = 0, ok = true;
      [[D.qx0, D.qv0], [D.qx1, D.qv0], [D.qx1, D.qv1], [D.qx0, D.qv1]].forEach(function (p) {
        var along = place.start + (place.flip ? 2 - p[0] : p[0]);
        var wx = place.alongX ? along : place.wall, wy = place.alongX ? place.wall : along;
        var dx = wx - c.px, dy = wy - c.py;
        var tx = inv * (c.dirY * dx - c.dirX * dy), ty = inv * (-c.planeY * dx + c.planeX * dy);
        if (ty < 0.05) {
          ok = false;
          return;
        }
        var X = (rw / 2) * (1 + tx / ty) * sxk, Y = (c.half - (1 - p[1] - c.eye) * rh / ty) * syk;
        x0 = Math.min(x0, X);
        x1 = Math.max(x1, X);
        y0 = Math.min(y0, Y);
        y1 = Math.max(y1, Y);
        dsum += ty;
      });
      if (ok && x1 > 0 && x0 < W && y1 > 0 && y0 < H) {
        out.push({kind: "plaque", place: k, x0: x0, y0: y0, x1: x1, y1: y1, d: dsum / 4});
      }
    });
    return out;
  };

  /* Over the picture, on its own canvas: the mouse (its whiskers through
   * its eyes, or all of it in front of the camera behind it) and the food
   * nearer than it. */
  GLView.prototype.show = function (scene) {
    var g = this.over.getContext("2d");
    var W = this.W, H = this.H;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    if (!scene.mouse || !FG.mouse) {
      return;
    }
    if (scene.camera !== "behind" || !scene.cam) {
      FG.mouse.overlay3d(g, W, H, scene.mouse);
      return;
    }
    var cam = scene.cam, back = cam.back, z = this.zbuf, rw = this.rw, sx = W / rw;
    var fov = Math.tan(33 * Math.PI / 180) * (rw / this.rh) / (4 / 3);
    var P = function (f, s, u) {
      var d = back + f;
      if (d < 0.08) {
        return {x: 0, y: 0, k: 0, d: d};
      }
      return {x: W / 2 * (1 + s / (fov * d)), y: H * (cam.horizon + (scene.tilt || 0)) + (cam.eye - u) * H / d,
        k: H / d, d: d};
    };
    g.save();
    g.beginPath();
    for (var x = 0; x < rw;) {
      if (z[x] < back - 0.05) {
        x++;
        continue;
      }
      var x0 = x;
      while (x < rw && z[x] >= back - 0.05) {
        x++;
      }
      g.rect(x0 * sx, 0, (x - x0) * sx, H);
    }
    g.clip();
    FG.mouse.drawBehind(g, P, scene.mouse);
    g.restore();
    var self = this, hits = [];
    (this.front || []).forEach(function (e) { self.sprite(g, e, hits); });
    this.frontHits = hits;
  };

  /* What is at (x, y), CSS pixels: a plaque or the gramophone not behind a
   * wall, the nearest; or null. */
  GLView.prototype.hit = function (x, y) {
    var X = x * this.dpr, Y = y * this.dpr, best = null;
    var col = Math.max(0, Math.min(this.rw - 1, Math.floor(X / this.W * this.rw)));
    var wall = this.zbuf ? this.zbuf[col] : Infinity;
    this.plaqueHits().concat(this.spriteHits || [], this.frontHits || []).forEach(function (h) {
      if (X < h.x0 || X > h.x1 || Y < h.y0 || Y > h.y1 || h.d > wall + 0.08) {
        return;
      }
      if (!best || h.d < best.d) {
        best = h;
      }
    });
    return best ? {kind: best.kind, place: best.place === undefined ? null : best.place, d: best.d} : null;
  };

  // graphics "cards" that are programs on the processor: slower there than
  // the ray casting
  var SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i;

  /* A WebGL view on canvas, or null (then canvas is left as it was, for the
   * ray casting) where the browser has no WebGL, or only WebGL drawn by the
   * processor, unless any is true (the link ?gl=1, for the checks). Why there
   * is none: FG.gl3d.refused, "none" or "software". WebGL is tried on a
   * canvas of its own first, so that a failure leaves canvas free. */
  function create(canvas, any, level) {
    var opts = {antialias: true, alpha: false, depth: true, premultipliedAlpha: true, preserveDrawingBuffer: false,
      powerPreference: "high-performance", failIfMajorPerformanceCaveat: !any};
    var probe = document.createElement("canvas");
    var test = null, two = false;
    FG.gl3d.refused = null;
    try {
      test = probe.getContext("webgl2", opts);
      two = !!test;
      test = test || probe.getContext("webgl", opts) || probe.getContext("experimental-webgl", opts);
      if (!test && !any) {
        // is there one drawn by the processor?
        opts.failIfMajorPerformanceCaveat = false;
        var soft = probe.getContext("webgl2", opts) || probe.getContext("webgl", opts);
        FG.gl3d.refused = soft ? "software" : "none";
        return null;
      }
      if (!test) {
        FG.gl3d.refused = "none";
        return null;
      }
      var dbg = test.getExtension("WEBGL_debug_renderer_info");
      if (!any && dbg && SOFTWARE.test(String(test.getParameter(dbg.UNMASKED_RENDERER_WEBGL)))) {
        FG.gl3d.refused = "software";
        return null;
      }
      compile(test, WORLD_VS, WORLD_FS);
      compile(test, DECAL_VS, DECAL_FS);
      var lose = test.getExtension("WEBGL_lose_context");
      if (lose) {
        lose.loseContext();
      }
    } catch (err) {
      FG.gl3d.refused = FG.gl3d.refused || "none";
      return null;
    }
    var gl = null;
    try {
      gl = (two ? canvas.getContext("webgl2", opts) : null) || canvas.getContext("webgl", opts) ||
        canvas.getContext("experimental-webgl", opts);
    } catch (err) {
      gl = null;
    }
    if (!gl) {
      FG.gl3d.refused = "none";
      return null;
    }
    var gl2 = typeof root.WebGL2RenderingContext !== "undefined" && gl instanceof root.WebGL2RenderingContext;
    var v = new GLView(canvas, gl, gl2);
    // a level the picture keeps (the link ?level=, for the checks)
    if (level !== undefined && level !== null && level >= 0 && level < LEVELS.length) {
      v.fixed = level;
      v.scale = level;
    }
    v.spriteHits = [];
    var draw = v.draw;
    v.draw = function (scene, again) {
      if (!again || !this.drawn) {
        this.spriteHits = [];
      }
      return draw.call(this, scene, again);
    };
    return v;
  }

  FG.gl3d = {create: create, TEX: TEX, refused: null};
})(typeof window !== "undefined" ? window : globalThis);
