import { PlatformGlyph } from "./decor";
import { Switch } from "./switch";
import { CheckIcon, CropIcon, InfoIcon } from "./icons";

// Mesa de qualidade: os três modos do app ("Na lata", "Esperto", "Caprichado")
// com o que cada destino recebe. Os números saem da mesma conta do app
// (src/lib/estimates.ts + os presets de src/lib/platforms.ts):
// cópia usa o menor bitrate da lista (menor denominador comum) e recodificação
// usa o recomendado da plataforma. Twitch 6000/160 · YouTube 9000/192 ·
// Kick 6000/160 · TikTok 720×1280 3000/128.

type Row = {
  id: "twitch" | "youtube" | "kick" | "tiktok";
  name: string;
  detail: string;
  tag: string;
  tone?: "copy" | "warn";
};

const MODES = [
  {
    id: "lata",
    title: "Na lata",
    tag: "Mais leve",
    lead: "A mesma imagem vai pra todas as plataformas, no mesmo padrão.",
    rows: [
      {
        id: "twitch",
        name: "Twitch",
        detail: "1080p60 · 3000 kbps",
        tag: "Cópia",
        tone: "copy",
      },
      {
        id: "youtube",
        name: "YouTube",
        detail: "1080p60 · 3000 kbps",
        tag: "Cópia",
        tone: "copy",
      },
      {
        id: "kick",
        name: "Kick",
        detail: "1080p60 · 3000 kbps",
        tag: "Cópia",
        tone: "copy",
      },
      {
        id: "tiktok",
        name: "TikTok",
        detail: "recebe vídeo deitado",
        tag: "Não serve",
        tone: "warn",
      },
    ] as Row[],
    upload: "12,6 Mb/s",
    encodes: "nenhuma",
    load: "quase zero",
    verdict:
      "O TikTok é o mais fraco da lista, então todo mundo cai pro bitrate dele — e ainda recebe vídeo deitado. A Corneta mostra esse estrago antes de você entrar no ar, com o conserto a um clique.",
  },
  {
    id: "esperto",
    title: "Esperto",
    tag: "Recomendado",
    lead: "Ajusta cada plataforma só onde precisa. Decide sozinho.",
    rows: [
      {
        id: "twitch",
        name: "Twitch",
        detail: "1080p60 · 6000 kbps",
        tag: "Cópia",
        tone: "copy",
      },
      {
        id: "youtube",
        name: "YouTube",
        detail: "1080p60 · 6000 kbps",
        tag: "Cópia",
        tone: "copy",
      },
      {
        id: "kick",
        name: "Kick",
        detail: "1080p60 · 6000 kbps",
        tag: "Cópia",
        tone: "copy",
      },
      {
        id: "tiktok",
        name: "TikTok",
        detail: "720×1280 · 3000 kbps",
        tag: "Converte",
      },
    ] as Row[],
    upload: "21,6 Mb/s",
    encodes: "1 (na placa)",
    load: "~2%",
    verdict:
      "Uma conversão só, pro vertical. O resto vai na cópia: sua máquina quase não sente e ninguém perde qualidade no caminho.",
  },
  {
    id: "caprichado",
    title: "Caprichado",
    tag: "Máx. qualidade",
    lead: "Melhor imagem possível pra cada plataforma, mas é o mais pesado.",
    rows: [
      {
        id: "twitch",
        name: "Twitch",
        detail: "1080p60 · 6000 kbps",
        tag: "Converte",
      },
      {
        id: "youtube",
        name: "YouTube",
        detail: "1080p60 · 9000 kbps",
        tag: "Converte",
      },
      {
        id: "kick",
        name: "Kick",
        detail: "1080p60 · 6000 kbps",
        tag: "Converte",
      },
      {
        id: "tiktok",
        name: "TikTok",
        detail: "720×1280 · 3000 kbps",
        tag: "Converte",
      },
    ] as Row[],
    upload: "24,6 Mb/s",
    encodes: "4 (na placa)",
    load: "~40%",
    verdict:
      "O YouTube aproveita os 9000 kbps que ele aguenta e cada plataforma recebe a imagem ideal — mas a conta de internet e de placa sobe junto. Você vê essa soma antes do BORA.",
  },
] as const;

export function QualityDesk() {
  return (
    <Switch
      label="Modos de qualidade"
      items={MODES.map((mode) => ({
        id: mode.id,
        title: mode.title,
        hint: mode.tag,
        panel: <ModePanel mode={mode} />,
      }))}
    />
  );
}

function ModePanel({ mode }: { mode: (typeof MODES)[number] }) {
  return (
    <div>
      <p className="mode-lead">{mode.lead}</p>

      <div className="mode-board">
        <div className="demo-label">
          <span>4 plataformas ligadas</span>
          <span>estimativa do app</span>
        </div>

        <div className="mode-rows">
          {mode.rows.map((row) => (
            <div className="mode-row" key={row.id}>
              <PlatformGlyph id={row.id} />
              <div>
                <strong>{row.name}</strong>
                <small>{row.detail}</small>
              </div>
              <span
                className={`tag${row.tone === "copy" ? " tag-copy" : ""}${row.tone === "warn" ? " tag-warn" : ""}`}
              >
                {row.tag}
              </span>
            </div>
          ))}
        </div>

        <div className="mode-summary">
          <div>
            <span>upload somado</span>
            <strong>{mode.upload}</strong>
          </div>
          <div>
            <span>conversões</span>
            <strong>{mode.encodes}</strong>
          </div>
          <div>
            <span>carga estimada</span>
            <strong>{mode.load}</strong>
          </div>
        </div>
      </div>

      <p className="mode-verdict">
        <InfoIcon />
        {mode.verdict}
      </p>
    </div>
  );
}

export function VerticalCopy() {
  return (
    <div className="benefit-copy">
      <span className="benefit-icon">
        <CropIcon />
      </span>
      <div>
        <h3>Sua live deitada virando vídeo em pé</h3>
        <p>
          TikTok e Instagram só aceitam vídeo em pé. Em vez de montar outra cena
          e transmitir duas vezes, a Corneta recorta um 9:16 do que já tá no ar
          — e você escolhe o enquadramento arrastando o quadro, vendo o
          resultado.
        </p>
        <ul className="checklist">
          <li>
            <CheckIcon /> Recorte 9:16 com panorâmica e zoom
          </li>
          <li>
            <CheckIcon /> Serve pra qualquer destino RTMP vertical
          </li>
        </ul>
        <span className="benefit-note">
          <InfoIcon /> TikTok e Instagram seguem experimentais: entrar neles
          depende de liberação da própria plataforma.
        </span>
      </div>
    </div>
  );
}
