import Link from "next/link";
import { TelemetryPreference } from "@/app/_components/telemetry-preference";
import {
  Callout,
  Contact,
  LegalSection,
  LegalTable,
  Todo,
} from "../_components/legal-chrome";
import {
  LEGAL_AUTHOR,
  LEGAL_CNPJ,
  LEGAL_HOST,
  LEGAL_OPERATOR,
  LEGAL_UPDATED_LABEL_EN,
  legalHref,
} from "@/lib/legal";

// Política de privacidade — TRADUÇÃO. O texto que vincula é o `privacy.pt.tsx`.
//
// Os nomes das leis brasileiras ficam com o nome original e a glosa em inglês
// ao lado (LGPD, ANPD, CDC): quem for pesquisar precisa do termo que existe, e
// traduzir "Autoridade Nacional de Proteção de Dados" pra "national data
// protection authority" apagaria justamente o nome do órgão que a pessoa tem
// que procurar. Os artigos de lei ficam na forma brasileira (art. 7º, V).

const L = "en" as const;

export const privacyHeroEn = {
  kicker: "Privacy policy",
  title: "Your stream content stays where you are: on your PC.",
  intro:
    "Corneta is a desktop app that runs on your machine. This policy explains, in detail and without the runaround, what happens to data on the website, in the sign-in API and inside the app — including what we deliberately don’t collect.",
};

export const privacySectionsEn = [
  { id: "responsavel", title: "Who’s responsible" },
  { id: "escopo", title: "What this policy covers" },
  { id: "principio", title: "The principle: Corneta is local" },
  { id: "site", title: "Data on the website" },
  { id: "api", title: "Data in the sign-in API" },
  { id: "app", title: "Data on your computer" },
  { id: "bases", title: "Legal bases" },
  { id: "google", title: "Google and YouTube data" },
  { id: "terceiros", title: "Third parties and the app’s connections" },
  { id: "internacional", title: "International transfers" },
  { id: "retencao", title: "How long we keep things" },
  { id: "seguranca", title: "Security" },
  { id: "direitos", title: "Your rights" },
  { id: "espectadores", title: "Your viewers’ data" },
  { id: "criancas", title: "Children and teenagers" },
  { id: "cookies", title: "Cookies and local preferences" },
  { id: "mudancas", title: "Changes to this policy" },
];

export const privacyTldrEn = {
  points: [
    "Corneta creates no account and needs no sign-up. In the app, usage data and crash reports start on by default when collection is configured; you can turn each purpose off separately.",
    "Stream keys and tokens live in your operating system’s credential vault, never on our servers.",
    "Settings, chat, alerts and stream reports live in files on your computer.",
    "Only the Kick sign-in passes through our servers — in transit, never stored. Twitch and YouTube talk straight to your app.",
    "This website measures only route, language, download clicks and technical errors, with no analytics cookies, replay, page text or link to the app; you can turn these metrics off below.",
  ],
  note: "This summary is a reading courtesy and does not replace the full text below.",
};

