// Paints a deck card face into a canvas, for the warp shader to zoom through: the art's backdrop and cover, the
// constellation as it is at this instant (read from the live SVG's computed styles), the name plate and the centered
// card's white ring. It mirrors cards/card.css; keep the two in step.

/** Transparent margin around the card (CSS px): room for the ring, and it keeps the clamped texture edge clear. */
export const PAD = 12;

export interface PaintedCard {
  canvas: HTMLCanvasElement;
  /** The card's layout size, CSS px, without PAD. */
  width: number;
  height: number;
  artHeight: number;
}

/** A CSS color as 0…1 RGB. */
export function rgbOf(color: string): [number, number, number] {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return [1, 1, 1];
  probe.fillStyle = color;
  const hex = String(probe.fillStyle);
  if (!hex.startsWith("#")) return [1, 1, 1];
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const withAlpha = ([r, g, b]: [number, number, number], a: number) => `rgb(${r * 255} ${g * 255} ${b * 255} / ${a})`;

const opacityOf = (el: Element) => Number(getComputedStyle(el).opacity);
const matrixOf = (el: Element) => {
  const t = getComputedStyle(el).transform;
  return new DOMMatrix(t === "none" ? undefined : t);
};

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, 0), 0, Math.PI * 2);
}

/** The cover, cropped like object-fit: cover and faded out toward the bottom; null if it can't be read back. */
function coverLayer(img: HTMLImageElement, width: number, height: number): HTMLCanvasElement | null {
  const off = document.createElement("canvas");
  off.width = Math.ceil(width);
  off.height = Math.ceil(height);
  const o = off.getContext("2d");
  if (!o) return null;
  const s = Math.max(off.width / img.naturalWidth, off.height / img.naturalHeight);
  const iw = img.naturalWidth * s;
  const ih = img.naturalHeight * s;
  o.drawImage(img, (off.width - iw) / 2, (off.height - ih) / 2, iw, ih);
  try {
    o.getImageData(0, 0, 1, 1);
  } catch {
    return null; // A cross-origin cover would taint the texture.
  }
  o.globalCompositeOperation = "destination-in";
  const fade = o.createLinearGradient(0, 0, 0, off.height);
  fade.addColorStop(0.62, "#000");
  fade.addColorStop(0.92, "rgb(0 0 0 / 0)");
  o.fillStyle = fade;
  o.fillRect(0, 0, off.width, off.height);
  return off;
}

