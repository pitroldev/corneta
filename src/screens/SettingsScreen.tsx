import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  AudioLines,
  Check,
  ChevronDown,
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
import * as Collapsible from "@radix-ui/react-collapsible";
import * as RTabs from "@radix-ui/react-tabs";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { obsIngestUrl } from "../lib/factory";
import { BRB_SLATE_GENERATION, renderBrbSlatePng } from "../lib/brbSlate";
import { toast } from "../lib/toast";
import { cn } from "../lib/utils";
import { sanitizeHost } from "../lib/validation";
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
  // C20: os campos crus do endpoint nascem escondidos — a persona só copia.
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
        // O backend guarda a config antiga antes de sobrescrever — dá o caminho de volta.
        toast.success("Config importada — a anterior ficou salva em backup.");
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
                  "inline-flex items-center gap-2 rounded-md px-4 py-2 font-display text-sm font-bold transition",
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
              Endereço local onde o OBS te entrega o vídeo. A
              <strong className="text-ink-muted"> chave</strong> abaixo é só
              entre OBS e Corneta — não é a chave da plataforma, que fica no
              cofre.
            </p>

            {live && (
              <div className="mb-3 flex items-center gap-2 rounded-md bg-warn/15 px-3 py-2 text-xs font-semibold text-warn">
                <AlertTriangle className="size-4 shrink-0" />
                Você está no ar — travei a edição do endpoint pra não derrubar o
                OBS no meio da live.
              </div>
            )}

            {/* A tarefa nº1 aqui é COPIAR, não editar — os campos crus ficam no "Avançado". */}
            <div className="rounded-md bg-surface-2 p-3">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                Cole no OBS
              </span>
              <div className="mt-2 grid gap-2">
                <CopyField label="Servidor" value={obsIngestUrl(ingest)} />
                <CopyField label="Chave" value={ingest.key} mono />
              </div>
            </div>

            <Collapsible.Root
              open={advancedOpen}
              onOpenChange={setAdvancedOpen}
              className="mt-4"
            >
              <Collapsible.Trigger className="group flex w-full items-center gap-2 text-left text-sm font-bold text-ink-muted transition-colors hover:text-ink">
                Avançado — mudar o endereço local
                <ChevronDown className="size-4 shrink-0 text-ink-faint transition-transform group-data-[state=open]:rotate-180" />
              </Collapsible.Trigger>
              <Collapsible.Content className="mt-3">
                <p className="mb-3 text-xs text-ink-faint">
                  Só mexa aqui se a porta padrão (1935) já estiver em uso por
                  outro programa. Mudou aqui, muda no OBS também.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Host">
                    <Input
                      value={ingest.host}
                      disabled={live}
                      onChange={(e) => setIngest({ host: e.target.value })}
                      onBlur={(e) => {
                        // Se colar a URL inteira no campo de host, fica só o host.
                        const clean = sanitizeHost(e.target.value);
                        if (clean !== e.target.value)
                          setIngest({ host: clean });
                      }}
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
              </Collapsible.Content>
            </Collapsible.Root>
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
                title="Senha do WebSocket"
                desc="A senha aparece nessa mesma janela do OBS, no botão “Mostrar Chave de Conexão”. Se “Ativar Autenticação” estiver desmarcado lá, deixe vazio."
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
                desc="No BORA AO VIVO, a Corneta também manda o OBS começar a transmitir."
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
              As redes que seguram a sua live quando algo dá errado.
            </p>
            {/* Cada feature + seus parâmetros formam um GRUPO: o divisor fica entre grupos, e os
                parâmetros só aparecem com a feature ligada, aninhados (colados) logo abaixo dela. */}
            <div className="divide-y divide-border-soft">
              <div>
                <SecurityFeature
                  preview={<BrbPreview />}
                  on={settings.brbEnabled}
                  title="Proteção contra quedas (JÁ VOLTO)"
                  desc="Se o OBS cair no meio da live, a tela “JÁ VOLTO” entra no ar sem derrubar as plataformas — pro espectador a live nem pisca, e volta sozinha quando o sinal retorna."
                >
                  <Toggle
                    checked={settings.brbEnabled}
                    onChange={(v) => setSettings({ brbEnabled: v })}
                    label="Proteção contra quedas"
                  />
                </SecurityFeature>
                {settings.brbEnabled && (
                  <SubSettings>
                    <BrbSlateChooser />
                  </SubSettings>
                )}
              </div>

              <div>
                <SecurityFeature
                  preview={<BitratePreview />}
                  on={settings.autoBitrate}
                  title="Segurar a live quando a internet aperta (auto-bitrate)"
                  desc="Se a sua internet engasgar, a Corneta baixa a qualidade do vídeo por um tempo em vez de deixar a live travar ou cair — e volta ao normal sozinha."
                >
                  <Toggle
                    checked={settings.autoBitrate}
                    onChange={(v) => setSettings({ autoBitrate: v })}
                    label="Auto-bitrate"
                  />
                </SecurityFeature>
              </div>

              <div>
                <SecurityFeature
                  preview={<GuardianPreview />}
                  on={settings.guardianEnabled}
                  title="Guardião de privacidade"
                  badge={<ExperimentalBadge />}
                  desc="Se um termo seu (lista abaixo) aparece na tela, a Corneta corta pra “JÁ VOLTO” antes de ir ao ar. Rede de segurança, não garantia. Custo: a live inteira sai com 12s de atraso (o chat também)."
                >
                  <Toggle
                    checked={settings.guardianEnabled}
                    onChange={(v) => setSettings({ guardianEnabled: v })}
                    label="Guardião"
                  />
                </SecurityFeature>
                {settings.guardianEnabled && (
                  <SubSettings>
                    <GuardianEditor />
                  </SubSettings>
                )}
              </div>

              <div>
                <SecurityFeature
                  preview={<LoudnessPreview />}
                  on={settings.loudnessNormalize}
                  title="Normalizador de áudio"
                  desc="A Corneta acerta o volume do seu som antes de enviar — sem “tá baixo” nem estourando na troca de cena. Se você já normaliza no OBS, deixe desligado pra não brigar."
                >
                  <Toggle
                    checked={settings.loudnessNormalize}
                    onChange={(v) => setSettings({ loudnessNormalize: v })}
                    label="Normalizar"
                  />
                </SecurityFeature>
                {settings.loudnessNormalize && (
                  <SubSettings>
                    <LoudnessTarget />
                  </SubSettings>
                )}
              </div>
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
              <SettingRow title="Tema claro">
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
                desc="Salva seus ajustes num arquivo. As chaves ficam no cofre, não vão junto. Importar substitui a config atual."
              >
                <div className="flex gap-2">
                  <Button variant="subtle" size="sm" onClick={onExport}>
                    <Download className="size-4" /> Exportar
                  </Button>
                  <Button
                    variant={confirmImport ? "danger" : "subtle"}
                    size="sm"
                    onClick={onImport}
                  >
                    <Upload className="size-4" />{" "}
                    {confirmImport ? "Substituir a config atual?" : "Importar"}
                  </Button>
                </div>
              </SettingRow>
              <SettingRow
                title="Logs"
                desc="Exporte um diagnóstico redigido para o suporte ou abra os arquivos locais."
              >
                <div className="flex gap-2">
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => void api.exportDiagnostics()}
                  >
                    <Download className="size-4" aria-hidden /> Exportar
                    diagnóstico
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => void api.openLogsDir()}
                  >
                    <FileText className="size-4" aria-hidden /> Abrir logs
                  </Button>
                </div>
              </SettingRow>
            </div>
          </Card>
        </RTabs.Content>
      </RTabs.Root>
    </div>
  );
}