export function PrivacyBodyEn() {
  return (
    <>
      <LegalSection id="responsavel" n={1} title="Who’s responsible">
        <p>
          The party responsible for the processing described here — the
          “controller”, in the language of Brazil’s General Data Protection Law
          (Lei nº 13.709/2018, the LGPD) — is <strong>{LEGAL_OPERATOR}</strong>,
          registered under CNPJ no. <strong>{LEGAL_CNPJ}</strong>, which
          operates this website and the sign-in API.
        </p>
        <p>
          The Corneta software is distributed under the MIT licence and its
          copyright belongs to <strong>{LEGAL_AUTHOR}</strong>, the project’s
          author. Authorship of the code and operation of the service are
          separate things: the company above is who answers for the data
          processed here.
        </p>
        <p>
          For any privacy matter, including exercising your rights, the channel
          for data subjects is <Contact locale={L} />.
        </p>
        <Callout>
          In plain terms: the company is small enough that the law waives the
          formal “data protection officer” role, as long as there’s an open
          channel to you — which is the email above. That’s set out in ANPD
          Resolution CD/ANPD nº 2/2022. If an officer is ever appointed, their
          name will appear here.
        </Callout>
      </LegalSection>

      <LegalSection id="escopo" n={2} title="What this policy covers">
        <p>
          This policy covers three distinct things, and the difference matters:
        </p>
        <ul>
          <li>
            <strong>This website</strong> — the public pages that present
            Corneta and offer the download.
          </li>
          <li>
            <strong>The sign-in API</strong> — a minimal service on this same
            domain that helps the app finish the Kick sign-in and find out which
            sign-in providers are available.
          </li>
          <li>
            <strong>The Corneta app</strong> — the program you install on
            Windows and that runs on your machine.
          </li>
        </ul>
        <p>
          We don’t cover the streaming platforms (Twitch, YouTube, Kick,
          Facebook and others), the alert aggregators (Streamlabs,
          StreamElements) or OBS. Each has its own policy, and it’s with them
          that you deal about the data under their care.
        </p>
      </LegalSection>

      <LegalSection
        id="principio"
        n={3}
        title="The principle: Corneta is local"
      >
        <p>
          Corneta was built to distribute your stream from your computer,
          without routing the video through a cloud of our own. That isn’t a
          marketing promise: it’s the architecture. Video leaves OBS, enters
          Corneta and goes straight from your machine to each destination
          platform.
        </p>
        <p>
          As a result, <strong>we don’t receive</strong> your video, your audio,
          your stream keys, your chat, your alerts or your reports. There’s no
          dashboard of ours where that data shows up, because it never reaches
          us.
        </p>
        <Callout>
          App telemetry <strong>starts on</strong> and runs under legitimate
          interest (art. 7º, IX): usage data and crash reports exist to find and
          fix problems. You can <strong>turn each one off at any time</strong>{" "}
          in Settings — that is your right to object (art. 18, §2), it takes
          effect immediately, and it changes nothing about how Corneta works. A
          random installation UUID is created on first use with an active
          purpose. Turning both off stops new events but does not delete data
          already received by the processor. Copy the UUID before regenerating
          it or restarting the app with both purposes off if you want to request
          deletion. You can verify this behaviour in the source code.
        </Callout>
      </LegalSection>

      <LegalSection id="site" n={4} title="Data on the website">
        <p>
          This site has no sign-up form, newsletter, support chat, advertising
          pixel or user profile. Its fonts are served by the site itself, so
          your visit generates no request to third-party font services.
        </p>
        <p>
          We use PostHog in cookieless mode to measure only the route and
          language visited, which download button was used and redacted
          technical failures, together with the environment and build version.
          We do not collect query strings, URL fragments, visible text, typed
          fields, session replay, heatmaps, autocapture or network performance.
          The browser receives no persistent analytics identifier, we create no
          person profile and we do not connect the visit to the app’s optional
          installation UUID.
        </p>
        <p>
          The connection reveals the IP address to the provider in transit, as
          every internet request does, but the project is configured to discard
          it at ingestion and not use geolocation. We honour Do Not Track and
          Global Privacy Control. You can also stop new metrics at any time
          through the control in section 16.
        </p>
        <p>
          As with any website, the server that delivers it records technical
          access data — IP address, date and time, page requested, response code
          and browser information. Those records are generated and kept by the
          hosting provider,{" "}
          {LEGAL_HOST ? (
            <strong>{LEGAL_HOST}</strong>
          ) : (
            <Todo locale={L}>hosting provider</Todo>
          )}
          , acting as a processor, and serve to deliver the site, keep it secure
          and diagnose failures.
        </p>
        <p>
          The download button points to the installer. When you download it, the
          provider hosting the file may record the same kind of technical access
          data.
        </p>
      </LegalSection>

      <LegalSection id="api" n={5} title="Data in the sign-in API">
        <p>
          For you to sign in with your account and use chat, alerts and
          automatic broadcast creation, the app needs to complete a sign-in
          (OAuth) flow with each platform. Two of the three platforms talk{" "}
          <strong>directly</strong> to your computer; only Kick requires a
          server secret, and that’s why it comes through here.
        </p>

        <LegalTable>
          <table>
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">What it receives</th>
                <th scope="col">What we do</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>GET /api/v1/bootstrap</code>
                </td>
                <td>Nothing beyond the request itself.</td>
                <td>
                  Answers which sign-in providers are active and their public
                  client identifiers. No personal data.
                </td>
              </tr>
              <tr>
                <td>
                  <code>GET /api/v1/health</code>
                </td>
                <td>Nothing beyond the request itself.</td>
                <td>Answers whether the service is up.</td>
              </tr>
              <tr>
                <td>
                  <code>POST /api/v1/oauth/kick/exchange</code>
                </td>
                <td>
                  Kick’s temporary authorisation code, the PKCE verifier and the
                  return address.
                </td>
                <td>
                  Forwards it to <code>id.kick.com</code> along with the client
                  secret and hands the tokens back to your app.
                </td>
              </tr>
              <tr>
                <td>
                  <code>POST /api/v1/oauth/kick/refresh</code>
                </td>
                <td>Kick’s refresh token.</td>
                <td>Asks Kick for a new token and hands it to your app.</td>
              </tr>
            </tbody>
          </table>
        </LegalTable>

        <h3>What this API does not do</h3>
        <ul>
          <li>
            <strong>It doesn’t store tokens.</strong> The code and the tokens
            exist only in memory during the request and go on to your app, which
            keeps them in your system’s vault. There’s no database, file or
            cache holding those values.
          </li>
          <li>
            <strong>It doesn’t create accounts or sessions.</strong> There’s no
            sign-up, no website login, no session cookie and no user profile.
          </li>
          <li>
            <strong>It doesn’t log request contents.</strong> When an unexpected
            failure happens, the server may send PostHog only a random request
            identifier, categorised route and provider, error code, response
            class and a duration bucket. An unexpected failure includes a
            redacted type and stack. Request bodies, platform responses, query
            strings, tokens and authentication headers never enter that event.
            The telemetry UUID and operation identifier accompany a request only
            when the app has the corresponding purpose active; otherwise,
            correlation is ephemeral and limited to that request.
          </li>
        </ul>

        <h3>Abuse protection</h3>
        <p>
          To stop anyone using the service as a springboard, there’s a per-IP
          attempt limit (20 exchanges and 60 refreshes per minute). That control
          uses the request’s IP in memory only, for a few minutes, purely to
          count attempts in the current window.
        </p>
        <Callout>
          Twitch sign-in uses the device code flow and YouTube uses PKCE
          straight with Google. In both of those cases, no sign-in data passes
          through our servers.
        </Callout>
      </LegalSection>

      <LegalSection id="app" n={6} title="Data on your computer">
        <p>
          The app keeps, on your machine, what it needs to do its job. None of
          the content described below is sent to us. Only the technical data
          expressly listed further down may be sent when collection is
          configured and the corresponding purpose is active, including before a
          choice on first use.
        </p>
        <ul>
          <li>
            <strong>Stream keys and access tokens</strong> live in the operating
            system’s credential vault (on Windows, Credential Manager). The
            config file stores only the fact that a key exists, never the key.
          </li>
          <li>
            <strong>Settings</strong> — destinations, per-platform quality,
            preferences, profiles, stream title — live in a local config file
            that you can export and import whenever you want.
          </li>
          <li>
            <strong>Chat, alerts and viewer counts</strong> arrive from the
            platforms straight to your app and are shown in the interface. The
            history is not sent to any server of ours.
          </li>
          <li>
            <strong>Post-stream reports</strong> — stability, audience, chat
            rate, alerts, marked moments — are written to local files.
          </li>
          <li>
            <strong>Stream recording</strong> — off by default. If you turn it
            on, the app saves the video that went out (and, as a separate
            option, chat messages along with the name of whoever wrote them) as
            files in the folder you pick, on your computer. None of it is sent
            to us or anywhere else. Other people&rsquo;s messages that you
            choose to record are your responsibility: you decide how long to
            keep them, and you can delete them at any time from the report
            itself or from the folder.
          </li>
          <li>
            <strong>Support diagnostics</strong> — if you request an export, the
            app generates a file containing only a structured technical summary
            and allowlisted operational events. It does not include raw logs,
            channel or destination names, titles, paths, URLs or credentials.
            Logs can be opened separately on your computer; you decide whether
            and to whom to send the diagnostic file.
          </li>
          <li>
            <strong>Telemetry you can turn off</strong> — “usage data” may send
            the version, language, categorised system family, architecture and
            GPU, operation stages and outcomes, enumerated platforms,
            destination count and bucketed durations. “Crash reports” may send
            the error code and stage, type, redacted stack and random
            error/operation identifiers, plus a minimal startup marker with the
            version and whether the previous exit was clean, needed to measure
            stability without enabling usage metrics. These are two independent
            preferences and both start on. Even when active, we never send
            video, audio, chat, alerts, stream title, channel, keys, tokens,
            RTMP URL, hostname, full local path, raw logs or configuration.
          </li>
          <li>
            <strong>Telemetry preference and UUID</strong> — these live in a
            separate local file that does not travel with configuration exports
            or imports. The UUID is created on first use with an active purpose,
            even before you make a choice. Turning both off stops new events and
            clears SDK persistence. The ID remains available in the current
            session so you can copy it and request deletion of previous events;
            copy it before restarting or regenerating it. Regenerating the ID
            does not delete data held by the processor.
          </li>
          <li>
            <strong>The OBS overlay</strong> — when on, the app starts a server
            that answers only on your computer (<code>127.0.0.1</code>), so OBS
            can read alerts and chat as a Browser Source. It is not exposed to
            the internet.
          </li>
          <li>
            <strong>Your acceptance of these documents</strong> — the date and
            version of the terms you saw on the welcome screen are kept locally,
            only so the app knows when it needs to tell you again. That record
            doesn’t travel with the config export and is never sent to us.
          </li>
        </ul>
        <p>
          Without a valid token or host, or with the build telemetry kill switch
          active, the app does not send these events. Telemetry network failures
          do not prevent using the app or starting and ending a stream; events
          may be lost. Turning collection off does not undo a request already in
          flight.
        </p>
        <p>
          Uninstalling the app does not guarantee removal of credentials or all
          local data. Before uninstalling, disconnect your accounts in Corneta
          and revoke access on the platforms. To check remaining credentials,
          open Windows Credential Manager and remove only entries identified as
          Corneta (service <code>br.com.pitroldev.corneta</code>); do not delete
          other apps’ credentials. If the app reports a failure when
          disconnecting, cleanup may be incomplete.
        </p>
        <p>
          Settings, reports, recordings and exported copies are separate data:
          review the locations you use before removing them. Telemetry events
          sent before then follow the period in section 11; to request earlier
          deletion, note the UUID shown in Settings before removing local data
          and use the channel in section 13.
        </p>
      </LegalSection>

      <LegalSection id="bases" n={7} title="Legal bases">
        <p>
          For the few processing activities we carry out, the LGPD legal bases
          are:
        </p>
        <ul>
          <li>
            <strong>Performance of a contract</strong> (art. 7º, V) — processing
            Kick’s code and tokens is what lets us deliver the sign-in feature
            you asked for when you clicked sign in.
          </li>
          <li>
            <strong>Legitimate interest</strong> (art. 7º, IX) — technical
            access records, the per-IP limit, API failure diagnostics and
            strictly aggregate cookieless site metrics exist to keep the service
            available, secure and understandable, at the minimum needed for
            those purposes. The site offers a direct opt-out and honours browser
            privacy signals.
          </li>
          <li>
            <strong>Legitimate interest</strong> (art. 7º, IX) — app usage data
            and automatic crash reports start on and exist to find defects,
            measure stability, and prioritise fixes. Processing is kept to the
            minimum necessary (art. 10, §1): a closed list of technical
            properties, no stream content, no geolocation, and no identified
            profile. You can object to each purpose at any time in Settings
            (art. 18, §2), with immediate effect and without affecting how
            Corneta works. The balancing test is published in the repository.
          </li>
          <li>
            <strong>Compliance with a legal or regulatory obligation</strong>{" "}
            (art. 7º, II) — where keeping access records is required by law.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="google" n={8} title="Google and YouTube data">
        <p>
          If you connect your YouTube account, Corneta asks for the{" "}
          <strong>“manage your YouTube account”</strong> permission (the{" "}
          <code>https://www.googleapis.com/auth/youtube</code> scope). It is
          used exclusively to:
        </p>
        <ul>
          <li>
            <strong>Create and end your live broadcast</strong>, get the
            matching stream key and set the title you typed into the app, so you
            don’t have to open YouTube Studio for every stream. The title change
            affects only the broadcast in progress — no video already published
            on your channel is modified.
          </li>
          <li>
            <strong>Read and send live chat messages</strong>, which is what
            makes unified chat and replying from the app possible.
          </li>
          <li>
            <strong>Read the viewer count</strong> of the broadcast in progress,
            to show your combined audience.
          </li>
        </ul>
        <p>
          This data is requested by the app installed on your machine, directly
          from Google, and stays there. YouTube sign-in uses the official PKCE
          flow for installed apps and{" "}
          <strong>does not pass through our servers</strong>: not the
          authorisation code, not the token, not the refresh. The tokens are
          kept in the Windows credential vault.
        </p>

        <h3>Limited Use</h3>
        <p>
          Corneta’s use and transfer of information received from Google APIs
          adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noreferrer noopener"
            target="_blank"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In practice, that means
          Corneta:
        </p>
        <ul>
          <li>
            <strong>does not transfer</strong> Google data to third parties,
            except as needed to provide the very feature you asked for or where
            required by law;
          </li>
          <li>
            <strong>does not use</strong> that data for advertising, profiling
            or sale;
          </li>
          <li>
            <strong>does not use</strong> that data to train artificial
            intelligence models, generalised or not;
          </li>
          <li>
            <strong>does not allow</strong> humans to read that data, except
            with your explicit consent, for security purposes, to comply with
            the law, or over aggregated and anonymised data.
          </li>
        </ul>
        <Callout>
          You can revoke access at any time at{" "}
          <a
            href="https://myaccount.google.com/permissions"
            rel="noreferrer noopener"
            target="_blank"
          >
            myaccount.google.com/permissions
          </a>
          . Revoking platform access and deleting local credentials are separate
          actions. Also disconnect the account in Corneta; uninstalling does not
          guarantee that vault entries are deleted. See section 6 for local
          cleanup guidance.
        </Callout>
      </LegalSection>

      <LegalSection
        id="terceiros"
        n={9}
        title="Third parties and the app’s connections"
      >
        <p>
          We don’t sell, rent or share data with third parties for advertising —
          we have no ads, no data sponsor and no marketing partnership. What
          does exist are connections <strong>your computer</strong> makes for
          the app to work. They leave your machine, not ours:
        </p>
        <ul>
          <li>
            <strong>Destination platforms</strong> — the video ingest servers
            (RTMP/RTMPS) your stream is sent to.
          </li>
          <li>
            <strong>Platform APIs</strong> — Twitch, YouTube/Google and Kick,
            for sign-in, chat, viewer counts, alerts and broadcast creation.
          </li>
          <li>
            <strong>Emote services</strong> — BetterTTV, FrankerFaceZ and 7TV,
            to show chat emotes, plus the platforms’ own image CDNs.
          </li>
          <li>
            <strong>Alert aggregators</strong> — Streamlabs and StreamElements,
            only if you set those sources up; the token stays in your vault.
          </li>
          <li>
            <strong>Speed test</strong> — the upload meter sends throwaway data
            to a public Cloudflare endpoint (<code>speed.cloudflare.com</code>)
            to estimate your bandwidth. None of your content is transmitted in
            that test.
          </li>
        </ul>
        <p>
          On our side, the processors are the hosting provider for the site and
          API, named above, and <strong>PostHog Inc.</strong>. PostHog receives
          only the technical events and redacted exceptions described in this
          policy, for product metrics, operations and diagnosis; it does not
          receive your stream content and is not used for advertising.
        </p>
      </LegalSection>

      <LegalSection id="internacional" n={10} title="International transfers">
        <p>
          The site and the API are hosted on{" "}
          {LEGAL_HOST ? (
            <strong>{LEGAL_HOST}</strong>
          ) : (
            <Todo locale={L}>hosting provider</Todo>
          )}
          , a company based in the United States, which may process requests on
          servers outside Brazil. Telemetry is processed by{" "}
          <strong>PostHog Cloud US, in Virginia, United States</strong>. The
          streaming platforms, alert aggregators and emote services named above
          also operate abroad.
        </p>
        <p>
          When you use those features, the data needed for the communication
          travels internationally, per each service’s policies and per arts. 33
          and following of the LGPD. None of your stream’s content passes
          through those servers: the video leaves your machine straight for each
          platform.
        </p>
      </LegalSection>

      <LegalSection id="retencao" n={11} title="How long we keep things">
        <LegalTable>
          <table>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Retention</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Kick authorisation code and tokens</td>
                <td>
                  Only during the request, in memory. They are never written
                  down.
                </td>
              </tr>
              <tr>
                <td>Per-IP attempt counter</td>
                <td>In memory, until the counting window ends (one minute).</td>
              </tr>
              <tr>
                <td>Technical access records</td>
                <td>
                  For the period the hosting provider practises and for the
                  applicable statutory periods.
                </td>
              </tr>
              <tr>
                <td>
                  Technical events and redacted exceptions from the site, app
                  and API
                </td>
                <td>
                  Up to 90 days in PostHog. The IP address is discarded at
                  ingestion and is not used as a dimension.
                </td>
              </tr>
              <tr>
                <td>App telemetry preferences and UUID</td>
                <td>
                  Preferences remain on your computer until changed or deleted.
                  The UUID can be regenerated with both purposes off; it is also
                  no longer available in the app when restarting with both off.
                </td>
              </tr>
              <tr>
                <td>Website preferences</td>
                <td>
                  The language choice stays in a functional cookie for up to one
                  year; the metrics opt-out stays in local storage until you
                  re-enable metrics or clear browser data.
                </td>
              </tr>
              <tr>
                <td>Your settings, keys and reports</td>
                <td>
                  For as long as you want: they’re on your computer, under your
                  care.
                </td>
              </tr>
            </tbody>
          </table>
        </LegalTable>
      </LegalSection>

      <LegalSection id="seguranca" n={12} title="Security">
        <p>
          We take technical measures proportional to what the service does:
          sensitive credentials live in the operating system’s vault instead of
          text files; API responses are not cached; request size is capped;
          sign-in return addresses are validated against a fixed list; and
          there’s a per-IP attempt limit. The OBS overlay answers only on the
          local address. Before every telemetry event, a closed property list
          and a redactor remove secrets, free text, URL parameters and local
          paths; an event outside the schema is dropped.
        </p>
        <p>
          No system is infallible. If we identify a security incident with
          relevant risk, we will notify the data subjects and Brazil’s National
          Data Protection Authority (Autoridade Nacional de Proteção de Dados,
          ANPD) as the law requires.
        </p>
        <Callout>
          Found a flaw? Talk to us at <Contact locale={L} /> before disclosing
          it publicly. We reply, and we credit whoever reports.
        </Callout>
      </LegalSection>

      <LegalSection id="direitos" n={13} title="Your rights">
        <p>
          The LGPD grants you, among others, the right to confirm that
          processing exists, access the data, correct incomplete or outdated
          data, request anonymisation, blocking or deletion of unnecessary data,
          request portability, obtain information about sharing, withdraw
          consent and object to processing based on legitimate interest.
        </p>
        <p>
          To exercise any of them, write to <Contact locale={L} />. We’ll answer
          within the statutory deadline. Since we keep no account, most data
          concerning you is already under your direct control. If you enabled
          app telemetry, include the UUID you can copy from Settings so we can
          locate and delete the events. Cookieless site telemetry creates no
          persistent identifier with which to isolate a past visit; the control
          below prevents new sends in this browser.
        </p>
      </LegalSection>

      <LegalSection id="espectadores" n={14} title="Your viewers’ data">
        <p>
          When you use chat and alerts, your computer receives other people’s
          data: nicknames, messages, donation amounts, subscription notices.
          That data arrives from the platforms straight to your app and{" "}
          <strong>does not pass through us</strong>.
        </p>
        <p>
          For that processing, you’re the one deciding what to do with the data
          — including whether it shows up in the overlay inside your stream. We
          recommend care when displaying the name and amount of whoever supports
          you, and care when sharing recordings and screenshots.
        </p>
      </LegalSection>

      <LegalSection id="criancas" n={15} title="Children and teenagers">
        <p>
          Corneta is a production tool for people who stream live and is not
          directed at children. Streaming platforms have their own minimum age,
          and your use must respect it. If you’re a teenager, use the app with
          the knowledge and assistance of whoever is responsible for you.
        </p>
      </LegalSection>

      <LegalSection id="cookies" n={16} title="Cookies and local preferences">
        <p>
          PostHog runs in cookieless mode: it writes no analytics cookie or
          persistent analytics identifier, performs no fingerprinting and
          creates no person profile. One functional cookie,
          <code> corneta.locale</code>, stores your language choice for up to
          one year.
        </p>
        <p>
          If you turn metrics off, the browser stores only the value “disabled”
          under the <code>corneta:site-telemetry:v1</code> local-storage key.
          That preference is not sent to PostHog. Do Not Track and Global
          Privacy Control also keep capture off. Because there is no advertising
          or analytics cookie, we provide the direct control below instead of a
          cookie banner.
        </p>
        <TelemetryPreference locale={L} />
      </LegalSection>

      <LegalSection id="mudancas" n={17} title="Changes to this policy">
        <p>
          If the product changes in a way that alters data processing — say, if
          one day there’s an optional feature that depends on a server — this
          policy will be updated before that change reaches you, with a new
          revision date at the top of the page. The current version is{" "}
          {LEGAL_UPDATED_LABEL_EN}.
        </p>
        <p>
          The <Link href={legalHref(L, "terms")}>Terms of use</Link> complement
          this policy and explain the rules for using the software and the
          sign-in service.
        </p>
      </LegalSection>
    </>
  );
}
