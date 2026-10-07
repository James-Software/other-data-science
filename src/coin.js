/* Acalanes Data Fest — spinning 3D "A" coin.
 *
 * Vanilla-WebGL port of the Motion hero coin (hand-rolled, zero dependencies),
 * with two changes: matte non-shiny materials, and the Acalanes "A" logo as
 * the texture on both faces. If WebGL is unavailable the static <img> in the
 * stage is left in place, so the hero never breaks.
 */
(function () {
  "use strict";

  var stage = document.getElementById("coin-stage");
  if (!stage) return;

  var FACE = 2.0; // coin face is 2x2 world units
  var RADIUS = 0.22; // rounded-corner radius
  var DEPTH = 0.37; // extrusion depth — same feel as the Motion coin
  var SEG = 10; // arc segments per corner
  var SPIN_MS = 9000; // one revolution
  var SPIN_DELAY_MS = 3000; // spin begins ~3s in, after the entrance settles
  var STATIC_ANGLE = 0.45; // 3/4 view for the reduced-motion still frame
  var CAM_DIST = 9.9;
  var FOV_Y = (12.4 * Math.PI) / 180;

  function norm3(x, y, z) {
    var l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  }
  var KEY_DIR = norm3(-0.38, 0.65, 0.72); // fixed lamp: top-left-front

  /* Column-major mat4 helpers. */
  function matPerspective(fovY, aspect, near, far) {
    var f = 1 / Math.tan(fovY / 2);
    var nf = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ];
  }
  function matRotateY(a) {
    var c = Math.cos(a), s = Math.sin(a);
    return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  }
  function matTranslate(x, y, z) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  }
  function matMul(a, b) {
    var o = new Array(16).fill(0);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  }

  /* Rounded-square slab geometry: textured faces + matte extruded sides. */
  function buildCoin() {
    var h = FACE / 2, hz = DEPTH / 2;
    var ring = [];
    var corners = [
      [h - RADIUS, h - RADIUS, 0],
      [-(h - RADIUS), h - RADIUS, Math.PI / 2],
      [-(h - RADIUS), -(h - RADIUS), Math.PI],
      [h - RADIUS, -(h - RADIUS), Math.PI * 1.5],
    ];
    for (var k = 0; k < 4; k++) {
      var cx = corners[k][0], cy = corners[k][1], a0 = corners[k][2];
      for (var i = 0; i <= SEG; i++) {
        var a = a0 + (i / SEG) * (Math.PI / 2);
        ring.push({
          x: cx + RADIUS * Math.cos(a),
          y: cy + RADIUS * Math.sin(a),
          nx: Math.cos(a),
          ny: Math.sin(a),
        });
      }
    }
    var pos = [], nrm = [], uv = [];
    function tri(ax, ay, az, anx, any, anz, au, av,
                 bx, by, bz, bnx, bny, bnz, bu, bv,
                 ex, ey, ez, enx, eny, enz, eu, ev) {
      pos.push(ax, ay, az, bx, by, bz, ex, ey, ez);
      nrm.push(anx, any, anz, bnx, bny, bnz, enx, eny, enz);
      uv.push(au, av, bu, bv, eu, ev);
    }
    var n = ring.length, j;
    for (j = 0; j < n; j++) {
      var p0 = ring[j], p1 = ring[(j + 1) % n];
      var u0 = p0.x / FACE + 0.5, v0 = p0.y / FACE + 0.5;
      var u1 = p1.x / FACE + 0.5, v1 = p1.y / FACE + 0.5;
      // Front face (+z), CCW.
      tri(0, 0, hz, 0, 0, 1, 0.5, 0.5,
          p0.x, p0.y, hz, 0, 0, 1, u0, v0,
          p1.x, p1.y, hz, 0, 0, 1, u1, v1);
      // Back face (-z). U is mirrored so the A reads correctly from behind.
      tri(0, 0, -hz, 0, 0, -1, 0.5, 0.5,
          p1.x, p1.y, -hz, 0, 0, -1, 0.5 - p1.x / FACE, v1,
          p0.x, p0.y, -hz, 0, 0, -1, 0.5 - p0.x / FACE, v0);
    }
    for (j = 0; j < n; j++) {
      var q0 = ring[j], q1 = ring[(j + 1) % n];
      var qax = q0.x, qay = q0.y, qbx = q1.x, qby = q1.y;
      // Outward winding: (q0+, q0-, q1-) and (q0+, q1-, q1+).
      tri(qax, qay, hz, q0.nx, q0.ny, 0, 0, 0,
          qax, qay, -hz, q0.nx, q0.ny, 0, 0, 0,
          qbx, qby, -hz, q1.nx, q1.ny, 0, 0, 0);
      tri(qax, qay, hz, q0.nx, q0.ny, 0, 0, 0,
          qbx, qby, -hz, q1.nx, q1.ny, 0, 0, 0,
          qbx, qby, hz, q1.nx, q1.ny, 0, 0, 0);
    }
    return {
      positions: new Float32Array(pos),
      normals: new Float32Array(nrm),
      uvs: new Float32Array(uv),
      count: pos.length / 3,
    };
  }

  var VERT_SRC = [
    "attribute vec3 aPos;",
    "attribute vec3 aNrm;",
    "attribute vec2 aUV;",
    "uniform mat4 uMVP;",
    "uniform mat4 uModel;",
    "varying vec3 vN;",
    "varying vec2 vUV;",
    "varying float vFace;", // 0 on faces, 1 on extrusion sides
    "void main() {",
    "  vN = mat3(uModel) * aNrm;",
    "  vUV = aUV;",
    "  vFace = 1.0 - abs(aNrm.z);",
    "  gl_Position = uMVP * vec4(aPos, 1.0);",
    "}",
  ].join("\n");

  var FRAG_SRC = [
    "precision mediump float;",
    "varying vec3 vN;",
    "varying vec2 vUV;",
    "varying float vFace;",
    "uniform sampler2D uTex;",
    "uniform vec3 uKeyDir;",
    "void main() {",
    "  vec3 N = normalize(vN);",
    "  float dl = abs(dot(N, uKeyDir));", // two-sided: both faces fully lit
    // Faces: the Acalanes A texture, gently modulated by the fixed lamp.
    "  vec3 faceCol = texture2D(uTex, vUV).rgb * (0.78 + 0.22 * dl);",
    // Sides: flat matte near-black with normal-based shading, no specular.
    "  vec3 sideCol = vec3(0.055, 0.075, 0.13) * (0.55 + 0.85 * dl);",
    "  gl_FragColor = vec4(mix(faceCol, sideCol, clamp(vFace, 0.0, 1.0)), 1.0);",
    "}",
  ].join("\n");

  function compileShader(gl, type, src) {
    var sh = gl.createShader(type);
    if (!sh) throw new Error("createShader failed");
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error("shader compile failed: " + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  function start(textureImage) {
    var canvas = document.createElement("canvas");
    canvas.className = "coin-canvas";
    canvas.setAttribute("aria-hidden", "true");

    var gl = null;
    try {
      gl = canvas.getContext("webgl", { antialias: true, alpha: true, depth: true });
    } catch (e) { gl = null; }
    if (!gl) return false; // leave the static <img> in place

    try {
      var prog = gl.createProgram();
      if (!prog) throw new Error("createProgram failed");
      gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
      gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("program link failed: " + gl.getProgramInfoLog(prog));
      }
      gl.useProgram(prog);

      var aPos = gl.getAttribLocation(prog, "aPos");
      var aNrm = gl.getAttribLocation(prog, "aNrm");
      var aUV = gl.getAttribLocation(prog, "aUV");
      var uMVP = gl.getUniformLocation(prog, "uMVP");
      var uModel = gl.getUniformLocation(prog, "uModel");
      var uKeyDir = gl.getUniformLocation(prog, "uKeyDir");
      var uTex = gl.getUniformLocation(prog, "uTex");

      gl.enable(gl.DEPTH_TEST);
      gl.enableVertexAttribArray(aPos);
      gl.enableVertexAttribArray(aNrm);
      gl.enableVertexAttribArray(aUV);

      var geo = buildCoin();
      function buf(data) {
        var b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return b;
      }
      var posBuf = buf(geo.positions);
      var nrmBuf = buf(geo.normals);
      var uvBuf = buf(geo.uvs);

      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureImage);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(uTex, 0);
      gl.uniform3fv(uKeyDir, KEY_DIR);

      var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var lastAngle = STATIC_ANGLE, lastTime = 0;

      function draw(angle, timeSec) {
        lastAngle = angle;
        lastTime = timeSec;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        var aspect = canvas.width / Math.max(1, canvas.height);
        var mvp = matMul(
          matPerspective(FOV_Y, aspect, 0.1, 100),
          matMul(matTranslate(0, 0, -CAM_DIST), matRotateY(angle))
        );
        gl.uniformMatrix4fv(uMVP, false, mvp);
        gl.uniformMatrix4fv(uModel, false, matRotateY(angle));
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
        gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
        gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, geo.count);
      }

      function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = Math.max(1, Math.round(stage.clientWidth * dpr));
        var h = Math.max(1, Math.round(stage.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        draw(lastAngle, lastTime);
      }

      // WebGL is up — swap the static fallback image for the live canvas.
      var fallback = stage.querySelector(".coin-static");
      stage.insertBefore(canvas, stage.firstChild);
      if (fallback) fallback.style.display = "none";
      resize();

      var raf = 0, visible = true;
      if (reduced) {
        draw(STATIC_ANGLE, 0); // one still frame, no animation
      } else {
        var t0 = performance.now();
        var frame = function (now) {
          raf = 0;
          if (!visible) return;
          var angle = (Math.max(0, now - t0 - SPIN_DELAY_MS) / SPIN_MS) * Math.PI * 2;
          draw(angle, (now - t0) / 1000);
          raf = requestAnimationFrame(frame);
        };
        var io = new IntersectionObserver(function (entries) {
          var was = visible;
          visible = entries[0].isIntersecting;
          if (visible && !was && !raf) raf = requestAnimationFrame(frame);
        }, { threshold: 0 });
        io.observe(stage);
        raf = requestAnimationFrame(frame);
      }

      var ro = new ResizeObserver(resize);
      ro.observe(stage);
      return true;
    } catch (e) {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      return false; // static <img> fallback stays visible
    }
  }

  var img = new Image();
  img.onload = function () { start(img); };
  img.onerror = function () { /* keep the static fallback image */ };
  img.src = "acalanes-a.png";
})();
