import { beforeEach, describe, expect, it } from "vitest";
import { armDeckOffer, closeDeckOffer, deckOfferDue } from "./deckOffer";

describe("phone panel offer", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    } as Storage;
  });

  it("stays hidden until a live has ended", () => {
    expect(deckOfferDue(false)).toBe(false);
    armDeckOffer();
    expect(deckOfferDue(false)).toBe(true);
  });

  it("is not made to someone who already uses the phone panel", () => {
    armDeckOffer();
    expect(deckOfferDue(true)).toBe(false);
  });

  it("never returns once answered, even after more lives", () => {
    armDeckOffer();
    closeDeckOffer();
    armDeckOffer();
    expect(deckOfferDue(false)).toBe(false);
  });
});
