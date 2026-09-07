use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::json;

use super::domain::{self, Recovery, VideoFile};
use super::store::MemStore;
use super::{chat_path, parse_video_name, valid_session_id, SessionStore};

fn paths(names: &[&str]) -> Vec<PathBuf> {
    names.iter().map(PathBuf::from).collect()
}

fn video(id: &str, seg: &str, len: u64) -> VideoFile {
    VideoFile {
        path: PathBuf::from(format!("/v/{seg}")),
        len,
        id: id.into(),
    }
}

#[test]
fn session_id_accepts_only_timestamp_digits() {
    assert!(valid_session_id("1721400000000"));
    assert!(!valid_session_id("../config"));
    assert!(!valid_session_id("1/2"));
    assert!(!valid_session_id(""));
    assert!(!valid_session_id("123456789012345678901"));
}

#[test]
fn video_name_recognizes_corneta_recordings() {
    assert_eq!(
        parse_video_name("1721400000000.mp4"),
        Some(("1721400000000".into(), 1))
    );
    assert_eq!(
        parse_video_name("1721400000000.p2.mp4"),
        Some(("1721400000000".into(), 2))
    );
}

#[test]
fn video_name_rejects_foreign_files() {
    for foreign in [
        "2024-07-30 21-15-03.mp4",
        "live-twitch.mp4",
        "ferias.mp4",
        "1721400000000.mkv",
        "1721400000000.p.mp4",
        "1721400000000.pX.mp4",
        "../../1721400000000.mp4",
        "casamento-1721400000000.mp4",
    ] {
        assert_eq!(parse_video_name(foreign), None, "must not match: {foreign}");
    }
}

#[test]
fn chat_is_stored_alongside_the_session() {
    assert_eq!(
        chat_path(Path::new("/x/1721400000000.ndjson")),
        Path::new("/x/1721400000000.chat.ndjson")
    );
}

#[test]
fn chat_file_is_not_a_session() {
    assert!(domain::is_session_file(Path::new(
        "/s/1721400000000.ndjson"
    )));
    assert!(!domain::is_session_file(Path::new(
        "/s/1721400000000.chat.ndjson"
    )));
    assert!(!domain::is_session_file(Path::new("/s/config.ndjson")));
    assert!(!domain::is_session_file(Path::new("/s/1721400000000.mp4")));
}

fn snapshot(cpu: Option<f64>) -> crate::engine::EngineSnapshot {
    let mut targets = HashMap::new();
    targets.insert(
        "t1".to_string(),
        crate::engine::TargetStatus {
            target_id: "t1".into(),
            name: "Twitch".into(),
            state: "live".into(),
            bitrate_kbps: 6000,
            fps: 60,
            dropped_frames: 3,
            uptime_sec: 12.0,
            message: None,
        },
    );
    crate::engine::EngineSnapshot {
        state: "live".into(),
        started_at: Some(1),
        ingest_live: true,
        operation_id: None,
        error_id: None,
        targets,
        message: None,
        cpu,
        gpu: None,
        memory_pct: Some(61.5),
        obs: None,
        forced_brb: false,
        guardian_status: None,
    }
}

#[test]
fn sample_without_chat_omits_the_channel_map() {
    let line = domain::sample_line(100, &snapshot(Some(42.0)), &HashMap::new(), &[]);
    assert_eq!(line["chat"], 0);
    assert!(line.get("chatBy").is_none());
    assert_eq!(line["kind"], "sample");
    assert_eq!(line["t"], 100);
    assert_eq!(line["cpu"], 42.0);
    assert_eq!(line["memoryPct"], 61.5);
    assert_eq!(line["targets"][0]["dropped"], 3);
    assert!(line.get("apps").is_none());
}

#[test]
fn sample_totals_chat_and_preserves_per_channel_counts() {
    let mut by_channel = HashMap::new();
    by_channel.insert("twitch:fulano".to_string(), 7u64);
    by_channel.insert("kick:fulano".to_string(), 5u64);
    let line = domain::sample_line(100, &snapshot(None), &by_channel, &[]);
    assert_eq!(line["chat"], 12);
    assert_eq!(line["chatBy"]["twitch:fulano"], 7);
    assert_eq!(line["chatBy"]["kick:fulano"], 5);
}

