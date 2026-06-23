import { type ReactNode } from "react";
import { MonitorCog, Plug, Server } from "lucide-react";
import { useStore } from "../lib/store";
import { obsIngestUrl } from "../lib/factory";
import { Card, Input, SectionTitle, Toggle } from "../components/ui";

export function SettingsScreen() {
  const config = useStore((s) => s.config);
  const setIngest = useStore((s) => s.setIngest);
  const setSettings = useStore((s) => s.setSettings);
  if (!config) return null;
  const { ingest, settings } = config;

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
        </div>
      </Card>
    </div>
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
