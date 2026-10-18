"use client";

import { LazyMotion } from "framer-motion";
import type { ReactNode } from "react";

const loadFeatures = () =>
  import("./motion-features").then((features) => features.default);

/** Animation features load after hydration; nothing above the fold animates. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
