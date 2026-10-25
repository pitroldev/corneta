"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";

const COPY = {
  "pt-BR": {
    kicker: "Faça a conta",
    title: "Quanto a sua live vai pedir?",
    hint: "Use o bitrate de vídeo + áudio de cada saída local.",
    input: (platform: string) =>
      `Bitrate da ${platform} em megabits por segundo`,
    total: "Bitrate somado",
    upload: "Upload estável recomendado",
    range: (low: string, high: string) => `${low} a ${high} Mb/s`,
    note: "Essa faixa usa a margem de 1,5× a 2× indicada pelo YouTube para multistream. Teste com áudio, câmera e movimento reais antes da live.",
  },
  en: {
    kicker: "Do the math",
    title: "How much will your stream need?",
    hint: "Use the video + audio bitrate of each local output.",
    input: (platform: string) => `${platform} bitrate in megabits per second`,
    total: "Combined bitrate",
    upload: "Recommended stable upload",
    range: (low: string, high: string) => `${low} to ${high} Mb/s`,
    note: "This range uses the 1.5× to 2× margin YouTube recommends for multistreaming. Test with real audio, camera and motion before going live.",
  },
} as const;

const DESTINATIONS = [
  { id: "twitch", label: "Twitch", initial: 6 },
  { id: "youtube", label: "YouTube", initial: 4 },
  { id: "kick", label: "Kick", initial: 0 },
] as const;

function safeBitrate(value: string) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

function formatMbps(locale: Locale, value: number) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value);
}

export function UploadCalculator({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const [bitrates, setBitrates] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      DESTINATIONS.map((destination) => [destination.id, destination.initial]),
    ),
  );
  const total = DESTINATIONS.reduce(
    (sum, destination) => sum + (bitrates[destination.id] ?? 0),
    0,
  );

  return (
    <section
      className="editorial-upload-calculator"
      aria-labelledby="upload-calculator-title"
    >
      <div className="editorial-upload-calculator__heading">
        <p>{copy.kicker}</p>
        <h2 id="upload-calculator-title">{copy.title}</h2>
        <span>{copy.hint}</span>
      </div>

      <div className="editorial-upload-calculator__fields">
        {DESTINATIONS.map((destination) => (
          <label key={destination.id} data-platform={destination.id}>
            <span>{destination.label}</span>
            <span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                inputMode="decimal"
                value={bitrates[destination.id]}
                onChange={(event) =>
                  setBitrates((current) => ({
                    ...current,
                    [destination.id]: safeBitrate(event.target.value),
                  }))
                }
                aria-label={copy.input(destination.label)}
              />
              <b>Mb/s</b>
            </span>
          </label>
        ))}
      </div>

      <div className="editorial-upload-calculator__result" aria-live="polite">
        <div>
          <span>{copy.total}</span>
          <strong>{formatMbps(locale, total)} Mb/s</strong>
        </div>
        <div>
          <span>{copy.upload}</span>
          <strong>
            {copy.range(
              formatMbps(locale, total * 1.5),
              formatMbps(locale, total * 2),
            )}
          </strong>
        </div>
      </div>

      <p className="editorial-upload-calculator__note">{copy.note}</p>
    </section>
  );
}
