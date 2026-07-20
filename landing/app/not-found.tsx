import Link from "next/link";
import { BrandMark } from "./_components/brand-mark";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-6 text-center text-cream">
      <div>
        <BrandMark className="justify-center" />
        <p className="mt-12 text-xs font-extrabold tracking-[.2em] text-tomato">
          ERRO 404
        </p>
        <h1 className="mt-3 font-display text-6xl leading-[.85] md:text-8xl">
          ESSA PÁGINA SAIU DO AR.
        </h1>
        <p className="mx-auto mt-6 max-w-md text-cream/60">
          A transmissão principal continua firme. Volte para a central e tente
          outro caminho.
        </p>
        <Link className="button mt-9" href="/">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
