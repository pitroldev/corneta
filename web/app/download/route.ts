import { RELEASES_URL } from "../../lib/download";
import { latestInstallerUrl } from "../../lib/server/download";

export async function GET() {
  const installerUrl = await latestInstallerUrl();
  return new Response(null, {
    status: 302,
    headers: {
      Location: installerUrl ?? RELEASES_URL,
      "Cache-Control": installerUrl
        ? "public, max-age=0, s-maxage=300"
        : "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
