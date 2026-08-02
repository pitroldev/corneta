import type { ReactNode } from "react";
import { EDITORIAL_COLLECTIONS } from "@/lib/editorial/constants";

export const dynamicParams = false;

/** Primeiro nível top-down: cada locale ancestral recebe as duas coleções. */
export function generateStaticParams() {
  return EDITORIAL_COLLECTIONS.map((collection) => ({ collection }));
}

export default function EditorialCollectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
