import { LegalHeader } from "./_components/legal-chrome";

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="legal">
      <a className="skip-link" href="#documento">
        Pular para o documento
      </a>
      <LegalHeader />
      <main id="documento">{children}</main>
    </div>
  );
}