#[test]
fn sample_records_only_the_supplied_relevant_apps() {
    let apps = vec![crate::resources::ResourceAppSample {
        app_ref: "meujogo".into(),
        name: "MeuJogo".into(),
        cpu: 12.5,
        memory_mb: 2048.0,
        gpu_3d: Some(94.2),
        gpu_encode: None,
    }];
    let line = domain::sample_line(100, &snapshot(None), &HashMap::new(), &apps);
    assert_eq!(line["apps"][0]["appRef"], "meujogo");
    assert_eq!(line["apps"][0]["name"], "MeuJogo");
    assert_eq!(line["apps"][0]["gpu3d"], 94.2);
    assert!(line["apps"][0].get("gpuEncode").is_none());
}

#[test]
fn followers_without_channels_produce_no_record() {
    assert!(domain::followers_line(1, &[]).is_none());
    let items = vec![json!({ "source": "twitch:fulano", "total": 900 })];
    let line = domain::followers_line(1, &items).expect("a channel must produce a record");
    assert_eq!(line["kind"], "followers");
    assert_eq!(line["items"][0]["total"], 900);
}

#[test]
fn chat_message_omits_absent_color_and_native_id() {
    let minimal = domain::chat_msg_line(5, "twitch", "twitch:f", "zé", None, "oi", None);
    assert_eq!(
        minimal,
        json!({ "t": 5, "p": "twitch", "s": "twitch:f", "a": "zé", "m": "oi" })
    );
    let full = domain::chat_msg_line(
        5,
        "twitch",
        "twitch:f",
        "zé",
        Some("#fff"),
        "oi",
        Some("abc"),
    );
    assert_eq!(full["c"], "#fff");
    assert_eq!(full["i"], "abc");
}

#[test]
fn recovery_recording_end_does_not_invent_a_segment() {
    let line = domain::truncated_rec_end_line(9);
    assert_eq!(line["reason"], "truncated");
    assert!(line.get("seg").is_none());
    assert_eq!(domain::rec_end_line(9, 2, "stopped")["seg"], 2);
}

#[test]
fn metadata_declares_the_schema_version() {
    let line = domain::meta_line(1721400000000, "multi", vec![json!({ "id": "t1" })]);
    assert_eq!(line["schemaVersion"], 4);
    assert_eq!(line["id"], "1721400000000");
    assert_eq!(line["startedAt"], 1721400000000u64);
    assert_eq!(line["mode"], "multi");
}

#[test]
fn clock_jump_detection_ignores_sampling_delay() {
    assert!(!domain::is_clock_jump(domain::clock_drift_ms(3_500, 3_500)));
    assert!(!domain::is_clock_jump(domain::clock_drift_ms(2_000, 3_900)));
    assert!(domain::is_clock_jump(domain::clock_drift_ms(
        2_000, 3_602_000
    )));
    assert_eq!(domain::clock_drift_ms(2_000, -3_598_000), -3_600_000);
    assert!(domain::is_clock_jump(-3_600_000));
}

#[test]
fn recovery_recognizes_a_completed_session() {
    let raw = "{\"kind\":\"meta\"}\n{\"kind\":\"end\",\"endedAt\":9}\n";
    assert_eq!(domain::recovery_from_tail(raw), Recovery::Complete);
}

#[test]
fn recovery_respects_end_before_post_live_edits() {
    let raw = concat!(
        "{\"kind\":\"end\",\"endedAt\":9000}\n",
        "{\"kind\":\"marker\",\"t\":4000}\n",
        "{\"kind\":\"offset\",\"ms\":250}\n",
        "{\"kind\":\"recFinalized\",\"seg\":1}\n",
    );
    assert_eq!(domain::recovery_from_tail(raw), Recovery::Complete);
}

#[test]
fn tail_prefers_the_earliest_valid_end() {
    let raw = concat!(
        "{\"kind\":\"end\",\"endedAt\":5000}\n",
        "{\"kind\":\"marker\",\"t\":3000}\n",
        "{\"kind\":\"end\",\"endedAt\":2005000,\"recovered\":true}\n",
    );
    assert_eq!(domain::ended_at_from_tail(raw, 1000), Some(5000));
}

#[test]
fn recovery_marks_an_open_recording_as_truncated() {
    let raw = "{\"kind\":\"recording\",\"seg\":1}\n{\"kind\":\"sample\"}\n";
    assert_eq!(
        domain::recovery_from_tail(raw),
        Recovery::Interrupted {
            was_recording: true
        }
    );
}

