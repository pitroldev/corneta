import { PlatformGlyph } from "./decor";
import { Switch } from "./switch";
import { BenefitCopy, BenefitNote, Checklist, DemoLabel, Tag } from "./ui";
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

const SUMMARY_CELL =
  "border-t-2 border-brass/55 bg-surface-2 px-[11px] py-[9px] " +
  "[&>span]:block [&>span]:text-[0.55rem] [&>span]:font-extrabold [&>span]:tracking-[0.08em] [&>span]:text-faint-raised [&>span]:uppercase " +
  "[&>strong]:mt-0.5 [&>strong]:block [&>strong]:font-display [&>strong]:text-[1.02rem] [&>strong]:font-extrabold [&>strong]:tabular-nums";

function ModePanel({ mode }: { mode: (typeof MODES)[number] }) {
  return (
    <div>
      <p className="mb-[18px] max-w-[54ch] text-base leading-[1.6] font-medium text-muted">
        {mode.lead}
      </p>

      <div className="rounded-xl bg-surface p-5 shadow-pop-lg">
        <DemoLabel>
          <span>4 plataformas ligadas</span>
          <span>estimativa do app</span>
        </DemoLabel>

        <div className="flex flex-col gap-2">
          {mode.rows.map((row) => (
            <div
              className="grid grid-cols-[34px_minmax(0,1fr)_auto] max-[760px]:grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-[11px] rounded-md bg-surface-2 px-[11px] py-[9px]"
              key={row.id}
            >
              <PlatformGlyph id={row.id} />
              <div>
                <strong className="block font-display text-[0.9rem] leading-[1.1] font-bold">
                  {row.name}
                </strong>
                <small className="mt-0.5 block text-[0.66rem] font-[550] text-faint-raised">
                  {row.detail}
                </small>
              </div>
              <Tag tone={row.tone}>{row.tag}</Tag>
            </div>
          ))}
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-2 max-[760px]:grid-cols-2 max-[760px]:[&>div:last-child]:col-span-2">
          <div className={SUMMARY_CELL}>
            <span>upload somado</span>
            <strong>{mode.upload}</strong>
          </div>
          <div className={SUMMARY_CELL}>
            <span>conversões</span>
            <strong>{mode.encodes}</strong>
          </div>
          <div className={SUMMARY_CELL}>
            <span>carga estimada</span>
            <strong>{mode.load}</strong>
          </div>
        </div>
      </div>

      {/* O ícone é absoluto pra o texto correr embaixo dele sem virar item de
          flex — senão o parágrafo quebra numa coluna estreita. */}
      <p className="relative mt-3.5 pl-[26px] text-[0.8rem] leading-[1.5] font-[550] text-muted [&>svg]:absolute [&>svg]:top-0.5 [&>svg]:left-0 [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:fill-current [&>svg]:text-brass">
        <InfoIcon />
        {mode.verdict}
      </p>
    </div>
  );
}

export function VerticalCopy() {
  return (
    <BenefitCopy
      tone="dark"
      icon={<CropIcon />}
      title="Sua live deitada virando vídeo em pé"
    >
      <p>
        TikTok e Instagram só aceitam vídeo em pé. Em vez de montar outra cena e
        transmitir duas vezes, a Corneta recorta um 9:16 do que já tá no ar — e
        você escolhe o enquadramento arrastando o quadro, vendo o resultado.
      </p>
      <Checklist>
        <li>
          <CheckIcon /> Recorte 9:16 com panorâmica e zoom
        </li>
        <li>
          <CheckIcon /> Serve pra qualquer destino RTMP vertical
        </li>
      </Checklist>
      <BenefitNote>
        <InfoIcon /> TikTok e Instagram seguem experimentais: entrar neles
        depende de liberação da própria plataforma.
      </BenefitNote>
    </BenefitCopy>
  );
}
