const KEY = "corneta.deckOffer";

type DeckOfferState = "pending" | "done";

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(value: DeckOfferState): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Without storage the offer stays hidden, which is the safe side for a one-time prompt.
  }
}

/** Call when a live ends: the first one arms the phone panel offer, later ones leave it alone. */
export function armDeckOffer(): void {
  if (read() === null) write("pending");
}

/** Whether the Live screen should offer the phone panel now. */
export function deckOfferDue(deckEnabled: boolean): boolean {
  return !deckEnabled && read() === "pending";
}

/** Answered either way, the offer never comes back. */
export function closeDeckOffer(): void {
  write("done");
}
