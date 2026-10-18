import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

interface Committed<T> {
  value: T;
  commit(next: T): void;
  normalize?: (next: T) => T;
}

/** Holds one pending edit and commits it at most once, only when it changes the stored value. */
export function createDraftBuffer<T>(read: () => Committed<T>) {
  let pending: { value: T } | null = null;
  return {
    change(next: T) {
      pending = { value: next };
    },
    flush(): boolean {
      const edit = pending;
      if (!edit) return false;
      pending = null;
      const { value, commit, normalize } = read();
      const next = normalize ? normalize(edit.value) : edit.value;
      if (Object.is(next, value)) return false;
      commit(next);
      return true;
    },
  };
}

export interface Draft<T> {
  /** The edit in progress, or the stored value when nothing is being edited. */
  value: T;
  change(next: T): void;
  /** Ends the edit and commits it when it differs from the stored value. */
  flush(): void;
}

/**
 * Keeps an edit local until it ends, so the native config is written once per edit instead of once
 * per keystroke or slider step. An unfinished edit is committed when the field unmounts.
 */
export function useDraft<T>(
  value: T,
  commit: (next: T) => void,
  normalize?: (next: T) => T,
): Draft<T> {
  const [draft, setDraft] = useState<{ value: T } | null>(null);
  const latest = useRef<Committed<T>>({ value, commit, normalize });
  useLayoutEffect(() => {
    latest.current = { value, commit, normalize };
  });
  const [buffer] = useState(() => createDraftBuffer(() => latest.current));
  const change = useCallback(
    (next: T) => {
      buffer.change(next);
      setDraft({ value: next });
    },
    [buffer],
  );
  const flush = useCallback(() => {
    setDraft(null);
    buffer.flush();
  }, [buffer]);
  useEffect(() => () => void buffer.flush(), [buffer]);
  return { value: draft ? draft.value : value, change, flush };
}

/** Props for a single-line text field: Enter ends the edit like leaving the field. */
export function draftInputProps(draft: Draft<string>) {
  return {
    value: draft.value,
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      draft.change(event.target.value),
    onBlur: draft.flush,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") event.currentTarget.blur();
    },
  };
}
