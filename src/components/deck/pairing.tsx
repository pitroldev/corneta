import { useCallback, useEffect, useMemo, useState } from "react";
import { encode } from "uqr";
import { api } from "../../lib/api";
import type { DeckPairTicket, DeckStatus } from "../../lib/types";
import { errMsg } from "../../lib/utils";

/** Square modules with a quiet zone, drawn as one path so the code stays crisp at any size. */
export function QrSvg({ text, label }: { text: string; label: string }) {
  const path = useMemo(() => {
    const { data, size } = encode(text, { border: 0 });
    let d = "";
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (data[y]![x]) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    return { d, box: size + 4 };
  }, [text]);
  return (
    <svg
      viewBox={`0 0 ${path.box} ${path.box}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="block size-full"
    >
      <rect width={path.box} height={path.box} fill="#fff" />
      <path d={path.d} fill="#100b07" />
    </svg>
  );
}

export function useDeckStatus() {
  const [status, setStatus] = useState<DeckStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void api.deckStatus().then((s) => {
      if (alive) setStatus(s);
    });
    const unbind = api.subscribeDeck({ status: setStatus });
    return () => {
      alive = false;
      unbind();
    };
  }, []);
  return status;
}

/** A pairing QR that counts down; `active` waits for the server to have an address first. */
export function usePairTicket(active: boolean) {
  const [ticket, setTicket] = useState<DeckPairTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  const issue = useCallback(() => {
    setError(null);
    api.deckPairStart().then(
      (next) => {
        setTicket(next);
        setLeft(Math.round(next.expiresInMs / 1000));
      },
      (e: unknown) => setError(errMsg(e)),
    );
  }, []);

  useEffect(() => {
    if (active) issue();
    else setTicket(null);
  }, [active, issue]);
  useEffect(() => {
    if (!ticket) return;
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [ticket]);

  const expired = ticket !== null && left === 0;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return { ticket, error, left, clock, expired, issue };
}
