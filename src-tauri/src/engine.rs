mod abr;
mod args;
mod hybrid;
mod runtime;

pub use abr::{AutoBitrate, BitrateAction};
pub(crate) use args::ffmpeg_args_for_rendition_egress;
pub use args::{
    ffmpeg_args_for_audio_decoder, ffmpeg_args_for_decoder, ffmpeg_args_for_encoder,
    ffmpeg_args_for_slate_audio, ffmpeg_args_for_slate_video, ffmpeg_args_for_target,
    ingest_path_name, ingest_url, mediamtx_config, program_path_name, program_spec, program_url,
    ProgramSpec, MEDIAMTX_API_PORT,
};
#[cfg(test)]
pub use hybrid::copy_limits;
pub(crate) use hybrid::effective_preset;
pub use hybrid::{
    apply_source_signal, effective_action, strictest_copy_limits, CopyLimits, SourceSignal,
};
pub use runtime::{
    EngineActivityGuard, EngineRuntime, EngineSnapshot, ObsStats, PlatformCheck,
    PlatformCheckState, RecorderLaunch, TargetStatus,
};
