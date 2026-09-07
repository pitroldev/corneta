"use client";

import Image, { type ImageProps } from "next/image";
import { Minus, Plus, X, ZoomIn } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/app/_components/ui";

type ImageSource = ImageProps["src"];

const ZOOM_LEVELS = [1, 1.25, 1.5, 2] as const;
const INITIAL_ZOOM_INDEX = 0;

export interface EditorialImageProps {
  src: ImageSource;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  source?: string;
  sourceHref?: string;
  version?: string;
  zoomLabel?: string;
  zoomCloseLabel?: string;
  zoomInLabel?: string;
  zoomOutLabel?: string;
  zoomFitLabel?: string;
  preload?: boolean;
  sizes?: string;
  quality?: number;
  className?: string;
}

// Native dialog supplies focus isolation and restoration for the lightbox.
export function EditorialImage({
  src,
  alt,
  width,
  height,
  caption,
  source,
  sourceHref,
  version,
  zoomLabel = "Ampliar imagem",
  zoomCloseLabel = "Fechar imagem ampliada",
  zoomInLabel = "Aumentar zoom",
  zoomOutLabel = "Diminuir zoom",
  zoomFitLabel = "Ajustar",
  preload = false,
  sizes = "(max-width: 760px) calc(100vw - 2rem), (max-width: 1180px) calc(100vw - 4rem), 760px",
  quality,
  className,
}: EditorialImageProps) {
  const [open, setOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(INITIAL_ZOOM_INDEX);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const dialogId = useId();
  const descriptionId = useId();
  const zoom = ZOOM_LEVELS[zoomIndex];

  const close = useCallback(() => {
    setOpen(false);
    setZoomIndex(INITIAL_ZOOM_INDEX);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openImage = () => {
    setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    setZoomIndex(INITIAL_ZOOM_INDEX);
    setOpen(true);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoomIndex((current) =>
          Math.min(ZOOM_LEVELS.length - 1, current + 1),
        );
      } else if (event.key === "-") {
        event.preventDefault();
        setZoomIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "0") {
        event.preventDefault();
        setZoomIndex(0);
      }
    };
    const onResize = () =>
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    requestAnimationFrame(() => {
      dialog.querySelector<HTMLButtonElement>("[data-lightbox-close]")?.focus();
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = previousOverflow;
    };
  }, [close, open]);

  const compactViewport = viewportSize.width <= 460;
  const maxFitWidth = viewportSize.width * (compactViewport ? 0.94 : 0.82);
  const maxFitHeight = viewportSize.height * (compactViewport ? 0.68 : 0.72);
  const fitScale =
    viewportSize.width > 0 && viewportSize.height > 0
      ? Math.min(
          1,
          Math.max(1, maxFitWidth) / width,
          Math.max(1, maxFitHeight) / height,
        )
      : 1;
  const zoomedImageStyle: CSSProperties = {
    width: `${Math.round(width * fitScale * zoom)}px`,
  };
  const displayedWidth = Math.round(width * fitScale * zoom);
  const displayedHeight = Math.round(height * fitScale * zoom);
  const canvasHorizontalPadding = compactViewport
    ? 10
    : Math.min(58, Math.max(24, viewportSize.width * 0.04));
  const canvasVerticalPadding = compactViewport ? 112 : 136;
  const canvasStyle: CSSProperties = {
    width: `${Math.max(
      viewportSize.width,
      displayedWidth + canvasHorizontalPadding * 2,
    )}px`,
    height: `${Math.max(
      viewportSize.height,
      displayedHeight + canvasVerticalPadding,
    )}px`,
  };

  useLayoutEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({
        left: Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2),
        top: Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2),
        behavior: "auto",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, viewportSize, zoomIndex]);

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.removeAttribute("data-dragging");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <figure className={cn("editorial-image", className)}>
      <button
        ref={triggerRef}
        type="button"
        className="editorial-image__frame"
        aria-label={`${zoomLabel}: ${alt}`}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        onClick={openImage}
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          preload={preload}
          quality={quality}
        />
        <span className="editorial-image__zoom">
          <ZoomIn aria-hidden="true" />
          {zoomLabel}
        </span>
      </button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        className="editorial-lightbox"
        aria-label={`${zoomLabel}: ${alt}`}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          setOpen(false);
          setZoomIndex(INITIAL_ZOOM_INDEX);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="editorial-lightbox__shell">
          <div className="editorial-lightbox__toolbar">
            <p>{zoomLabel}</p>
            <div className="editorial-lightbox__actions">
              <div
                className="editorial-lightbox__zoom-controls"
                role="group"
                aria-label={zoomLabel}
              >
                <button
                  type="button"
                  aria-label={zoomOutLabel}
                  aria-keyshortcuts="- 0"
                  disabled={zoomIndex === 0}
                  onClick={() =>
                    setZoomIndex((current) => Math.max(0, current - 1))
                  }
                >
                  <Minus aria-hidden="true" />
                </button>
                <output aria-live="polite">
                  {zoomIndex === 0
                    ? zoomFitLabel
                    : `${Math.round(zoom * 100)}%`}
                </output>
                <button
                  type="button"
                  aria-label={zoomInLabel}
                  aria-keyshortcuts="+ ="
                  disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                  onClick={() =>
                    setZoomIndex((current) =>
                      Math.min(ZOOM_LEVELS.length - 1, current + 1),
                    )
                  }
                >
                  <Plus aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                className="editorial-lightbox__close"
                data-lightbox-close
                aria-label={zoomCloseLabel}
                onClick={close}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            ref={viewportRef}
            className="editorial-lightbox__viewport"
            data-zoomed={zoomIndex > 0 ? "" : undefined}
            onPointerDown={(event) => {
              if (
                event.pointerType !== "mouse" ||
                event.button !== 0 ||
                zoomIndex === 0
              )
                return;
              dragRef.current = {
                x: event.clientX,
                y: event.clientY,
                left: event.currentTarget.scrollLeft,
                top: event.currentTarget.scrollTop,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              event.currentTarget.setAttribute("data-dragging", "");
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) return;
              event.currentTarget.scrollLeft =
                drag.left - (event.clientX - drag.x);
              event.currentTarget.scrollTop =
                drag.top - (event.clientY - drag.y);
            }}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
          >
            <div
              className={cn(
                "editorial-lightbox__canvas",
                zoomIndex > 0 && "is-zoomed",
              )}
              style={canvasStyle}
              onClick={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <Image
                className="editorial-lightbox__image"
                src={src}
                alt={alt}
                width={width}
                height={height}
                sizes="100vw"
                quality={quality}
                style={zoomedImageStyle}
                draggable={false}
                onDoubleClick={() =>
                  setZoomIndex((current) =>
                    current === ZOOM_LEVELS.length - 1
                      ? INITIAL_ZOOM_INDEX
                      : current + 1,
                  )
                }
              />
            </div>
          </div>

          <p id={descriptionId} className="editorial-lightbox__description">
            {caption ?? alt}
          </p>
        </div>
      </dialog>

      {caption || source || version ? (
        <figcaption>
          {caption ? (
            <span className="editorial-image__caption">{caption}</span>
          ) : null}
          {source || version ? (
            <span className="editorial-image__details">
              {source ? (
                sourceHref ? (
                  <a
                    href={sourceHref}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {source}
                  </a>
                ) : (
                  <span>{source}</span>
                )
              ) : null}
              {version ? <span>{version}</span> : null}
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
