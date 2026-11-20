import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I18nProvider } from "../lib/i18n";
import { DeckClient, type Link } from "./client";
import {
  DeckCipher,
  PAIR_INFO,
  SESSION_INFO,
  decodeB64Url,
  deriveDirectionKeys,
  encodeB64Url,
  generateX25519KeyPair,
  x25519SharedSecret,
  type X25519KeyPair,
} from "./crypto";
import {
  appendChat,
  clearCredentials,
  forgetToken,
  guessDeviceName,
  loadStoredCredentials,
  matchesDelete,
  mentions,
  pendingToken,
  rememberToken,
  saveCredentials,
  tokenFromHash,
  type Credentials,
  type DeckChat,
  type DeckState,
  type ServerMessage,
} from "./model";
import {
  Code,
  NameStep,
  NotFound,
  Paired,
  Searching,
  Stop,
  Welcome,
} from "./screens";
import { applySavedPrefs } from "./prefs";
import { Shell, type DeckEvent } from "./Shell";

type Phase =
  | { kind: "welcome" }
  | { kind: "name"; token: string }
  | { kind: "searching" }
  | { kind: "code"; code: string }
  | { kind: "paired" }
  | { kind: "notfound" }
  | { kind: "deck" }
  | {
      kind: "stop";
      reason:
        | "refused"
        | "invalid"
        | "expired"
        | "lost"
        | "full"
        | "unknown"
        | "revoked"
        | "forgotten"
        | "repair";
      message?: string;
    };

type Intent =
  | { kind: "pair"; token: string; name: string; sent: boolean }
  | { kind: "hello"; credentials: Credentials }
  | null;

type Handshake =
  | { kind: "pair"; kp: X25519KeyPair; token: string; name: string }
  | { kind: "hello"; kp: X25519KeyPair; credentials: Credentials }
  | null;

const TEXT_ENC = new TextEncoder();

/** Failed attempts before the phone says it cannot find the PC. */
const NOT_FOUND_AFTER = 3;

/** Moves a scanned token out of the address bar, where a reload or a shared link would expose it. */
function takeToken(): string | null {
  const token = tokenFromHash(window.location.hash);
  if (!token) return null;
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
  rememberToken(window.sessionStorage, token);
  return token;
}

function initialPhase(): { phase: Phase; intent: Intent } {
  const token = takeToken() ?? pendingToken(window.sessionStorage);
  if (token) return { phase: { kind: "name", token }, intent: null };
  const stored = loadStoredCredentials(window.localStorage);
  if (stored.status === "v2")
    return {
      phase: { kind: "searching" },
      intent: { kind: "hello", credentials: stored.credentials },
    };
  if (stored.status === "legacy") {
    clearCredentials(window.localStorage);
    return { phase: { kind: "stop", reason: "repair" }, intent: null };
  }
  return { phase: { kind: "welcome" }, intent: null };
}

