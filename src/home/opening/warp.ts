// The opening's renderer: a full-window WebGL2 canvas running the warp shader (shaders.ts). It's made once, while the
// deck is idle (compiling on the click would stall the first frame), and reused for every opening.
import { FRAGMENT, VERTEX } from "./shaders.ts";

export interface WarpCard {
  canvas: HTMLCanvasElement;
  /** The painted card's size and the art's middle in it, CSS px. */
  size: [number, number];
  focus: [number, number];
  accent: [number, number, number];
}

export interface WarpFrame {
  focus: [number, number];
  scale: number;
  speed: number;
  show: number;
  warp: number;
  travel: number;
  glow: number;
  glowSize: number;
  white: number;
}

export interface Warp {
  /** Size the canvas to the window, upload the card and put the canvas on the page. */
  begin(card: WarpCard): void;
  draw(frame: WarpFrame): void;
  /** Take the canvas off the page. */
  end(): void;
}

/** At most this many canvas pixels: the blur hides the difference and slower GPUs keep 60fps. */
const MAX_PIXELS = 2_600_000;

const UNIFORMS = [
  "uCard",
  "uView",
  "uDpr",
  "uCardSize",
  "uCardFocus",
  "uFocus",
  "uScale",
  "uSpeed",
  "uShow",
  "uWarp",
  "uTravel",
  "uGlow",
  "uGlowSize",
  "uWhite",
  "uFrame",
  "uAccent",
] as const;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("No shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "GLSL");
  return shader;
}

/** Compile and link the warp program and make it current; null (with a warning) if the GPU refuses it. */
function link(gl: WebGL2RenderingContext): WebGLProgram | null {
  const program = gl.createProgram();
  try {
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(program);
    return program;
  } catch (error) {
    console.warn("Card opening: no warp shader.", error);
    return null;
  }
}

let shared: Warp | null | undefined;

function create(): Warp | null {
  const canvas = document.createElement("canvas");
  canvas.className = "sh-open-gl";
  canvas.addEventListener("webglcontextlost", () => {
    shared = undefined;
  });
  const gl = canvas.getContext("webgl2", { antialias: false, depth: false, powerPreference: "high-performance" });
  if (!gl) return null;

  const program = link(gl);
  if (!program) return null;
  const u = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<
    (typeof UNIFORMS)[number],
    WebGLUniformLocation | null
  >;

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.uniform1i(u.uCard, 0);

  let frame = 0;
  let dpr = 1;
  let view: [number, number] = [1, 1];

  // One throwaway draw now, so the driver finishes compiling before the first real frame.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.generateMipmap(gl.TEXTURE_2D);
  canvas.width = 1;
  canvas.height = 1;
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  return {
    begin(card) {
      view = [window.innerWidth, window.innerHeight];
      dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (view[0] * view[1])));
      canvas.width = Math.round(view[0] * dpr);
      canvas.height = Math.round(view[1] * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, card.canvas);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.uniform2f(u.uView, view[0], view[1]);
      gl.uniform1f(u.uDpr, canvas.width / view[0]);
      gl.uniform2f(u.uCardSize, ...card.size);
      gl.uniform2f(u.uCardFocus, ...card.focus);
      gl.uniform3f(u.uAccent, ...card.accent);
      document.body.append(canvas);
    },
    draw(f) {
      gl.uniform2f(u.uFocus, ...f.focus);
      gl.uniform1f(u.uScale, f.scale);
      gl.uniform1f(u.uSpeed, f.speed);
      gl.uniform1f(u.uShow, f.show);
      gl.uniform1f(u.uWarp, f.warp);
      gl.uniform1f(u.uTravel, f.travel);
      gl.uniform1f(u.uGlow, f.glow);
      gl.uniform1f(u.uGlowSize, f.glowSize);
      gl.uniform1f(u.uWhite, f.white);
      gl.uniform1f(u.uFrame, frame++ % 64);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    end() {
      canvas.remove();
    },
  };
}

/** The renderer, made on first use; null without WebGL2. */
export function warp(): Warp | null {
  if (shared === undefined) shared = create();
  return shared;
}
