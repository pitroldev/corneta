import { useCallback, useMemo, useState } from "react";
import type { ChartMarker, ChartSeries } from "../../components/LineChart";
import type { ReplayTick, SeekRequest } from "../../components/ReplayPlayer";
import type { I18n } from "../../lib/i18n";
import { fractionalIndexAt, type ReplayIndex } from "../../lib/replay";
import {
  bitrateSeries,
  chatRateSeries,
  chatRateSeriesFor,
  cpuSeries,
  gpuSeries,
  memorySeries,
  obsRenderSeries,
  viewerSeries,
  viewerSeriesFor,
  type ReportAnalysis,
} from "../../lib/report";
import type { SessionData } from "../../lib/types";
import { channelColors, platformColor, relativeTime } from "./reportUtils";
import {
  createPlaybackClock,
  type PlaybackSource,
} from "../../lib/playbackClock";

export type ReplayState = "ready" | "empty" | "missing";

export interface ReportStoryModel {
  sampleCount: number;
  viewerCount: number;
  replayState: ReplayState;
  replayTicks: ReplayTick[];
  raidMarkers: ChartMarker[];
  momentMarkers: ChartMarker[];
  channelColors: Record<string, string>;
  canSplitViewers: boolean;
  canSplitChat: boolean;
  viewerSeries: ChartSeries[];
  chatSeries: ChartSeries[];
  chatMarkers: ChartMarker[];
}

export function useReportStoryModel({
  data,
  analysis,
  replayIndex,
  splitViewers,
  splitChat,
  t,
}: {
  data: SessionData | null;
  analysis: ReportAnalysis | null;
  replayIndex: ReplayIndex | null;
  splitViewers: boolean;
  splitChat: boolean;
  t: I18n["t"];
}): ReportStoryModel | null {
  return useMemo(() => {
    if (!data || !analysis) return null;
    const sampleCount = data.samples.length;
    const viewerCount = data.viewerSamples.length;
    const replayState: ReplayState = replayIndex?.segments.length
      ? "ready"
      : data.recordings.length > 0
        ? "empty"
        : "missing";
    const indexAt = (timestamp: number) => {
      let low = 0;
      let high = sampleCount;
      while (low < high) {
        const middle = low + ((high - low) >> 1);
        if (data.samples[middle].t < timestamp) low = middle + 1;
        else high = middle;
      }
      return Math.min(low, Math.max(0, sampleCount - 1));
    };
    const viewerIndexAt = (timestamp: number) => {
      let low = 0;
      let high = viewerCount;
      while (low < high) {
        const middle = low + ((high - low) >> 1);
        if (data.viewerSamples[middle].t < timestamp) low = middle + 1;
        else high = middle;
      }
      return Math.min(low, Math.max(0, viewerCount - 1));
    };
    const colors = channelColors(analysis.byChannel.channels);
    const viewerChannels = analysis.byChannel.channels.filter(
      (channel) => channel.viewers.hasData,
    );
    const chatChannels = analysis.byChannel.channels.filter(
      (channel) => channel.chat.total > 0,
    );
    const canSplitViewers = viewerChannels.length > 1;
    const canSplitChat =
      analysis.byChannel.hasChatByChannel && chatChannels.length > 1;

    return {
      sampleCount,
      viewerCount,
      replayState,
      replayTicks:
        replayState === "ready"
          ? [
              ...analysis.events
                .filter(
                  (event) =>
                    event.kind === "error" || event.kind === "reconnect",
                )
                .map((event) => ({
                  t: event.t,
                  color: event.kind === "error" ? "#ef4444" : "#f97316",
                  label: event.label,
                })),
              ...data.markers.map((marker) => ({
                t: marker.t,
                color: "#e0b040",
                label: marker.label,
              })),
            ]
          : [],
      raidMarkers: data.alertEvents
        .filter((event) => event.kind === "raid")
        .map((event) => ({
          index: viewerIndexAt(event.t),
          color: "#7c9cff",
        })),
      momentMarkers: analysis.highlights.map((highlight) => ({
        index: viewerIndexAt(highlight.t),
        color:
          highlight.kind === "raid"
            ? "#7c9cff"
            : highlight.kind === "viewers"
              ? "#56e39b"
              : highlight.kind === "alert"
                ? "#ff5a36"
                : "#ffb323",
      })),
      channelColors: colors,
      canSplitViewers,
      canSplitChat,
      viewerSeries:
        splitViewers && canSplitViewers
          ? viewerChannels.map((channel) => ({
              label: channel.source,
              color: colors[channel.key],
              values: viewerSeriesFor(data, channel.key),
            }))
          : [
              {
                label: t("reports.viewers.series"),
                color: "#56e39b",
                values: viewerSeries(data),
              },
            ],
      chatSeries:
        splitChat && canSplitChat
          ? chatChannels.map((channel) => ({
              label: channel.source,
              color: colors[channel.key],
              values: chatRateSeriesFor(data, channel.key),
            }))
          : [
              {
                label: t("reports.chat.series"),
                color: "#ffb323",
                values: chatRateSeries(data),
              },
            ],
      chatMarkers: analysis.highlights
        .filter((highlight) => highlight.kind === "chat")
        .map((highlight) => ({
          index: indexAt(highlight.t),
          color: "#ffb323",
        })),
    };
  }, [analysis, data, replayIndex, splitChat, splitViewers, t]);
}

