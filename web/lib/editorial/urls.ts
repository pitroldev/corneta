import type {
  EditorialCollection,
  EditorialLocale,
  EditorialRouteKey,
} from "./types";

export function editorialCollectionHref(
  locale: EditorialLocale,
  collection: EditorialCollection,
): string {
  const localePrefix = locale === "en" ? "/en" : "";
  return `${localePrefix}/${collection}`;
}

export function editorialSearchHref(locale: EditorialLocale): string {
  return locale === "en" ? "/en/search" : "/search";
}

export function editorialCategoryHref(
  route: Pick<EditorialRouteKey, "locale" | "collection" | "category">,
): string {
  return `${editorialCollectionHref(route.locale, route.collection)}/${route.category}`;
}

export function buildEditorialHref(route: EditorialRouteKey): string {
  return `${editorialCategoryHref(route)}/${route.slug}`;
}
