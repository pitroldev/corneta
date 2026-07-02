import { type ReactNode, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  FileText,
  Keyboard,
  MonitorCog,
  Palette,
  Plug,
  ScanEye,
  Server,
  Shield,
  Upload,
  X,
} from "lucide-react";
import * as RTabs from "@radix-ui/react-tabs";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { obsIngestUrl } from "../lib/factory";
import { renderBrbSlatePng } from "../lib/brbSlate";
import { toast } from "../lib/toast";
import { cn } from "../lib/utils";
import type { ObsCheck } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  CopyField,
  EmptyState,
  ExperimentalBadge,
  Input,
  SectionTitle,
  Toggle,
} from "../components/ui";

type SettingsTab = "obs" | "seguranca" | "geral";
const TABS: { id: SettingsTab; label: string; icon: typeof Plug }[] = [
  { id: "geral", label: "Geral", icon: MonitorCog },
  { id: "seguranca", label: "Segurança ao vivo", icon: Shield },
  { id: "obs", label: "OBS", icon: Plug },
];

export function SettingsScreen() {
  const config = useStore((s) => s.config);
  const setIngest = useStore((s) => s.setIngest);
  const setSettings = useStore((s) => s.setSettings);
  const load = useStore((s) => s.load);
  const live = useStore(
    (s) => s.snapshot.state === "live" || s.snapshot.state === "starting",
  );
  const requestedTab = useStore((s) => s.settingsTab);
  const setSettingsTab = useStore((s) => s.setSettingsTab);

  const [confirmImport, setConfirmImport] = useState(false);
  const [tab, setTab] = useState<SettingsTab>(
    () => (requestedTab as SettingsTab) || "geral",
  );
  const [portDraft, setPortDraft] = useState<string | null>(null);

  // Deep-link do "Ajustar" (Ao vivo) → abre direto na aba certa, e consome o pedido.
  useEffect(() => {
    if (requestedTab) {
      setTab(requestedTab as SettingsTab);
      setSettingsTab(null);
    }
  }, [requestedTab, setSettingsTab]);

  if (!config) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState title="Carregando…">Já trago seus ajustes.</EmptyState>
      </div>
    );
  }
  const { ingest, settings } = config;
  const portShown = portDraft ?? String(ingest.port);
  const portNum = Number(portShown);
  const portInvalid =
    portShown.trim() === "" ||
    !Number.isInteger(portNum) ||
    portNum < 1 ||
    portNum > 65535;

  const onExport = async () => {
    try {
      if (await api.exportConfig()) toast.success("Config exportada");
    } catch (e) {
      toast.error(`Falha ao exportar: ${e}`);
    }
  };
  const onImport = async () => {
    if (!confirmImport) {
      setConfirmImport(true);
      setTimeout(() => setConfirmImport(false), 3000);
      return;
    }
    setConfirmImport(false);
    try {
      if (await api.importConfig()) {
        await load();
        toast.success("Config importada");
      }
    } catch (e) {
      toast.error(`Falha ao importar: ${e}`);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        kicker="Por baixo do capô"
        title="Configurações"
        subtitle="Como a Corneta conversa com o OBS e se comporta no ar."
      />

      <RTabs.Root value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
        <RTabs.List className="mb-5 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <RTabs.Trigger
                key={t.id}
                value={t.id}
                data-on-brass={tab === t.id ? "" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-4 py-2 font-display text-sm font-bold transition-all",
                  "bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink",
                  "data-[state=active]:bg-brass data-[state=active]:text-brass-ink data-[state=active]:pop-brass",
                )}
              >
                <Icon className="size-4" strokeWidth={2.4} /> {t.label}
              </RTabs.Trigger>
            );
          })}
        </RTabs.List>

        {/* ===================== OBS ===================== */}
        <RTabs.Content value="obs">
          <Card className="mb-4">
            <h3 className="flex items-center gap-2 text-lg">
              <Server className="size-5 text-brass" /> Endpoint de ingestão
              (OBS)
            </h3>
            <p className="mt-1 mb-4 text-xs text-ink-faint">
              Endereço local onde o OBS te entrega o vídeo. Mudou aqui, muda no
              OBS também. A<strong className="text-ink-muted"> chave</strong>{" "}
              abaixo é local (OBS ↔ Corneta) — não confunda com as chaves das
              plataformas, que ficam no cofre.
            </p>

            {live && (
              <div className="mb-3 flex items-center gap-2 rounded-md bg-warn/15 px-3 py-2 text-xs font-semibold text-warn">
                <AlertTriangle className="size-4 shrink-0" />
                Você está no ar — travei a edição do endpoint pra não derrubar o
                OBS no meio da live.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Host">
                <Input
                  value={ingest.host}
                  disabled={live}
                  onChange={(e) => setIngest({ host: e.target.value })}
                />
              </Field>
              <Field label="Porta">
                <Input
                  type="number"
                  value={portShown}
                  disabled={live}
                  invalid={portInvalid}
                  onChange={(e) => setPortDraft(e.target.value)}
                  onBlur={(e) => {
                    // No blur (como no EncodingScreen): clampa pra 1–65535; vazio/inválido volta pro valor da config.
                    const v = Number(e.target.value);
                    const port =
                      e.target.value.trim() !== "" && Number.isFinite(v)
                        ? Math.min(65535, Math.max(1, Math.round(v)))
                        : ingest.port;
                    if (port !== ingest.port) setIngest({ port });
                    setPortDraft(null);
                  }}
                />
                {portInvalid && (
                  <span className="text-[11px] font-medium text-bad">
                    A porta vai de 1 a 65535.
                  </span>
                )}
              </Field>
              <Field label="Aplicação (app)">
                <Input
                  value={ingest.app}
                  disabled={live}
                  onChange={(e) => setIngest({ app: e.target.value })}
                />
              </Field>
              <Field label="Chave local">
                <Input
                  value={ingest.key}
                  disabled={live}
                  onChange={(e) => setIngest({ key: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-4 rounded-md bg-surface-2 p-3">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                Cole no OBS
              </span>
              <div className="mt-2 grid gap-2">
                <CopyField label="Servidor" value={obsIngestUrl(ingest)} />
                <CopyField label="Chave" value={ingest.key} mono />
              </div>
            </div>
          </Card>

          <Card className="mb-4">
            <h3 className="flex items-center gap-2 text-lg">
              <Plug className="size-5 text-brass" /> OBS — auto-config
            </h3>
            <p className="mt-1 mb-4 text-xs text-ink-faint">
              Pro botão{" "}
              <strong className="text-ink-muted">“Configura pra mim”</strong>{" "}
              (na tela Ao vivo) funcionar, ative no OBS:{" "}
              <strong className="text-ink-muted">
                Ferramentas → Configurações do Servidor WebSocket
              </strong>
              . Se tiver senha, cole aqui.
            </p>
            <div className="divide-y divide-border-soft">
              <SettingRow
                title="Senha do obs-websocket"
                desc="Deixe vazio se o OBS não pedir senha."
              >
                <div className="flex flex-col items-end gap-2">
                  <Input
                    type="password"
                    placeholder="(opcional)"
                    className="w-48"
                    value={settings.obsPassword}
                    onChange={(e) =>
                      setSettings({ obsPassword: e.target.value })
                    }
                  />
                  <ObsTestButton />
                </div>
              </SettingRow>
              <SettingRow
                title="Ligar o OBS junto"
                desc="No BORA AO VIVO, a Corneta também manda o OBS começar a transmitir (precisa do obs-websocket)."
              >
                <Toggle
                  checked={settings.autoStartObs}
                  onChange={(v) => setSettings({ autoStartObs: v })}
                  label="Ligar o OBS junto"
                />
              </SettingRow>
            </div>
          </Card>
        </RTabs.Content>

        {/* ===================== Segurança ao vivo ===================== */}
        <RTabs.Content value="seguranca">
          <Card accent>
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <Shield className="size-5 text-brass" /> Segurança ao vivo
            </h3>
            <p className="mb-2 text-xs text-ink-faint">
              As redes que seguram a sua live quando algo dá errado. O escudo{" "}
              <strong className="text-brass">acende</strong> quando a proteção
              está armada — igual na tela Ao vivo.
            </p>
            <div className="divide-y divide-border-soft">
              <SecurityFeature
                preview={<BrbPreview />}
                on={settings.brbEnabled}
                title="Proteção contra quedas (JÁ VOLTO)"
                desc="Se o OBS cair no meio da live, a tela “JÁ VOLTO” entra no ar SEM derrubar a conexão com as plataformas — pro espectador a live nem pisca, e volta sozinha quando o sinal retorna. Custo: a Corneta recodifica o sinal continuamente (usa a GPU quando tem; num PC fraco sem GPU pode pesar)."
              >
                <Toggle
                  checked={settings.brbEnabled}
                  onChange={(v) => setSettings({ brbEnabled: v })}
                  label="Proteção contra quedas"
                />
              </SecurityFeature>
              <BrbSlateChooser />
              <SecurityFeature
                preview={<BitratePreview />}
                on={settings.autoBitrate}
                title="Auto-bitrate quando a banda aperta"
                desc="Se um destino que a Corneta recodifica não dá conta do upload, ela baixa o bitrate dele e sobe de volta quando estabiliza — em vez de derrubar."
              >
                <Toggle
                  checked={settings.autoBitrate}
                  onChange={(v) => setSettings({ autoBitrate: v })}
                  label="Auto-bitrate"
                />
              </SecurityFeature>
              <SecurityFeature
                preview={<GuardianPreview />}
                on={settings.guardianEnabled}
                title="Guardião de privacidade"
                badge={<ExperimentalBadge />}
                desc="Se um termo seu (lista abaixo) aparece na tela, a Corneta corta pra “JÁ VOLTO” antes de ir ao ar. A leitura é local — OCR no seu PC, nada sai daqui. Rede de segurança, não garantia."
              >
                <Toggle
                  checked={settings.guardianEnabled}
                  onChange={(v) => setSettings({ guardianEnabled: v })}
                  label="Guardião"
                />
              </SecurityFeature>
              {settings.guardianEnabled && <GuardianEditor />}
            </div>
          </Card>
        </RTabs.Content>

        {/* ===================== Geral ===================== */}
        <RTabs.Content value="geral">
          <Card className="mb-4">
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <Keyboard className="size-5 text-brass" /> Atalho global
            </h3>
            <p className="mb-3 text-xs text-ink-faint">
              Começa/para a transmissão de qualquer lugar — mesmo com a Corneta
              minimizada na bandeja.
            </p>
            <div className="flex items-center gap-2">
              <ShortcutCapture
                value={settings.liveShortcut}
                onChange={async (v) => {
                  const prev = settings.liveShortcut;
                  setSettings({ liveShortcut: v });
                  try {
                    await api.registerShortcut(v);
                  } catch {
                    // O backend desregistra o antigo antes de registrar — se o novo falhou
                    // (em uso por outro programa), reverte e re-registra o anterior.
                    toast.error(
                      "Esse atalho já está em uso por outro programa — mantive o anterior.",
                    );
                    setSettings({ liveShortcut: prev });
                    try {
                      await api.registerShortcut(prev);
                    } catch {
                      setSettings({ liveShortcut: "" });
                      toast.error(
                        "Não consegui restaurar o atalho anterior — defina um novo.",
                      );
                    }
                  }
                }}
              />
              {settings.liveShortcut && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSettings({ liveShortcut: "" });
                    void api.registerShortcut("");
                  }}
                >
                  <X className="size-4" /> Limpar
                </Button>
              )}
            </div>
          </Card>

          <Card className="mb-4">
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <MonitorCog className="size-5 text-brass" /> Sistema
            </h3>
            <div className="divide-y divide-border-soft">
              <SettingRow
                title="Minimizar para a bandeja ao fechar"
                desc="Fechar a janela esconde a Corneta na bandeja (a transmissão continua). Para sair de vez, use o menu da bandeja."
              >
                <Toggle
                  checked={settings.minimizeToTray}
                  onChange={(v) => setSettings({ minimizeToTray: v })}
                  label="Minimizar para a bandeja"
                />
              </SettingRow>
              <SettingRow
                title="Abrir com o Windows"
                desc="Inicia a Corneta automaticamente quando você liga o computador."
              >
                <Toggle
                  checked={settings.autostart}
                  onChange={(v) => setSettings({ autostart: v })}
                  label="Abrir com o Windows"
                />
              </SettingRow>
            </div>
          </Card>

          <Card className="mb-4">
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <Palette className="size-5 text-brass" /> Aparência
            </h3>
            <div className="divide-y divide-border-soft">
              <SettingRow
                title="Tema claro"
                desc="Troca a interface pro modo claro (papel)."
              >
                <Toggle
                  checked={settings.theme === "light"}
                  onChange={(v) => setSettings({ theme: v ? "light" : "dark" })}
                  label="Tema claro"
                />
              </SettingRow>
            </div>
          </Card>

          <Card>
            <h3 className="mb-1 flex items-center gap-2 text-lg">
              <Database className="size-5 text-brass" /> Dados &amp; diagnóstico
            </h3>
            <div className="divide-y divide-border-soft">
              <SettingRow
                title="Backup da config"
                desc="Exportar/importar perfis e ajustes num arquivo (as chaves não vão — ficam no cofre). Importar substitui a config atual."
              >
                <div className="flex gap-2">
                  <Button variant="subtle" size="sm" onClick={onExport}>
                    <Download className="size-4" /> Exportar
                  </Button>
                  <Button
                    variant={confirmImport ? "primary" : "subtle"}
                    size="sm"
                    onClick={onImport}
                  >
                    <Upload className="size-4" />{" "}
                    {confirmImport ? "Substituir?" : "Importar"}
                  </Button>
                </div>
              </SettingRow>
              <SettingRow
                title="Logs"
                desc="Abre a pasta de logs — útil pra diagnosticar ou mandar pro suporte."
              >
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => void api.openLogsDir()}
                >
                  <FileText className="size-4" /> Abrir logs
                </Button>
              </SettingRow>
            </div>
          </Card>
        </RTabs.Content>
      </RTabs.Root>
    </div>
  );
}

