import Link from "next/link";
import {
  Callout,
  Contact,
  LegalSection,
  Todo,
} from "../_components/legal-chrome";
import {
  LEGAL_AUTHOR,
  LEGAL_CNPJ,
  LEGAL_OPERATOR,
  LEGAL_UPDATED_LABEL_EN,
  LEGAL_VENUE,
  legalHref,
} from "@/lib/legal";

// Termos de uso — TRADUÇÃO. O texto que vincula é o `terms.pt.tsx`, e a página
// diz isso em destaque antes do documento.
//
// Três decisões de tradução que valem registro:
//  • os `id` das seções são os MESMOS do português (`aceitacao`, `oque-e`…).
//    São âncora de URL: alguém pode ter linkado `#garantia`, e o link tem que
//    cair no mesmo lugar nos dois idiomas;
//  • "Código de Defesa do Consumidor" e "LGPD" ficam com o nome brasileiro e a
//    glosa em inglês ao lado — é o nome da lei, não um conceito genérico. Quem
//    for procurar precisa do termo que existe;
//  • os links internos usam `legalHref("en", …)`: apontar pro documento em
//    português a partir daqui seria mandar o leitor de volta pro problema.

const L = "en" as const;

export const termsHeroEn = {
  kicker: "Terms of use",
  title: "The rules, in plain language.",
  intro:
    "Corneta is free software that runs on your own machine. These terms say what you can do with it, what’s on you when you stream, and how far our side goes — no fine print.",
};

export const termsSectionsEn = [
  { id: "aceitacao", title: "Accepting these terms" },
  { id: "oque-e", title: "What Corneta is (and isn’t)" },
  { id: "licenca", title: "Software licence" },
  { id: "terceiros", title: "Third-party components" },
  { id: "login", title: "The sign-in service" },
  { id: "responsabilidades", title: "What’s on you" },
  { id: "plataformas", title: "The platforms’ own rules" },
  { id: "experimental", title: "Experimental features" },
  { id: "requisitos", title: "Requirements and performance" },
  { id: "garantia", title: "No warranty" },
  { id: "responsabilidade", title: "Limitation of liability" },
  { id: "marcas", title: "Trademarks and non-affiliation" },
  { id: "mudancas", title: "Changes to the software and these terms" },
  { id: "encerramento", title: "Ending it" },
  { id: "lei", title: "Governing law and venue" },
  { id: "contato", title: "Contact" },
];

export const termsTldrEn = {
  points: [
    "Corneta’s core is open source under the MIT licence: use it, study it, modify it, share it.",
    "There’s no subscription and no account to create; the app runs on your computer.",
    "You stay responsible for what you stream and for following each platform’s rules.",
    "Features marked experimental can fail; the privacy guard is a safety net, not a guarantee.",
    "The software comes “as is”, with no warranty — but your consumer rights under Brazilian law still stand.",
  ],
  note: "This summary is a reading courtesy and does not replace the full text below.",
};