export interface ReportTechnicalModel {
  markers: ChartMarker[];
  bitrateSeries: ChartSeries[];
  machineSeries: ChartSeries[];
  obsSeries: ChartSeries[];
  hasMachineData: boolean;
}

export function useReportTechnicalModel({
  data,
  analysis,
  open,
  t,
}: {
  data: SessionData | null;
  analysis: ReportAnalysis | null;
  open: boolean;
  t: I18n["t"];
}): ReportTechnicalModel | null {
  return useMemo(() => {
    if (!data || !analysis || !open) return null;
    const indexAt = (timestamp: number) => {
      for (let index = 0; index < data.samples.length; index++)
        if (data.samples[index].t >= timestamp) return index;
      return Math.max(0, data.samples.length - 1);
    };
    const cpu = cpuSeries(data);
    const gpu = gpuSeries(data);
    const memory = memorySeries(data);
    const hasMachineData =
      cpu.some((value) => value != null) ||
      gpu.some((value) => value != null) ||
      memory.some((value) => value != null);
    return {
      markers: analysis.events
        .filter(
          (event) =>
            event.kind === "reconnect" ||
            event.kind === "error" ||
            event.kind === "signal",
        )
        .map((event) => ({
          index: indexAt(event.t),
          color:
            event.kind === "error"
              ? "#ef4444"
              : event.kind === "signal"
                ? "#a855f7"
                : "#f97316",
        })),
      bitrateSeries: data.meta.platforms.map((platform) => ({
        label: platform.name,
        color: platformColor(platform.platformId),
        values: bitrateSeries(data, platform.id).map((value) =>
          value == null ? null : value / 1000,
        ),
      })),
      machineSeries: [
        { label: "CPU", color: "#ff7a45", values: cpu },
        ...(gpu.some((value) => value != null)
          ? [{ label: "GPU", color: "#56b3ff", values: gpu }]
          : []),
        ...(memory.some((value) => value != null)
          ? [
              {
                label: t("reports.machine.memory"),
                color: "#a78bfa",
                values: memory,
              },
            ]
          : []),
      ],
      obsSeries: [
        {
          label: t("reports.obs.series"),
          color: "#a855f7",
          values: obsRenderSeries(data),
        },
      ],
      hasMachineData,
    };
  }, [analysis, data, open, t]);
}

export interface ReportTimelineModel {
  seek: SeekRequest | null;
  sampleClock: PlaybackSource;
  viewerClock: PlaybackSource;
  setPlayhead: (timestamp: number | null) => void;
  seekTo: (timestamp: number) => void;
  seekSample?: (index: number) => void;
  seekViewer?: (index: number) => void;
  relative: (timestamp: number) => string;
  relativeAtSample: (index: number) => string;
  relativeAtViewer: (index: number) => string;
}

export function useReportTimeline(
  data: SessionData | null,
  replayState: ReplayState,
): ReportTimelineModel {
  const clock = useMemo(createPlaybackClock, []);
  const [seek, setSeek] = useState<SeekRequest | null>(null);
  const sampleTimes = useMemo(
    () => data?.samples.map((sample) => sample.t) ?? [],
    [data?.samples],
  );
  const viewerTimes = useMemo(
    () => data?.viewerSamples.map((sample) => sample.t) ?? [],
    [data?.viewerSamples],
  );
  const seekTo = useCallback(
    (timestamp: number) =>
      setSeek((current) => ({
        epoch: timestamp,
        nonce: (current?.nonce ?? 0) + 1,
      })),
    [],
  );
  const seekSampleAt = useCallback(
    (index: number) => {
      const timestamp = sampleTimes[Math.round(index)];
      if (timestamp != null) seekTo(timestamp);
    },
    [sampleTimes, seekTo],
  );
  const seekViewerAt = useCallback(
    (index: number) => {
      const timestamp = viewerTimes[Math.round(index)];
      if (timestamp != null) seekTo(timestamp);
    },
    [seekTo, viewerTimes],
  );
  const relative = useCallback(
    (timestamp: number) => relativeTime(data?.meta.startedAt ?? 0, timestamp),
    [data?.meta.startedAt],
  );
  const relativeAtSample = useCallback(
    (index: number) =>
      relative(
        data?.samples[Math.min(index, data.samples.length - 1)]?.t ??
          data?.meta.startedAt ??
          0,
      ),
    [data, relative],
  );
  const relativeAtViewer = useCallback(
    (index: number) =>
      relative(
        data?.viewerSamples[Math.min(index, data.viewerSamples.length - 1)]
          ?.t ??
          data?.meta.startedAt ??
          0,
      ),
    [data, relative],
  );
  const hasReplay = replayState === "ready";
  const sampleClock = useMemo<PlaybackSource>(
    () => ({
      subscribe: clock.subscribe,
      getSnapshot: () => {
        const value = clock.getSnapshot();
        return value == null ? null : fractionalIndexAt(sampleTimes, value);
      },
    }),
    [clock, sampleTimes],
  );
  const viewerClock = useMemo<PlaybackSource>(
    () => ({
      subscribe: clock.subscribe,
      getSnapshot: () => {
        const value = clock.getSnapshot();
        return value == null ? null : fractionalIndexAt(viewerTimes, value);
      },
    }),
    [clock, viewerTimes],
  );

  return {
    seek,
    sampleClock,
    viewerClock,
    setPlayhead: clock.set,
    seekTo,
    seekSample: hasReplay ? seekSampleAt : undefined,
    seekViewer: hasReplay ? seekViewerAt : undefined,
    relative,
    relativeAtSample,
    relativeAtViewer,
  };
}