/** Testa o obs-websocket ali mesmo, com estado carregando/ok/erro. */
function ObsTestButton() {
  const [obs, setObs] = useState<ObsCheck | "loading" | null>(null);
  const run = async () => {
    setObs("loading");
    try {
      setObs(await api.obsCheck());
    } catch (e) {
      setObs({
        reachable: false,
        pointingAtCorneta: false,
        width: 0,
        height: 0,
        fps: 0,
        error: String(e),
      });
    }
  };
  return (
    <div className="flex items-center gap-2">
      {obs && obs !== "loading" && (
        <span
          className={cn(
            "flex items-center gap-1 text-xs font-semibold",
            obs.reachable ? "text-ok" : "text-bad",
          )}
        >
          {obs.reachable ? (
            <Check className="size-3.5" />
          ) : (
            <AlertTriangle className="size-3.5" />
          )}
          {obs.reachable ? "Conectado" : "Não achei o OBS"}
        </span>
      )}
      <Button
        variant="subtle"
        size="sm"
        onClick={run}
        loading={obs === "loading"}
        disabled={obs === "loading"}
      >
        {obs !== "loading" && <Plug className="size-4" />}
        Testar conexão
      </Button>
    </div>
  );
}

/** Editor da watchlist do Guardião: contagem positiva + trim/dedup no blur. */
function GuardianEditor() {
  const settings = useStore((s) => s.config!.settings);
  const setSettings = useStore((s) => s.setSettings);
  const watchCount = settings.guardianWatchlist.filter(
    (t) => t.trim().length >= 3,
  ).length;

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="rounded-md border-2 border-brass/40 bg-brass/[0.06] p-3 text-xs leading-relaxed text-ink-muted">
        <div className="mb-1 font-display text-sm font-extrabold text-ink">
          🛡️ O preço da proteção
        </div>
        Quando um termo da sua lista aparece, a Corneta troca pra tela{" "}
        <strong className="text-ink">“JÁ VOLTO”</strong> antes daquele instante
        ir ao ar — nunca exposto, nem num clipe. Pra garantir isso:
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>
            A transmissão fica <strong className="text-ink">12s atrás</strong>{" "}
            do tempo real (fixo — é o mínimo pra dar conta até de tela cheia de
            texto).
          </li>
          <li>O chat e a interação chegam até você com esse mesmo atraso.</li>
          <li>
            Só vigia os termos que você listar —{" "}
            <strong className="text-ink">não</strong> “qualquer segredo”.
          </li>
          <li>Texto miúdo ou OCR errando feio ainda pode escapar.</li>
        </ul>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-ink-muted">
          Termos a vigiar{" "}
          <span className="font-normal text-ink-faint">
            (um por linha — seu e-mail, nome real, endereço, @…)
          </span>
        </span>
        <textarea
          value={settings.guardianWatchlist.join("\n")}
          onChange={(e) =>
            setSettings({ guardianWatchlist: e.target.value.split("\n") })
          }
          onBlur={() =>
            setSettings({
              guardianWatchlist: Array.from(
                new Set(
                  settings.guardianWatchlist
                    .map((t) => t.trim())
                    .filter(Boolean),
                ),
              ),
            })
          }
          rows={4}
          placeholder={"meu@email.com\nRua das Flores, 42\nMeu Nome Real"}
          className="resize-y rounded-md border-2 border-border bg-surface px-2 py-1.5 text-sm font-medium text-ink outline-none focus:border-brass"
        />
        {watchCount === 0 ? (
          <span className="text-xs font-semibold text-brass">
            Sem termos (3+ letras), o guardião não faz nada — adicione ao menos
            um.
          </span>
        ) : (
          <span className="text-xs font-semibold text-ok">
            Vigiando {watchCount} termo{watchCount > 1 ? "s" : ""}.
          </span>
        )}
      </label>
    </div>
  );
}

