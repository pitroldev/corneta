import Link from "next/link";
import { BrandMark } from "../../_components/brand-mark";
import { Mascot } from "../../_components/decor";
import { ArrowIcon, CheckIcon, InfoIcon } from "../../_components/icons";
import {
  LEGAL_CNPJ,
  LEGAL_CONTACT,
  LEGAL_OPERATOR,
  LEGAL_ROUTES,
  LEGAL_UPDATED_ISO,
  LEGAL_UPDATED_LABEL,
} from "@/lib/legal";

/** Valor que o dono do site precisa preencher antes de publicar. */
export function Todo({ children }: { children: string }) {
  return (
    <span className="legal-todo" data-placeholder-legal="replace-me">
      [definir: {children}]
    </span>
  );
}

/** E-mail de contato ou a pendência visível, quando ainda não há um. */
export function Contact() {
  if (!LEGAL_CONTACT) return <Todo>e-mail de contato</Todo>;
  return <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>;
}

export function LegalHeader() {
  return (
    <header className="legal-header">
      <div className="shell header-inner">
        <Link className="brand-link" href="/" aria-label="Corneta — início">
          <BrandMark />
        </Link>
        <nav className="main-nav" aria-label="Documentos">
          <Link href={LEGAL_ROUTES.privacy}>Privacidade</Link>
          <Link href={LEGAL_ROUTES.terms}>Termos de uso</Link>
        </nav>
      </div>
    </header>
  );
}

export function LegalHero({
  kicker,
  title,
  intro,
  version,
}: {
  kicker: string;
  title: string;
  intro: string;
  version: string;
}) {
  return (
    <div className="shell legal-hero">
      <span className="kicker">{kicker}</span>
      <h1>{title}</h1>
      <p>{intro}</p>
      <div className="legal-meta">
        <span>
          Última atualização:{" "}
          <time dateTime={LEGAL_UPDATED_ISO}>{LEGAL_UPDATED_LABEL}</time>
        </span>
        <span>Versão {version}</span>
        <span>Português do Brasil</span>
      </div>
    </div>
  );
}

export function LegalTldr({
  points,
  note,
}: {
  points: string[];
  note: string;
}) {
  return (
    <div className="legal-tldr">
      <span>
        <Mascot /> Em uma corneta
      </span>
      <ul>
        {points.map((point) => (
          <li key={point}>
            <CheckIcon />
            {point}
          </li>
        ))}
      </ul>
      <small>{note}</small>
    </div>
  );
}

export function LegalToc({
  sections,
}: {
  sections: { id: string; title: string }[];
}) {
  return (
    <nav className="legal-toc" aria-label="Sumário do documento">
      <strong>Neste documento</strong>
      <ol>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function LegalSection({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        <b>{String(n).padStart(2, "0")}</b>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="legal-callout">
      <InfoIcon />
      <span>{children}</span>
    </p>
  );
}

export function LegalFoot({ other }: { other: "privacy" | "terms" }) {
  return (
    <>
      <div className="legal-foot">
        <Link className="legal-back" href="/">
          <ArrowIcon /> Voltar para a Corneta
        </Link>
        <div className="legal-pair">
          {other === "terms" ? (
            <Link href={LEGAL_ROUTES.terms}>Termos de uso</Link>
          ) : (
            <Link href={LEGAL_ROUTES.privacy}>Política de privacidade</Link>
          )}
          <a
            href="https://github.com/pitroldev"
            rel="noreferrer noopener"
            target="_blank"
          >
            Código-fonte
          </a>
        </div>
      </div>
      <p className="legal-id">
        {LEGAL_OPERATOR} · CNPJ {LEGAL_CNPJ} · {LEGAL_CONTACT}
      </p>
    </>
  );
}
