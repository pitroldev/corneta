import { useEffect, useRef, useState } from "react";
import { detachReplayVideo } from "../../components/replay/useReplaySource";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";

export function RecordingPreview({ path }: { path: string }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<{
    path: string;
    url?: string;
    failed?: boolean;
  }>();
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    const video = videoRef.current;
    void api
      .recordVideoUrl(path)
      .then((next) => {
        if (!active) {
          void api.releaseRecordVideo(next).catch(() => {});
          return;
        }
        url = next;
        setSource({ path, url });
      })
      .catch(() => {
        if (active) setSource({ path, failed: true });
      });
    return () => {
      active = false;
      detachReplayVideo(video);
      if (url) void api.releaseRecordVideo(url).catch(() => {});
    };
  }, [path]);

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={source?.path === path ? source.url : undefined}
        controls
        autoPlay
        className="w-full rounded-lg bg-black"
      />
      {source?.path === path && source.failed && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {t("replay.mediaError")}
        </p>
      )}
    </>
  );
}
