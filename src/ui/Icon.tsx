// A small hand-drawn icon set: 24px grid, 2px rounded strokes, currentColor.
const PATHS = {
  comment: "M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  close: "M6 6l12 12M18 6 6 18",
  check: "m5 12.5 4.5 4.5L19 7.5",
  chevronLeft: "m14.5 6-6 6 6 6",
  chevronRight: "m9.5 6 6 6-6 6",
  chevronDown: "m6 9.5 6 6 6-6",
  arrowLeft: "M19 12H5m6-6-6 6 6 6",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  deck: "M4 6.5v11M9 4v16h6V4H9Zm11 2.5v11",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-5m0-3.2v.2",
  tip: "M9.5 18h5M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z",
  warning: "M12 4 2.8 19.5h18.4L12 4Zm0 6v4.5m0 2.5v.2",
  danger: "M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2L8.2 3ZM12 8v5m0 3v.2",
  send: "M4 12 20 4l-5 16-3.5-6.5L4 12Zm7.5 1.5L20 4",
  undo: "M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2",
  redo: "m15 7 5 5-5 5m5-5H9a5 5 0 0 0 0 10h2",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V4.5h6V7m-8.5 0 1 13h9l1-13",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  reply: "M10 7 5 12l5 5M5 12h9a5 5 0 0 1 5 5v2",
  search: "m20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z",
  minimize: "M6 12h12",
  maximize: "M6 6h12v12H6z",
  restore: "M8 8h10v10H8zM6 16V6h10",
  menu: "M4 7h16M4 12h16M4 17h16",
  contents: "M9.5 6H20M9.5 12H20M9.5 18H20M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  share: "M12 15V3.5m0 0L7.5 8M12 3.5 16.5 8M5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5",
  copy: "M9 9h11v11H9V9Zm-4 6H4V4h11v1",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff:
    "M3 3l18 18M10.6 5.6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.7M6.6 6.6A17 17 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  block: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8",
  sun: "M12 3v1.5m0 15V21M3 12h1.5m15 0H21M5.6 5.6l1.1 1.1m10.6 10.6 1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  home: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z",
  primitives: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm12.5 0a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z",
  live: "M12 12h.01M8.5 8.5a5 5 0 0 0 0 7m7-7a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8m12.8-12.8a9 9 0 0 1 0 12.8",
  // The drawing board's tools (src/designs/board/).
  pen: "M4.5 19.5 6.5 12 15 3.5 20.5 9 12 17.5l-7.5 2Zm2-7.5 5.5 5.5M4.5 19.5 9 15",
  pencil: "M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 19 4 20Zm9.5-13 3.5 3.5M5 15.5 8.5 19",
  brush:
    "M20 4 11.5 12.5M13 11l-2-2M9.5 12.8c-2.2-.3-4 1.2-4 3.4 0 1.4-.9 2.4-2 2.8 1.8 1.4 5.8 1.2 7.3-.6 1.2-1.4 1-4.5-1.3-5.6Z",
  marker: "M15 3.5 20.5 9l-8 8h-4v-4l8-8M8.5 13 4 17.5V20h5.5l3-3M13 6l5 5",
  spray: "M8 11h6v9.5H8V11Zm1-3h4v3H9V8Zm2 0V5.5h3M17 6.5h.01M19.5 5h.01M19.5 8h.01M17 9.5h.01M21 11h.01",
  smudge: "M3.5 15c2.5-5 5-5 7 0s4.5 5 7 0c.8-1.6 1.8-2.6 3-3M3.5 9.5c2-3.5 4-3.5 5.5-1M3.5 20c2-2 4-2 5.5 0",
  drop: "M12 3.5s6 6.4 6 10.7a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5Zm-2.7 11a2.8 2.8 0 0 0 2.4 2.6",
  eraser: "M9 20h11M5 15.2 14.2 6l4.8 4.8-8.2 8.2H8.8L5 15.2Zm4.6-4.6 4.8 4.8",
  bucket:
    "M5 11.5 11.5 5 18 11.5 11.5 18 5 11.5Zm0 0h13M20 15.5s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3ZM9 3l2.5 2",
  pipette: "M14 6.5 17.5 3a2.1 2.1 0 0 1 3 3L17 9.5m-5-1.5 4 4m-2.5-2.5L5.5 17.5 4 20l2.5-1.5 8-8",
  mirror: "M12 3v2m0 3v2m0 3v2m0 3v2M9 7.5 4 17h5V7.5Zm6 0L20 17h-5V7.5Z",
  zoomIn: "m20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 10.5h5M10.5 8v5",
  zoomOut: "m20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 10.5h5",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5",
  fit: "M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4M8.5 8.5h7v7h-7z",
  shrink: "M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5",
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

/** A shape of a filled icon: filled (holes cut by even-odd), or a round stroke `stroke` wide; `soft` is the second tone. */
type Part = { d: string; soft?: true; stroke?: number };

/**
 * Filled versions in the page icons' style (bold, round, solid; src/icons/), for the wiki header. Still one color,
 * `currentColor`, with a softer second tone, so they follow the button they're in.
 */
const FILLED: Partial<Record<IconName, Part[]>> = {
  menu: [
    {
      d: "M4.6 4.4h14.8a1.6 1.6 0 0 1 0 3.2H4.6a1.6 1.6 0 0 1 0-3.2Zm0 6h14.8a1.6 1.6 0 0 1 0 3.2H4.6a1.6 1.6 0 0 1 0-3.2Zm0 6h14.8a1.6 1.6 0 0 1 0 3.2H4.6a1.6 1.6 0 0 1 0-3.2Z",
    },
  ],
  deck: [
    {
      d: "M4.5 6h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm14 0h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z",
      soft: true,
    },
    { d: "M10.5 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1.5 6.3-2 2.7 2 2.7 2-2.7Z" },
  ],
  search: [
    { d: "M6.6 10.5a3.9 3.9 0 1 0 7.8 0 3.9 3.9 0 1 0-7.8 0Z", soft: true },
    { d: "M3.2 10.5a7.3 7.3 0 1 0 14.6 0 7.3 7.3 0 1 0-14.6 0Zm3.4 0a3.9 3.9 0 1 0 7.8 0 3.9 3.9 0 1 0-7.8 0Z" },
    { d: "m16.2 16.2 4.3 4.3", stroke: 3.4 },
  ],
  share: [
    {
      d: "M4 12.5a1.5 1.5 0 0 1 3 0V18h10v-5.5a1.5 1.5 0 0 1 3 0V19a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19Z",
      soft: true,
    },
    { d: "M12 14.5V4.5M7.8 8.5 12 4.3l4.2 4.2", stroke: 2.8 },
  ],
  primitives: [
    {
      d: "M15.5 3.5h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Zm-10 10h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z",
      soft: true,
    },
    {
      d: "M5.5 3.5h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2ZM13.4 17a3.6 3.6 0 1 0 7.2 0 3.6 3.6 0 1 0-7.2 0Z",
    },
  ],
  comment: [
    {
      d: "M5.5 4h13A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H12l-4.3 3.4a1 1 0 0 1-1.7-.8V17h-.5A2.5 2.5 0 0 1 3 14.5v-8A2.5 2.5 0 0 1 5.5 4Zm1.1 6.5a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 1 0-2.8 0Zm4 0a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 1 0-2.8 0Zm4 0a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 1 0-2.8 0Z",
    },
  ],
  eye: [
    {
      d: "M12 5c5.5 0 9.3 5 9.8 6.3a1.6 1.6 0 0 1 0 1.4C21.3 14 17.5 19 12 19S2.7 14 2.2 12.7a1.6 1.6 0 0 1 0-1.4C2.7 10 6.5 5 12 5Zm-4.3 7a4.3 4.3 0 1 0 8.6 0 4.3 4.3 0 1 0-8.6 0Zm2.2 0a2.1 2.1 0 1 0 4.2 0 2.1 2.1 0 1 0-4.2 0Z",
    },
  ],
  sun: [
    { d: "M7.4 12a4.6 4.6 0 1 0 9.2 0 4.6 4.6 0 1 0-9.2 0Z" },
    {
      d: "M12 2.6v1.6m0 15.6v1.6M2.6 12h1.6m15.6 0h1.6M5.4 5.4l1.1 1.1m11 11 1.1 1.1M5.4 18.6l1.1-1.1m11-11 1.1-1.1",
      stroke: 2.6,
    },
  ],
  moon: [
    { d: "M17 3.5c.3 1.5.9 2.1 2.4 2.4-1.5.3-2.1.9-2.4 2.4-.3-1.5-.9-2.1-2.4-2.4 1.5-.3 2.1-.9 2.4-2.4Z", soft: true },
    { d: "M20.2 14.6A8.3 8.3 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" },
  ],
  live: [
    { d: "M5 5a9.9 9.9 0 0 0 0 14M19 5a9.9 9.9 0 0 1 0 14", stroke: 2.4, soft: true },
    { d: "M8.1 8.1a5.5 5.5 0 0 0 0 7.8m7.8-7.8a5.5 5.5 0 0 1 0 7.8", stroke: 2.4 },
    { d: "M9.4 12a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0Z" },
  ],
};

/** `filled`: the filled version where there is one (the wiki header), else the line icon. */
export function Icon({
  name,
  size = 18,
  label,
  filled,
}: {
  name: IconName;
  size?: number;
  label?: string;
  filled?: boolean;
}) {
  const parts = filled ? FILLED[name] : undefined;
  if (parts)
    return (
      <svg
        className="sh-icon"
        data-filled=""
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {parts.map((p) =>
          p.stroke ? (
            <path
              key={p.d}
              d={p.d}
              fill="none"
              stroke="currentColor"
              strokeWidth={p.stroke}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={p.soft ? "sh-icon-soft" : undefined}
            />
          ) : (
            <path key={p.d} d={p.d} fillRule="evenodd" className={p.soft ? "sh-icon-soft" : undefined} />
          ),
        )}
      </svg>
    );
  return (
    <svg
      className="sh-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
