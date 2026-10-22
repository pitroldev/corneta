import { Pin, Vote } from "lucide-react";
import { ChatFragments } from "../../components/ChatFragments";
import { PlatformGlyph } from "../../components/ui";
import { useI18n, useT } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { chatSideKey, type ChatSide } from "../../lib/store/types";
import type { ChatModes, ChatPlatform, ChatPoll } from "../../lib/types";

/** Pinned messages and running polls of the visible sources, above the feed. */
export function PinnedAndPolls({
  platformFilter,
  images,
}: {
  platformFilter: Record<ChatPlatform, boolean> | null;
  images: boolean;
}) {
  const side = useStore((s) => s.chatSide);
  const shown = Object.values(side).filter(
    (s) =>
      (s.pin || s.poll) &&
      (!platformFilter || platformFilter[s.platform as ChatPlatform]),
  );
  if (shown.length === 0) return null;
  return (
    <div className="flex max-h-36 shrink-0 flex-col gap-1 overflow-y-auto border-b border-border-soft p-1.5">
      {shown.map((s) => (
        <SideEntries
          key={chatSideKey(s.platform, s.source)}
          side={s}
          images={images}
        />
      ))}
    </div>
  );
}

function SideEntries({ side, images }: { side: ChatSide; images: boolean }) {
  const t = useT();
  return (
    <>
      {side.pin && (
        <div className="flex items-start gap-2 rounded-md bg-surface-2 px-2 py-1 text-xs">
          <Pin className="mt-0.5 size-3.5 shrink-0 text-brass" aria-hidden />
          <PlatformGlyph id={side.platform as ChatPlatform} size={15} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              {t("chat.pin.label")}
              {side.pin.note ? ` · ${side.pin.note}` : ""}
            </div>
            <span
              className="font-bold"
              style={side.pin.color ? { color: side.pin.color } : undefined}
            >
              {side.pin.author}
            </span>{" "}
            <span className="break-words text-ink-muted">
              <ChatFragments fragments={side.pin.fragments} images={images} />
            </span>
          </div>
        </div>
      )}
      {side.poll && <PollCard platform={side.platform} poll={side.poll} />}
    </>
  );
}

function PollCard({ platform, poll }: { platform: string; poll: ChatPoll }) {
  const { t, tp } = useI18n();
  const total =
    poll.total ?? poll.options.reduce((sum, o) => sum + (o.votes ?? 0), 0);
  const share = (o: ChatPoll["options"][number]) =>
    o.percent ?? (total > 0 && o.votes != null ? (o.votes / total) * 100 : 0);
  return (
    <div className="rounded-md bg-surface-2 px-2 py-1 text-xs">
      <div className="flex items-center gap-2">
        <Vote className="size-3.5 shrink-0 text-info" aria-hidden />
        <PlatformGlyph id={platform as ChatPlatform} size={15} />
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          {t(
            poll.kind === "prediction"
              ? "chat.poll.prediction"
              : "chat.poll.poll",
          )}
          {poll.ended ? ` · ${t("chat.poll.ended")}` : ""}
        </span>
        {total > 0 && (
          <span className="ml-auto text-[11px] text-ink-faint">
            {tp("chat.poll.votes", total)}
          </span>
        )}
      </div>
      <div className="font-bold">{poll.question}</div>
      <div className="mt-0.5 flex flex-col gap-0.5">
        {poll.options.map((o, i) => {
          const pct = Math.round(share(o));
          return (
            <div
              key={i}
              className="relative overflow-hidden rounded bg-surface-3"
            >
              <div
                className="absolute inset-y-0 left-0 bg-info/25"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <div className="relative flex justify-between gap-2 px-1.5 text-[11px] leading-4">
                <span className="truncate">{o.label}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The restrictions a source reports, as small chips beside its status. */
export function ModeChips({ modes }: { modes?: ChatModes }) {
  const t = useT();
  if (!modes) return null;
  const chips: string[] = [];
  if (modes.emoteOnly) chips.push(t("chat.modes.emoteOnly"));
  if (modes.subsOnly) chips.push(t("chat.modes.subsOnly"));
  if (modes.membersOnly) chips.push(t("chat.modes.membersOnly"));
  if (modes.uniqueChat) chips.push(t("chat.modes.uniqueChat"));
  if (modes.slow && modes.slow > 0)
    chips.push(t("chat.modes.slow", { n: modes.slow }));
  if (modes.followersOnly != null && modes.followersOnly >= 0)
    chips.push(
      modes.followersOnly > 0
        ? t("chat.modes.followersOnlyFor", { n: modes.followersOnly })
        : t("chat.modes.followersOnly"),
    );
  if (chips.length === 0) return null;
  return (
    <>
      {chips.map((c) => (
        <span
          key={c}
          className="rounded-sm bg-surface-3 px-1.5 text-[10px] font-semibold uppercase leading-5 tracking-wide text-ink-faint"
        >
          {c}
        </span>
      ))}
    </>
  );
}