#[test]
fn recovery_respects_previously_closed_segments() {
    let raw = "{\"kind\":\"recording\",\"seg\":1}\n{\"kind\":\"recEnd\",\"seg\":1}\n{\"kind\":\"sample\"}\n";
    assert_eq!(
        domain::recovery_from_tail(raw),
        Recovery::Interrupted {
            was_recording: false
        }
    );
}

#[test]
fn recovery_ignores_a_partial_first_line() {
    let raw = "kind\":\"sample\",\"cpu\":4\n{\"kind\":\"end\",\"endedAt\":9}\n";
    assert_eq!(domain::recovery_from_tail(raw), Recovery::Complete);

    let partial = "\"seg\":1}\n{\"kind\":\"sample\"}\n";
    assert_eq!(
        domain::recovery_from_tail(partial),
        Recovery::Interrupted {
            was_recording: false
        }
    );
}

#[test]
fn recovery_skips_empty_or_oversized_files() {
    assert!(!domain::worth_recovering(0));
    assert!(domain::worth_recovering(1));
    assert!(domain::worth_recovering(domain::MAX_SESSION_BYTES));
    assert!(!domain::worth_recovering(domain::MAX_SESSION_BYTES + 1));
}

#[test]
fn metadata_estimates_duration_from_mtime() {
    let line = r#"{"kind":"meta","id":"1000","startedAt":1000,"mode":"multi","platforms":[]}"#;
    let meta = domain::parse_meta_line(line, Some(61_000)).expect("valid metadata");
    assert_eq!(meta.id, "1000");
    assert_eq!(meta.duration_sec, 60);
    assert_eq!(meta.ended_at, Some(61_000));
    let without_mtime = domain::parse_meta_line(line, None).expect("valid metadata");
    assert_eq!(without_mtime.duration_sec, 0);
    assert_eq!(without_mtime.ended_at, None);
}

#[test]
fn metadata_rejects_non_metadata_records() {
    assert!(domain::parse_meta_line("{\"kind\":\"sample\",\"t\":1}", Some(2)).is_none());
    assert!(domain::parse_meta_line("lixo", Some(2)).is_none());
    assert!(domain::parse_meta_line("", Some(2)).is_none());
    assert!(domain::parse_meta_line("{\"kind\":\"meta\",\"id\":\"1\"}", Some(2)).is_none());
}

#[test]
fn session_pruning_does_not_count_chat_files() {
    let files = paths(&[
        "/s/1000.ndjson",
        "/s/1000.chat.ndjson",
        "/s/2000.ndjson",
        "/s/2000.chat.ndjson",
        "/s/3000.ndjson",
        "/s/3000.chat.ndjson",
    ]);
    assert!(domain::plan_session_prune(&files, 3).is_empty());
}

#[test]
fn session_pruning_removes_the_oldest_sessions() {
    let files = paths(&[
        "/s/3000.ndjson",
        "/s/1000.ndjson",
        "/s/2000.ndjson",
        "/s/4000.ndjson",
    ]);
    assert_eq!(
        domain::plan_session_prune(&files, 2),
        paths(&["/s/1000.ndjson", "/s/2000.ndjson"])
    );
}

const GB: u64 = 1024 * 1024 * 1024;

struct PruneWorkspace(PathBuf);

