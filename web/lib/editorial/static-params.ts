// Next.js skips prerendering a nested route when any parent branch returns no params, so an
// empty category (every English one today) would turn every article into a 404.
export const EMPTY_CATEGORY_SLUG = "__empty__";

export function articleStaticParams(
  slugs: readonly string[],
): { slug: string }[] {
  return (slugs.length > 0 ? slugs : [EMPTY_CATEGORY_SLUG]).map((slug) => ({
    slug,
  }));
}
