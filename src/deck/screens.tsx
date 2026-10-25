import { useState, type FormEvent, type ReactNode } from "react";
import {
  Check,
  Copy,
  Eye,
  LoaderCircle,
  LogOut,
  MapPin,
  Monitor,
  QrCode,
  RefreshCw,
  Shield,
  Smartphone,
  SunMedium,
  Timer,
  Unlink,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { strong, useI18n } from "../lib/i18n";
import { hms, marksText, type DeckState } from "./model";
import { copyText } from "./ui";

function Full({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <main className={`full ${className}`}>{children}</main>;
}

function Badge({
  tone,
  children,
}: {
  tone?: "muted" | "bad";
  children: ReactNode;
}) {
  return <span className={`badge-ic ${tone ?? ""}`}>{children}</span>;
}

function Checks({
  items,
}: {
  items: { icon: ReactNode; title: string; body: string }[];
}) {
  return (
    <ul className="checks">
      {items.map((item) => (
        <li key={item.title}>
          <span className="tile">{item.icon}</span>
          <span>
            <b>{item.title}</b>
            <small>{item.body}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

const where = (t: ReturnType<typeof useI18n>["t"]) => t("deck.where");

export function Welcome() {
  const { t } = useI18n();
  return (
    <Full>
      <Badge>
        <QrCode className="ic" aria-hidden />
      </Badge>
      <h1 className="h2">{t("deck.welcome.title")}</h1>
      <p>{strong(t, "deck.welcome.lede", { where: where(t) })}</p>
      <Checks
        items={[
          {
            icon: <Wifi className="ic" aria-hidden />,
            title: t("deck.welcome.wifi"),
            body: t("deck.welcome.wifiBody"),
          },
          {
            icon: <QrCode className="ic" aria-hidden />,
            title: t("deck.welcome.scan"),
            body: t("deck.welcome.scanBody"),
          },
        ]}
      />
    </Full>
  );
}

export function NameStep({
  initial,
  linked,
  onSubmit,
}: {
  initial: string;
  linked: boolean;
  onSubmit: (name: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(name.trim());
  };
  return (
    <Full>
      <form className="fill-form" onSubmit={submit} autoComplete="off">
        <Badge>
          <Smartphone className="ic" aria-hidden />
        </Badge>
        <h1 className="h2">{t("deck.name.title")}</h1>
        <p>{t("deck.name.lede")}</p>
        <div className="field">
          <label htmlFor="deck-device-name">{t("deck.name.field")}</label>
          <input
            id="deck-device-name"
            className="input"
            value={name}
            maxLength={32}
            enterKeyHint="go"
            placeholder={t("deck.name.placeholder")}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="help">{t("deck.name.help")}</span>
        </div>
        <div className="push" />
        <p className="fine center" aria-live="polite">
          {linked ? t("deck.name.found") : t("deck.name.looking")}
        </p>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          data-on-brass
        >
          {t("deck.name.go")}
        </button>
      </form>
    </Full>
  );
}

export function Searching() {
  const { t } = useI18n();
  return (
    <Full>
      <Badge tone="muted">
        <LoaderCircle className="ic spin" aria-hidden />
      </Badge>
      <h1 className="h2" aria-live="polite">
        {t("deck.searching.title")}
      </h1>
      <p>{t("deck.searching.lede")}</p>
    </Full>
  );
}

export function Code({
  code,
  onCancel,
}: {
  code: string;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Full>
      <h1 className="h2 top">{t("deck.code.title")}</h1>
      <p>{strong(t, "deck.code.lede", { allow: t("deck.prompt.allow") })}</p>
      <div
        className="code"
        role="img"
        aria-label={t("deck.code.label", { code: code.split("").join(" ") })}
      >
        {code.split("").map((digit, i) => (
          <span key={i} aria-hidden>
            {digit}
          </span>
        ))}
      </div>
      <div className="waiting" role="status">
        <LoaderCircle className="ic spin" aria-hidden />
        {t("deck.code.waiting")}
      </div>
      <div className="push" />
      <button
        type="button"
        className="btn btn-ghost btn-block"
        onClick={onCancel}
      >
        {t("deck.code.cancel")}
      </button>
    </Full>
  );
}

export function Paired({ pc, onOpen }: { pc: string; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <Full>
      <Badge>
        <Check className="ic" aria-hidden />
      </Badge>
      <h1 className="h2">{t("deck.paired.title")}</h1>
      <p>{strong(t, "deck.paired.lede", { pc })}</p>
      <Checks
        items={[
          {
            icon: <MapPin className="ic" aria-hidden />,
            title: t("deck.paired.keys"),
            body: t("deck.paired.keysBody"),
          },
          {
            icon: <Eye className="ic" aria-hidden />,
            title: t("deck.paired.see"),
            body: t("deck.paired.seeBody"),
          },
          {
            icon: <Shield className="ic" aria-hidden />,
            title: t("deck.how.secrets"),
            body: t("deck.paired.secretsBody"),
          },
          {
            icon: <SunMedium className="ic" aria-hidden />,
            title: t("deck.how.screen"),
            body: t("deck.how.screenBody"),
          },
        ]}
      />
      <div className="push" />
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={onOpen}
        data-on-brass
      >
        {t("deck.paired.open")}
      </button>
    </Full>
  );
}

/** Ends of the road that need a fresh QR from the PC. */
export function Stop({
  kind,
  message,
}: {
  kind:
    | "refused"
    | "invalid"
    | "expired"
    | "lost"
    | "full"
    | "unknown"
    | "revoked"
    | "forgotten";
  message?: string;
}) {
  const { t } = useI18n();
  const look = {
    refused: {
      icon: <X className="ic" aria-hidden />,
      title: t("deck.refused.title"),
      body: t("deck.refused.lede"),
    },
    invalid: {
      icon: <QrCode className="ic" aria-hidden />,
      title: t("deck.invalid.title"),
      body: t("deck.invalid.lede"),
    },
    expired: {
      icon: <Timer className="ic" aria-hidden />,
      title: t("deck.expired.title"),
      body: t("deck.expired.lede"),
    },
    lost: {
      icon: <WifiOff className="ic" aria-hidden />,
      title: t("deck.lost.title"),
      body: t("deck.lost.lede"),
    },
    full: {
      icon: <Users className="ic" aria-hidden />,
      title: t("deck.full.title"),
      body: message ?? "",
    },
    unknown: {
      icon: <Unlink className="ic" aria-hidden />,
      title: t("deck.unknown.title"),
      body: t("deck.unknown.lede"),
    },
    revoked: {
      icon: <Unlink className="ic" aria-hidden />,
      title: t("deck.revoked.title"),
      body: t("deck.revoked.lede"),
    },
    forgotten: {
      icon: <LogOut className="ic" aria-hidden />,
      title: t("deck.forgotten.title"),
      body: t("deck.forgotten.lede"),
    },
  }[kind];
  return (
    <Full>
      <Badge tone={kind === "forgotten" ? "muted" : "bad"}>{look.icon}</Badge>
      <h1 className="h2">{look.title}</h1>
      <p>{look.body}</p>
      {kind !== "full" && <p>{strong(t, "deck.again", { where: where(t) })}</p>}
    </Full>
  );
}

export function NotFound({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  const { t } = useI18n();
  return (
    <Full>
      <Badge tone="bad">
        <WifiOff className="ic" aria-hidden />
      </Badge>
      <h1 className="h2">{t("deck.notfound.title")}</h1>
      <p>{t("deck.notfound.lede")}</p>
      <Checks
        items={[
          {
            icon: <Monitor className="ic" aria-hidden />,
            title: t("deck.notfound.open"),
            body: t("deck.notfound.openBody"),
          },
          {
            icon: <Wifi className="ic" aria-hidden />,
            title: t("deck.notfound.wifi"),
            body: t("deck.notfound.wifiBody"),
          },
          {
            icon: <Users className="ic" aria-hidden />,
            title: t("deck.notfound.guest"),
            body: t("deck.notfound.guestBody"),
          },
        ]}
      />
      <div className="push" />
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={onRetry}
        data-on-brass
        aria-busy={retrying || undefined}
      >
        {retrying ? (
          <LoaderCircle className="ic spin" aria-hidden />
        ) : (
          <RefreshCw className="ic" aria-hidden />
        )}
        {retrying ? t("deck.notfound.trying") : t("deck.notfound.retry")}
      </button>
    </Full>
  );
}

export function Summary({
  session,
  onDone,
  onCopied,
}: {
  session: DeckState["session"];
  onDone: () => void;
  onCopied: (ok: boolean) => void;
}) {
  const { t, tp, fmt } = useI18n();
  const length = (session.endedAt ?? 0) - (session.startedAt ?? 0);
  const marks = session.marks;
  const fallback = t("deck.summary.moment");
  return (
    <Full className="summary">
      <h1 className="sum-title">
        {t("deck.summary.title")}
        <br />
        {t("deck.summary.length", { time: fmt.dur(length / 1000) })}
      </h1>
      <p className="sum-lede">
        {session.peak > 0
          ? strong(
              t,
              marks.length ? "deck.summary.ledeMarks" : "deck.summary.lede",
              {
                peak: tp("deck.summary.people", session.peak, {
                  n: fmt.num(session.peak),
                }),
                marks: tp("deck.summary.marks", marks.length, {
                  n: marks.length,
                }),
              },
            )
          : marks.length
            ? strong(t, "deck.summary.ledeOnlyMarks", {
                marks: tp("deck.summary.marks", marks.length, {
                  n: marks.length,
                }),
              })
            : t("deck.summary.ledeQuiet")}
      </p>
      <h2 className="sec flush">{t("deck.summary.moments")}</h2>
      {marks.length ? (
        <ol className="marks">
          {marks.map((m, i) => (
            <li key={i} className="row">
              <span className="when tnum">{hms(m.at)}</span>
              <span className="main">
                <b>{m.label.trim() || fallback}</b>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="group">
          <div className="row">
            <span className="tile">
              <MapPin className="ic" aria-hidden />
            </span>
            <span className="main">
              <b>{t("deck.summary.none")}</b>
              <small>{t("deck.summary.noneHint")}</small>
            </span>
          </div>
        </div>
      )}
      <p className="fine top-gap">{t("deck.summary.report")}</p>
      <div className="push" />
      <div className="actions">
        {marks.length > 0 && (
          <button
            type="button"
            className="btn btn-subtle btn-block"
            onClick={() => onCopied(copyText(marksText(marks, fallback)))}
          >
            <Copy className="ic" aria-hidden />
            {t("deck.summary.copy")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={onDone}
          data-on-brass
        >
          {t("deck.summary.done")}
        </button>
      </div>
    </Full>
  );
}
