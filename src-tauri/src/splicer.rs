//! Copy OBS packets and splice pre-encoded slates without re-encoding the live stream.
//! Announce OBS avcC once; reassert each source's SPS/PPS in-band when switching at an IDR.
//! Fall back to the compositor only before publishing; replacing an active publisher disconnects destinations.
//! Use binary process pipes rather than the line-oriented Tauri shell.

mod avc;
mod enhanced_flv;
mod flv;
mod pump;
mod slate;
#[cfg(test)]
mod tests;

pub use pump::run;
