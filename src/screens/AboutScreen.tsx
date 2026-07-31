import { useEffect, useState } from "react";
import { ArrowUpRight, Globe, Heart, RefreshCw } from "lucide-react";
import { siGithub } from "simple-icons";
import { IS_TAURI } from "../lib/api";
import { useStore } from "../lib/store";

// LinkedIn não está no simple-icons (removido por política de marca) — path oficial embutido.
const LINKEDIN_PATH =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z";
import { openExternal, readableOn } from "../lib/utils";
import { LEGAL_URLS } from "../lib/legal";
import { LegalLink } from "../components/legal";
import { Mascot, SoundWaves } from "../components/decor";
import { SectionTitle } from "../components/ui";
import { CheckUpdateButton } from "../components/UpdateBanner";

function useAppVersion(): string {
  const [version, setVersion] = useState(__APP_VERSION__);
  useEffect(() => {
    if (!IS_TAURI) return;
    void import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => {
        /* fica na versão do build */
      });
  }, []);
  return version;
}

async function openUrl(url: string) {
  await openExternal(url);
}

interface LinkDef {
  label: string;
  sub: string;
  url: string;
  brand: string;
  path?: string; // simple-icon path
}

const LINKS: LinkDef[] = [
  {
    label: "GitHub",
    sub: "@pitroldev",
    url: "https://github.com/pitroldev",
    brand: "#ffffff",
    path: siGithub.path,
  },
  {
    label: "LinkedIn",
    sub: "Petro Cardoso",
    url: "https://www.linkedin.com/in/petrocardoso/",
    brand: "#0a66c2",
    path: LINKEDIN_PATH,
  },
];

export function AboutScreen() {
  const replayTour = useStore((s) => s.replayTour);
  const appVersion = useAppVersion();
  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle kicker="Quem soprou essa corneta" title="Sobre" />

      {/* Hero */}
      <div className="relative mb-4 overflow-hidden rounded-xl bg-brass p-6 text-brass-ink pop-brass">
        <SoundWaves className="pointer-events-none absolute -right-10 -top-8 size-52 text-brass-ink/10" />
        <div className="relative flex items-start gap-4">
          <div className="grid size-16 shrink-0 rotate-[-4deg] place-items-center rounded-lg bg-brass-ink text-brass pop">
            <Mascot className="size-9" />
          </div>
          <div>
            <h3 className="text-3xl">Oi, sou o Petro</h3>
            <p className="mt-2 max-w-md text-sm font-semibold leading-relaxed opacity-90">
              Fiz a Corneta pra matar um perrengue meu: um stream do OBS vira
              live na Twitch, YouTube, Kick e cia. de uma vez só — grátis.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={() => openUrl("https://www.corneta.live")}
        className="group mb-2 flex w-full items-center gap-4 rounded-xl bg-surface p-5 pop transition-transform hover:translate-x-1 hover:-translate-y-1"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-brass text-brass-ink">
          <Mascot className="size-7" />
        </span>
        <span className="flex-1 text-left">
          <span className="block font-display text-xl font-extrabold">
            corneta.live
          </span>
          <span className="block text-sm text-ink-muted">
            Site oficial, dúvidas e download.
          </span>
        </span>
        <ArrowUpRight
          className="size-6 text-ink-faint transition-colors group-hover:text-brass"
          strokeWidth={2.4}
        />
      </button>

      {/* CTA do autor */}
      <button
        onClick={() => openUrl("https://pitrol.dev")}
        className="group mb-4 flex w-full items-center gap-4 rounded-xl bg-surface p-5 pop transition-transform hover:translate-x-1 hover:-translate-y-1"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-3">
          <BlogIcon />
        </span>
        <span className="flex-1 text-left">
          <span className="block font-display text-xl font-extrabold">
            pitrol.dev
          </span>
          <span className="block text-sm text-ink-muted">
            Meu blog e meus projetos.
          </span>
        </span>
        <ArrowUpRight
          className="size-6 text-ink-faint transition-colors group-hover:text-brass"
          strokeWidth={2.4}
        />
      </button>

      {/* Redes */}
      <div className="grid grid-cols-2 gap-2">
        {LINKS.map((l) => (
          <button
            key={l.label}
            onClick={() => openUrl(l.url)}
            className="flex items-center gap-3 rounded-lg bg-surface-2 p-3 text-left transition hover:translate-x-0.5 hover:-translate-y-0.5 hover:bg-surface-3"
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-md"
              style={{ backgroundColor: l.brand }}
            >
              {l.path && (
                <svg
                  viewBox="0 0 24 24"
                  width={18}
                  height={18}
                  fill={readableOn(l.brand)}
                  aria-hidden
                >
                  <path d={l.path} />
                </svg>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display font-bold">
                {l.label}
              </span>
              <span className="block truncate text-[11px] text-ink-faint">
                {l.sub}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Rever o tour */}
      <button
        onClick={replayTour}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-border bg-surface-2 px-4 py-3 text-sm font-semibold text-ink-muted transition-colors hover:border-brass hover:text-ink"
      >
        <RefreshCw className="size-4" /> Rever o tour de boas-vindas
      </button>

      {/* Rodapé */}
      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-sm text-ink-faint">
        Corneta é grátis e de código aberto. Feita com{" "}
        <Heart className="size-4 text-tomate" fill="currentColor" aria-hidden />{" "}
        e código.
      </p>
      {/* Os documentos precisam ser alcançáveis por quem só tem o app e nunca
          visitou o site — é o "livre acesso" do art. 6º, IV da LGPD. */}
      <p className="mt-3 flex items-center justify-center gap-2 text-[11px] text-ink-faint">
        <LegalLink href={LEGAL_URLS.terms}>Termos de Uso</LegalLink>
        <span aria-hidden>·</span>
        <LegalLink href={LEGAL_URLS.privacy}>Política de Privacidade</LegalLink>
      </p>

      <p className="mt-3 flex items-center justify-center gap-3 text-[11px] font-semibold text-ink-faint">
        <span>Corneta v{appVersion} · multi-stream</span>
        <span aria-hidden>·</span>
        <CheckUpdateButton version={appVersion} />
      </p>
    </div>
  );
}

/** Ícone local: evita que a tela Sobre faça uma requisição externa só para buscar favicon. */
function BlogIcon() {
  return <Globe className="size-6 text-tomate" strokeWidth={2.3} aria-hidden />;
}
