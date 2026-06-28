import * as RSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** Select on-brand via Radix: teclado completo, typeahead e portal (sem clipping). */
export function Select<T extends string>({
  value,
  options,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <RSelect.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <RSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          "group flex h-10 w-full items-center justify-between gap-2 rounded-md border-2 border-border bg-surface-2 px-2.5 text-sm font-medium outline-none transition-colors",
          "hover:border-brass/60 focus:border-brass data-[state=open]:border-brass",
          className,
        )}
      >
        <RSelect.Value />
        <RSelect.Icon asChild>
          <ChevronDown
            className="size-4 shrink-0 text-ink-faint transition-transform group-data-[state=open]:rotate-180"
            strokeWidth={2.4}
          />
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={4}
          className="z-[100] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md bg-surface-2 pop"
        >
          <RSelect.Viewport className="max-h-64 overflow-auto">
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className={cn(
                  "flex cursor-pointer select-none items-center justify-between gap-4 whitespace-nowrap px-3 py-2 text-sm text-ink outline-none transition-colors",
                  "data-[highlighted]:bg-surface-3 data-[state=checked]:font-bold data-[state=checked]:text-brass",
                )}
              >
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator>
                  <Check className="size-4 shrink-0" strokeWidth={2.6} />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
