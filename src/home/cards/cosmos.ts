// The cosmos behind each card: a small fragment shader (drifting nebula + twinkling stars, tinted by the wiki's
// accent). One shared WebGL context renders every visible card in turn and copies the frame into that card's 2D
// canvas, so any number of cards costs one GL context. Runs at ~30 fps; with reduced motion it stays still.

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uSeed;
uniform vec3 uTint;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// One layer of stars: at most one per grid cell, each with its own twinkle.
float stars(vec2 uv, float scale, float t, float rarity) {
  vec2 g = uv * scale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash(id + uSeed);
  if (h < rarity) return 0.0;
  vec2 off = vec2(hash(id + 1.3 + uSeed), hash(id + 7.1 + uSeed)) - 0.5;
  float d = length(f - off * 0.7);
  float twinkle = 0.55 + 0.45 * sin(t * (1.0 + h * 3.0) + h * 40.0);
  float bright = (h - rarity) / (1.0 - rarity);
  return (smoothstep(0.07, 0.0, d) + exp(-d * 22.0) * 0.25) * twinkle * (0.4 + bright);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.y;
  vec2 q = uv + vec2(uSeed * 3.17, uSeed * 1.91);
  vec2 drift = vec2(uTime * 0.012, uTime * 0.007);

  float n = fbm(q * 1.6 + drift);
  float m = fbm(q * 3.1 - drift * 1.3 + n);

  vec3 col = mix(vec3(0.02, 0.015, 0.06), vec3(0.14, 0.07, 0.3), smoothstep(0.25, 0.9, n));
  col += uTint * smoothstep(0.45, 1.0, m) * 0.5;
  col += vec3(0.4, 0.3, 0.7) * pow(max(m - 0.55, 0.0), 2.0) * 1.6;

  float s = stars(uv + drift * 0.3, 28.0, uTime, 0.9)
          + stars(uv + drift * 0.6, 13.0, uTime * 1.3, 0.94) * 1.5;
  col += vec3(1.0, 0.95, 0.85) * s;

  gl_FragColor = vec4(col, 1.0);
}
`;

interface Target {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  seed: number;
  tint: [number, number, number];
  drawn: boolean;
}

interface Renderer {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  seed: WebGLUniformLocation | null;
  tint: WebGLUniformLocation | null;
}

const targets = new Set<Target>();
let renderer: Renderer | null | undefined;
let raf = 0;
let last = 0;
const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/** The shared renderer, or null when WebGL isn't available (cards then show their CSS gradient). */
function getRenderer(): Renderer | null {
  if (renderer !== undefined) return renderer;
  renderer = null;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  renderer = {
    gl,
    canvas,
    res: gl.getUniformLocation(program, "uRes"),
    time: gl.getUniformLocation(program, "uTime"),
    seed: gl.getUniformLocation(program, "uSeed"),
    tint: gl.getUniformLocation(program, "uTint"),
  };
  return renderer;
}

/** Off-screen deck cards are hidden with `visibility`; skip them. */
const hidden = (el: HTMLElement) => el.closest<HTMLElement>(".deck-card")?.style.visibility === "hidden";

function draw(r: Renderer, t: Target, time: number) {
  const w = t.canvas.clientWidth;
  const h = t.canvas.clientHeight;
  if (!w || !h || hidden(t.canvas)) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.round(w * dpr);
  const height = Math.round(h * dpr);
  if (t.canvas.width !== width || t.canvas.height !== height) {
    t.canvas.width = width;
    t.canvas.height = height;
    t.drawn = false;
  }
  if (still && t.drawn) return;
  if (r.canvas.width !== width || r.canvas.height !== height) {
    r.canvas.width = width;
    r.canvas.height = height;
  }
  const { gl } = r;
  gl.viewport(0, 0, width, height);
  gl.uniform2f(r.res, width, height);
  gl.uniform1f(r.time, still ? 0 : time);
  gl.uniform1f(r.seed, t.seed);
  gl.uniform3f(r.tint, ...t.tint);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  t.ctx ??= t.canvas.getContext("2d");
  t.ctx?.drawImage(r.canvas, 0, 0);
  t.drawn = true;
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (now - last < 33) return;
  last = now;
  const r = getRenderer();
  if (!r) return;
  for (const t of targets) draw(r, t, now / 1000 + t.seed * 10);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(n) ? [0.9, 0.7, 0.4] : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Start drawing the cosmos into `canvas`. Returns the stop function. */
export function attachCosmos(canvas: HTMLCanvasElement, accent: string, seed: number) {
  const target: Target = { canvas, ctx: null, seed, tint: hexToRgb(accent), drawn: false };
  targets.add(target);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => {
    targets.delete(target);
    if (!targets.size) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}
