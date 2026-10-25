import { NextResponse, type NextRequest } from "next/server";
import {
  isLocale,
  LOCALE_COOKIE,
  localePath,
  negotiateLocale,
} from "./lib/i18n";

// Only the root needs code: language negotiation by cookie and weighted Accept-Language.
// Portuguese collection rewrites and pt-BR redirects are static rules in next.config.ts.
export const config = {
  matcher: ["/"],
};

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname !== "/") return NextResponse.next();

  const saved = req.cookies.get(LOCALE_COOKIE)?.value;
  const chosen =
    saved && isLocale(saved)
      ? saved
      : negotiateLocale(req.headers.get("accept-language"));

  // The root is the language-neutral x-default: English unless the visitor signals Portuguese.
  const url = req.nextUrl.clone();
  url.pathname = localePath(chosen);
  const res = NextResponse.redirect(url, 307);
  res.headers.set("Vary", "Accept-Language, Cookie");
  return res;
}
