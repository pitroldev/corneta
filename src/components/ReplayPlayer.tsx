// ============================================================
// Player do replay: o vídeo da live tocando COM o relatório correndo junto.
// Ver docs/FEATURE-GRAVACAO-E-REPLAY.md §4.
//
// A ideia inteira cabe numa frase: existe UM cursor, em epoch ms, e tudo se pendura nele.
// O vídeo tocando move o cursor; clicar num evento, numa janela problemática ou no gráfico
// move o cursor; o chat mostra o que tinha sido dito até o cursor. Nenhuma das pontas sabe
// da outra — todas falam com o mesmo número.
//
// A matemática de epoch ↔ tempo de vídeo NÃO mora aqui: está em lib/replay.ts, que é núcleo
// puro e testado. Aqui é só o pedaço que precisa de DOM.
// ============================================================
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Download,
  Flag,
  FolderOpen,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { toast } from "../lib/toast";
import { cn, errMsg } from "../lib/utils";
import {
  buildReplayIndex,
  epochAtGlobal,
  globalAtEpoch,
  hasEstimatedAnchor,
  hasUnplayableCodec,
  isPlayableCodec,
  pointAtGlobal,
  type ReplayIndex,
} from "../lib/replay";
import type {
  ReplayChatGap,
  ReplayChatMessage,
  SessionData,
  SessionMarker,
} from "../lib/types";
import { ReplayChatPanel } from "./ReplayChatPanel";
import { Select } from "./Select";
import { Button } from "./ui";

/** Pedido de salto vindo de FORA (um clique num evento do relatório). O `nonce` existe
 *  porque clicar duas vezes no MESMO evento tem que saltar as duas vezes — comparar só o
 *  instante faria o segundo clique não fazer nada. */
export interface SeekRequest {
  epoch: number;
  nonce: number;
}

/** Marca na régua do tempo (evento, janela problemática, destaque). */
export interface ReplayTick {
  t: number;
  color: string;
  label: string;
}

const PLAY_RATES = [0.5, 1, 1.5, 2] as const;

