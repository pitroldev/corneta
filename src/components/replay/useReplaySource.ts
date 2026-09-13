import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { api } from "../../lib/api";
import {
  createReplaySourceSession,
  type ReplaySourceState,
} from "./sourceSession";
import {
  observeReplayStartup,
  type ReplayStartupDiagnostic,
} from "./startupDiagnostics";

export function detachReplayVideo(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
}

export function useReplaySource(
  id: string,
  path: string | undefined,
  videoRef: RefObject<HTMLVideoElement | null>,
  previewRef: RefObject<HTMLVideoElement | null>,
  onSuspend?: () => void,
) {
  const key = `${id}\n${path ?? ""}`;
  const [source, setSource] = useState<ReplaySourceState & { key: string }>({
    key,
    sourceError: false,
  });
  const [slowUrl, setSlowUrl] = useState<string>();
  const [diagnostic, setDiagnostic] = useState<{
    url: string;
    value: ReplayStartupDiagnostic;
  }>();
  const controller = useRef<ReturnType<
    typeof createReplaySourceSession
  > | null>(null);
  const suspendRef = useRef(onSuspend);
  useEffect(() => {
    suspendRef.current = onSuspend;
  }, [onSuspend]);

  useEffect(() => {
    if (!path) return;
    const mountedVideo = videoRef.current;
    const detach = (preservePosition: boolean) => {
      if (preservePosition) suspendRef.current?.();
      detachReplayVideo(mountedVideo);
      if (videoRef.current !== mountedVideo)
        detachReplayVideo(videoRef.current);
      detachReplayVideo(previewRef.current);
    };
    const session = createReplaySourceSession(
      api,
      id,
      path,
      (next) => setSource({ key, ...next }),
      detach,
    );
    controller.current = session;
    const unsubscribe = api.subscribeRecordingReplay(
      (event) => {
        if (event.id === id) session.refreshStatus(true);
      },
      () => session.refreshStatus(),
    );
    return () => {
      unsubscribe();
      session.dispose();
      if (controller.current === session) controller.current = null;
    };
  }, [id, key, path, previewRef, videoRef]);

  const current: ReplaySourceState =
    source.key === key ? source : { sourceError: false };
  const url = current.url;
  const openingStartedAt = current.openingStartedAt;

  useEffect(() => {
    const video = videoRef.current;
    if (!url || !video) return;
    return observeReplayStartup(
      video,
      () => api.recordVideoStats(url),
      () => setSlowUrl(url),
      (value) => {
        setDiagnostic({ url, value });
        if (value.firstFrameMs != null) setSlowUrl(undefined);
      },
      openingStartedAt,
    );
  }, [openingStartedAt, url, videoRef]);

  return {
    ...current,
    slow:
      current.status?.state !== "preparing" &&
      (current.openingSlow === true || (!!url && slowUrl === url)),
    diagnostic:
      diagnostic && diagnostic.url === url ? diagnostic.value : undefined,
    retry: useCallback(() => controller.current?.retry(), []),
    prepare: useCallback(() => controller.current?.prepare(), []),
  };
}
