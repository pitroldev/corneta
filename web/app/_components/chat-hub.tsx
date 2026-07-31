import type { MessageKey, T } from "@/lib/i18n";
import {
  AlertsFeed,
  ChatFeed,
  OverlayScene,
  type AlertItem,
  type AlertsFeedCopy,
  type ChatFeedCopy,
  type ChatMsg,
  type OverlayCopy,
} from "./chat-live";
import { Switch } from "./switch";
import { Board, Chip, HubNote } from "./ui";
import { InfoIcon } from "./icons";

// Chat, alertas e overlay pro OBS — as três coisas que a tela de Chat do app
// faz. As abas vêm do <Switch>; os três painéis são CLIENTES, porque os três
// estão acontecendo (ver chat-live.tsx).
//
// A copy chega resolvida em objeto simples: função não atravessa a fronteira
// servidor→cliente do Next, e este arquivo é o lugar onde ela para.

/** As oito falas do feed, na ordem em que chegam. Plataformas alternadas de
 *  propósito: é a alegação da seção — três chats caindo num lugar só. */
const POOL: { key: string; platform: ChatMsg["platform"]; tone?: "mod" | "member" }[] =
  [
    { key: "1", platform: "twitch", tone: "mod" },
    { key: "2", platform: "youtube", tone: "member" },
    { key: "3", platform: "kick" },
    { key: "4", platform: "twitch" },
    { key: "5", platform: "youtube" },
    { key: "6", platform: "twitch" },
    { key: "7", platform: "kick" },
    { key: "8", platform: "youtube" },
  ];

const chatCopy = (t: T): ChatFeedCopy => ({
  label: t("protection.chat.demo.label"),
  example: t("protection.chat.demo.example"),
  pool: POOL.map((m) => ({
    name: t(`protection.chat.msg.${m.key}.name` as MessageKey),
    text: t(`protection.chat.msg.${m.key}.text` as MessageKey),
    platform: m.platform,
    badge: m.tone
      ? t(`protection.chat.msg.${m.key}.badge` as MessageKey)
      : undefined,
    badgeTone: m.tone,
  })),
  actionDelete: t("protection.chat.action.delete"),
  actionTimeout: t("protection.chat.action.timeout"),
  actionReply: t("protection.chat.action.reply"),
  removed: t("protection.chat.removed"),
  timedOut: t("protection.chat.timedOut"),
  input: t("protection.chat.input.placeholder"),
  sendAll: t("protection.chat.input.sendAll"),
  hint: t("protection.chat.hint"),
});

/** Os seis alertas que o feed cicla. `amount` só onde o alerta tem número —
 *  seguidor não tem, e inventar um seria mentira pequena e desnecessária. */
const ALERTS: AlertItem["kind"][] = [
  "follow",
  "sub",
  "raid",
  "superchat",
  "bits",
  "member",
];
const WITH_AMOUNT = new Set(["sub", "superchat", "bits", "member"]);

const alertsCopy = (t: T): AlertsFeedCopy => ({
  label: t("protection.alerts.demo.label"),
  example: t("protection.alerts.demo.example"),
  pool: ALERTS.map((kind) => ({
    kind,
    title: t(`protection.alerts.item.${kind}.title` as MessageKey),
    meta: t(`protection.alerts.item.${kind}.meta` as MessageKey),
    amount: WITH_AMOUNT.has(kind)
      ? t(`protection.alerts.item.${kind}.amount` as MessageKey)
      : kind === "raid"
        ? "42"
        : undefined,
  })),
  test: t("protection.alerts.test"),
});

const overlayCopy = (t: T): OverlayCopy => ({
  label: t("protection.overlay.demo.label"),
  example: t("protection.overlay.demo.example"),
  scene: t("protection.overlay.scene"),
  alert: t("protection.overlay.alert"),
  camera: t("protection.overlay.camera"),
  chat: [
    t("protection.overlay.chat.1"),
    t("protection.overlay.chat.2"),
    t("protection.overlay.chat.3"),
  ],
  copy: t("protection.overlay.url.copy"),
  copied: t("protection.overlay.url.copied"),
  urls: ["http://127.0.0.1:7393/alerts", "http://127.0.0.1:7393/chat"],
});

export function ChatHub({ t }: { t: T }) {
  return (
    <Switch
      label={t("protection.chat.tabs.label")}
      items={[
        {
          id: "chat",
          title: t("protection.chat.tabs.chat.title"),
          hint: t("protection.chat.tabs.chat.hint"),
          panel: (
            <div>
              <Board>
                <ChatFeed copy={chatCopy(t)} />
              </Board>
              <HubNote>
                <InfoIcon />
                <span>{t("protection.chat.note")}</span>
              </HubNote>
            </div>
          ),
        },
        {
          id: "alertas",
          title: t("protection.chat.tabs.alerts.title"),
          hint: t("protection.chat.tabs.alerts.hint"),
          panel: (
            <div>
              <Board>
                <AlertsFeed copy={alertsCopy(t)} />

                <div className="mt-3 flex flex-wrap gap-[7px]">
                  <Chip quiet>{t("protection.alerts.chip.bits")}</Chip>
                  <Chip quiet>{t("protection.alerts.chip.subgift")}</Chip>
                  <Chip quiet>{t("protection.alerts.chip.member")}</Chip>
                  <Chip quiet>{t("protection.alerts.chip.tip")}</Chip>
                  <Chip>Streamlabs</Chip>
                  <Chip>StreamElements</Chip>
                </div>
              </Board>
              <HubNote>
                <InfoIcon />
                <span>{t("protection.alerts.note")}</span>
              </HubNote>
            </div>
          ),
        },
        {
          id: "overlay",
          title: t("protection.chat.tabs.overlay.title"),
          hint: t("protection.chat.tabs.overlay.hint"),
          panel: (
            <div>
              <Board>
                <OverlayScene copy={overlayCopy(t)} />
              </Board>
              <HubNote>
                <InfoIcon />
                <span>
                  {/* Sem `<strong>` no meio: marcação dentro da frase obrigaria
                      a fatiá-la em pedaços que a tradução não recompõe na mesma
                      ordem. */}
                  {t("protection.overlay.note")}
                </span>
              </HubNote>
            </div>
          ),
        },
      ]}
    />
  );
}
