"use client";

import { useState } from "react";

const DESTINATIONS = [
  { id: "twitch", label: "Twitch", initial: 6 },
  { id: "youtube", label: "YouTube", initial: 4 },
  { id: "kick", label: "Kick", initial: 0 },
] as const;

function safeBitrate(value: string) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

function formatMbps(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(value);
}

export function UploadCalculator() {
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
        <p>Faça a conta</p>
        <h2 id="upload-calculator-title">Quanto a sua live vai pedir?</h2>
        <span>Use o bitrate de vídeo + áudio de cada saída local.</span>
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
                aria-label={`Bitrate da ${destination.label} em megabits por segundo`}
              />
              <b>Mb/s</b>
            </span>
          </label>
        ))}
      </div>

      <div className="editorial-upload-calculator__result" aria-live="polite">
        <div>
          <span>Bitrate somado</span>
          <strong>{formatMbps(total)} Mb/s</strong>
        </div>
        <div>
          <span>Upload estável recomendado</span>
          <strong>
            {formatMbps(total * 1.5)} a {formatMbps(total * 2)} Mb/s
          </strong>
        </div>
      </div>

      <p className="editorial-upload-calculator__note">
        Essa faixa usa a margem de 1,5× a 2× indicada pelo YouTube para
        multistream. Teste com áudio, câmera e movimento reais antes da live.
      </p>
    </section>
  );
}