export function TermsBodyEn() {
  return (
    <>
      <LegalSection id="aceitacao" n={1} title="Accepting these terms">
        <p>
          These terms govern the use of the Corneta app, this website and the
          sign-in service described below, all offered by{" "}
          <strong>{LEGAL_OPERATOR}</strong>, registered in Brazil under CNPJ no.{" "}
          <strong>{LEGAL_CNPJ}</strong>. If you don’t agree with them, don’t
          install the app — and if you already did, uninstall it.
        </p>
        <p>
          You accept these terms when you finish or dismiss the app’s welcome
          screen, where this document and the Privacy Policy appear as links
          before any use. The installer shows both references too, and they stay
          permanently available on the <strong>About</strong> screen. The record
          that you went through that notice lives only on your computer: there
          is no sign-up, no account and no server of ours holding it.
        </p>
        <p>
          If you use Corneta on behalf of a company, channel or team, you
          declare you have the authority to accept these terms for them. If
          you’re under 18, use the app with the assistance of whoever is legally
          responsible for you.
        </p>
      </LegalSection>

      <LegalSection id="oque-e" n={2} title="What Corneta is (and isn’t)">
        <p>
          Corneta is a desktop app that takes a single video signal produced by
          your OBS and pushes it to several streaming destinations at the same
          time, with monitoring, unified chat, alerts, reports and safety nets
          that all run on your own machine.
        </p>
        <ul>
          <li>
            <strong>It doesn’t replace OBS.</strong> Scenes, camera, audio and
            composition are still built there.
          </li>
          <li>
            <strong>It isn’t a cloud relay service.</strong> There’s no server
            of ours in the middle of your video: your computer is what sends it,
            using your upload.
          </li>
          <li>
            <strong>It doesn’t provide the platforms.</strong> Your account,
            your streaming rights and your standing on each service are your
            relationship with that service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="licenca" n={3} title="Software licence">
        <p>
          Corneta’s core code is distributed under the{" "}
          <strong>MIT licence</strong>, whose text ships with the repository and
          the installer, copyright <strong>{LEGAL_AUTHOR}</strong>. It lets you
          use, copy, modify, merge, publish, distribute, sublicense and sell
          copies of the software, as long as the copyright notice and the
          permission notice are kept.
        </p>
        <p>
          If these terms and the MIT licence ever disagree about the{" "}
          <em>code</em>, the MIT licence wins. These terms are about using the
          distributed app, the website and the sign-in service.
        </p>
      </LegalSection>

      <LegalSection id="terceiros" n={4} title="Third-party components">
        <p>
          The installer bundles third-party programs that Corneta runs as
          separate processes, each with its own licence — notably{" "}
          <strong>FFmpeg</strong> (a GPL build) and <strong>MediaMTX</strong>.
          The MIT licence on our code does not override those obligations.
        </p>
        <p>
          If you redistribute the installer or a modified version, meeting those
          components’ licences is on you, including publishing the notices and
          the corresponding source where required. The third-party notices ship
          with the project in the notices file.
        </p>
      </LegalSection>

      <LegalSection id="login" n={5} title="The sign-in service">
        <p>
          For you to sign in with your Kick account, the app uses a minimal
          service hosted on this domain, which completes the credential exchange
          with the platform. That service is offered free of charge, as is, with
          no commitment to availability, response time or continuity.
        </p>
        <ul>
          <li>
            It exists for normal use of the app. Automating calls in volume,
            using it as a proxy for other programs, trying to extract secrets or
            working around the usage limits is not allowed.
          </li>
          <li>
            There’s a per-IP attempt limit. Abusive use can be blocked without
            notice.
          </li>
          <li>
            We may change, suspend or discontinue that service. If that happens,
            the rest of the app keeps working with the keys you’ve already set
            up.
          </li>
        </ul>
        <p>
          How that service handles data is described in the{" "}
          <Link href={legalHref(L, "privacy")}>Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection id="responsabilidades" n={6} title="What’s on you">
        <p>By using Corneta, you commit to:</p>
        <ul>
          <li>
            <strong>Having the rights to what you stream</strong> — likeness,
            voice, music, games, brands and any third-party content that shows
            up on your stream.
          </li>
          <li>
            <strong>Not using the app for unlawful content</strong>, to violate
            someone else’s rights, or to stream from accounts that aren’t yours.
          </li>
          <li>
            <strong>Keeping your credentials safe.</strong> Keys and tokens live
            in your operating system’s credential vault; protecting access to
            your computer is part of your job.
          </li>
          <li>
            <strong>Looking after your viewers’ data.</strong> Names, messages
            and donation amounts show up on your screen and can show up on your
            stream if you use the overlay. That call is yours.
          </li>
          <li>
            <strong>Maintaining your setup.</strong> Operating system, drivers,
            OBS and connection are prerequisites on your side.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="plataformas" n={7} title="The platforms’ own rules">
        <p>
          Streaming to several services at once is allowed by some platforms and
          restricted by others, and those rules change over time — sometimes
          depending on your account type or an exclusivity contract.
        </p>
        <Callout>
          Before you start streaming everywhere, check the terms of every
          platform you plan to use. A tool making something technically possible
          doesn’t make it contractually allowed — and the consequence of
          breaking those terms lands on your account.
        </Callout>
        <p>
          Corneta does not police, interpret or guarantee that your use complies
          with third-party rules. We also have no way to restore accounts they
          suspend.
        </p>
      </LegalSection>

      <LegalSection id="experimental" n={8} title="Experimental features">
        <p>
          Some features are marked <strong>experimental</strong> in the app
          precisely because they depend on third parties or haven’t been widely
          validated yet. They can fail, change behaviour or be removed:
        </p>
        <ul>
          <li>
            <strong>TikTok, Instagram and X</strong> depend on approval and on
            the platforms’ own flows, which may not be available for your
            account.
          </li>
          <li>
            <strong>The privacy guard</strong> is a safety net that watches for
            terms you define and cuts to the “BE RIGHT BACK” screen. It is not a
            guarantee that nothing leaks, and it costs delay across your whole
            stream.
          </li>
          <li>
            <strong>Automatic safety nets</strong> like “BE RIGHT BACK” and
            auto-bitrate react to conditions they can detect; failures outside
            what they expect can still cut your stream.
          </li>
        </ul>
        <p>
          The full platform matrix is still in public validation. As of this
          version of the terms, only Twitch has a documented real stream.
        </p>
      </LegalSection>

      <LegalSection id="requisitos" n={9} title="Requirements and performance">
        <p>
          Today the installer is for <strong>Windows</strong> and the app
          depends on OBS to produce the stream. Each destination eats part of
          your upload, and re-encoding video eats CPU or GPU. The app estimates
          that arithmetic before you go live, but estimates are estimates: the
          result depends on your machine, your network and the platforms
          themselves.
        </p>
      </LegalSection>

      <LegalSection id="garantia" n={10} title="No warranty">
        <p>
          Per the MIT licence, the software is provided <strong>“as is”</strong>
          , without warranties of any kind, express or implied, including —
          without limitation — the warranties of merchantability, fitness for a
          particular purpose and non-infringement.
        </p>
        <p>
          We don’t guarantee that your stream will run without interruption,
          that the safety nets will prevent every incident, that the
          integrations will keep working after third-party changes, or that the
          reports will be free of inaccuracy.
        </p>
      </LegalSection>

      <LegalSection
        id="responsabilidade"
        n={11}
        title="Limitation of liability"
      >
        <p>
          To the maximum extent permitted by applicable law, we will not be
          liable for indirect damages, lost profits, lost audience, lost
          subscription or donation revenue, data loss, platform account
          suspensions or stream interruptions arising from the use of — or the
          inability to use — the software.
        </p>
        <Callout>
          This limitation does not waive rights the law does not allow to be
          waived. If you use Corneta as a consumer, Brazil’s Consumer Protection
          Code (Código de Defesa do Consumidor) still applies, as do the
          statutory cases of wilful misconduct and gross negligence.
        </Callout>
      </LegalSection>

      <LegalSection id="marcas" n={12} title="Trademarks and non-affiliation">
        <p>
          Twitch, YouTube, Kick, Facebook, TikTok, Instagram, X, OBS,
          Streamlabs, StreamElements and the other names mentioned here are
          trademarks of their respective owners, used only to identify
          compatibility. Corneta is{" "}
          <strong>not affiliated with, sponsored by or endorsed by</strong> any
          of those companies.
        </p>
        <p>
          The name “Corneta”, the horn symbol and the project’s visual identity
          belong to {LEGAL_OPERATOR}. The MIT licence covers the code, not the
          brand: if you distribute a modified version, don’t present it as the
          official Corneta.
        </p>
      </LegalSection>

      <LegalSection
        id="mudancas"
        n={13}
        title="Changes to the software and these terms"
      >
        <p>
          Corneta is under active development. Features can be added, changed or
          removed, and new versions can require reconfiguration steps. These
          terms may be updated to keep up; the revision date at the top marks
          the version in force, today {LEGAL_UPDATED_LABEL_EN}.
        </p>
        <p>
          Wording fixes take effect on publication. A <strong>material</strong>{" "}
          change, though — starting to charge for something free today, asking
          for a new permission on your accounts, or restricting the sign-in
          service — makes the app tell you again, with these documents at hand,
          before you carry on. Continuing to use it after that notice means you
          agree with the published version.
        </p>
      </LegalSection>

      <LegalSection id="encerramento" n={14} title="Ending it">
        <p>
          You end the relationship at any time by uninstalling the app — there’s
          no account to cancel and no subscription to stop. We may suspend
          access to the sign-in service in case of abuse, and we may discontinue
          the website or the service. The rights the MIT licence granted you
          over the versions you already have remain.
        </p>
      </LegalSection>

      <LegalSection id="lei" n={15} title="Governing law and venue">
        <p>
          These terms are governed by the laws of the Federative Republic of
          Brazil. For settling disputes, the parties elect the courts of{" "}
          {LEGAL_VENUE ? (
            <strong>{LEGAL_VENUE}</strong>
          ) : (
            <Todo locale={L}>court venue</Todo>
          )}
          , without prejudice to a consumer’s right to sue in the courts of
          their own domicile.
        </p>
      </LegalSection>

      <LegalSection id="contato" n={16} title="Contact">
        <p>
          Questions about these terms, about licensing or about brand use: talk
          to us at <Contact locale={L} />. For personal data matters, see the{" "}
          <Link href={legalHref(L, "privacy")}>Privacy Policy</Link>.
        </p>
      </LegalSection>
    </>
  );
}
