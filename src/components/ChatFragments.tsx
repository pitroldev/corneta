import { useState, type ReactNode } from "react";
import { useT } from "../lib/i18n";
import type { ChatFragment } from "../lib/types";
import { cn, openExternal } from "../lib/utils";

/** An image that falls back to its text when the platform's CDN does not answer. */
function FragmentImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span>{alt}</span>;
  return (
    <img
      src={src}
      alt={alt}
      title={alt}
      loading="lazy"
      className={className}
      onError={() => setBroken(true)}
    />
  );
}

function piece(
  f: ChatFragment,
  key: number,
  images: boolean,
  openLabel: (url: string) => string,
): ReactNode {
  const text = f.text ?? "";
  switch (f.kind) {
    case "emote":
      return images && f.url ? (
        <FragmentImage
          key={key}
          src={f.url}
          alt={text}
          className={cn(
            "mx-0.5 inline-block w-auto align-middle",
            f.giant ? "h-20" : "h-[1.4em]",
          )}
        />
      ) : (
        <span key={key}>{text}</span>
      );
    case "gif":
    case "sticker":
      return images && f.url ? (
        <FragmentImage
          key={key}
          src={f.url}
          alt={text}
          className="my-0.5 inline-block max-h-28 max-w-full rounded-md align-middle"
        />
      ) : (
        <span key={key}>{text}</span>
      );
    case "link":
      return f.url ? (
        <a
          key={key}
          href={f.url}
          title={openLabel(f.url)}
          onClick={(e) => {
            e.preventDefault();
            void openExternal(f.url!);
          }}
          className="break-all text-info underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          {text}
        </a>
      ) : (
        <span key={key}>{text}</span>
      );
    case "mention":
      return (
        <span key={key} className="font-semibold text-ink">
          {text}
        </span>
      );
    case "cheer":
      return (
        <span
          key={key}
          className="inline-flex items-center gap-0.5 font-bold"
          style={f.color ? { color: f.color } : undefined}
        >
          {images && f.url ? (
            <FragmentImage
              src={f.url}
              alt={text}
              className="inline-block h-[1.4em] w-auto align-middle"
            />
          ) : null}
          {images && f.url ? (f.amount ?? text) : text}
        </span>
      );
    default:
      return <span key={key}>{text}</span>;
  }
}

/** Renders a message's fragments; zero-width emotes stack over the emote before them. */
export function ChatFragments({
  fragments,
  images = true,
}: {
  fragments: readonly ChatFragment[];
  /** Off shows emotes, GIFs and stickers as their text. */
  images?: boolean;
}) {
  const t = useT();
  const openLabel = (url: string) => t("chat.feed.openLink", { url });
  const out: ReactNode[] = [];
  for (let i = 0; i < fragments.length; i++) {
    const f = fragments[i];
    const stack: number[] = [];
    while (
      images &&
      f.kind === "emote" &&
      fragments[i + stack.length + 1]?.overlay
    )
      stack.push(i + stack.length + 1);
    if (stack.length === 0) {
      out.push(piece(f, i, images, openLabel));
      continue;
    }
    out.push(
      <span key={i} className="inline-grid align-middle">
        {[i, ...stack].map((j) => (
          <span
            key={j}
            className="col-start-1 row-start-1 grid place-items-center"
          >
            {piece(fragments[j], j, images, openLabel)}
          </span>
        ))}
      </span>,
    );
    i += stack.length;
  }
  return <>{out}</>;
}
