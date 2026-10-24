"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import { PlayIcon } from "./icons";

const noSubscription = () => () => {};

export type HeroVideoCopy = {
  play: string;
  duration: string;
  videoLabel: string;
};

// The native <video> works without JavaScript; the cover and the page's "watch it" links
// (data-video-seek="<seconds>") are enhancements on top of it.
export function HeroVideo({
  webm,
  mp4,
  poster,
  captions,
  copy,
}: {
  webm: string;
  mp4: string;
  poster: { src: string; width: number; height: number };
  captions: { src: string; lang: string; label: string };
  copy: HeroVideoCopy;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [covered, setCovered] = useState(true);
  // False on the server and during hydration, so the no-JS markup keeps the native controls.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const play = useCallback((at?: number) => {
    const v = video.current;
    if (!v) return;
    setCovered(false);
    // Before metadata loads this becomes the start position, so it also works on the first play.
    if (at != null) v.currentTime = at;
    void v.play().catch(() => {});
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.(
        "[data-video-seek]",
      );
      if (!link) return;
      event.preventDefault();
      const at = Number(link.getAttribute("data-video-seek"));
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      frame.current?.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "center",
      });
      play(Number.isFinite(at) ? at : undefined);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [play]);

  return (
    <div
      ref={frame}
      id="video"
      className="relative aspect-video scroll-mt-28 overflow-hidden rounded-[14px] border-[3px] border-ink bg-night shadow-[10px_10px_0_0_var(--ink)] max-[760px]:shadow-[6px_6px_0_0_var(--ink)]"
    >
      {/* The poster is the page's largest paint: a responsive, preloaded image shows through
          the video, which stays transparent until it has frames, even without JavaScript. */}
      <Image
        src={poster.src}
        width={poster.width}
        height={poster.height}
        alt=""
        preload
        fetchPriority="high"
        sizes="(max-width: 1172px) calc(100vw - 2rem), 1140px"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <video
        ref={video}
        className="relative h-full w-full"
        controls={!hydrated || !covered}
        playsInline
        preload="none"
        aria-label={copy.videoLabel}
        onPlay={() => setCovered(false)}
      >
        <source src={webm} type='video/webm; codecs="av01.0.08M.08, opus"' />
        <source src={mp4} type="video/mp4" />
        <track
          kind="captions"
          src={captions.src}
          srcLang={captions.lang}
          label={captions.label}
        />
      </video>

      {covered && (
        <button
          type="button"
          className="hero-video-cover group @container absolute inset-0 block cursor-pointer overflow-hidden focus-visible:outline-none"
          onClick={() => play()}
        >
          <span
            aria-hidden
            className="absolute inset-0 bg-night/80 transition-colors duration-200 group-hover:bg-night/70"
          />
          {/* Pinned over the poster's brass Corneta logo (centered at 47.9% × 44.1%, ~9.6% wide)
              and, with the label, over the "Corneta" word below it (57.9%), so neither peeks out. */}
          <span className="absolute top-[44.1%] left-[47.9%] -translate-x-1/2 -translate-y-1/2">
            <span className="grid size-[max(60px,10cqw)] -rotate-6 place-items-center rounded-[14px] border-[3px] border-ink bg-brass text-brass-ink shadow-[6px_6px_0_0_var(--ink)] transition-transform duration-150 group-hover:-rotate-3 group-active:translate-x-1 group-active:translate-y-1 group-active:shadow-none group-focus-visible:outline-[4px] group-focus-visible:outline-offset-4 group-focus-visible:outline-tomato [&>svg]:ml-[8%] [&>svg]:size-[44%] [&>svg]:fill-current">
              <PlayIcon />
            </span>
          </span>
          <span className="absolute top-[57.9%] left-[47.9%] -translate-x-1/2 -translate-y-1/2 rotate-[1.5deg] rounded-sm bg-paper-raised px-3 py-[max(4px,0.5cqw)] font-display text-[clamp(0.72rem,1.4cqw,1rem)] font-extrabold whitespace-nowrap text-ink shadow-[3px_3px_0_0_var(--ink)] max-[560px]:top-[calc(44.1%+52px)] max-[560px]:translate-y-0">
            {copy.play} · {copy.duration}
          </span>
        </button>
      )}
      <noscript>
        <style>{".hero-video-cover{display:none}"}</style>
      </noscript>
    </div>
  );
}
