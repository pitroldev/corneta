import { describe, it, expect } from "vitest";
import { errMsg } from "./utils";

describe("errMsg", () => {
  it("tira só o prefixo 'Error:' do início (ancorado)", () => {
    expect(errMsg(new Error("boom"))).toBe("boom"); // Error.toString() = "Error: boom"
    expect(errMsg("Error: falhou")).toBe("falhou");
    expect(errMsg("Error:   com espaços")).toBe("com espaços");
    expect(errMsg("sem prefixo")).toBe("sem prefixo");
  });

  it("NÃO mexe num 'Error:' no meio da mensagem (era o bug latente do replace sem âncora)", () => {
    expect(errMsg("Falha ao conectar: Error: connection refused")).toBe(
      "Falha ao conectar: Error: connection refused",
    );
  });
});
