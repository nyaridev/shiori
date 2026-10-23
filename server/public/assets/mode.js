// The public wiki (ADR-0011): before the page paints, the reader's day or night (else their system's) and spoiler
// choice.
(() => {
  const html = document.documentElement;
  html.classList.add("pw-js");
  if (window.matchMedia) html.dataset.mode = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  try {
    const mode = localStorage.getItem("pw-mode");
    if (mode === "dark" || mode === "light") html.dataset.mode = mode;
    if (localStorage.getItem("pw-spoilers") === "1") html.classList.add("pw-spoilers-shown");
  } catch {}
})();
