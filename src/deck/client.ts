import type { DeckCipher } from "./crypto";
import type { ServerMessage } from "./model";

export type Link = "connecting" | "open" | "closed";

interface Pending {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const PLAINTEXT_HANDSHAKE_TYPES = new Set([
  "pair-hello",
  "hello-ack",
  "pair-invalid",
  "unknown-device",
  "re-pair-required",
]);

/** One WebSocket to the PC; reconnects with backoff until stopped. */
export class DeckClient {
  private socket: WebSocket | null = null;
  private cipher: DeckCipher | null = null;
  private pending = new Map<string, Pending>();
  private seq = 0;
  private failures = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly onMessage: (message: ServerMessage) => void,
    private readonly onLink: (link: Link, failures: number) => void,
  ) {}

  setCipher(cipher: DeckCipher | null) {
    this.cipher = cipher;
  }

  connect() {
    if (this.stopped) return;
    this.cipher = null;
    this.onLink("connecting", this.failures);
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.failures = 0;
      this.onLink("open", 0);
    };
    socket.onmessage = (event) => {
      const raw = String(event.data);
      let message: ServerMessage;
      if (this.cipher) {
        try {
          const decrypted = this.cipher.open(raw);
          message = JSON.parse(decrypted) as ServerMessage;
        } catch {
          socket.close();
          return;
        }
      } else {
        try {
          message = JSON.parse(raw) as ServerMessage;
        } catch {
          return;
        }
        if (!PLAINTEXT_HANDSHAKE_TYPES.has(message.type)) {
          return;
        }
      }
      if (message.type === "result") {
        const waiting = this.pending.get(message.id);
        if (!waiting) return;
        this.pending.delete(message.id);
        clearTimeout(waiting.timer);
        if (message.ok) waiting.resolve(message.data);
        else waiting.reject(new Error(message.message ?? ""));
        return;
      }
      this.onMessage(message);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.cipher = null;
      this.failures += 1;
      for (const [id, waiting] of this.pending) {
        clearTimeout(waiting.timer);
        waiting.reject(new Error(""));
        this.pending.delete(id);
      }
      this.onLink("closed", this.failures);
      if (!this.stopped) {
        const wait = Math.min(8000, 700 * 2 ** Math.min(this.failures - 1, 4));
        this.retry = setTimeout(() => this.connect(), wait);
      }
    };
  }

  /** Try again right away, as when the phone comes back from the lock screen. */
  reconnectNow() {
    if (this.stopped || this.socket?.readyState === WebSocket.OPEN) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.socket?.close();
    this.socket = null;
    this.cipher = null;
    this.connect();
  }

  /** Sends a plaintext handshake init frame before session keys are established. */
  sendPlain(message: Record<string, unknown>): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  /** Encrypts and sends a frame over the active session; refuses to send in plaintext. */
  send(message: Record<string, unknown>): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.cipher) {
      return false;
    }
    try {
      this.socket.send(this.cipher.seal(JSON.stringify(message)));
      return true;
    } catch {
      this.socket.close();
      return false;
    }
  }

  /** Start and stop wait on the PC, which may take a while to reach every platform. */
  command(
    action: string,
    args: Record<string, unknown> = {},
    timeoutMs = 70_000,
  ): Promise<unknown> {
    const id = `c${++this.seq}`;
    return new Promise((resolve, reject) => {
      if (!this.send({ type: "cmd", id, action, args })) {
        reject(new Error(""));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(""));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  stop() {
    this.stopped = true;
    this.cipher = null;
    if (this.retry) clearTimeout(this.retry);
    this.socket?.close();
    this.socket = null;
  }
}
