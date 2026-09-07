// The complete translated sentence controls placeholder order; React nodes replace markers afterward.
import { Fragment, type ReactNode } from "react";
import type { MessageKey } from "./pt";
import type { Vars } from "./locale";

// Reserve U+FFFC as a non-text marker; it must not appear in dictionary copy.
const MARK = "￼";
const SLOT_RE = /￼(\w+)￼/;

export type Translate = (key: MessageKey, vars?: Vars) => string;

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
      i % 2 === 0 ? (
        // Literal text between placeholders may also contain bold markup.
        <Fragment key={i}>{splitBold(piece)}</Fragment>
      ) : (
        <Fragment key={i}>{parts[piece]}</Fragment>
      ),
    );
}

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

function splitBold(text: string): ReactNode[] {
  return text
    .split(BOLD_RE)
    .map((piece, i) =>
      i % 2 === 0 ? piece : <strong key={i}>{piece}</strong>,
    );
}

/** Support bold text only; insert links and dynamic content through rich placeholders. */
export function bold(t: Translate, key: MessageKey, vars?: Vars): ReactNode[] {
  return splitBold(t(key, vars));
}