/** Keeps the screen on where the browser allows it; plain-http pages usually do not get it. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = () => {
      navigator.wakeLock
        .request("screen")
        .then((sentinel) => {
          if (cancelled) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}

export function DeckApp() {
  const start = useMemo(() => {
    applySavedPrefs();
    return initialPhase();
  }, []);
  const [phase, setPhase] = useState<Phase>(start.phase);
  const [state, setState] = useState<{ value: DeckState; at: number } | null>(
    null,
  );
  const [chat, setChat] = useState<DeckChat[]>([]);
  const [chatSeq, setChatSeq] = useState(0);
  const [link, setLink] = useState<Link>("connecting");
  const [failures, setFailures] = useState(0);
  const [event, setEvent] = useState<DeckEvent | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const intent = useRef<Intent>(start.intent);
  const handshake = useRef<Handshake>(null);
  const client = useRef<DeckClient | null>(null);
  const forgetting = useRef(false);
  const handles = useRef<string[]>([]);
  const eventSeq = useRef(0);
  const phaseRef = useRef(phase);
  // Socket callbacks read the phase without waiting for a render.
  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const greet = useCallback(() => {
    const current = intent.current;
    const socket = client.current;
    if (!socket || !current) return;
    if (current.kind === "hello") {
      const kp = generateX25519KeyPair();
      handshake.current = {
        kind: "hello",
        kp,
        credentials: current.credentials,
      };
      socket.sendPlain({
        type: "hello-init",
        v: 2,
        device: current.credentials.device,
        pub: encodeB64Url(kp.publicKey),
      });
    } else if (!current.sent) {
      const kp = generateX25519KeyPair();
      handshake.current = {
        kind: "pair",
        kp,
        token: current.token,
        name: current.name,
      };
      if (
        socket.sendPlain({
          type: "pair-init",
          pub: encodeB64Url(kp.publicKey),
        })
      ) {
        current.sent = true;
        forgetToken(window.sessionStorage);
      }
    }
  }, []);

  const finish = useCallback(
    (reason: Extract<Phase, { kind: "stop" }>["reason"], message?: string) => {
      intent.current = null;
      handshake.current = null;
      client.current?.stop();
      go({ kind: "stop", reason, message });
    },
    [go],
  );

  const onMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "pair-hello": {
          const hs = handshake.current;
          const socket = client.current;
          if (!hs || hs.kind !== "pair" || !socket) return;
          handshake.current = null;
          try {
            const serverPub = decodeB64Url(message.pub);
            const shared = x25519SharedSecret(hs.kp.privateKey, serverPub);
            const { c2s, s2c } = deriveDirectionKeys(
              shared,
              TEXT_ENC.encode(hs.token),
              hs.kp.publicKey,
              serverPub,
              PAIR_INFO,
            );
            socket.setCipher(DeckCipher.forClient(c2s, s2c));
            socket.send({ type: "pair", token: hs.token, name: hs.name });
          } catch {
            finish("invalid");
          }
          return;
        }
        case "hello-ack": {
          const hs = handshake.current;
          const socket = client.current;
          if (!hs || hs.kind !== "hello" || !socket) return;
          handshake.current = null;
          try {
            const serverPub = decodeB64Url(message.pub);
            const shared = x25519SharedSecret(hs.kp.privateKey, serverPub);
            const { c2s, s2c } = deriveDirectionKeys(
              shared,
              decodeB64Url(hs.credentials.key),
              hs.kp.publicKey,
              serverPub,
              SESSION_INFO,
            );
            socket.setCipher(DeckCipher.forClient(c2s, s2c));
            socket.send({
              type: "hello-auth",
              device: hs.credentials.device,
            });
          } catch {
            clearCredentials(window.localStorage);
            finish("unknown");
          }
          return;
        }
        case "state": {
          const { type: _type, ...value } = message;
          handles.current = value.handles ?? [];
          setState({ value, at: Date.now() });
          if (value.device?.name) setDeviceName(value.device.name);
          const kind = phaseRef.current.kind;
          if (kind === "searching" || kind === "notfound") go({ kind: "deck" });
          return;
        }
        case "pairing":
          go({ kind: "code", code: message.code });
          return;
        case "paired": {
          const credentials: Credentials = {
            v: 2,
            device: message.device,
            key: message.key,
          };
          saveCredentials(window.localStorage, credentials);
          intent.current = { kind: "hello", credentials };
          setDeviceName(message.name);
          go({ kind: "paired" });
          return;
        }
        case "refused":
          return finish("refused");
        case "pair-invalid":
          return finish("invalid");
        case "pair-expired":
          return finish("expired");
        case "pair-full":
          return finish("full", message.message);
        case "unknown-device":
          clearCredentials(window.localStorage);
          return finish("unknown");
        case "re-pair-required":
          clearCredentials(window.localStorage);
          return finish("repair");
        case "revoked":
          clearCredentials(window.localStorage);
          return finish(forgetting.current ? "forgotten" : "revoked");
        case "chat-history":
          setChat(message.messages.slice(-80));
          return;
        case "chat": {
          setChat((list) => appendChat(list, message.message));
          setChatSeq((n) => n + 1);
          if (
            !message.message.system &&
            mentions(message.message.text, handles.current)
          )
            setEvent({ seq: ++eventSeq.current, mention: message.message });
          return;
        }
        case "chat-delete":
          setChat((list) =>
            list.filter((m) => !matchesDelete(m, message.event)),
          );
          return;
        case "alert":
          setEvent({ seq: ++eventSeq.current, alert: message.alert });
          return;
        case "notice":
          setEvent({ seq: ++eventSeq.current, notice: message.notice });
          return;
      }
    },
    [finish, go],
  );

  const onLink = useCallback(
    (next: Link, failed: number) => {
      setLink(next);
      setFailures(failed);
      if (next === "open") {
        greet();
        return;
      }
      if (next !== "closed") return;
      const kind = phaseRef.current.kind;
      // The PC drops a pending pairing with its socket, so the QR cannot be reused.
      if (kind === "code") return finish("lost");
      if (kind === "searching" && failed >= NOT_FOUND_AFTER)
        go({ kind: "notfound" });
    },
    [finish, go, greet],
  );

  const connect = useCallback(() => {
    client.current?.stop();
    const socket = new DeckClient(
      `ws://${window.location.host}/deck/ws`,
      onMessage,
      onLink,
    );
    client.current = socket;
    socket.connect();
  }, [onLink, onMessage]);

  useEffect(() => {
    if (start.phase.kind !== "welcome") connect();
    return () => client.current?.stop();
  }, [connect, start.phase.kind]);

  // Scanning a new QR while this page is open only changes the hash.
  useEffect(() => {
    const onHash = () => {
      const token = takeToken();
      if (!token) return;
      intent.current = null;
      forgetting.current = false;
      setState(null);
      go({ kind: "name", token });
      connect();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [connect, go]);

  // Phones freeze background tabs; try again as soon as the deck is back in front.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible")
        client.current?.reconnectNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useWakeLock(phase.kind === "deck");

  const pair = (token: string, name: string) => {
    intent.current = { kind: "pair", token, name, sent: false };
    setDeviceName(name);
    go({ kind: "searching" });
    if (link === "open") greet();
  };

  const command = useCallback(
    (action: string, args?: Record<string, unknown>, timeoutMs?: number) => {
      const socket = client.current;
      return socket
        ? socket.command(action, args, timeoutMs)
        : Promise.reject(new Error(""));
    },
    [],
  );

  const reconnect = useCallback(() => client.current?.reconnectNow(), []);

  const forget = useCallback(() => {
    forgetting.current = true;
    clearCredentials(window.localStorage);
    client.current?.command("forget").catch(() => undefined);
    // The PC closes the socket after it forgets the phone; this covers a socket that was already gone.
    setTimeout(() => {
      if (phaseRef.current.kind === "deck") finish("forgotten");
    }, 3000);
  }, [finish]);

  let screen;
  switch (phase.kind) {
    case "welcome":
      screen = <Welcome />;
      break;
    case "name":
      screen = (
        <NameStep
          initial={guessDeviceName(navigator.userAgent)}
          linked={link === "open"}
          onSubmit={(name) => pair(phase.token, name)}
        />
      );
      break;
    case "searching":
      screen =
        failures >= NOT_FOUND_AFTER ? (
          <NotFound onRetry={reconnect} retrying={link === "connecting"} />
        ) : (
          <Searching />
        );
      break;
    case "notfound":
      screen = (
        <NotFound onRetry={reconnect} retrying={link === "connecting"} />
      );
      break;
    case "code":
      screen = (
        <Code
          code={phase.code}
          onCancel={() => {
            intent.current = null;
            client.current?.stop();
            go({ kind: "welcome" });
          }}
        />
      );
      break;
    case "paired":
      screen = (
        <Paired
          pc={state?.value.pc ?? ""}
          onOpen={() => go({ kind: "deck" })}
        />
      );
      break;
    case "stop":
      screen = <Stop kind={phase.reason} message={phase.message} />;
      break;
    case "deck":
      screen = state ? (
        <Shell
          conn={{
            state: state.value,
            receivedAt: state.at,
            chat,
            chatSeq,
            link,
            event,
            command,
            reconnect,
            forget,
          }}
          deviceName={deviceName}
        />
      ) : (
        <Searching />
      );
      break;
  }

  return (
    <I18nProvider language={state?.value.lang}>
      <div className="deck-root">{screen}</div>
    </I18nProvider>
  );
}
