import type { ReactNode } from "react";
import { categoriesForCollection, isEditorialCollection } from "../_shared";

export const dynamicParams = false;

export function generateStaticParams({
  params,
}: {
  params: { locale: string; collection: string };
}) {
  if (!isEditorialCollection(params.collection)) return [];
  return categoriesForCollection(params.collection).map((category) => ({
    category,
  }));
}

export default function EditorialCategoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