/** Testa o obs-websocket ali mesmo. Quatro desfechos, não dois: não achei /
 *  senha recusada / conectado mas apontando pra outro lugar / conectado de verdade. */
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

  // O backend já manda o motivo em pt-BR no error; a senha é o caso que dá pra apontar direto.
  const verdict = (() => {
    if (!obs || obs === "loading") return null;
    if (!obs.reachable) {
      const authFail = /senha|identificar|autentic/i.test(obs.error ?? "");
      return authFail
        ? {
            tone: "text-bad",
            msg: "Senha recusada — confira a senha do WebSocket no OBS (botão “Mostrar Chave de Conexão”).",
          }
        : {
            tone: "text-bad",
            msg: "Não achei o OBS — ele está aberto? O WebSocket está ativado em Ferramentas → Configurações do Servidor WebSocket?",
          };
    }
    if (!obs.pointingAtCorneta)
      return {
        tone: "text-warn",
        msg: "Conectado, mas o OBS não está apontando pra Corneta — use “Configura pra mim” na tela Ao vivo.",
      };
    return {
      tone: "text-ok",
      msg:
        obs.width > 0
          ? `Conectado · ${obs.width}×${obs.height} · ${obs.fps}fps`
          : "Conectado",
    };
  })();

  return (
    <div className="flex flex-col items-end gap-1.5">
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
      {verdict && (
        <span
          className={cn(
            "flex max-w-64 items-start gap-1 text-right text-xs font-semibold",
            verdict.tone,
          )}
        >
          {verdict.tone === "text-ok" ? (
            <Check className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          )}
          {verdict.msg}
        </span>
      )}
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
  // Termos de 1–2 letras são descartados pelo motor — avisar em vez de fingir proteção.
  const shortTerms = settings.guardianWatchlist
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length < 3);

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
            do tempo real.
          </li>
          <li>O chat e a interação chegam até você com esse mesmo atraso.</li>
          <li>
            Só vigia os termos que você listar —{" "}
            <strong className="text-ink">não</strong> “qualquer segredo”.
          </li>
          <li>Texto muito pequeno ainda pode escapar.</li>
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
        ) : shortTerms.length > 0 ? (
          <span className="text-xs font-semibold text-brass">
            Vigiando {watchCount} termo{watchCount > 1 ? "s" : ""} —{" "}
            {shortTerms.length === 1
              ? `1 ignorado por ser curto demais (mínimo 3 letras): "${shortTerms[0]}"`
              : `${shortTerms.length} ignorados por serem curtos demais (mínimo 3 letras): ${shortTerms.map((t) => `"${t}"`).join(", ")}`}
            .
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

/** Captura um atalho global: clica e pressiona a combinação (exige um modificador).
 *  Tecla solta não passa batido: avisa na hora que precisa de Ctrl/Alt/Shift. Esc cancela. */
function ShortcutCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feedback de ~1.5s quando vier tecla sem modificador — some sozinho (reinicia se repetir).
  const flashHint = useCallback(() => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(true);
    hintTimer.current = setTimeout(() => setHint(false), 1500);
  }, []);
  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (!capturing) return;
    e.preventDefault();
    const k = e.key;
    if (k === "Escape") {
      // Cancela sem mexer no atalho atual.
      setCapturing(false);
      setHint(false);
      return;
    }
    if (["Control", "Alt", "Shift", "Meta", "OS"].includes(k)) return;
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (parts.length === 0) {
      // Atalho global exige modificador — avisar em vez de ignorar em silêncio.
      flashHint();
      return;
    }
    parts.push(k.length === 1 ? k.toUpperCase() : k);
    onChange(parts.join("+"));
    setCapturing(false);
    setHint(false);
  };

  return (
    <button
      onClick={() => setCapturing(true)}
      onBlur={() => {
        setCapturing(false);
        setHint(false);
      }}
      onKeyDown={onKey}
      className={cn(
        "rounded-md border-2 px-3 py-2 font-mono text-sm transition-colors",
        capturing && hint
          ? "border-warn text-warn"
          : capturing
            ? "border-brass text-brass"
            : "border-border text-ink hover:border-brass/60",
      )}
    >
      {capturing
        ? hint
          ? "precisa de Ctrl, Alt ou Shift junto"
          : "pressione Ctrl, Alt ou Shift + tecla… (Esc cancela)"
        : value || "definir atalho"}
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

/** Escolhe a tela do "JÁ VOLTO": padrão gerada ou arquivo próprio (imagem ou vídeo —
 *  a kind vem da extensão). O arquivo é copiado pro backend (brb-slate.*) e entra no
 *  ar quando o sinal cai. Preview 16:9 pra conferir o que vai pro ar de verdade. */
function BrbSlateChooser() {
  const kind = useStore((s) => s.config!.settings.brbSlateKind) ?? "auto";
  const fileName = useStore((s) => s.config!.settings.brbSlateFileName);
  const setSettings = useStore((s) => s.setSettings);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>("");

  // Preview vem do backend em JPEG base64 (vídeo = 1 frame); "" = indisponível.
  const loadPreview = useCallback(async () => {
    try {
      setPreview(await api.getBrbSlatePreview());
    } catch {
      setPreview("");
    }
  }, []);
  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const pick = async () => {
    setBusy(true);
    try {
      const r = await api.setBrbSlate();
      if (r) {
        setSettings({ brbSlateKind: r.kind, brbSlateFileName: r.fileName });
        toast.success("Tela do JÁ VOLTO atualizada");
        await loadPreview();
      }
      // null = usuário cancelou o seletor → sem mudança.
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
      const b64 = await renderBrbSlatePng();
      if (b64) await api.saveBrbSlate(b64, BRB_SLATE_GENERATION);
      setSettings({ brbSlateKind: "auto", brbSlateFileName: undefined });
      toast.success("Voltou pra tela padrão da Corneta");
      await loadPreview();
    } catch (e) {
      toast.error(`Falha ao voltar pro padrão: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const current =
    kind === "image"
      ? `Usando: ${fileName ?? "imagem enviada"} (imagem)`
      : kind === "video"
        ? `Usando: ${fileName ?? "vídeo enviado"} (vídeo, com som)`
        : "Usando: tela padrão da Corneta";

  const opt = (active: boolean) =>
    cn(
      "flex-1 rounded-md border-2 px-3 py-2 font-display text-sm font-bold transition-colors disabled:opacity-50",
      active
        ? "border-brass bg-brass/10 text-brass"
        : "border-border text-ink-muted hover:border-brass/60",
    );

  return (
    <div className="flex items-start gap-4 py-3.5">
      {/* Mesmo formato 16:9 dos previews de SecurityFeature — é isso que vai pro ar. */}
      {preview && (
        <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
          <img
            src={`data:image/jpeg;base64,${preview}`}
            alt="Prévia da tela do JÁ VOLTO"
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-sm font-semibold text-ink-muted">
          Tela do “JÁ VOLTO”
        </span>
        <div className="flex gap-2">
          <button
            className={opt(kind === "auto")}
            disabled={busy}
            onClick={useDefault}
          >
            Padrão (gerada)
          </button>
          <button
            className={opt(kind === "image" || kind === "video")}
            disabled={busy}
            onClick={pick}
          >
            Usar arquivo meu (imagem ou vídeo)
          </button>
        </div>
        <span className="text-xs font-semibold text-ink-faint">
          {current} — entra no ar quando o sinal cai. Vídeo toca em loop e pode
          ter som.
        </span>
      </div>
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
/** Sub-painel dos parâmetros de uma feature: acento de latão à esquerda + fundo sutil, colado
 *  logo abaixo do toggle. Renderizado só quando a feature está ligada — deixa claro que aquilo
 *  pertence à feature acima (em vez de virar uma linha solta na lista). */
function SubSettings({ children }: { children: ReactNode }) {
  return (
    <div className="-mt-1 mb-3 ml-1 rounded-md border-l-2 border-brass/30 bg-surface-2/40 px-3">
      {children}
    </div>
  );
}

/** Prévia do guardião de áudio: um medidor com a agulha na zona-alvo (verde). */
function LoudnessPreview() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-2 px-2.5">
      <div className="relative h-2.5 w-4/5 overflow-hidden rounded-sm bg-night">
        <div className="absolute inset-y-0 left-[45%] right-[25%] bg-ok/40" />
        <div className="absolute inset-y-0 left-[58%] w-1 rounded-sm bg-ok" />
      </div>
      <AudioLines
        className="absolute right-1.5 top-1.5 size-3.5 text-brass"
        strokeWidth={2.4}
      />
    </div>
  );
}

/** Alvo de volume (LUFS) do normalizador: presets comuns. -14 é o padrão de Twitch/YouTube. */
function LoudnessTarget() {
  const target = useStore((s) => s.config!.settings.loudnessTargetLufs);
  const setSettings = useStore((s) => s.setSettings);
  const opts = [
    { v: -14, label: "-14 · padrão (Twitch/YT)" },
    { v: -16, label: "-16 · mais suave" },
    { v: -18, label: "-18 · podcast/voz" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 py-3.5">
      <span className="text-xs font-semibold text-ink-faint">
        Alvo de volume
      </span>
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => setSettings({ loudnessTargetLufs: o.v })}
          className={cn(
            "rounded-md border-2 px-2.5 py-1 text-xs font-bold transition-colors",
            target === o.v
              ? "border-brass bg-brass/10 text-brass"
              : "border-border text-ink-muted hover:border-brass/60",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
          "relative aspect-video w-32 shrink-0 overflow-hidden rounded-md transition",
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
  desc?: string;
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
        {desc && (
          <div className="mt-0.5 max-w-md text-sm text-ink-muted">{desc}</div>
        )}
      </div>
      {children}
    </div>
  );
}
