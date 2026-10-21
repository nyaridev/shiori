// GLSL for the warp (warp.ts). One full-window triangle; the fragment shader does everything: the painted card zoomed
// with a radial blur and chromatic fringes, a lens bulge at speed, the streaking tunnel behind it and the light at
// the end. Positions are in CSS px, top left origin, like the DOM.

export const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uCard;
uniform vec2 uView;       // window, CSS px
uniform float uDpr;       // canvas px per CSS px
uniform vec2 uCardSize;   // the painted card, CSS px
uniform vec2 uCardFocus;  // the art's middle in it
uniform vec2 uFocus;      // where that point is on screen
uniform float uScale;     // screen px per card px
uniform float uSpeed;     // 0…1
uniform float uShow;      // card opacity
uniform float uWarp;      // tunnel opacity
uniform float uTravel;    // distance flown; moves the streaks
uniform float uGlow;      // the light at the end: strength…
uniform float uGlowSize;  // …and radius, as a fraction of the window diagonal
uniform float uWhite;     // the whole window, white
uniform float uFrame;
uniform vec3 uAccent;

out vec4 outColor;

const float TAU = 6.2831853;
const int TAPS = 18;

// Interleaved gradient noise: jitters the blur taps so they read as one smooth smear, not stacked copies.
float noise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

vec4 card(vec2 p) {
  return texture(uCard, (uCardFocus + (p - uFocus) / uScale) / uCardSize);
}

// Light streaks flying outward from the focus, one per angular lane; some lanes stay empty.
float streaks(vec2 d, float diag, float lanes, float seed) {
  float r = length(d);
  float lane = (atan(d.y, d.x) / TAU + 0.5) * lanes;
  float id = floor(lane);
  float h = hash(id + seed);
  if (h < 0.3) return 0.0;
  float z = fract(hash(id * 1.37 + seed + 9.1) + uTravel * (0.3 + 0.7 * h));
  float head = z * z * diag * 0.75;
  float len = 6.0 + uSpeed * head * 0.6;
  float along = clamp((r - head + len) / len, 0.0, 1.0) * step(r, head);
  float px = abs(fract(lane) - 0.5) * TAU * r / lanes;
  float width = 0.5 + 1.5 * z;
  float across = 1.0 - smoothstep(width * 0.4, width, px);
  return along * along * across * h * smoothstep(0.0, 60.0, r);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  float diag = length(uView);
  vec2 d = p - uFocus;
  float r = length(d) / diag;
  // A lens bulge at speed: the edges stretch outward.
  d *= 1.0 - uSpeed * 0.35 * r * r;

  vec3 tunnel = vec3(0.02, 0.016, 0.05) + uAccent * 0.25 * exp(-r * 5.0) * uSpeed;
  vec3 tint = mix(vec3(1.0), uAccent, 0.3);
  tunnel += tint * (streaks(d, diag, 110.0, 0.0) + 0.6 * streaks(d, diag, 260.0, 41.0)) * (0.5 + uSpeed);
  vec4 color = vec4(tunnel, 1.0) * uWarp;

  if (uShow > 0.0) {
    vec4 c;
    float blur = uSpeed * 0.3;
    if (blur < 0.003) {
      c = card(uFocus + d);
    } else {
      float j = noise(gl_FragCoord.xy + uFrame * 5.588238);
      float fringe = uSpeed * 0.014;
      vec4 sum = vec4(0.0);
      float total = 0.0;
      for (int i = 0; i < TAPS; i++) {
        float f = (float(i) + j) / float(TAPS);
        vec2 q = d * (1.0 - blur * f);
        float w = 1.0 - 0.5 * f;
        vec4 g = card(uFocus + q);
        float red = card(uFocus + q * (1.0 - fringe)).r;
        float blue = card(uFocus + q * (1.0 + fringe)).b;
        sum += vec4(red, g.g, blue, g.a) * w;
        total += w;
      }
      c = sum / total;
    }
    c *= uShow;
    color = c + color * (1.0 - c.a);
  }

  // The light: a wide bloom with a hot core, screened over the scene so it brightens instead of fogging it.
  vec4 warm = vec4(1.0, 0.975, 0.94, 1.0);
  float dist = length(p - uFocus) / diag / max(uGlowSize, 0.001);
  float light = clamp(uGlow * (exp(-dist * dist) + 0.8 * exp(-dist * dist * 12.0)), 0.0, 1.0);
  color.rgb = 1.0 - (1.0 - color.rgb) * (1.0 - warm.rgb * light);
  color.a = color.a + light * (1.0 - color.a);
  color = mix(color, warm, uWhite);
  color.rgb += (noise(gl_FragCoord.xy) - 0.5) / 255.0 * color.a;
  outColor = color;
}`;
