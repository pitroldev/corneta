import { FolderOpen, FolderSearch, HardDrive, Play, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import { Button, Card, Toggle } from "../../components/ui";
import { api } from "../../lib/api";
import { lowestCommonDenominator } from "../../lib/estimates";
import { useI18n, type MessageKey } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { toast } from "../../lib/toast";
import type { RecordDirCheck } from "../../lib/types";
import { cn, errMsg } from "../../lib/utils";
import { RecordGroup, SettingRow } from "./SettingPrimitives";

export function RecordingSettings() {
  const { t, fmt } = useI18n();
  const config = useStore((s) => s.config!);
  const settings = config.settings;
  const setSettings = useStore((s) => s.setSettings);
  const [check, setCheck] = useState<RecordDirCheck | null>(null);
  // Pasta que o streamer escolheu e eu recusei. Fica FORA de `check`, que é
  // sempre da pasta que está na tela — é dela o espaço livre mostrado embaixo,
  // e é ela que continua recebendo as gravações.
  const [rejected, setRejected] = useState<{
    path: string;
    error?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const dir = settings.recordVideoDir;

  const validate = useCallback(async (path: string) => {
    try {
      setCheck(await api.recordCheckDir(path));
    } catch {
      setCheck(null);
    }
  }, []);

  useEffect(() => {
    // Trocou a pasta (ou religou a gravação): a recusa anterior não descreve
    // mais nada que esteja na tela.
    setRejected(null);
    if (settings.recordVideo) void validate(dir);
  }, [dir, settings.recordVideo, validate]);

  // Custo em disco a partir do bitrate REAL desta configuração, não de um número redondo.
  // "Gravar a live" sem "≈2,7 GB/h no seu bitrate" é uma pegadinha: o streamer só
  // descobriria o preço quando o SSD enchesse.
  const kbps =
    lowestCommonDenominator(config).videoKbps ??
    Math.max(
      2500,
      ...config.targets
        .filter((x) => x.enabled)
        .map((x) => x.encoding.preset?.videoBitrateKbps || 0),
    );
  const gbPerHour = ((kbps + 160) * 3600) / 8 / 1024 / 1024;

  const runTest = async () => {
    setTesting(true);
    try {
      const file = await api.recordTest(dir);
      // Tocar de volta ali mesmo é o que fecha a prova de ponta a ponta: pasta, escrita,
      // FFmpeg, remux, escopo do asset, CSP, codec e player, num clique só. Se o vídeo
      // aparecer, TODO o caminho da gravação funciona nesta máquina.
      setPreview(await api.recordVideoUrl(file));
      toast.success(t("settings.record.test.ok"));
    } catch (e) {
      toast.error(t("settings.record.test.fail", { error: errMsg(e) }));
    } finally {
      setTesting(false);
    }
  };

  const pick = async () => {
    const chosen = await api.recordPickDir();
    if (!chosen) return; // cancelou — não é erro
    const c = await api.recordCheckDir(chosen);
    if (!c.ok) {
      // Pasta que não escreve não vira configuração — e o caminho que fica na
      // tela é o de antes, então o erro precisa dizer QUAL pasta não serviu.
      setRejected({ path: chosen, error: c.error });
      return;
    }
    setRejected(null);
    setSettings({ recordVideoDir: chosen });
  };

  const dirErrorKey = (error: string | undefined): MessageKey =>
    error === "notDir"
      ? "settings.record.dir.error.notDir"
      : error === "readonly"
        ? "settings.record.dir.error.readonly"
        : "settings.record.dir.error.missing";

  // Abrir a pasta é o gesto que faltava: até aqui dava pra ESCOLHER onde salvar e
  // nunca pra ir lá ver. O comando resolve a pasta padrão sozinho, então funciona
  // igual quando o caminho está vazio — que é justamente quando o streamer não
  // sabe onde as gravações foram parar.
  const openDir = async () => {
    try {
      await api.openRecordingFolder();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const freeGb = check?.freeBytes != null ? check.freeBytes / 1024 ** 3 : null;
  const keepGb = settings.recordVideoKeepGb;
  // O limite passar do espaço livre é uma armadilha silenciosa: a faxina só age
  // DEPOIS de encher, então o disco acaba primeiro.
  const keepOverFree = freeGb != null && keepGb > freeGb;

  return (
    <Card className="mb-4">
      <h3 className="mb-1 flex items-center gap-2 text-lg">
        <Video className="size-5 text-brass" /> {t("settings.record.title")}
      </h3>
      <p className="mb-3 text-xs text-ink-faint">{t("settings.record.desc")}</p>

      <div className="divide-y divide-border-soft">
        <SettingRow
          title={t("settings.record.video.label")}
          desc={t("settings.record.video.hint", { gb: fmt.dec(gbPerHour, 1) })}
        >
          <Toggle
            checked={settings.recordVideo}
            onChange={(v) => setSettings({ recordVideo: v })}
            label={t("settings.record.video.label")}
          />
        </SettingRow>

        {/* Os ajustes do vídeo em BLOCOS, não numa pilha. Antes eram pasta,
            avisos, limite e teste soltos no mesmo nível, todos com o mesmo peso
            — e "onde salvar" acabava com a mesma importância visual que uma nota
            de rodapé. Cada assunto agora tem caixa e título próprios. */}
        {settings.recordVideo && (
          <div className="flex flex-col gap-3 py-3.5">
            <section className="rounded-md bg-surface-2 p-3">
              <RecordGroup icon={<FolderOpen className="size-4" />}>
                {t("settings.record.dir.label")}
              </RecordGroup>

              {/* O caminho INTEIRO, quebrando se precisar. Ele estava num chip de
                  384px com `truncate`, que cortava justo o fim — a parte que diz
                  em qual pasta a gravação cai. */}
              <p className="mt-2 rounded bg-surface px-2.5 py-2 font-mono text-xs break-all text-ink-muted">
                {dir || t("settings.record.dir.default")}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void openDir()}>
                  <FolderOpen className="size-4" />{" "}
                  {t("settings.record.dir.open")}
                </Button>
                <Button size="sm" variant="subtle" onClick={() => void pick()}>
                  <FolderSearch className="size-4" />{" "}
                  {t("settings.record.dir.pick")}
                </Button>
                {dir && (
                  <button
                    onClick={() => setSettings({ recordVideoDir: "" })}
                    className="text-xs font-semibold text-ink-faint hover:text-brass"
                  >
                    {t("settings.record.dir.reset")}
                  </button>
                )}
              </div>

              {(rejected ||
                (check &&
                  (check.error ||
                    check.removableOrNetwork ||
                    check.longPath))) && (
                <div className="mt-2 flex flex-col gap-1 text-xs">
                  {rejected ? (
                    <>
                      <span className="font-semibold text-bad">
                        {t("settings.record.dir.error.kept", {
                          path: rejected.path,
                        })}
                      </span>
                      <span className="text-bad">
                        {t(dirErrorKey(rejected.error))}
                      </span>
                    </>
                  ) : (
                    check?.error && (
                      <span className="font-semibold text-bad">
                        {t(dirErrorKey(check.error))}
                      </span>
                    )
                  )}
                  {check?.removableOrNetwork && (
                    <span className="text-warn">
                      {t("settings.record.warn.network")}
                    </span>
                  )}
                  {check?.longPath && (
                    <span className="text-warn">
                      {t("settings.record.warn.longPath")}
                    </span>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-md bg-surface-2 p-3">
              <RecordGroup icon={<HardDrive className="size-4" />}>
                {t("settings.record.group.space")}
              </RecordGroup>

              {/* A barra dá ao limite a referência que ele nunca teve: "20 GB" é
                  um número abstrato até você ver quanto isso é do disco que
                  sobrou. Vermelha quando o limite passa do livre — aí a faxina
                  nunca chega a agir, porque o disco enche antes. */}
              {freeGb != null && (
                <>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
                    role="img"
                    aria-label={t("settings.record.dir.free", {
                      size: fmt.dec(freeGb, 1),
                      hours: fmt.dec(freeGb / Math.max(gbPerHour, 0.1), 1),
                    })}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-200",
                        keepOverFree ? "bg-bad" : "bg-brass",
                      )}
                      style={{
                        width: `${Math.min(100, (keepGb / Math.max(freeGb, 0.1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 text-xs",
                      check?.lowSpace ? "text-warn" : "text-ink-faint",
                    )}
                  >
                    {t("settings.record.dir.free", {
                      size: fmt.dec(freeGb, 1),
                      hours: fmt.dec(freeGb / Math.max(gbPerHour, 0.1), 1),
                    })}
                  </p>
                </>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-semibold">
                  {t("settings.record.keep.label")}
                </span>
                <input
                  type="range"
                  min={5}
                  max={500}
                  step={5}
                  value={keepGb}
                  onChange={(e) =>
                    setSettings({ recordVideoKeepGb: Number(e.target.value) })
                  }
                  className="h-1 min-w-40 flex-1 accent-brass"
                  aria-label={t("settings.record.keep.label")}
                />
                {/* GB é a unidade do disco; hora é a unidade de quem transmite.
                    O limite só quer dizer alguma coisa nas duas. */}
                <span className="font-mono text-xs whitespace-nowrap">
                  {fmt.num(keepGb)} GB
                  <span className="ml-1.5 text-ink-faint">
                    {t("settings.record.keep.hours", {
                      hours: fmt.dec(keepGb / Math.max(gbPerHour, 0.1), 1),
                    })}
                  </span>
                </span>
              </div>
              <p
                className={cn(
                  "mt-1.5 text-[11px]",
                  keepOverFree ? "font-semibold text-warn" : "text-ink-faint",
                )}
              >
                {keepOverFree
                  ? t("settings.record.keep.over")
                  : t("settings.record.keep.hint")}
              </p>
            </section>

            <div>
              <Button
                size="sm"
                variant="subtle"
                loading={testing}
                onClick={() => void runTest()}
              >
                {!testing && <Play className="size-4" />}
                {testing
                  ? t("settings.record.test.busy")
                  : t("settings.record.test.cta")}
              </Button>
              <p className="mt-1 text-[11px] text-ink-faint">
                {t("settings.record.test.hint")}
              </p>
            </div>
          </div>
        )}

        <SettingRow
          title={t("settings.record.chat.label")}
          desc={t("settings.record.chat.hint")}
        >
          <Toggle
            checked={settings.recordChat}
            onChange={(v) => setSettings({ recordChat: v })}
            label={t("settings.record.chat.label")}
          />
        </SettingRow>
      </div>

      <p className="mt-3 rounded bg-surface-2 px-3 py-2 text-[11px] text-ink-muted">
        {t("settings.record.privacy")}
      </p>

      {/* O resultado do teste num modal de verdade (e não num <video> jogado no body):
          fecha no Esc, no clique fora e no X, como todo o resto do app. */}
      {preview && (
        <Modal
          title={t("settings.record.test.modal")}
          onClose={() => setPreview(null)}
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={preview}
            controls
            autoPlay
            className="w-full rounded-lg bg-black"
          />
          <p className="mt-2 text-xs text-ink-muted">
            {t("settings.record.test.modal.body")}
          </p>
        </Modal>
      )}
    </Card>
  );
}
