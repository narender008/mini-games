// Thin WebGL2 helpers: programs with shared includes, textures and render
// targets. Everything the renderer draws goes through these.

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;
  // half-float targets for the lit scene, if the device can render to them
  const cbf = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
  gl.hdr = !!cbf;
  gl.getExtension('OES_texture_float_linear');
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  watchContext(canvas, gl);
  return gl;
}

// The device can take the context away (a phone switching apps drops its big
// textures first). Rebuilding every GPU resource is a lot for a rare event,
// so the game says so and starts over on a tap; the renderer stops drawing
// while `gl.lost` is set.
function watchContext(canvas, gl) {
  let note = null;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // without this the context is never restored
    gl.lost = true;
    if (note) return;
    note = document.createElement('button');
    note.type = 'button';
    note.textContent = 'Graphics were reset by the device. Tap to reload.';
    // light text on a dark plate with a light edge: readable on any backdrop
    note.style.cssText =
      'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;max-width:80vw;' +
      'padding:16px 22px;border:2px solid #f2f2f2;border-radius:10px;background:#1b1b1b;color:#f2f2f2;' +
      'font:600 16px/1.3 system-ui,sans-serif;text-align:center;cursor:pointer;touch-action:manipulation';
    note.addEventListener('click', () => location.reload());
    document.body.appendChild(note);
  });
}

function compile(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

// Compiles without waiting (KHR_parallel_shader_compile lets the driver work
// in the background); `ready()` checks and reports errors.
export function program(gl, vs, fs, name) {
  const p = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vs, name);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs, name);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  const prog = { gl, p, name, u: {}, linked: false, v, f };
  prog.check = () => {
    if (prog.linked) return true;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = (s) => gl.getShaderInfoLog(s) || '';
      const vlog = log(v);
      const flog = log(f);
      const plog = gl.getProgramInfoLog(p);
      const err = new Error(`shader ${name}: ${vlog} ${flog} ${plog}`);
      if (flog) console.error(name, flog, numbered(fs));
      if (vlog) console.error(name, vlog, numbered(vs));
      throw err;
    }
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const key = info.name.replace(/\[0\]$/, '');
      prog.u[key] = gl.getUniformLocation(p, info.name);
    }
    const bi = gl.getUniformBlockIndex(p, 'Frame');
    if (bi !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, bi, 0);
    prog.linked = true;
    return true;
  };
  return prog;
}

function numbered(src) {
  return src
    .split('\n')
    .map((l, i) => `${i + 1}: ${l}`)
    .join('\n');
}

export function texture(gl, opts) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const {
    w,
    h,
    internal = gl.RGBA8,
    format = gl.RGBA,
    type = gl.UNSIGNED_BYTE,
    data = null,
    filter = gl.LINEAR,
    wrap = gl.CLAMP_TO_EDGE,
    wrapT = wrap,
    mips = false,
  } = opts;
  if (opts.image) {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, format, type, opts.image);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

// A colour target with its framebuffer. Resizable.
export class Target {
  constructor(gl, w, h, { internal, format = gl.RGBA, type, filter = gl.LINEAR } = {}) {
    this.gl = gl;
    this.internal = internal ?? (gl.hdr ? gl.RGBA16F : gl.RGBA8);
    this.format = format;
    this.type = type ?? (this.internal === gl.RGBA16F ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE);
    this.filter = filter;
    this.fb = gl.createFramebuffer();
    this.tex = null;
    this.resize(w, h);
  }

  resize(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    if (this.tex) gl.deleteTexture(this.tex);
    this.tex = texture(gl, { w, h, internal: this.internal, format: this.format, type: this.type, filter: this.filter });
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.w, this.h);
  }
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}
