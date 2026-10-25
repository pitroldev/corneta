"use client";

import { useEffect } from "react";
import { captureSiteException } from "@/lib/client/telemetry";

// This boundary replaces the root layout, so it reads the language from the URL.
const COPY = {
  "pt-BR": {
    title: "Não foi possível abrir esta página.",
    body: "A falha foi isolada. Você pode tentar carregar o conteúdo de novo.",
    retry: "Tentar novamente",
  },
  en: {
    title: "This page couldn't be opened.",
    body: "The failure was contained. You can try loading the content again.",
    retry: "Try again",
  },
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void captureSiteException(error, window.location.pathname, false);
  }, [error]);
  const locale =
    typeof window !== "undefined" &&
    /^\/en(\/|$)/.test(window.location.pathname)
      ? "en"
      : "pt-BR";
  const copy = COPY[locale];

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#100b07",
          color: "#f3ead7",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 560, padding: 32, textAlign: "center" }}>
          <p style={{ color: "#ffb323", fontWeight: 800 }}>Corneta</p>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              marginTop: 16,
              border: "2px solid #100b07",
              borderRadius: 6,
              padding: "10px 18px",
              background: "#ffb323",
              color: "#100b07",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            {copy.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
