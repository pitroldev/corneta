# Corneta web

The part of Corneta that runs outside the streamer's PC, built with Next.js 16, React Server
Components and Tailwind CSS 4. The same app holds two things:

- **Public site** — the landing page and the legal pages. HTML is rendered on the server; a
  small client handles the language switch, the telemetry preference and the manual metrics
  described below.
- **Setup API** (`/api/v1/*`) — serves the public Client IDs at bootstrap and performs the OAuth
  exchange/refresh for Kick, the only platform that requires a Client Secret. The desktop app
  depends on it for the official Kick login.

## Contributing without official credentials

Use the Node/pnpm versions and the installation described in the [main README](../README.md). From the repository root, without creating a `.env`:

```bash
pnpm contrib:web        # site + API at http://localhost:7390
pnpm contrib:web:check  # site integrity, lint, types and build
pnpm test               # includes the pure tests of the web workspace
```

Run the server and the build at different times or in separate copies. The contributor profile provides the canonical build origin and turns telemetry off; it does not use official OAuth credentials or validate a real login. If real `web/.env*` files exist, it refuses to continue: use another clean clone instead of deleting your credentials. See [development](../docs/DEVELOPMENT.md).

## Configured operation and variables

To test your own integrations, the relevant example is [web/.env.example](.env.example) and the local file is `web/.env.local`, both relative to the repository root. Do not overwrite an existing file. The `pnpm web:dev` and `pnpm web:check` commands, also run from the root, use this configuration and do not have the isolation of the contributor profile.

The production build requires `NEXT_PUBLIC_SITE_URL=https://www.corneta.live`; this does not enable arbitrary hosting of forks. On the production host, supply the variables through the host's environment/secret store. See the [configuration matrix](../docs/CONFIGURATION.md) for OAuth, local limits, proxy, precedence and the distinction between secrets and public values. The [release gates](../docs/RELEASE-GATES.md) collect the additional criteria required to distribute the product, including WAF/edge protection on the host.

The download uses the stable `/download` address, with no environment variable or secret.
The route reads the public `latest.json` of the official GitHub release and redirects
to the versioned Windows `.exe` installer named in the manifest, after validating the
repository, platform and version. A valid response may stay in the CDN cache for
five minutes. If the manifest is invalid or unavailable, the route forwards
to the `releases/latest` page of the official repository, uncached, instead of inventing
a file name. This does not change the [desktop updater](../docs/AUTO-UPDATE.md),
which still uses its own manifest endpoint and verifies the signature.

Summary of the site variables:

- `NEXT_PUBLIC_SITE_URL`: canonical URL used in metadata, sitemap and robots;
- `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION`: public tokens issued by Search
  Console and Bing Webmaster Tools. The metadata omits the tags when they are empty;
- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST`: ingestion Project API Key
  (`phc_*`) and HTTPS host used in the browser;
- `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`: server-only equivalents for the Setup API. When
  absent, the public variables are used as fallback;
- `NEXT_PUBLIC_TELEMETRY_DISABLED=1` and `TELEMETRY_DISABLED=1`: independent client and server
  kill switches;
- `NEXT_PUBLIC_DEPLOYMENT_ENV`, `POSTHOG_ENVIRONMENT`, `NEXT_PUBLIC_BUILD_SHA` and `BUILD_SHA`:
  deploy context. On Vercel, `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` are the server
  fallbacks.

Use only the **ingestion Project API Key** in these variables. A PostHog Personal API Key must
never go into the site, the API or the repository. In production, client and server use the
same project token, `https://us.i.posthog.com` and the full SHA of the same commit; the
`pnpm telemetry:release:check` gate validates this contract together with the desktop.

The Kick routes are protected by local memory capped at 10,000 entries per instance,
with no storage service or additional secret: 20 exchanges and 60 refreshes per
origin in fixed 60-second windows. Restarting/scaling creates fresh counters; this
is not a global limit. Shared protection in front of the instances depends on a
WAF/edge configured and tested on the host, answering `429` without an interactive challenge.
The build neither configures nor proves this protection. Check scope, coverage and
test runs before distributing.

