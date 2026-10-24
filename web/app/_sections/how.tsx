import { fill, type Locale, type T } from "@/lib/i18n";
import { stepsFor } from "@/lib/content";
import { clock, lpMedia } from "@/lib/lp-media";
import { PlayIcon } from "../_components/icons";
import { Shell } from "../_components/ui";

const STEP_CHAPTERS = ["obs", "platforms", "golive", "chat"] as const;

export function How({ t, locale }: { t: T; locale: Locale }) {
  const { chapters } = lpMedia(locale);

  return (
    <section
      id="como-funciona"
      aria-labelledby="como-funciona-titulo"
      className="below-fold border-y-[3px] border-ink bg-charcoal bg-[image:var(--halftone-dark)] bg-[length:20px_20px] py-[clamp(56px,6vw,88px)] text-cream"
    >
      <Shell>
        <h2
          id="como-funciona-titulo"
          className="text-[clamp(2rem,3.4vw,3rem)] leading-none tracking-[-0.03em]"
        >
          {t("how.title")}
        </h2>

        <ol className="mt-[clamp(32px,4vw,52px)] grid grid-cols-4 gap-[clamp(22px,2.8vw,40px)] max-[980px]:grid-cols-2 max-[560px]:grid-cols-1">
          {stepsFor(t).map((step, i) => {
            const at = chapters[STEP_CHAPTERS[i]];
            return (
              <li
                key={step.title}
                className="grid grid-rows-[auto_auto_1fr_auto] border-t-2 border-border-dry pt-5 max-[560px]:grid-cols-[34px_minmax(0,1fr)] max-[560px]:grid-rows-none max-[560px]:gap-x-3 max-[560px]:pt-4"
              >
                <span
                  aria-hidden="true"
                  className="font-display text-[2.8rem] leading-none font-extrabold text-brass max-[560px]:row-span-3 max-[560px]:text-[2rem]"
                >
                  {i + 1}
                </span>
                <h3 className="mt-3 text-[clamp(1.2rem,1.6vw,1.4rem)] leading-[1.12] max-[560px]:mt-0.5">
                  {step.title}
                </h3>
                <p className="mt-2 mb-4 text-[0.95rem] leading-[1.55] font-medium text-muted max-[560px]:mb-1">
                  {step.text}
                </p>
                <a
                  href="#video"
                  data-video-seek={at}
                  className="inline-flex min-h-11 w-fit self-end items-center gap-2 font-display text-[0.92rem] font-extrabold text-brass underline decoration-2 underline-offset-4 transition-colors hover:text-cream focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brass [&>svg]:size-4 [&>svg]:fill-current"
                >
                  <PlayIcon />
                  {fill(t("how.watch"), { time: clock(at) })}
                </a>
              </li>
            );
          })}
        </ol>
      </Shell>
    </section>
  );
}
