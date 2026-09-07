import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  negotiateLocale,
} from "./lib/i18n";

// Negotiate only the root URL; temporary redirects vary by the explicit preference and language header.

export const config = {
  matcher: [
    "/",
    "/pt-BR",
    "/legal/:path*",
    "/help/:path*",
    "/guides/:path*",
    "/search/:path*",
    "/pt-BR/legal/:path*",
    "/pt-BR/help/:path*",
    "/pt-BR/guides/:path*",
    "/pt-BR/search/:path*",
  ],
};

const PUBLIC_PT_COLLECTIONS = [
  "/legal",
  "/help",
  "/guides",
  "/search",
] as const;

function belongsToCollection(pathname: string, collection: string) {
  return pathname === collection || pathname.startsWith(`${collection}/`);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The internal Portuguese prefix must redirect to the established public URL.
  const internalPtPath = pathname.slice(`/${DEFAULT_LOCALE}`.length) || "/";
  if (
    pathname === `/${DEFAULT_LOCALE}` ||
    PUBLIC_PT_COLLECTIONS.some((collection) =>
      belongsToCollection(internalPtPath, collection),
    )
  ) {
    const url = req.nextUrl.clone();
    url.pathname = internalPtPath;
    return NextResponse.redirect(url, 308);
  }

  // Rewrite Portuguese internally without changing its unprefixed public URL.
  if (
    PUBLIC_PT_COLLECTIONS.some((collection) =>
      belongsToCollection(pathname, collection),
    )
  ) {
    const url = req.nextUrl.clone();
    url.pathname = `/${DEFAULT_LOCALE}${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (pathname !== "/") return NextResponse.next();

  const saved = req.cookies.get(LOCALE_COOKIE)?.value;
  const chosen =
    saved && isLocale(saved)
      ? saved
      : negotiateLocale(req.headers.get("accept-language"));

  if (chosen === DEFAULT_LOCALE) {
    const res = NextResponse.rewrite(new URL(`/${DEFAULT_LOCALE}`, req.url));
    res.headers.set("Vary", "Accept-Language, Cookie");
    return res;
  }

  const url = req.nextUrl.clone();
  url.pathname = `/${chosen}`;
  const res = NextResponse.redirect(url, 307);
  res.headers.set("Vary", "Accept-Language, Cookie");
  return res;
}
