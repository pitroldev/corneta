import type { Metadata } from "next";

export const TITLE_TEMPLATE = "%s | Corneta";

const BRAND_SUFFIX = TITLE_TEMPLATE.replace("%s", "");
// Search results cut titles near 60 characters; a long title keeps its own words instead of the brand.
const SEARCH_TITLE_LIMIT = 60;

export function pageTitle(title: string): NonNullable<Metadata["title"]> {
  return title.length + BRAND_SUFFIX.length <= SEARCH_TITLE_LIMIT
    ? title
    : { absolute: title };
}