/** Captura um atalho global: clica e pressiona a combinação (exige um modificador). */
function ShortcutCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);

  const onKey = (e: React.KeyboardEvent) => {
    if (!capturing) return;
    e.preventDefault();
    const k = e.key;
    if (["Control", "Alt", "Shift", "Meta", "OS"].includes(k)) return;
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (parts.length === 0) return; // exige ao menos um modificador
    parts.push(k.length === 1 ? k.toUpperCase() : k);
    onChange(parts.join("+"));
    setCapturing(false);
  };

  return (
    <button
      onClick={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={onKey}
      className={cn(
        "rounded-md border-2 px-3 py-2 font-mono text-sm transition-colors",
        capturing
          ? "border-brass text-brass"
          : "border-border text-ink hover:border-brass/60",
      )}
    >
      {capturing ? "pressione as teclas…" : value || "definir atalho"}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
      {label}
      {children}
    </label>
  );
}

/** Escolhe a tela do "JÁ VOLTO": padrão gerada, imagem ou vídeo (com som). O arquivo
 *  escolhido é copiado pro backend (brb-slate.*) e entra no ar quando o sinal cai. */
function BrbSlateChooser() {
  const kind = useStore((s) => s.config!.settings.brbSlateKind) ?? "auto";
  const setSettings = useStore((s) => s.setSettings);
  const [busy, setBusy] = useState(false);

  // Imagem/Vídeo abrem o mesmo seletor (ambos os filtros); a kind real vem da extensão.
  const pick = async () => {
    setBusy(true);
    try {
      const k = await api.setBrbSlate();
      if (k) {
        setSettings({ brbSlateKind: k as "image" | "video" });
        toast.success("Tela do JÁ VOLTO atualizada");
      }
      // k vazio = usuário cancelou o seletor → sem mudança.
    } catch (e) {
      toast.error(`Não consegui usar esse arquivo: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // Volta pro padrão: apaga o custom e regenera o PNG da Corneta (como o App faz no boot).
  const useDefault = async () => {
    setBusy(true);
    try {
      await api.clearBrbSlate();
      setSettings({ brbSlateKind: "auto" });
      const b64 = await renderBrbSlatePng();
      if (b64) await api.saveBrbSlate(b64);
      toast.success("Voltou pra tela padrão da Corneta");
    } catch (e) {
      toast.error(`Falha ao voltar pro padrão: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const current =
    kind === "image"
      ? "Usando: imagem enviada"
      : kind === "video"
        ? "Usando: vídeo enviado (com som)"
        : "Usando: tela padrão da Corneta";

  const opt = (active: boolean) =>
    cn(
      "flex-1 rounded-md border-2 px-3 py-2 font-display text-sm font-bold transition-colors disabled:opacity-50",
      active
        ? "border-brass bg-brass/10 text-brass"
        : "border-border text-ink-muted hover:border-brass/60",
    );

  return (
    <div className="flex flex-col gap-2 py-3.5">
      <span className="text-sm font-semibold text-ink-muted">
        Tela do “JÁ VOLTO”
      </span>
      <div className="flex gap-2">
        <button className={opt(kind === "auto")} disabled={busy} onClick={useDefault}>
          Padrão (gerada)
        </button>
        <button className={opt(kind === "image")} disabled={busy} onClick={pick}>
          Imagem
        </button>
        <button className={opt(kind === "video")} disabled={busy} onClick={pick}>
          Vídeo (com som)
        </button>
      </div>
      <span className="text-xs font-semibold text-ink-faint">
        {current} — a imagem ou vídeo que você escolher entra no ar quando o sinal
        cai. Vídeo toca em loop e pode ter som.
      </span>
    </div>
  );
}

/** A tela "JÁ VOLTO" que vai pro ar quando o sinal do OBS cai. */
function BrbPreview() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#14100a]">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,179,35,0.16) 1px, transparent 0)",
          backgroundSize: "7px 7px",
        }}
      />
      <div className="relative -rotate-3 bg-brass px-2 py-0.5 font-display text-[9px] font-extrabold leading-none text-brass-ink shadow-[2px_2px_0_#0b0805]">
        JÁ VOLTO
      </div>
    </div>
  );
}

