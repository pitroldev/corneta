import { LegalHeader } from "./_components/legal-chrome";

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // As páginas legais vivem no PAPEL, ao contrário do resto do site: são
    // texto longo, e ler parágrafo comprido em tinta clara sobre breu cansa.
    <div className="min-h-screen bg-paper-raised bg-[image:var(--halftone-light)] bg-[length:20px_20px] text-ink">
      <a
        className="fixed top-3 left-3 z-100 -translate-y-[180%] rounded-md bg-brass px-[18px] py-[13px] font-display text-[0.88rem] font-extrabold text-brass-ink shadow-pop-brass transition-transform duration-140 focus:translate-y-0"
        href="#documento"
      >
        Pular para o documento
      </a>
      <LegalHeader />
      <main id="documento">{children}</main>
    </div>
  );
}
