"use client";

import { useEffect } from "react";
import { captureSiteException } from "@/lib/client/telemetry";

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

  return (
    <html lang="pt-BR">
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
          <h1>Não foi possível abrir esta página.</h1>
          <p>
            A falha foi isolada. Você pode tentar carregar o conteúdo de novo.
          </p>
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
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
