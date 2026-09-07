import { describe, expect, it } from "vitest";
import { downloadMetadata } from "./download";

describe("release download identity", () => {
  it("derives the advertised version from the linked release, not the web build", () => {
    expect(
      downloadMetadata(
        "https://github.com/pitroldev/corneta/releases/download/v0.7.0/Corneta.exe",
      )?.version,
    ).toBe("0.7.0");
  });
  it("does not invent a version for a moving latest link", () => {
    expect(
      downloadMetadata(
        "https://github.com/pitroldev/corneta/releases/latest/download/Corneta.exe",
      )?.version,
    ).toBeNull();
  });
  it.each([
    "#download",
    "https://example.com/Corneta.exe",
    "https://127.0.0.1/Corneta.exe",
    "https://github.com/another/project/releases/download/v1.0.0/Corneta.exe",
    "https://secret@github.com/pitroldev/corneta/releases/download/v0.7.0/Corneta.exe",
  ])("rejects provisional or unrelated downloads: %s", (value) =>
    expect(downloadMetadata(value)).toBeNull(),
  );
});
