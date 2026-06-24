import { type ReactNode, useState } from "react";
import { Download, FileText, Keyboard, MonitorCog, Plug, Server, Upload } from "lucide-react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { obsIngestUrl } from "../lib/factory";
import { toast } from "../lib/toast";
import { cn } from "../lib/utils";
import { Button, Card, Input, SectionTitle, Toggle } from "../components/ui";
import { Slider } from "../components/Slider";

export function SettingsScreen() {
  const config = useStore((s) => s.config);
  const setIngest = useStore((s) => s.setIngest);
  const setSettings = useStore((s) => s.setSettings);
  const load = useStore((s) => s.load);
  if (!config) return null;
  const { ingest, settings } = config;

  const onExport = async () => {
    try {
      if (await api.exportConfig()) toast.success("Config exportada");
    } catch (e) {
      toast.error(`Falha ao exportar: ${e}`);
    }
  };
  const onImport = async () => {
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
        kicker="Ajustes da corneta"
        title="Configurações"
        subtitle="O endpoint que o OBS usa e como a Corneta se comporta."
      />

      {/* Endpoint de ingestão */}
      <Card className="mb-4">
        <h3 className="flex items-center gap-2 text-lg">
          <Server className="size-5 text-brass" /> Endpoint de ingestão (OBS)
        </h3>
        <p className="mt-1 mb-4 text-xs text-ink-faint">
          É onde o OBS publica o stream. Se mudar aqui, atualize também o OBS. A
          <strong className="text-ink-muted"> chave</strong> abaixo é local (OBS ↔ Corneta) — não confunda
          com as chaves das plataformas, que ficam no cofre.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Host">
            <Input value={ingest.host} onChange={(e) => setIngest({ host: e.target.value })} />
          </Field>
          <Field label="Porta">
            <Input
              type="number"
              value={ingest.port}
              onChange={(e) => setIngest({ port: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Aplicação (app)">
            <Input value={ingest.app} onChange={(e) => setIngest({ app: e.target.value })} />
          </Field>
          <Field label="Chave local">
            <Input value={ingest.key} onChange={(e) => setIngest({ key: e.target.value })} />
          </Field>
        </div>

        <div className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-sm">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">No OBS</span>
          <div className="mt-1 font-mono text-ink-muted" data-selectable>
            {obsIngestUrl(ingest)} <span className="text-ink-faint">· chave</span> {ingest.key}
          </div>
        </div>
      </Card>

      {/* OBS — auto-config */}
      <Card className="mb-4">
        <h3 className="flex items-center gap-2 text-lg">
          <Plug className="size-5 text-brass" /> OBS — auto-config
        </h3>
        <p className="mt-1 mb-4 text-xs text-ink-faint">
          Pro botão <strong className="text-ink-muted">“Configurar sozinho”</strong> (na tela Ao vivo)
          funcionar, ative no OBS: <strong className="text-ink-muted">Ferramentas → Configurações do
          Servidor WebSocket</strong>. Se tiver senha, cole aqui.
        </p>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
          Senha do obs-websocket (opcional)
          <Input
            type="password"
            placeholder="deixe vazio se não tiver"
            value={settings.obsPassword}
            onChange={(e) => setSettings({ obsPassword: e.target.value })}
          />
        </label>
        <div className="mt-2 border-t border-border-soft">
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

      {/* Atalho global */}
      <Card className="mb-4">
        <h3 className="mb-1 flex items-center gap-2 text-lg">
          <Keyboard className="size-5 text-brass" /> Atalho global
        </h3>
        <p className="mb-3 text-xs text-ink-faint">
          Começa/para a transmissão de qualquer lugar — mesmo com a Corneta minimizada na bandeja.
        </p>
        <ShortcutCapture
          value={settings.liveShortcut}
          onChange={(v) => {
            setSettings({ liveShortcut: v });
            void api.registerShortcut(v);
          }}
        />
      </Card>

      {/* Comportamento */}
      <Card>
        <h3 className="mb-1 flex items-center gap-2 text-lg">
          <MonitorCog className="size-5 text-brass" /> Comportamento
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
          <SettingRow
            title="Proteção contra quedas"
            desc="Se o sinal do OBS cair no meio da live, a Corneta segura a transmissão com um slate “JÁ VOLTO” nas plataformas até voltar — em vez de a live cair. (Só age depois que a transmissão já começou.)"
          >
            <Toggle
              checked={settings.brbEnabled}
              onChange={(v) => setSettings({ brbEnabled: v })}
              label="Proteção contra quedas"
            />
          </SettingRow>
          <SettingRow
            title="Auto-bitrate quando a banda aperta"
            desc="Se um destino que recodifica começar a engasgar (não dá conta do upload), a Corneta baixa o bitrate dele e sobe de volta quando estabiliza — em vez de ficar derrubando. (Só vale pra destinos em transcode.)"
          >
            <Toggle
              checked={settings.autoBitrate}
              onChange={(v) => setSettings({ autoBitrate: v })}
              label="Auto-bitrate"
            />
          </SettingRow>
          <SettingRow
            title="Guardião anti-vazamento (beta)"
            desc="Vigia os frames que estão saindo e avisa se aparecer segredo na tela — e-mail, chave de API, CPF, cartão, ou um termo da sua lista. OCR local: nada sai do PC. Pega muito, não tudo — trate como rede de segurança."
          >
            <Toggle
              checked={settings.guardianEnabled}
              onChange={(v) => setSettings({ guardianEnabled: v })}
              label="Guardião"
            />
          </SettingRow>
          {settings.guardianEnabled && (
            <div className="flex flex-col gap-3 rounded-lg border-2 border-border-soft bg-surface-2 p-4">
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-ink-muted">
                  Censurar automaticamente
                  <span className="mt-0.5 block text-xs font-normal text-ink-faint">
                    ao detectar algo grave (chave/CPF/cartão/seu dado), corta a saída pra uma tela de
                    proteção na hora. Desligado, só avisa.
                  </span>
                </span>
                <Toggle
                  checked={settings.guardianAction === "censor"}
                  onChange={(v) => setSettings({ guardianAction: v ? "censor" : "warn" })}
                  label="Censurar automaticamente"
                />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-ink-muted">
                  Tarja só na seção
                  <span className="mt-0.5 block text-xs font-normal text-ink-faint">
                    cobre só onde o segredo aparece (resto da tela continua ao vivo). Desligado, cobre
                    a tela toda com o slate.
                  </span>
                </span>
                <Toggle
                  checked={settings.guardianCensorMode === "region"}
                  onChange={(v) => setSettings({ guardianCensorMode: v ? "region" : "screen" })}
                  label="Tarja só na seção"
                />
              </label>
              <label className="flex items-center gap-4">
                <span className="text-sm font-semibold text-ink-muted">
                  Delay de proteção
                  <span className="mt-0.5 block text-xs font-normal text-ink-faint">
                    atrasa a transmissão alguns segundos pra a censura cortar{" "}
                    <strong className="text-ink-muted">antes</strong> do segredo ir pro ar
                    (preventivo). 0 = reativo (corta logo depois que aparece). Custa latência vs o
                    chat + um pouco de CPU.
                  </span>
                </span>
                <Slider
                  className="ml-auto w-40 shrink-0"
                  value={settings.protectDelaySec}
                  min={0}
                  max={10}
                  onChange={(v) => setSettings({ protectDelaySec: v })}
                  suffix="s"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-ink-muted">
                  Termos pessoais a vigiar{" "}
                  <span className="font-normal text-ink-faint">
                    (um por linha — endereço, nome real, @…)
                  </span>
                </span>
                <textarea
                  value={settings.guardianWatchlist.join("\n")}
                  onChange={(e) => setSettings({ guardianWatchlist: e.target.value.split("\n") })}
                  rows={3}
                  placeholder={"Rua das Flores, 42\nMeu Nome Real"}
                  className="resize-y rounded-md border-2 border-border bg-surface px-2 py-1.5 text-sm font-medium text-ink outline-none focus:border-brass"
                />
              </label>
            </div>
          )}
          <SettingRow title="Tema claro" desc="Troca a interface pro modo claro (papel).">
            <Toggle
              checked={settings.theme === "light"}
              onChange={(v) => setSettings({ theme: v ? "light" : "dark" })}
              label="Tema claro"
            />
          </SettingRow>
          <SettingRow
            title="Backup da config"
            desc="Exportar/importar perfis e ajustes num arquivo (as chaves não vão — ficam no cofre)."
          >
            <div className="flex gap-2">
              <Button variant="subtle" size="sm" onClick={onExport}>
                <Download className="size-4" /> Exportar
              </Button>
              <Button variant="subtle" size="sm" onClick={onImport}>
                <Upload className="size-4" /> Importar
              </Button>
            </div>
          </SettingRow>
          <SettingRow
            title="Logs"
            desc="Abre a pasta de logs — útil pra diagnosticar ou mandar pro suporte."
          >
            <Button variant="subtle" size="sm" onClick={() => void api.openLogsDir()}>
              <FileText className="size-4" /> Abrir logs
            </Button>
          </SettingRow>
        </div>
      </Card>
    </div>
  );
}

/** Captura um atalho global: clica e pressiona a combinação (exige um modificador). */
function ShortcutCapture({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
        capturing ? "border-brass text-brass" : "border-border text-ink hover:border-brass/60"
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

function SettingRow({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <div className="font-display font-bold">{title}</div>
        <div className="mt-0.5 max-w-md text-sm text-ink-muted">{desc}</div>
      </div>
      {children}
    </div>
  );
}
