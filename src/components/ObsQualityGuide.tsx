import { Check, Gauge, Route, X } from "lucide-react";
import { useStore } from "../lib/store";
import { PLATFORMS } from "../lib/platforms";
import { effectiveAction, lowestCommonDenominator } from "../lib/estimates";
import { fmtBitrate } from "../lib/utils";
import { Modal } from "./Modal";
import { Badge, Button, PlatformGlyph } from "./ui";

/** Rótulo humano do encoder (mesmo espírito da tela Qualidade). */
function encoderLabel(kind: string, label: string): string {
  if (kind === "software") return "Processador (x264)";
  return `Placa de vídeo (${label})`;
}

/**
 * Guia "qualidade certa no OBS": lê a config REAL (modo, plataformas, JÁ VOLTO/Guardião,
 * encoders da máquina) e cospe os números exatos pra colocar no OBS — em vez de conselho
 * genérico. O objetivo: nem perda de qualidade (bitrate curto onde a Corneta copia), nem
 * recodificação desperdiçada (sinal fraco onde a Corneta refaz o vídeo).
 */
export function ObsQualityGuide({ onClose }: { onClose: () => void }) {
  const config = useStore((s) => s.config)!;
  const encoders = useStore((s) => s.encoders);

  const enabled = config.targets.filter((t) => t.enabled);
  const guardArmed =
    config.settings.guardianEnabled &&
    config.settings.guardianWatchlist.some((t) => t.trim().length >= 3);
  // Com o compositor no ar (JÁ VOLTO/Guardião), TUDO passa por uma recodificação da
  // Corneta — o OBS vira um sinal de contribuição local (não gasta internet).
  const compositorOn = config.settings.brbEnabled || guardArmed;

  const copies = compositorOn ? [] : enabled.filter((t) => effectiveAction(config.mode, t) === "copy");
  const transcodes = enabled.filter((t) => !copies.includes(t));

  const fps = Math.min(
    60,
    Math.max(30, ...enabled.map((t) => t.encoding.preset?.fps ?? 30)),
  );

  // Resolução recomendada = a MAIOR saída que alguma plataforma realmente usa — mandar
  // 1080p com tudo em 720p é peso puro no PC sem ganho nenhum (e com o compositor no ar
  // dobra, porque ele reencoda a live inteira). Plataforma vertical (recorte 9:16) precisa
  // da fonte cheia em 1080p. O guardião fica sempre em 1080p (o OCR lê melhor no detalhe).
  // Espelha engine.rs::program_resolution — o número aqui é o MESMO que o motor roda.
  const needsFullHd =
    guardArmed ||
    enabled.length === 0 ||
    enabled.some((t) => {
      const p = t.encoding.preset ?? PLATFORMS[t.platformId].recommended;
      return p.height > p.width || Math.min(p.width, p.height) > 720;
    });
  const srcRes = needsFullHd ? "1920×1080" : "1280×720";

  // Bitrate recomendado pro OBS:
  // - com cópia: o teto é a plataforma mais apertada (menor denominador) — acima disso
  //   a live trava/cai NELA, porque o vídeo vai como saiu do OBS;
  // - só recodificação: o OBS manda pro localhost — capricha (fonte melhor = saída melhor;
  //   bitrate alto quase não pesa no encoder — quem pesa é resolução/fps).
  const lcd = lowestCommonDenominator(config);
  const hasCopy = copies.length > 0 && lcd.videoKbps != null;
  const contribKbps = needsFullHd ? (fps >= 60 ? 12000 : 10000) : fps >= 60 ? 8000 : 6500;
  const obsKbps = hasCopy ? lcd.videoKbps! : contribKbps;

  const hw = encoders.find((e) => e.available && e.kind !== "software");
  const encAdvice = hw
    ? encoderLabel(hw.kind, hw.label)
    : "Processador (x264) — preset veryfast; é o que essa máquina tem";

  return (
    <Modal
      title="Qualidade certa no OBS"
      onClose={onClose}
      className="max-w-lg rounded-xl bg-surface p-5 pop"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 id="obs-guide-title" className="flex items-center gap-2 text-xl">
          <Gauge className="size-5 text-brass" /> Qualidade certa no OBS
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
          <X className="size-4" />
        </Button>
      </div>

      {/* 1. O caminho do vídeo — com a config REAL do usuário */}
      <div className="rounded-md bg-surface-2 p-3">
        <div className="mb-1.5 flex items-center gap-2 text-sm font-bold">
          <Route className="size-4 text-brass" /> O caminho do seu vídeo hoje
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          O OBS encoda seu vídeo <strong className="text-ink">uma vez</strong> e me entrega.
          Daí:
        </p>
        <div className="mt-2 flex flex-col gap-1.5 text-xs">
          {compositorOn ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="brass">recodifico tudo</Badge>
              <span className="text-ink-muted">
                {config.settings.brbEnabled ? "JÁ VOLTO" : "Guardião"} ligado — o vídeo passa por
                mim antes das plataformas. O OBS manda só pra cá (local,{" "}
                <strong className="text-ink">não gasta sua internet</strong>), então capricha no
                sinal.
              </span>
            </div>
          ) : (
            <>
              {copies.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">em cópia</Badge>
                  {copies.map((t) => (
                    <span key={t.id} className="flex items-center gap-1 text-ink-muted">
                      <PlatformGlyph id={t.platformId} size={14} /> {t.name}
                    </span>
                  ))}
                  <span className="text-ink-faint">
                    — recebem <strong className="text-ink-muted">exatamente</strong> o que sai do
                    OBS
                  </span>
                </div>
              )}
              {transcodes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="brass">eu refaço</Badge>
                  {transcodes.map((t) => (
                    <span key={t.id} className="flex items-center gap-1 text-ink-muted">
                      <PlatformGlyph id={t.platformId} size={14} /> {t.name}
                    </span>
                  ))}
                  <span className="text-ink-faint">— recodifico sob medida a partir do OBS</span>
                </div>
              )}
              {enabled.length === 0 && (
                <span className="text-ink-faint">
                  (nenhuma plataforma ativa ainda — os números abaixo assumem 1080p)
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* 2. Os números — prontos pra copiar no OBS */}
      <div className="mt-3">
        <div className="mb-1.5 text-sm font-bold">
          Configure assim: OBS → Configurações → <strong className="text-brass">Saída</strong>
        </div>
        <div className="divide-y divide-border-soft rounded-md bg-surface-2 px-3 text-sm">
          <GuideRow k="Encoder" v={encAdvice} />
          <GuideRow k="Controle de taxa" v="CBR" />
          <GuideRow
            k="Taxa de bits"
            v={fmtBitrate(obsKbps)}
            note={
              hasCopy
                ? `teto do ${lcd.capBy} (a plataforma mais apertada em cópia) — acima disso a live trava lá`
                : "vai só pro seu PC — quanto melhor o sinal, melhor a minha recodificação"
            }
          />
          <GuideRow k="Intervalo de quadro-chave" v="2 s" />
          <GuideRow
            k="Vídeo (aba Vídeo)"
            v={`${srcRes} · ${fps} FPS`}
            note={
              needsFullHd
                ? "mesma resolução da tela de saída — redimensionar duas vezes borra a imagem"
                : "suas plataformas saem em 720p — mandar mais que isso só pesa no PC, sem ganho"
            }
          />
        </div>
        {/* Válvula de escape pra PC fraco: x264 em 1080p60 pena — fps custa quase linear. */}
        {!hw && (needsFullHd || fps >= 60) && (
          <p className="mt-2 text-[11px] font-semibold leading-relaxed text-warn">
            Sem placa de vídeo, o x264 pode penar em{" "}
            {needsFullHd ? "1080p" : "720p"}
            {fps >= 60 ? "60" : "30"}: se a live engasgar ou o jogo travar,{" "}
            {fps >= 60 ? "baixe o FPS pra 30 (aba Vídeo) — pesa quase metade" : "baixe a saída pra 720p (aba Vídeo)"}{" "}
            e, fora jogo muito rápido, ninguém nota.
          </p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          No modo <strong className="text-ink-muted">Simples</strong> do OBS, só bitrate e encoder
          aparecem — já resolve. Esses ajustes são na mão mesmo: o obs-websocket não me deixa
          mexer neles por você (o “Configura pra mim” cuida do servidor e da chave).
        </p>
      </div>

      {/* 3. O porquê, em 3 linhas */}
      <div className="mt-3 flex flex-col gap-1.5 text-xs text-ink-muted">
        <p className="flex gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0 text-ok" strokeWidth={2.8} />
          <span>
            <strong className="text-ink">Uma recodificação só.</strong> O OBS encoda; onde dá, eu
            copio sem mexer. Recodificar de novo sem necessidade = perder qualidade de graça.
          </span>
        </p>
        <p className="flex gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0 text-ok" strokeWidth={2.8} />
          <span>
            <strong className="text-ink">CBR + quadro-chave 2 s</strong> é exigência das
            plataformas — fora disso a live buferiza pros espectadores.
          </span>
        </p>
        <p className="flex gap-2">
          <Check className="mt-0.5 size-3.5 shrink-0 text-ok" strokeWidth={2.8} />
          <span>
            <strong className="text-ink">Mudou as plataformas ou ligou o JÁ VOLTO?</strong> Volta
            aqui — os números acima acompanham a sua config.
          </span>
        </p>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          Fechei o OBS certinho <Check className="size-4" strokeWidth={2.6} />
        </Button>
      </div>
    </Modal>
  );
}

function GuideRow({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 py-2">
      <span className="w-44 shrink-0 text-xs font-semibold text-ink-faint">{k}</span>
      <span className="font-display font-bold">{v}</span>
      {note && <span className="min-w-0 flex-1 text-[11px] text-ink-faint">— {note}</span>}
    </div>
  );
}
