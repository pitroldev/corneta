let pointer = { x: 0, y: 0 };
let pointerSeen = false;

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      pointerSeen = true;
    },
    true,
  );
}

function reducedMotion(): boolean {
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function applyTheme(theme: "dark" | "light", animate: boolean): void {
  const root = document.documentElement;
  const set = () => {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
  };

  if (!animate || !pointerSeen || reducedMotion()) {
    set();
    return;
  }

  // Force layout before changing data-theme so color transitions start from the previous theme.
  root.classList.add("theme-anim");
  void root.offsetWidth;

  const blast = document.createElement("div");
  blast.className = "theme-blast";
  blast.style.setProperty("--x", `${pointer.x}px`);
  blast.style.setProperty("--y", `${pointer.y}px`);

  const wash = document.createElement("span");
  wash.className = "theme-blast-wash";
  blast.appendChild(wash);
  for (let i = 0; i < 3; i++) {
    const ring = document.createElement("span");
    ring.className = "theme-blast-ring";
    ring.style.animationDelay = `${i * 90}ms`;
    blast.appendChild(ring);
  }

  document.body.appendChild(blast);
  window.setTimeout(set, 120);
  window.setTimeout(() => root.classList.remove("theme-anim"), 700);
  window.setTimeout(() => blast.remove(), 900);
}