/** O bitrate de saída (latão) descendo pra caber embaixo da banda disponível (linha tracejada). */
function BitratePreview() {
  return (
    <div className="absolute inset-0 bg-surface-2">
      <svg
        viewBox="0 0 128 72"
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        <path
          d="M2 16 H44 L64 40 H84 L126 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="4 3"
          className="text-bad/70"
        />
        <path
          d="M2 26 H44 L64 50 H84 L126 26 V72 H2 Z"
          fill="currentColor"
          className="text-brass/20"
        />
        <path
          d="M2 26 H44 L64 50 H84 L126 26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className="text-brass"
        />
      </svg>
    </div>
  );
}

/** Uma linha da tela com um termo seu tampado — o Guardião viu e cortou. */
function GuardianPreview() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-1.5 bg-surface-2 px-2.5">
      <div className="h-1.5 w-4/5 rounded-full bg-ink-faint/40" />
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1/5 rounded-full bg-ink-faint/40" />
        <div className="h-3 flex-1 rounded-sm bg-night" />
      </div>
      <div className="h-1.5 w-3/5 rounded-full bg-ink-faint/40" />
      <ScanEye
        className="absolute right-1.5 top-1.5 size-3.5 text-brass"
        strokeWidth={2.4}
      />
    </div>
  );
}