## Telemetry and diagnostics

Without a valid configuration, or with the relevant kill switch set, sending is disabled. On the desktop, usage is opt-in (`unset` means off) and failures are opt-out (`unset` means on); earlier explicit choices are preserved, and turning sending on does not recover earlier usage events. The site keeps its own single opt-out control, DNT/GPC and kill switch; it does not share the desktop preferences. The API keeps correlation according to each purpose enabled in the app. What is collected is in the [privacy policy](https://www.corneta.live/legal/privacy); this description is not a substitute for legal review.

When the applicable sending is enabled:

- the site uses PostHog without cookies: each page load gets a random id that lives only in
  memory. There is no identity persistence, person profile, autocapture, replay, heatmap, page
  text, performance, surveys, feature flags or remote config. PostHog's `cookieless_mode` does
  not work here: the server drops events without `$raw_user_agent` and `$host`, and the site's
  filter removes both;
- the site sends only `site_page_viewed`, `site_cta_clicked` and redacted exceptions. Routes are
  enums; query strings and fragments never enter the event;
- the `corneta:site-telemetry:v1` preference stores only a persistent opt-out in the browser.
  DNT and Global Privacy Control also turn capture off. The control is on the Privacy policy
  page;
- the site never identifies the person and does not link a visit to the optional installation
  UUID of the app;
- the Setup API sends only failures: known operational errors become an event with route, code,
  HTTP class and bucketed duration; unexpected failures become a redacted exception. Body,
  provider response, query, tokens and authentication headers are not passed to the facade;
- every API response includes `X-Request-Id`. The desktop sends the UUID correlation, an optional `operation_id` and a closed set of purposes in `X-Corneta-Telemetry-Purposes` only when some purpose is actually enabled. The API reuses this correlation in operational events only when usage is enabled, and in exceptions only when failures are enabled. Without an authorized correlation for that purpose, it uses an ephemeral per-request identity; this does not bypass the kill switch or the API's sending configuration;
- server-side sending runs in the Next.js `after()` and fails silently: PostHog never changes the
  status, body or required latency of the response.

The `/api/v1/health` health check publishes only the SHA, kill switches, public hosts and the
SHA-256 of the public project token actually deployed on the site/API. The release workflow
compares this metadata with the desktop before creating the draft; no Personal API Key or raw
token appears in the response.

In the production PostHog project, configure 90-day retention, **Discard client IP data**,
Cloud US (Virginia), DPA, MFA and role-based access.

### Legal pages

`/legal/privacy` and `/legal/terms-of-use` are static and describe the product's actual
behavior: what the app stores on the computer, what the login API (`/api/v1/*`) processes and
what neither of them does. When you change a data flow in the app or in the API routes, update
both documents and the date in `lib/legal.ts`.

Identification lives in **`lib/legal.ts`** — fixed configuration, no environment variable:
everything there is printed on the public page. The file deliberately separates two roles: the
**legal entity** that operates the site and the API and offers the terms (data controller under
the LGPD) and the **author** who holds the copyright to the code in `LICENSE`. Transferring
ownership of the code to the company would require an assignment of rights — it is not a text
edit.

A material telemetry change requires updating the PT/EN versions of the policy, the revision
date and `LEGAL_ACCEPT_VERSION`, which is mirrored in the desktop workspace.

## Editorial content and search engines

The public hubs always use English paths: `/help`, `/guides`, `/en/help` and
`/en/guides`. The text stays localized. Articles live in `content/`, go through the
`pnpm --dir web content:check` gate (run from the root) and only enter the sitemap, hreflang and llms.txt once they are published. See the [editorial guide](content/README.md).

To complete the external verification after the deploy:

1. set `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` in the production environment;
2. deploy the same host as `NEXT_PUBLIC_SITE_URL`;
3. confirm the tags in the rendered HTML;
4. verify domain ownership in both consoles;
5. submit `https://www.corneta.live/sitemap.xml`.

The first four steps depend on the external accounts and cannot be completed from the
repository alone. Do not use the verification file upload: the tags generated through metadata
remain valid on every public page.