export function ReplayPlayer({
  data,
  sessionId,
  chat,
  gaps,
  ticks,
  seek,
  onPlayhead,
  onMarkerAdded,
  onRecordingsDeleted,
}: {
  data: SessionData;
  sessionId: string;
  chat: ReplayChatMessage[];
  gaps: ReplayChatGap[];
  ticks: ReplayTick[];
  seek: SeekRequest | null;
  onPlayhead: (epoch: number | null) => void;
  onMarkerAdded: (marker: SessionMarker) => void;
  onRecordingsDeleted: () => void;
}) {
  const { t, fmt } = useI18n();
  const rateOptions = useMemo(
    () =>
      PLAY_RATES.map((playRate) => ({
        value: String(playRate),
        label: `${fmt.dec(playRate, playRate % 1 === 0 ? 0 : 1)}×`,
      })),
    [fmt],
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  /** Vídeo + régua juntos — é este bloco que vai pra tela cheia. */
  const stageRef = useRef<HTMLDivElement>(null);

  const idx: ReplayIndex = useMemo(
    () =>
      buildReplayIndex(
        data.recordings.map((r) => ({
          seg: r.seg,
          t: r.t,
          path: r.path,
          codec: r.codec,
          estimated: r.estimated,
          syncs: r.syncs,
          endT: r.endT,
        })),
        data.clockJumps,
        data.offsetMs,
      ),
    [data.clockJumps, data.offsetMs, data.recordings],
  );

  const [globalMs, setGlobalMs] = useState(0);
  const [segIndex, setSegIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(1);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(data.offsetMs);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [clipFrom, setClipFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Apagar é irreversível e são dezenas de GB — dois toques, como o resto do app.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  // O ajuste de sincronia é ferramenta de conserto, não de uso diário: fica guardado e
  // abre sozinho quando a âncora foi estimada, que é exatamente quando ele é necessário.
  const [showOffset, setShowOffset] = useState(false);
  const [previewOk, setPreviewOk] = useState(false);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);

  // O offset entra no índice sem reparsear a sessão: arrastar o ajuste tem que responder
  // na hora, senão o streamer não consegue calibrar olhando.
  const tuned = useMemo(() => ({ ...idx, offsetMs: offset }), [idx, offset]);

  const segment = tuned.segments[segIndex];
  const src = segment ? urls[segment.path] : undefined;
  const codecUnsupported = segment ? !isPlayableCodec(segment.codec) : false;
  const mediaState: "loading" | "ready" | "missing" | "unsupported" =
    codecUnsupported
      ? "unsupported"
      : !segment || src === undefined
        ? "loading"
        : src === "" || failedPath === segment.path
          ? "missing"
          : loadedPath === segment.path
            ? "ready"
            : "loading";
  const canControl = mediaState === "ready";
  const truncated = data.recordings.some(
    (r) => r.reason && r.reason !== "stopped",
  );

  // Cada arquivo é liberado no escopo do asset UM a UM, na hora em que vai tocar — não a
  // pasta inteira do streamer. Ver §5 do doc.
  useEffect(() => {
    // `in`, e NÃO `urls[path]` truthy. O caminho de falha guarda "" pra marcar "já tentei
    // e não deu" — com o teste de verdade, esse "" seria falsy, o efeito tentaria de novo,
    // guardaria "" de novo, e o arquivo apagado na mão viraria um laço infinito de
    // chamadas ao backend em vez de um aviso.
    if (!segment || codecUnsupported || segment.path in urls) return;
    let alive = true;
    void api
      .recordVideoUrl(segment.path)
      .then((u) => {
        if (alive) setUrls((prev) => ({ ...prev, [segment.path]: u }));
      })
      .catch(() => {
        // Arquivo apagado na mão: vira aviso, não erro vermelho.
        if (alive) setUrls((prev) => ({ ...prev, [segment.path]: "" }));
      });
    return () => {
      alive = false;
    };
  }, [codecUnsupported, segment, urls]);

  const emitPlayhead = useCallback(
    (g: number) => {
      onPlayhead(epochAtGlobal(tuned, g));
    },
    [onPlayhead, tuned],
  );

  /** Único caminho de salto. Tudo (teclado, clique na régua, evento do relatório,
   *  fim de segmento) passa por aqui, e por isso não há dois jeitos de a posição
   *  ficar dessincronizada do vídeo. */
  const seekGlobal = useCallback(
    (g: number, keepPlaying = playing) => {
      const clamped = Math.max(0, Math.min(tuned.totalMs, g));
      const p = pointAtGlobal(tuned, clamped);
      if (!p) return;
      setGlobalMs(clamped);
      emitPlayhead(clamped);
      const v = videoRef.current;
      // Só dá pra mexer no `currentTime` DEPOIS que os metadados carregaram; antes disso
      // a atribuição é engolida em silêncio. Isso acontece de verdade no primeiro clique
      // de um relatório recém-aberto (arquivo grande, disco lento) — e o sintoma seria o
      // pior: o clique "não faz nada" e o streamer conclui que o replay está quebrado.
      if (p.index !== segIndex || !v || v.readyState < 1) {
        if (p.index !== segIndex) setSegIndex(p.index);
        pendingSeek.current = { sec: p.localSec, play: keepPlaying };
      } else {
        v.currentTime = p.localSec;
      }
    },
    [emitPlayhead, playing, segIndex, tuned],
  );

  const pendingSeek = useRef<{ sec: number; play: boolean } | null>(null);

  // Salto pedido de fora (clique num evento/janela/destaque do relatório).
  useEffect(() => {
    if (!seek) return;
    const g = globalAtEpoch(tuned, seek.epoch);
    if (g == null) {
      toast.info(t("replay.seek.notRecorded"));
      return;
    }
    seekGlobal(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek?.nonce]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 1) return;
    if (v.paused) void v.play().catch(() => setPlaying(false));
    else v.pause();
  }, []);

  // Teclado. Os atalhos só ficam ativos quando o palco do replay tem foco: a barra de
  // espaço continua acionando normalmente qualquer botão do relatório.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !stageRef.current?.contains(el) || !canControl) return;
      if (
        el.closest(
          "button, a, input, textarea, select, [contenteditable='true'], [role='button'], [role='slider']",
        )
      )
        return;
      const step = e.shiftKey ? 60_000 : 10_000;
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekGlobal(globalMs - step);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekGlobal(globalMs + step);
          break;
        case ",":
          e.preventDefault();
          seekGlobal(globalMs - 1000 / 30);
          break;
        case ".":
          e.preventDefault();
          seekGlobal(globalMs + 1000 / 30);
          break;
        default:
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canControl, globalMs, seekGlobal, togglePlay]);

  const applyVolume = (v: number) => {
    setVolume(v);
    setMuted(v === 0);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  };

  /** Tela cheia no CONTÊINER, não no `<video>`: em tela cheia do elemento o Chromium
   *  desenha os controles nativos dele por cima, e a régua sincronizada — que é a razão
   *  de este player existir — sumiria justo na hora de olhar de perto. */
  const toggleFullscreen = () => {
    const box = stageRef.current;
    if (!box) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.requestFullscreen().catch(() => {});
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !tuned.segments.length) return;
    const g = tuned.starts[segIndex] + v.currentTime * 1000;
    setGlobalMs(g);
    emitPlayhead(g);
  };

  /** Fim de um arquivo não é fim do replay: emenda no próximo segmento. Uma sessão tem N
   *  arquivos porque o gravador pode ter morrido e retomado no meio da live. */
  const onEnded = () => {
    if (segIndex + 1 < tuned.segments.length) {
      setSegIndex(segIndex + 1);
      pendingSeek.current = { sec: 0, play: true };
    } else {
      setPlaying(false);
    }
  };

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !segment) return;
    setLoadedPath(segment.path);
    setFailedPath(null);
    // Trocar o `src` zera velocidade e volume do elemento. Sem reaplicar, emendar no
    // segmento seguinte devolvia o vídeo pra 1× e volume cheio no meio da revisão.
    v.playbackRate = rate;
    v.volume = volume;
    v.muted = muted;
    const want = pendingSeek.current;
    if (!want) return;
    pendingSeek.current = null;
    v.currentTime = want.sec;
    if (want.play) void v.play().catch(() => setPlaying(false));
  };

  const applyOffset = async (ms: number) => {
    const clamped = Math.max(-30_000, Math.min(30_000, ms));
    setOffset(clamped);
    try {
      await api.setSessionOffset(sessionId, clamped);
    } catch {
      // Ajuste é conforto: falhar em persistir não tira o replay do ar.
    }
  };

  const addMarker = async () => {
    const epoch = epochAtGlobal(tuned, globalMs);
    if (epoch == null) return;
    const marker: SessionMarker = {
      t: Math.round(epoch),
      label: t("replay.marker.default"),
    };
    try {
      await api.addSessionMarker(sessionId, marker.t, marker.label);
      toast.success(t("replay.marker.added"));
      onMarkerAdded(marker);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  /** Exporta o trecho entre a marca e o cursor. Corta com cópia de bitstream — é rápido e
   *  não recodifica, então o clipe sai com a qualidade que foi ao ar. */
  const exportClip = async () => {
    if (clipFrom == null) {
      setClipFrom(globalMs);
      return;
    }
    const a = Math.min(clipFrom, globalMs);
    const b = Math.max(clipFrom, globalMs);
    if (b - a < 500) {
      setClipFrom(null);
      return;
    }
    const pa = pointAtGlobal(tuned, a);
    const pb = pointAtGlobal(tuned, b);
    if (!pa || !pb || pa.index !== pb.index) {
      // Trecho que atravessa a emenda de dois arquivos exigiria concat; não vale a
      // complexidade pra um caso que só acontece quando o gravador morreu no meio.
      toast.error(t("replay.clip.crossSegment"));
      setClipFrom(null);
      return;
    }
    setBusy(true);
    try {
      const out = await api.exportClip(
        tuned.segments[pa.index].path,
        Math.round(pa.localSec * 1000),
        Math.round(pb.localSec * 1000),
      );
      if (out) toast.success(t("replay.clip.saved"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
      setClipFrom(null);
    }
  };

  const removeRecordings = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    setConfirmDelete(false);
    setBusy(true);
    try {
      await api.deleteSessionRecordings(sessionId);
      toast.info(t("replay.delete.done"));
      onRecordingsDeleted();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // Mensagens até o cursor. `deleted` sai por padrão: o replay respeita a moderação.
  const cursorEpoch = epochAtGlobal(tuned, globalMs);
  const visibleChat = useMemo(() => {
    if (cursorEpoch == null || !chat.length) return [];
    // BUSCA BINÁRIA, não `filter`. O array já vem ordenado por tempo, e isto roda a cada
    // `timeupdate` (~4×/s): varrer 40 mil mensagens nessa cadência travaria a tela
    // exatamente durante o replay, que é a hora em que ela precisa estar lisa.
    let lo = 0;
    let hi = chat.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (chat[mid].t <= cursorEpoch) lo = mid + 1;
      else hi = mid;
    }
    // Só a cauda: renderizar a live inteira a cada quadro seria o mesmo problema de novo.
    const tail = chat.slice(Math.max(0, lo - 300), lo);
    return (showDeleted ? tail : tail.filter((m) => !m.deleted)).slice(-120);
  }, [chat, cursorEpoch, showDeleted]);

  const gapBefore = useMemo(() => {
    if (cursorEpoch == null) return null;
    return gaps.find((g) => Math.abs(g.t - cursorEpoch) < 15_000) ?? null;
  }, [gaps, cursorEpoch]);

  if (!tuned.segments.length) return null;

  const pct = tuned.totalMs > 0 ? (globalMs / tuned.totalMs) * 100 : 0;
  const tickAt = (epoch: number): number | null => {
    const g = globalAtEpoch(tuned, epoch);
    return g == null || tuned.totalMs <= 0 ? null : (g / tuned.totalMs) * 100;
  };

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const trackPadding = 16;
    const trackWidth = Math.max(1, rect.width - trackPadding * 2);
    const k = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left - trackPadding) / trackWidth),
    );
    seekGlobal(k * tuned.totalMs);
  };

  const onScrubHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const trackPadding = 16;
    const trackWidth = Math.max(1, rect.width - trackPadding * 2);
    const k = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left - trackPadding) / trackWidth),
    );
    const g = k * tuned.totalMs;
    setHoverMs(g);
    // Miniatura de verdade, sem FFmpeg: um segundo <video> escondido buscando o
    // instante sob o mouse. Sai de graça e mostra o quadro real.
    const p = pointAtGlobal(tuned, g);
    const v = previewRef.current;
    // Só busca dentro do segmento que já está carregado. Passando o mouse por cima de
    // OUTRO segmento, a miniatura mostraria o quadro do arquivo errado — pior que não
    // mostrar nada, porque parece informação.
    setPreviewOk(!!p && p.index === segIndex);
    if (p && v && p.index === segIndex) v.currentTime = p.localSec;
  };

  return (
    <>
      {/* O título mora AQUI dentro, e não na tela que chama, porque quem decide se há
          replay é este componente: com todos os segmentos vazios (o FFmpeg morreu antes
          do primeiro quadro) ele devolve null, e um título sozinho na tela anunciaria
          um player que não existe. */}
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-faint">
        <Play className="size-4" /> {t("replay.title")}
      </h3>
      <div className="mb-4 overflow-hidden bg-night">
        <div
          className={cn(
            "grid min-h-0 gap-px bg-border-soft",
            chat.length > 0 &&
              "xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start",
          )}
        >
          <div className="min-w-0 bg-night">
            {/* Tela cheia usa o palco inteiro. O teto normal de altura não pode deixar a
                imagem pequena no meio do preto quando o usuário expande o replay. */}
            <div
              ref={stageRef}
              className="bg-night outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass [&:fullscreen]:flex [&:fullscreen]:h-screen [&:fullscreen]:flex-col [&:fullscreen]:justify-center [&:fullscreen]:bg-night [&:fullscreen]:p-4 [&:fullscreen_video]:max-h-[calc(100vh-9rem)]"
            >
              {mediaState === "missing" ? (
                <Note tone="warn">{t("replay.missing")}</Note>
              ) : mediaState === "unsupported" ? (
                <Note tone="bad">{t("replay.warn.codec")}</Note>
              ) : (
                <div className="relative flex min-h-48 items-center justify-center overflow-hidden bg-black xl:min-h-72">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    ref={videoRef}
                    src={src}
                    tabIndex={0}
                    aria-label={t("replay.stage.aria")}
                    className="aspect-video max-h-[58vh] w-full object-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass"
                    onTimeUpdate={onTimeUpdate}
                    onEnded={onEnded}
                    onLoadedMetadata={onLoadedMetadata}
                    onError={() => {
                      if (segment) setFailedPath(segment.path);
                    }}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onClick={togglePlay}
                    preload="metadata"
                  />
                  {mediaState === "loading" && (
                    <div
                      className="absolute inset-0 grid min-h-40 place-items-center bg-night/85 text-sm font-semibold text-ink-muted"
                      role="status"
                    >
                      <span className="flex items-center gap-2">
                        <LoaderCircle
                          className="size-4 animate-spin text-brass"
                          aria-hidden
                        />
                        {t("replay.loading")}
                      </span>
                    </div>
                  )}
                  {hoverMs != null && previewOk && (
                    <div className="pointer-events-none absolute right-2 bottom-2 w-40 overflow-hidden rounded border-2 border-border bg-black">
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video
                        ref={previewRef}
                        src={src}
                        muted
                        preload="metadata"
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Régua do tempo: posição + marcas dos eventos que o relatório já conhece. */}
              <div
                className={cn(
                  "group relative h-10 px-4",
                  canControl
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-50",
                )}
                onClick={canControl ? onScrub : undefined}
                onMouseMove={canControl ? onScrubHover : undefined}
                onMouseLeave={() => setHoverMs(null)}
                // A régua É um slider: com foco, as setas movem. Sem isso ela só existiria
                // pro mouse — e quem revisa uma live inteira navega no teclado.
                onKeyDown={(e) => {
                  if (!canControl) return;
                  const step = e.shiftKey ? 60_000 : 10_000;
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    seekGlobal(globalMs - step);
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    seekGlobal(globalMs + step);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    seekGlobal(0);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    seekGlobal(tuned.totalMs);
                  }
                }}
                role="slider"
                tabIndex={0}
                aria-valuemin={0}
                aria-valuemax={Math.round(tuned.totalMs / 1000)}
                aria-valuenow={Math.round(globalMs / 1000)}
                aria-valuetext={`${clock(globalMs)} / ${clock(tuned.totalMs)}`}
                aria-disabled={!canControl}
                aria-label={t("replay.scrub.aria")}
              >
                <div className="absolute top-[17px] right-4 left-4 h-1.5 rounded bg-surface-3" />
                <div
                  className="absolute top-[17px] left-4 h-1.5 rounded bg-brass"
                  style={{ width: `calc((100% - 2rem) * ${pct / 100})` }}
                />
                {ticks.map((k, i) => {
                  const x = tickAt(k.t);
                  return x == null ? null : (
                    <span
                      key={i}
                      title={k.label}
                      className="absolute top-3 h-4 w-0.5 rounded-full"
                      style={{
                        left: `calc(1rem + (100% - 2rem) * ${x / 100})`,
                        background: k.color,
                      }}
                    />
                  );
                })}
                {clipFrom != null && tuned.totalMs > 0 && (
                  <span
                    className="absolute top-2.5 h-5 w-0.5 bg-ok"
                    style={{
                      left: `calc(1rem + (100% - 2rem) * ${clipFrom / tuned.totalMs})`,
                    }}
                  />
                )}
                <span
                  className="absolute top-[13px] size-4 -translate-x-1/2 rounded-full border-2 border-brass bg-night"
                  style={{
                    left: `calc(1rem + (100% - 2rem) * ${pct / 100})`,
                  }}
                />
              </div>
            </div>

            <div className="flex min-h-14 flex-wrap items-center gap-1.5 border-t border-border-soft bg-surface px-3 py-2 sm:px-4">
              <Button
                size="sm"
                variant="ghost"
                className="size-10 px-0"
                disabled={!canControl}
                onClick={() => seekGlobal(globalMs - 10_000)}
                title={t("replay.back10")}
              >
                <SkipBack className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="primary"
                className="size-11 rounded-md px-0"
                disabled={!canControl}
                onClick={togglePlay}
                aria-label={t(playing ? "replay.pause" : "replay.play")}
                title={t(playing ? "replay.pause" : "replay.play")}
              >
                {playing ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="size-10 px-0"
                disabled={!canControl}
                onClick={() => seekGlobal(globalMs + 10_000)}
                title={t("replay.fwd10")}
              >
                <SkipForward className="size-4" />
              </Button>
              <span className="ml-1 font-mono text-xs tabular-nums text-ink sm:text-sm">
                {clock(globalMs)} / {clock(tuned.totalMs)}
              </span>
              <Select
                value={String(rate)}
                options={rateOptions}
                size="sm"
                disabled={!canControl}
                onChange={(value) => {
                  const nextRate = Number(value);
                  setRate(nextRate);
                  if (videoRef.current) {
                    videoRef.current.playbackRate = nextRate;
                  }
                }}
                className="w-[4.75rem] shrink-0"
                aria-label={t("replay.rate.aria")}
              />
              {/* Volume e tela cheia. Sem eles, revisar uma live seria assistir no volume
                  que o sistema deixou e numa janelinha — o `<video>` aqui não tem os
                  controles nativos, porque a régua sincronizada é que manda. */}
              <button
                onClick={toggleMute}
                disabled={!canControl}
                className="grid size-10 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-brass disabled:pointer-events-none disabled:opacity-40"
                title={t(muted ? "replay.unmute" : "replay.mute")}
                aria-label={t(muted ? "replay.unmute" : "replay.mute")}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="size-4" />
                ) : (
                  <Volume2 className="size-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                disabled={!canControl}
                onChange={(e) => applyVolume(Number(e.target.value))}
                className="hidden h-1 w-20 accent-brass sm:block"
                aria-label={t("replay.volume")}
              />
              <button
                onClick={toggleFullscreen}
                disabled={!canControl}
                className="grid size-10 place-items-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-brass disabled:pointer-events-none disabled:opacity-40"
                title={t("replay.fullscreen")}
                aria-label={t("replay.fullscreen")}
              >
                <Maximize2 className="size-4" />
              </button>
            </div>

            <div className="flex min-h-12 flex-wrap items-center gap-1.5 border-t border-border-soft bg-surface-2 px-3 py-2 sm:px-4">
              <Button
                size="sm"
                variant="subtle"
                disabled={!canControl}
                onClick={() => void addMarker()}
                title={t("replay.marker.cta")}
              >
                <Flag className="size-4" />
                <span className="hidden sm:inline">
                  {t("replay.marker.action")}
                </span>
              </Button>
              <Button
                size="sm"
                variant={clipFrom == null ? "ghost" : "primary"}
                disabled={busy || !canControl}
                onClick={() => void exportClip()}
                title={t("replay.clip.cta")}
              >
                <Scissors className="size-4" />
                <span className="hidden sm:inline">
                  {clipFrom == null
                    ? t("replay.clip.action")
                    : t("replay.clip.pending")}
                </span>
              </Button>
              {/* Sair do corte sem exportar. Sem isto, quem marcou o início por engano
                ficava preso: qualquer clique seguinte viraria um clipe. */}
              {clipFrom != null && (
                <button
                  onClick={() => setClipFrom(null)}
                  className="text-xs font-semibold text-ink-faint hover:text-brass"
                >
                  {t("replay.clip.cancel")}
                </button>
              )}
              <span className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void api.openRecordingFolder()}
                title={t("replay.folder")}
              >
                <FolderOpen className="size-4" />
              </Button>
              <Button
                size="sm"
                variant={confirmDelete ? "danger" : "ghost"}
                disabled={busy}
                onClick={() => void removeRecordings()}
                title={t("replay.delete.cta")}
              >
                <Trash2 className="size-4" />
                {confirmDelete && (
                  <span className="text-[11px]">
                    {t("replay.delete.confirm")}
                  </span>
                )}
              </Button>
            </div>

            {/* Atalhos. Quem revisa uma live de 4h caçando o instante do travamento vai
              usar o teclado muito mais que o mouse — mas só se souber que ele existe. */}
            <div className="flex flex-wrap items-center gap-x-3 border-t border-border-soft bg-surface px-4 py-2 text-[11px] text-ink-faint">
              <span>{t("replay.shortcuts")}</span>
              {/* O ajuste é ferramenta de CONSERTO. Deixá-lo sempre à vista sugeriria que
                  a sincronia precisa de supervisão — e ela não precisa em 95% dos casos.
                  Fica atrás de um link, e abre sozinho quando a âncora foi estimada. */}
              {!showOffset && !hasEstimatedAnchor(tuned) && offset === 0 && (
                <button
                  onClick={() => setShowOffset(true)}
                  className="font-semibold hover:text-brass"
                >
                  {t("replay.offset.open")}
                </button>
              )}
            </div>

            {/* Ajuste manual: a válvula de escape de TODA a classe de erro de sincronia.
              O que a automação errar, o streamer arrasta. */}
            <div
              className={cn(
                "items-center gap-2 bg-surface px-4 pb-3 text-xs text-ink-faint",
                showOffset || hasEstimatedAnchor(tuned) || offset !== 0
                  ? "flex"
                  : "hidden",
              )}
            >
              <span className="font-semibold">{t("replay.offset.label")}</span>
              <input
                type="range"
                min={-30000}
                max={30000}
                step={100}
                value={offset}
                onChange={(e) => void applyOffset(Number(e.target.value))}
                className="h-1 flex-1 accent-brass"
                aria-label={t("replay.offset.label")}
              />
              {/* `fmt.dec` e não `toFixed`: em pt-BR o separador decimal é vírgula, e um
                "1.5s" no meio de uma tela que mostra "1,5 GB" em toda parte destoa. */}
              <span className="w-16 text-right font-mono">
                {offset > 0 ? "+" : ""}
                {fmt.dec(offset / 1000, 1)}s
              </span>
              {offset !== 0 && (
                <button
                  onClick={() => void applyOffset(0)}
                  className="font-semibold text-brass hover:underline"
                >
                  {t("replay.offset.reset")}
                </button>
              )}
            </div>

            {hasEstimatedAnchor(tuned) && (
              <Note tone="warn">{t("replay.warn.estimated")}</Note>
            )}
            {hasUnplayableCodec(tuned) && !codecUnsupported && (
              <Note tone="bad">{t("replay.warn.codec")}</Note>
            )}
            {truncated && <Note tone="warn">{t("replay.warn.truncated")}</Note>}
            {tuned.segments.length > 1 && (
              <Note tone="warn">
                {t("replay.warn.segments", { n: tuned.segments.length })}
              </Note>
            )}
          </div>

          {/* Chat do momento. Só existe se a sessão gravou chat. */}
          {chat.length > 0 ? (
            <ReplayChatPanel
              messages={visibleChat}
              gap={gapBefore}
              showDeleted={showDeleted}
              onToggleDeleted={() => setShowDeleted((value) => !value)}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

/** `H:MM:SS` a partir de ms. Não usa `fmt.duration` porque aqui a leitura é de player
 *  (posição num vídeo), não de duração por extenso. */
function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function Note({
  tone,
  children,
}: {
  tone: "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "mx-4 mt-2 flex items-start gap-1.5 rounded px-2 py-1 text-[11px] font-semibold",
        tone === "warn" ? "bg-warn/15 text-warn" : "bg-bad/15 text-bad",
      )}
    >
      <AlertTriangle className="mt-px size-3.5 shrink-0" />
      {children}
    </p>
  );
}

/** Botão "baixar a gravação" da lista — atalho pra pasta, sem abrir o replay. */
export function OpenRecordingsButton({ label }: { label: string }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => void api.openRecordingFolder()}
    >
      <Download className="size-4" /> {label}
    </Button>
  );
}
