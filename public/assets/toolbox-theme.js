// Runs before the app loads (index.html): a toolbox tab takes its wiki's colors at once, from what the wiki header
// saved when it opened the tab (src/toolbox/open.ts), so the first frame isn't in the default ones. Any other page
// returns at once.
(() => {
  const m = /^\/toolbox\/([^/]+)/.exec(location.pathname);
  if (!m) return;
  try {
    const saved = JSON.parse(localStorage.getItem(`shiori:toolbox:${decodeURIComponent(m[1])}`) || "null");
    if (saved && typeof saved.vars === "string") document.documentElement.style.cssText = saved.vars;
  } catch {}
})();