function paintArt(
  ctx: CanvasRenderingContext2D,
  face: HTMLElement,
  w: number,
  h: number,
  accent: [number, number, number],
  k: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, [0, 0, 34, 0]);
  ctx.clip();

  // linear-gradient(165deg, #191433, #3b2a63)
  const angle = (165 * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const line = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half);
  line.addColorStop(0, "#191433");
  line.addColorStop(1, "#3b2a63");
  ctx.fillStyle = line;
  ctx.fillRect(0, 0, w, h);

  // radial-gradient(80% 60% at 70% 30%, accent 30%, transparent 70%)
  ctx.save();
  ctx.translate(w * 0.7, h * 0.3);
  ctx.scale(w * 0.8, h * 0.6);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  glow.addColorStop(0, withAlpha(accent, 0.3));
  glow.addColorStop(0.7, withAlpha(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(-2, -2, 4, 4);
  ctx.restore();

  const img = face.querySelector<HTMLImageElement>("img.cc-img");
  const cover = img?.complete && img.naturalWidth ? coverLayer(img, w * k, h * k) : null;
  if (cover) {
    ctx.save();
    ctx.globalCompositeOperation = "luminosity";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(cover, 0, 0, w, h);
    ctx.restore();
  }

  const sky = face.querySelector<SVGSVGElement>("svg.cc-sky");
  if (sky) paintSky(ctx, sky, w, h, k);
  ctx.restore();
}

function paintSky(ctx: CanvasRenderingContext2D, sky: SVGSVGElement, w: number, h: number, k: number) {
  const fade = opacityOf(sky);
  if (!fade) return;
  // viewBox 0 0 100 100, sliced over the art, plus the slow drift (a translation).
  const u = Math.max(w, h) / 100;
  const drift = matrixOf(sky);
  ctx.save();
  ctx.translate(drift.e + (w - 100 * u) / 2, drift.f + (h - 100 * u) / 2);
  ctx.scale(u, u);

  ctx.fillStyle = "#fff";
  for (const dust of sky.querySelectorAll<SVGCircleElement>(".cc-dust")) {
    ctx.globalAlpha = fade * opacityOf(dust);
    disc(ctx, dust.cx.baseVal.value, dust.cy.baseVal.value, dust.r.baseVal.value);
    ctx.fill();
  }

  ctx.lineCap = "round";
  ctx.lineWidth = 0.3;
  ctx.strokeStyle = "rgb(255 240 200 / 0.6)";
  ctx.shadowColor = "rgb(255 226 160 / 0.7)";
  ctx.shadowBlur = 2 * u * k;
  for (const line of sky.querySelectorAll<SVGLineElement>(".cc-line")) {
    const style = getComputedStyle(line);
    // pathLength is 1, so the dash offset is the part not traced yet.
    const traced = 1 - Math.min(1, Math.max(0, Number.parseFloat(style.strokeDashoffset) || 0));
    if (traced <= 0) continue;
    const x1 = line.x1.baseVal.value;
    const y1 = line.y1.baseVal.value;
    ctx.globalAlpha = fade * Number(style.opacity);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + (line.x2.baseVal.value - x1) * traced, y1 + (line.y2.baseVal.value - y1) * traced);
    ctx.stroke();
  }

  for (const g of sky.querySelectorAll("g")) {
    const group = fade * opacityOf(g);
    const ring = g.querySelector<SVGCircleElement>(".cc-ring");
    if (ring) {
      ctx.globalAlpha = group * opacityOf(ring);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#ffe7a6";
      ctx.lineWidth = 1 / u;
      disc(ctx, ring.cx.baseVal.value, ring.cy.baseVal.value, ring.r.baseVal.value * matrixOf(ring).a);
      ctx.stroke();
    }
    const star = g.querySelector<SVGCircleElement>(".cc-star");
    if (star) {
      ctx.globalAlpha = group * opacityOf(star);
      ctx.fillStyle = "#fff6dc";
      disc(ctx, star.cx.baseVal.value, star.cy.baseVal.value, star.r.baseVal.value * matrixOf(star).a);
      ctx.shadowColor = "rgb(255 214 140 / 0.6)";
      ctx.shadowBlur = 4 * u * k;
      ctx.fill();
      ctx.shadowColor = "#ffe7a6";
      ctx.shadowBlur = 1.6 * u * k;
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintPlate(ctx: CanvasRenderingContext2D, face: HTMLElement, w: number, top: number, bottom: number) {
  const name = face.querySelector<HTMLElement>(".cc-name");
  if (!name) return;
  const style = getComputedStyle(name);
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.fillStyle = style.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const max = w - 20;
  let text = name.textContent ?? "";
  if (ctx.measureText(text).width > max) {
    while (text && ctx.measureText(`${text}…`).width > max) text = text.slice(0, -1);
    text += "…";
  }
  ctx.fillText(text, w / 2, (top + bottom) / 2);
}

/** Paint `face` (a `.cc`) at `k` texture pixels per CSS px, capped so the texture stays within 4096px. */
export function paintCard(face: HTMLElement, accent: string, k = 2.5): PaintedCard {
  const w = face.offsetWidth;
  const h = face.offsetHeight;
  const artHeight = face.querySelector<HTMLElement>(".cc-art")?.offsetHeight ?? h * 0.83;
  const scale = Math.min(k, 4096 / (h + PAD * 2));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((w + PAD * 2) * scale);
  canvas.height = Math.ceil((h + PAD * 2) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, width: w, height: h, artHeight };
  ctx.scale(scale, scale);
  ctx.translate(PAD, PAD);

  // The centered card's ring (`.deck-card[data-center] .cc`).
  ctx.save();
  ctx.shadowColor = "rgb(255 255 255 / 0.35)";
  ctx.shadowBlur = 6 * scale;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(-3, -3, w + 6, h + 6, 13);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 10);
  ctx.clip();
  ctx.fillStyle = "#e9e5dc";
  ctx.fillRect(0, 0, w, h);
  paintArt(ctx, face, w, artHeight, rgbOf(accent), scale);
  paintPlate(ctx, face, w, artHeight, h);
  ctx.restore();
  return { canvas, width: w, height: h, artHeight };
}
