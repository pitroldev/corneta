"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";

export interface SwitchItem {
  id: string;
  title: string;
  hint: string;
  panel: ReactNode;
}

export function Switch({
  items,
  label,
}: {
  items: SwitchItem[];
  label: string;
}) {
  const [active, setActive] = useState(items[0]!.id);
  const group = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta =
      e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowLeft"
          ? -1
          : e.key === "Home"
            ? -index
            : e.key === "End"
              ? items.length - 1 - index
              : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = (index + delta + items.length) % items.length;
    setActive(items[next]!.id);
    tabs.current[next]?.focus();
  };

  const current = items.find((i) => i.id === active) ?? items[0]!;

  return (
    <div className="relative">
      <div
        role="tablist"
        aria-label={label}
        className="mb-5.5 flex flex-wrap gap-2.25"
      >
        {items.map((item, i) => {
          const on = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`${group}-tab-${item.id}`}
              aria-selected={on}
              aria-controls={`${group}-panel-${item.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={[
                "cursor-pointer rounded-md px-3.75 py-2.5 text-left max-[760px]:px-3 max-[760px]:py-2",
                "transition-[background-color,color,box-shadow] duration-150 ease-out",
                "outline-offset-[3px] focus-visible:outline-[3px] focus-visible:outline-brass",
                on
                  ? "bg-brass text-brass-ink shadow-pop-brass"
                  : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-cream",
              ].join(" ")}
            >
              {/* Each button owns its background to preserve text contrast during the transition. */}
              <span className="block font-display text-[1.05rem] leading-[1.1] font-bold max-[760px]:text-[0.94rem]">
                {item.title}
              </span>
              <span className="mt-0.5 block text-[0.66rem] font-extrabold tracking-[0.08em] uppercase opacity-75">
                {item.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Keep content mounted during transitions to prevent the container from collapsing. */}
      <motion.div
        key={current.id}
        role="tabpanel"
        id={`${group}-panel-${current.id}`}
        aria-labelledby={`${group}-tab-${current.id}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
      >
        {current.panel}
      </motion.div>
    </div>
  );
}
