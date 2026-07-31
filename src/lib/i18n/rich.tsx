// ============================================================
// Frase traduzida com pedaços em destaque no meio (<strong>, link, ícone).
//
// Existe porque a alternativa óbvia não funciona. Costurar o destaque no JSX —
// `<>Pra ativar, clique em <strong>{botao}</strong> e pronto.</>` — congela a
// ORDEM DAS PALAVRAS do português no código. Em inglês a mesma frase pode
// começar pelo botão, e a tradução não tem como mudar isso: o dicionário só
// controla os pedaços soltos, não onde eles caem.
//
// Aqui a frase inteira vive numa chave só, com `{buracos}`, e é ela que decide a
// ordem. Este módulo interpola um marcador invisível em cada buraco, corta a
// frase nele e devolve as peças na ordem que o IDIOMA pediu.
// ============================================================
import { Fragment, type ReactNode } from "react";
import type { MessageKey } from "./pt";
import type { Vars } from "./locale";

// U+FFFC é o "object replacement character" do Unicode: o caractere que existe
// justamente pra marcar onde entra algo que não é texto. Nunca aparece em copy,
// então cortar nele não corre risco de partir uma frase de verdade no meio.
const MARK = "￼";
const SLOT_RE = /￼(\w+)￼/;

export type Translate = (key: MessageKey, vars?: Vars) => string;

/** Frase do dicionário com `{buracos}` trocados por nós React.
 *
 *  ```tsx
 *  rich(t, "settings.obs.autoconfig.desc", {
 *    botao: <strong>{t("settings.obs.autoconfig.button")}</strong>,
 *  })
 *  ```
 *
 *  Buraco que a tradução esquecer some da tela — igual ao `interpolate`, que
 *  deixa o `{nome}` cru visível: o texto quebrado tem que ser VISÍVEL pra quem
 *  revisa, não silencioso. */
export function rich(
  t: Translate,
  key: MessageKey,
  parts: Record<string, ReactNode>,
): ReactNode[] {
  const vars: Vars = {};
  for (const name of Object.keys(parts)) vars[name] = `${MARK}${name}${MARK}`;
  return t(key, vars)
    .split(SLOT_RE)
    .map((piece, i) =>
      // Índice ímpar = nome do buraco (o grupo capturado pelo split).
      i % 2 === 0 ? (
        // O texto ENTRE os buracos ainda pode ter **negrito**: as duas marcações
        // convivem na mesma frase, e é comum — "Baixe a **Taxa de bits no OBS**
        // ({link})" tem as duas.
        <Fragment key={i}>{splitBold(piece)}</Fragment>
      ) : (
        <Fragment key={i}>{parts[piece]}</Fragment>
      ),
    );
}

/** Açúcar pro caso mais comum: todo pedaço vira `<strong>`. */
export function strong(
  t: Translate,
  key: MessageKey,
  parts: Record<string, ReactNode>,
): ReactNode[] {
  const wrapped: Record<string, ReactNode> = {};
  for (const [name, value] of Object.entries(parts))
    wrapped[name] = <strong>{value}</strong>;
  return rich(t, key, wrapped);
}

const BOLD_RE = /\*\*(.+?)\*\*/;

/** Texto → pedaços, com o que estava entre `**` já dentro de `<strong>`. */
function splitBold(text: string): ReactNode[] {
  return text
    .split(BOLD_RE)
    .map((piece, i) =>
      i % 2 === 0 ? piece : <strong key={i}>{piece}</strong>,
    );
}

/** Frase do dicionário com trechos entre `**asteriscos**` em negrito.
 *
 *  O `rich` acima resolve destaque de valor DINÂMICO (um número, um nome de
 *  canal): cada um vira um buraco. Mas o passo a passo do YouTube tem trinta
 *  destaques numa tela só, todos rótulos fixos da interface do Google — trinta
 *  buracos ali seria uma chave ilegível pra quem traduz e um JSX ilegível pra
 *  quem lê. Marcado no próprio texto, quem traduz move o negrito junto com a
 *  palavra, que é o comportamento certo: em outro idioma o rótulo é outro e
 *  cai em outro lugar da frase.
 *
 *  Só negrito, e de propósito. Isto não é markdown e não vai virar: no dia que
 *  precisar de link no meio da frase, o buraco do `rich` já resolve. */
export function bold(t: Translate, key: MessageKey, vars?: Vars): ReactNode[] {
  return splitBold(t(key, vars));
}
