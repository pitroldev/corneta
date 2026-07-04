import { describe, it, expect } from "vitest";
import * as ops from "./configOps";
import { defaultConfig } from "./factory";

const base = () => defaultConfig(); // 2 destinos (Twitch, YouTube), 1 perfil "Padrão"

describe("configOps", () => {
  it("suffixName acrescenta sufixo só quando colide", () => {
    expect(ops.suffixName("Twitch", new Set())).toBe("Twitch");
    expect(ops.suffixName("Twitch", new Set(["Twitch"]))).toBe("Twitch 2");
    expect(ops.suffixName("Twitch", new Set(["Twitch", "Twitch 2"]))).toBe("Twitch 3");
  });

  it("addTarget dá nome único ao repetir plataforma", () => {
    const { config } = ops.addTarget(base(), "twitch");
    const names = config.targets.map((t) => t.name);
    expect(names).toContain("Twitch 2");
    expect(config.targets.length).toBe(3);
  });

  it("removeTarget devolve o removido + índice pro desfazer, e insertTarget restaura", () => {
    const c = base();
    const id = c.targets[0].id;
    const { config, removed } = ops.removeTarget(c, id);
    expect(config.targets.find((t) => t.id === id)).toBeUndefined();
    expect(removed?.index).toBe(0);
    const restored = ops.insertTarget(config, removed!.target, removed!.index);
    expect(restored.targets[0].id).toBe(id);
  });

  it("removeTarget de id inexistente → removed null", () => {
    expect(ops.removeTarget(base(), "nao-existe").removed).toBeNull();
  });

  it("toggleTarget inverte o enabled", () => {
    const c = base();
    const id = c.targets[0].id;
    expect(ops.toggleTarget(c, id).targets[0].enabled).toBe(!c.targets[0].enabled);
  });

  it("duplicateTarget clona sem chave, com sufixo, logo depois do original", () => {
    const c = base();
    const dup = ops.duplicateTarget(c, c.targets[0].id, "tgt_novo");
    expect(dup.targets.length).toBe(c.targets.length + 1);
    expect(dup.targets[1].id).toBe("tgt_novo");
    expect(dup.targets[1].hasKey).toBe(false);
    expect(dup.targets[1].name).toBe(`${c.targets[0].name} 2`);
  });

  it("duplicateTarget/moveTarget de id inválido → mesma referência (no-op)", () => {
    const c = base();
    expect(ops.duplicateTarget(c, "nope", "x")).toBe(c);
    expect(ops.moveTarget(c, c.targets[0].id, -1)).toBe(c); // pra cima no topo → no-op
  });

  it("moveTarget troca com o vizinho", () => {
    const c = base();
    const first = c.targets[0].id;
    expect(ops.moveTarget(c, first, 1).targets[1].id).toBe(first);
  });

  it("perfis: add / rename / load / remove, nunca deixa a lista vazia", () => {
    let c = ops.addProfile(base(), "prof_2");
    expect(c.profiles.length).toBe(2);
    expect(c.activeProfileId).toBe("prof_2");
    expect(c.profiles[1].name).toBe("Perfil 2");
    c = ops.renameProfile(c, "prof_2", "Evento");
    expect(c.profiles[1].name).toBe("Evento");
    const firstId = c.profiles[0].id;
    c = ops.loadProfile(c, firstId);
    expect(c.activeProfileId).toBe(firstId);
    c = ops.removeProfile(c, "prof_2");
    expect(c.profiles.length).toBe(1);
    expect(ops.removeProfile(c, c.profiles[0].id)).toBe(c); // último → no-op
  });

  it("loadProfile de id inexistente → mesma referência", () => {
    const c = base();
    expect(ops.loadProfile(c, "nope")).toBe(c);
  });

  it("loadProfile do já-ativo devolve config NOVA (não mesma ref → o store persiste)", () => {
    const c = base();
    expect(ops.loadProfile(c, c.activeProfileId)).not.toBe(c);
  });

  it("removeProfile de id inexistente (com >1 perfil) NÃO é no-op: devolve config nova", () => {
    const c = ops.addProfile(base(), "prof_2"); // 2 perfis
    const next = ops.removeProfile(c, "nao-existe");
    expect(next).not.toBe(c);
    expect(next.profiles.length).toBe(2);
  });

  it("moveTarget na borda de BAIXO → no-op (mesma ref)", () => {
    const c = base();
    const last = c.targets[c.targets.length - 1].id;
    expect(ops.moveTarget(c, last, 1)).toBe(c);
  });

  it("addProfile pula nomes 'Perfil N' já tomados", () => {
    let c = base(); // "Padrão"
    c = ops.addProfile(c, "p2"); // "Perfil 2"
    c = ops.renameProfile(c, "p2", "Perfil 3"); // ocupa o próximo nome esperado
    c = ops.addProfile(c, "p3"); // length+1=3 → "Perfil 3" tomado → "Perfil 4"
    expect(c.profiles.find((p) => p.id === "p3")!.name).toBe("Perfil 4");
  });
});