/** Linha ILUSTRADA da "Segurança ao vivo": uma mini-tela mostra a proteção em ação e
 *  ganha moldura de latão (com sombra) quando está armada — como na tela Ao vivo. */
function SecurityFeature({
  preview,
  on,
  title,
  desc,
  badge,
  children,
}: {
  preview: ReactNode;
  on: boolean;
  title: string;
  desc: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-4">
      <div
        className={cn(
          "relative aspect-video w-32 shrink-0 overflow-hidden rounded-md transition-all",
          on
            ? "pop-brass ring-2 ring-brass"
            : "opacity-60 grayscale ring-1 ring-border",
        )}
      >
        {preview}
        {!on && (
          <div className="absolute inset-0 grid place-items-center bg-night/45">
            <span className="rounded-sm bg-surface-3/90 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-ink-faint">
              desligado
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-display font-bold">
          {title}
          {badge}
          {on && (
            <Badge tone="brass" className="text-[10px]">
              Armado
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-sm text-ink-muted">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SettingRow({
  title,
  desc,
  badge,
  children,
}: {
  title: string;
  desc: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <div className="flex items-center gap-2 font-display font-bold">
          {title}
          {badge}
        </div>
        <div className="mt-0.5 max-w-md text-sm text-ink-muted">{desc}</div>
      </div>
      {children}
    </div>
  );
}
