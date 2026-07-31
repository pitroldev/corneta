"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CropIcon } from "./icons";

// Recorte 9:16 da live deitada. Antes: três radios escondidos e três regras
// (`#crop-esq:checked ~ .vframe .vcrop { left: 4% }`) com uma `transition: left`
// no CSS. Agora o quadro é conduzido por mola, que dá o peso de arrastar algo
// físico em vez do deslize linear de antes.
//
// As posições são as MESMAS do CSS original, escritas para não depender da
// largura do quadro (que sai do aspect-ratio 9/16): "direita" continua sendo
// `right: 4%`, só que expresso como left 96% com translate -100%.
const SPOTS = [
  { id: "esq", label: "Enquadrar à esquerda", at: { left: "4%", x: "0%" } },
  { id: "meio", label: "Enquadrar no centro", at: { left: "50%", x: "-50%" } },
  { id: "dir", label: "Enquadrar à direita", at: { left: "96%", x: "-100%" } },
] as const;

export function VerticalCrop() {
  const [spot, setSpot] = useState<(typeof SPOTS)[number]["id"]>("meio");
  const active = SPOTS.find((s) => s.id === spot)!;

  return (
    <div className="relative">
      <div className="relative aspect-video overflow-hidden rounded-lg border-2 border-border-dry bg-surface bg-[image:var(--halftone-dark)] bg-[length:16px_16px]">
        <span className="absolute top-[9px] left-[11px] text-[0.6rem] font-extrabold tracking-[0.1em] text-faint-raised uppercase">
          seu sinal do OBS · 1920×1080
        </span>

        <motion.div
          className="absolute top-[6%] bottom-[6%] grid aspect-9/16 content-end justify-items-center border-[3px] border-brass bg-brass/15 pb-[7px] [&>span]:rounded-sm [&>span]:bg-brass [&>span]:px-1.5 [&>span]:py-0.5 [&>span]:text-[0.56rem] [&>span]:font-extrabold [&>span]:tracking-[0.06em] [&>span]:text-brass-ink"
          animate={active.at}
          initial={false}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <span>720×1280</span>
        </motion.div>

        {SPOTS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSpot(s.id)}
            aria-pressed={spot === s.id}
            className={[
              "absolute inset-y-0 z-2 w-1/3 cursor-pointer",
              "outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-brass",
              i === 0 ? "left-0" : i === 1 ? "left-1/3" : "left-2/3",
            ].join(" ")}
          >
            <span className="sr-only">{s.label}</span>
          </button>
        ))}
      </div>

      <p className="mt-[13px] flex items-center justify-center gap-[9px] text-[0.76rem] font-[650] text-faint [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:shrink-0 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:[stroke-linecap:round] [&>svg]:[stroke-linejoin:round] [&>svg]:[stroke-width:2.2] [&_b]:text-muted">
        <CropIcon />
        <span>
          Escolha um lado do quadro: é assim que você define{" "}
          <b>o que vai pro vertical</b>.
        </span>
      </p>
    </div>
  );
}
