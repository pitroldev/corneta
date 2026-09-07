import { describe, it, expect } from "vitest";
import { errMsg } from "./utils";

describe("errMsg", () => {
  it("removes only a leading Error prefix", () => {
    expect(errMsg(new Error("boom"))).toBe("boom");
    expect(errMsg("Error: falhou")).toBe("falhou");
    expect(errMsg("Error:   com espaços")).toBe("com espaços");
    expect(errMsg("sem prefixo")).toBe("sem prefixo");
  });

  it("preserves Error prefixes in the middle of a message", () => {
    expect(errMsg("Falha ao conectar: Error: connection refused")).toBe(
      "Falha ao conectar: Error: connection refused",
    );
  });
});
