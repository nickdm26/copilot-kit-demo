// CopilotKit's chat styles switch to dark only under a `.dark` class. Our theme switches on
// prefers-color-scheme or <html data-theme>, so mirror the effective scheme into `.dark` on <html>.
const root = document.documentElement;
const media = window.matchMedia("(prefers-color-scheme: dark)");

function sync() {
  const theme = root.getAttribute("data-theme");
  const dark = theme === "dark" || (theme !== "light" && media.matches);
  root.classList.toggle("dark", dark);
}

sync();
media.addEventListener("change", sync);
new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
