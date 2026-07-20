// Troca de tema (light/dark) com a cara da Corneta: a corneta SOPRA o tema novo — um
// sopro de latão + ondas sonoras (megafone!) saindo do ponto onde você clicou, e o tema
// vira no meio do sopro. Sem clique ainda, no 1º load, ou com "menos movimento": troca
// na hora, sem firula. A animação das ondas vive em src/index.css (.theme-blast).

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

/** Aplica o tema no documento. `animate` liga o sopro (deixe `false` no 1º load). */
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

  // As cores DERRETEM pro tema novo durante o sopro (em vez de pular seco). A classe
  // liga as transições; o reflow fixa a base antes de virar o data-theme.
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
  // Vira o tema logo no início do sopro; as cores transicionam suave (ver index.css).
  window.setTimeout(set, 120);
  window.setTimeout(() => root.classList.remove("theme-anim"), 700);
  window.setTimeout(() => blast.remove(), 900);
}
