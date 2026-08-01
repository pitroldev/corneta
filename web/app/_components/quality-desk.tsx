import type { T } from "@/lib/i18n";
import { PlatformGlyph } from "./decor";
import { Switch } from "./switch";
import { BenefitCopy, BenefitNote, Checklist, DemoLabel, Tag } from "./ui";
import { CheckIcon, CropIcon, InfoIcon } from "./icons";

// Mesa de qualidade: os três modos do app (t("quality.mode.lata.title"), t("quality.mode.esperto.title"), t("quality.mode.caprichado.title"))
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

// Os modos carregam copy (título, resumo, veredito), então a lista se monta
// com o `t` do idioma — array de módulo não enxerga o `t` do componente.
const modesFor = (t: T) =>
  [
    {
      id: "lata",
      title: "Na lata",
      tag: t("quality.mode.lata.tag"),
      lead: t("quality.mode.lata.lead"),
      rows: [
        {
          id: "twitch",
          name: "Twitch",
          detail: "1080p60 · 3000 kbps",
          tag: t("quality.desk.tag.copy"),
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
          detail: t("quality.mode.lata.row.tiktok.detail"),
          tag: t("quality.desk.tag.unusable"),
          tone: "warn",
        },
      ] as Row[],
      upload: t("quality.mode.lata.upload"),
      encodes: t("quality.mode.lata.encodes"),
      load: t("quality.mode.lata.load"),
      verdict: t("quality.mode.lata.verdict"),
    },
    {
      id: "esperto",
      title: "Esperto",
      tag: t("quality.mode.esperto.tag"),
      lead: t("quality.mode.esperto.lead"),
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
          tag: t("quality.desk.tag.convert"),
        },
      ] as Row[],
      upload: t("quality.mode.esperto.upload"),
      encodes: t("quality.mode.esperto.encodes"),
      load: "~2%",
      verdict: t("quality.mode.esperto.verdict"),
    },
    {
      id: "caprichado",
      title: "Caprichado",
      tag: t("quality.mode.caprichado.tag"),
      lead: t("quality.mode.caprichado.lead"),
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
      upload: t("quality.mode.caprichado.upload"),
      encodes: t("quality.mode.caprichado.encodes"),
      load: "~40%",
      verdict: t("quality.mode.caprichado.verdict"),
    },
  ] as const;

export function QualityDesk({ t }: { t: T }) {
  return (
    <Switch
      label={t("quality.desk.tablist.label")}
      items={modesFor(t).map((mode) => ({
        id: mode.id,
        title: mode.title,
        hint: mode.tag,
        panel: <ModePanel t={t} mode={mode} />,
      }))}
    />
  );
}

const SUMMARY_CELL =
  "border-t-2 border-brass/55 bg-surface-2 px-[11px] py-[9px] " +
  "[&>span]:block [&>span]:text-[0.55rem] [&>span]:font-extrabold [&>span]:tracking-[0.08em] [&>span]:text-faint-raised [&>span]:uppercase " +
  "[&>strong]:mt-0.5 [&>strong]:block [&>strong]:font-display [&>strong]:text-[1.02rem] [&>strong]:font-extrabold [&>strong]:tabular-nums";

function ModePanel({
  t,
  mode,
}: {
  t: T;
  mode: ReturnType<typeof modesFor>[number];
}) {
  return (
    <div>
      <p className="mb-[18px] max-w-[54ch] text-base leading-[1.6] font-medium text-muted">
        {mode.lead}
      </p>

      <div className="rounded-xl bg-surface p-5 shadow-pop-lg">
        <DemoLabel>
          <span>{t("quality.desk.demolabel.platforms")}</span>
          <span>{t("quality.desk.demolabel.estimate")}</span>
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
            <span>{t("quality.desk.summary.upload")}</span>
            <strong>{mode.upload}</strong>
          </div>
          <div className={SUMMARY_CELL}>
            <span>{t("quality.desk.summary.encodes")}</span>
            <strong>{mode.encodes}</strong>
          </div>
          <div className={SUMMARY_CELL}>
            <span>{t("quality.desk.summary.load")}</span>
            <strong>{mode.load}</strong>
          </div>
        </div>
      </div>

      {/* O ícone é absoluto pra o texto correr embaixo dele sem virar item de
          flex — senão o parágrafo quebra numa coluna estreita. */}
      <p className="relative mt-3.5 pl-[26px] text-[0.8rem] leading-[1.5] font-[550] text-muted [&>svg]:absolute [&>svg]:top-0.5 [&>svg]:left-0 [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:text-brass">
        <InfoIcon />
        {mode.verdict}
      </p>
    </div>
  );
}

export function VerticalCopy({ t }: { t: T }) {
  return (
    <BenefitCopy
      tone="dark"
      icon={<CropIcon />}
      title={t("quality.vertical.title")}
    >
      <p>{t("quality.vertical.body")}</p>
      <Checklist>
        <li>
          <CheckIcon /> {t("quality.vertical.check.crop")}
        </li>
        <li>
          <CheckIcon /> {t("quality.vertical.check.rtmp")}
        </li>
      </Checklist>
      <BenefitNote>
        <InfoIcon /> {t("quality.vertical.note")}
      </BenefitNote>
    </BenefitCopy>
  );
}
