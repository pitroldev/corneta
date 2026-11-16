import type { MessageKey } from "./i18n";
import type { ObsGuide, PlatformIssueTopic } from "./platformCheck";

export const TOPIC_KEY: Record<PlatformIssueTopic, MessageKey> = {
  audio: "golive.target.platform.topic.audio",
  bitrateHigh: "golive.target.platform.topic.bitrateHigh",
  bitrateLow: "golive.target.platform.topic.bitrateLow",
  frameRate: "golive.target.platform.topic.frameRate",
  keyframes: "golive.target.platform.topic.keyframes",
  other: "golive.target.platform.topic.other",
  resolution: "golive.target.platform.topic.resolution",
  signal: "golive.target.platform.topic.signal",
  slowUpload: "golive.target.platform.topic.slowUpload",
};

export const GUIDE_KEY: Record<ObsGuide, MessageKey> = {
  audio: "golive.target.platform.guide.audio",
  bitrate: "golive.target.platform.guide.bitrate",
  frameRate: "golive.target.platform.guide.frameRate",
  keyframes: "golive.target.platform.guide.keyframes",
  other: "golive.target.platform.guide.other",
  resolution: "golive.target.platform.guide.resolution",
};
