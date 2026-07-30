import Link from "next/link";
import { BrandMark } from "./_components/brand-mark";
import { SoundWaves } from "./_components/decor";

export default function NotFound() {
  return (
    <main className="notfound">
      <SoundWaves className="hero-waves" />
      <div className="shell notfound-inner">
        <BrandMark />
        <span className="sticker sticker-tomate notfound-badge">Erro 404</span>
        <h1>
          <span>Essa página</span>
          <span>
            <em className="slab">saiu do ar.</em>
          </span>
        </h1>
        <p>
          A transmissão principal continua firme. Volte para o início e tente
          outro caminho.
        </p>
        <Link className="download-button" href="/">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