impl PruneWorkspace {
    fn new() -> Self {
        let root =
            std::env::temp_dir().join(format!("corneta-prune-isolation-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let workspace = Self(root);
        std::fs::create_dir(workspace.0.join("sessions")).unwrap();
        std::fs::create_dir(workspace.0.join("imported")).unwrap();
        workspace
    }
}

impl Drop for PruneWorkspace {
    fn drop(&mut self) {
        // Delete only fixed paths in this test-owned directory, never real recordings or configuration.
        for file in [
            "sessions/1000.mp4",
            "sessions/3000.mp4",
            "sessions/3000.ndjson",
            "imported/2000.mp4",
        ] {
            let _ = std::fs::remove_file(self.0.join(file));
        }
        let _ = std::fs::remove_dir(self.0.join("sessions"));
        let _ = std::fs::remove_dir(self.0.join("imported"));
        let _ = std::fs::remove_dir(&self.0);
    }
}

#[test]
fn contributor_automatic_prune_preserves_imported_videos_and_prunes_only_its_own() {
    check_automatic_prune_scope(true);
}

#[test]
fn official_automatic_prune_keeps_existing_custom_directory_behavior() {
    check_automatic_prune_scope(false);
}

fn check_automatic_prune_scope(contributor: bool) {
    let workspace = PruneWorkspace::new();
    let sessions = workspace.0.join("sessions");
    let imported = workspace.0.join("imported");
    let own_orphan = sessions.join("1000.mp4");
    let own_kept = sessions.join("3000.mp4");
    let foreign_video = imported.join("2000.mp4");
    for file in [&own_orphan, &own_kept, &foreign_video] {
        std::fs::write(file, b"synthetic-video").unwrap();
    }
    std::fs::write(sessions.join("3000.ndjson"), b"{\"kind\":\"meta\"}\n").unwrap();

    assert_eq!(
        super::prune_videos_in(
            &super::store::DiskStore,
            &sessions,
            Some(&imported),
            1,
            contributor,
        ),
        0,
    );
    assert!(!own_orphan.exists());
    assert!(own_kept.exists());
    assert_eq!(foreign_video.exists(), contributor);
    if contributor {
        assert_eq!(std::fs::read(foreign_video).unwrap(), b"synthetic-video");
    }
}

#[test]
fn video_pruning_removes_orphans_even_with_available_space() {
    let plan = domain::plan_video_prune(
        vec![video("1000", "1000.mp4", GB), video("9999", "9999.mp4", GB)],
        &["1000".to_string()],
        50,
    );
    assert_eq!(plan.orphans, paths(&["/v/9999.mp4"]));
    assert!(
        plan.candidates.is_empty(),
        "within budget: no space-based pruning"
    );
    assert_eq!(plan.total, GB, "orphans do not count toward the budget");
}

#[test]
fn video_pruning_considers_oldest_recordings_first() {
    let ids = vec!["1000".to_string(), "2000".to_string(), "3000".to_string()];
    let plan = domain::plan_video_prune(
        vec![
            video("3000", "3000.mp4", 2 * GB),
            video("1000", "1000.mp4", 2 * GB),
            video("2000", "2000.mp4", 2 * GB),
        ],
        &ids,
        5,
    );
    assert_eq!(
        plan.candidates.iter().map(|(p, _)| p).collect::<Vec<_>>(),
        vec![
            Path::new("/v/1000.mp4"),
            Path::new("/v/2000.mp4"),
            Path::new("/v/3000.mp4")
        ]
    );
    assert_eq!(plan.total, 6 * GB);
    assert_eq!(plan.budget, 5 * GB);
}

#[test]
fn video_pruning_handles_zero_and_overflowing_budgets() {
    let zero = domain::plan_video_prune(vec![video("1000", "1000.mp4", 1)], &["1000".into()], 0);
    assert_eq!(zero.budget, 0);
    assert_eq!(zero.candidates.len(), 1);

    let oversized = domain::plan_video_prune(
        vec![video("1000", "1000.mp4", GB)],
        &["1000".into()],
        u64::MAX,
    );
    assert_eq!(oversized.budget, u64::MAX);
    assert!(oversized.candidates.is_empty());
}

#[test]
fn recovery_closes_only_interrupted_sessions() {
    let store = MemStore::with(&[
        (
            "/s/1000.ndjson",
            "{\"kind\":\"meta\"}\n{\"kind\":\"end\",\"endedAt\":5}\n",
        ),
        (
            "/s/2000.ndjson",
            "{\"kind\":\"meta\"}\n{\"kind\":\"sample\",\"t\":7}\n",
        ),
    ]);
    super::recover_all(&store, Path::new("/s"), 99);

    assert_eq!(
        store.lines("/s/1000.ndjson").len(),
        2,
        "a completed session must not gain records"
    );
    let recovered = store.lines("/s/2000.ndjson");
    assert_eq!(recovered.last().unwrap()["kind"], "end");
    assert_eq!(recovered.last().unwrap()["recovered"], true);
    assert_eq!(recovered.last().unwrap()["endedAt"], 99);
    assert!(
        recovered.iter().all(|l| l["kind"] != "recEnd"),
        "no active recording means no truncated-video marker"
    );
}

#[test]
fn recovery_marks_truncated_video_before_closing() {
    let store = MemStore::with(&[(
        "/s/2000.ndjson",
        "{\"kind\":\"recording\",\"seg\":1}\n{\"kind\":\"sample\"}\n",
    )]);
    super::recover_all(&store, Path::new("/s"), 99);

    let lines = store.lines("/s/2000.ndjson");
    assert_eq!(lines[lines.len() - 2]["kind"], "recEnd");
    assert_eq!(lines[lines.len() - 2]["reason"], "truncated");
    assert_eq!(lines[lines.len() - 1]["kind"], "end");
}

#[test]
fn recovery_does_not_modify_chat_files() {
    let store = MemStore::with(&[
        ("/s/2000.ndjson", "{\"kind\":\"meta\"}\n"),
        ("/s/2000.chat.ndjson", "{\"t\":1,\"m\":\"oi\"}\n"),
    ]);
    super::recover_all(&store, Path::new("/s"), 99);

    assert_eq!(
        store.body("/s/2000.chat.ndjson"),
        "{\"t\":1,\"m\":\"oi\"}\n",
        "recovery must leave chat unchanged"
    );
}

#[test]
fn recovery_skips_empty_files() {
    let store = MemStore::with(&[("/s/2000.ndjson", "")]);
    super::recover_all(&store, Path::new("/s"), 99);
    assert_eq!(store.body("/s/2000.ndjson"), "");
}

#[test]
fn session_pruning_removes_chat_siblings() {
    let store = MemStore::with(&[
        ("/s/1000.ndjson", "{\"kind\":\"meta\"}\n"),
        ("/s/1000.chat.ndjson", "{\"t\":1}\n"),
        ("/s/2000.ndjson", "{\"kind\":\"meta\"}\n"),
        ("/s/2000.chat.ndjson", "{\"t\":1}\n"),
    ]);
    super::prune_sessions(&store, Path::new("/s"), 1);

    assert!(!store.exists("/s/1000.ndjson"));
    assert!(!store.exists("/s/1000.chat.ndjson"));
    assert!(store.exists("/s/2000.ndjson"));
    assert!(store.exists("/s/2000.chat.ndjson"));
}

#[test]
fn session_list_is_newest_first() {
    let store = MemStore::with(&[
        (
            "/s/1000.ndjson",
            "{\"kind\":\"meta\",\"id\":\"1000\",\"startedAt\":1000,\"mode\":\"multi\",\"platforms\":[]}\n",
        ),
        (
            "/s/3000.ndjson",
            "{\"kind\":\"meta\",\"id\":\"3000\",\"startedAt\":3000,\"mode\":\"single\",\"platforms\":[]}\n",
        ),
        ("/s/3000.chat.ndjson", "{\"t\":1}\n"),
    ]);
    store.set_mtime("/s/1000.ndjson", 2_000);
    store.set_mtime("/s/3000.ndjson", 4_000);

    let list = super::list_in(&store, Path::new("/s"), &["1000".to_string()]);
    assert_eq!(
        list.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
        vec!["3000", "1000"]
    );
    assert!(list[0].has_chat, "session 3000 has recorded chat");
    assert!(!list[0].has_video, "session 3000 has no video on disk");
    assert!(!list[1].has_chat);
    assert!(list[1].has_video, "session 1000 has video on disk");
    assert_eq!(list[1].duration_sec, 1);
}

#[test]
fn session_list_prefers_recorded_end_over_copy_mtime() {
    let store = MemStore::with(&[(
        "/s/1000.ndjson",
        concat!(
            "{\"kind\":\"meta\",\"id\":\"1000\",\"startedAt\":1000,\"platforms\":[]}\n",
            "{\"kind\":\"sample\",\"t\":4000}\n",
            "{\"kind\":\"end\",\"endedAt\":5000}\n",
            "{\"kind\":\"marker\",\"t\":3000}\n",
            "{\"kind\":\"end\",\"endedAt\":2005000,\"recovered\":true}\n",
        ),
    )]);
    store.set_mtime("/s/1000.ndjson", 9_999_000);

    let list = super::list_in(&store, Path::new("/s"), &[]);
    assert_eq!(list[0].ended_at, Some(5000));
    assert_eq!(list[0].duration_sec, 4);
}

#[test]
fn memory_store_rejects_new_records_after_reaching_capacity() {
    let store = MemStore::with(&[("/s/2000.ndjson", "")]);
    let filling_record = "x".repeat(100);
    store.append(
        Path::new("/s/2000.ndjson"),
        &json!({ "a": filling_record }),
        50,
    );
    assert!(
        !store.body("/s/2000.ndjson").is_empty(),
        "the initially empty memory store accepts the first record"
    );
    store.append(Path::new("/s/2000.ndjson"), &json!({ "b": 1 }), 50);
    assert_eq!(
        store.lines("/s/2000.ndjson").len(),
        1,
        "after reaching capacity, the next record is discarded"
    );
}
