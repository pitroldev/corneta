//! Testes da sessão.
//!
//! O núcleo (`domain`) é testado direto. A aplicação (recuperação, poda, listagem) roda
//! contra o `MemStore` — sem disco, sem Tauri, sem relógio de verdade.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::json;

use super::domain::{self, Recovery, VideoFile};
use super::store::MemStore;
use super::{chat_path, parse_video_name, valid_session_id, SessionStore};

fn caminhos(nomes: &[&str]) -> Vec<PathBuf> {
    nomes.iter().map(PathBuf::from).collect()
}

fn video(id: &str, seg: &str, len: u64) -> VideoFile {
    VideoFile {
        path: PathBuf::from(format!("/v/{seg}")),
        len,
        id: id.into(),
    }
}

// ---------------------------------------------------------------------------
// Nomes
// ---------------------------------------------------------------------------

#[test]
fn session_id_accepts_only_timestamp_digits() {
    assert!(valid_session_id("1721400000000"));
    assert!(!valid_session_id("../config"));
    assert!(!valid_session_id("1/2"));
    assert!(!valid_session_id(""));
    assert!(!valid_session_id("123456789012345678901"));
}

#[test]
fn video_name_reconhece_gravacao_da_corneta() {
    assert_eq!(
        parse_video_name("1721400000000.mp4"),
        Some(("1721400000000".into(), 1))
    );
    assert_eq!(
        parse_video_name("1721400000000.p2.mp4"),
        Some(("1721400000000".into(), 2))
    );
}

/// A trava de segurança da poda: a pasta de vídeo é do streamer e pode ser a mesma onde
/// o OBS grava. Nada que não seja NOSSO padrão de nome pode virar candidato a exclusão.
#[test]
fn video_name_recusa_arquivo_alheio() {
    for alheio in [
        "2024-07-30 21-15-03.mp4",
        "live-twitch.mp4",
        "ferias.mp4",
        "1721400000000.mkv",
        "1721400000000.p.mp4",
        "1721400000000.pX.mp4",
        "../../1721400000000.mp4",
        "casamento-1721400000000.mp4",
    ] {
        assert_eq!(parse_video_name(alheio), None, "não podia casar: {alheio}");
    }
}

#[test]
fn chat_mora_ao_lado_da_sessao() {
    assert_eq!(
        chat_path(Path::new("/x/1721400000000.ndjson")),
        Path::new("/x/1721400000000.chat.ndjson")
    );
}

/// O irmão de chat termina em `.ndjson` e NÃO é uma sessão. Se ele contasse, toda
/// contagem (poda, lista, recuperação) enxergaria o dobro de sessões.
#[test]
fn arquivo_de_chat_nao_e_sessao() {
    assert!(domain::is_session_file(Path::new(
        "/s/1721400000000.ndjson"
    )));
    assert!(!domain::is_session_file(Path::new(
        "/s/1721400000000.chat.ndjson"
    )));
    assert!(!domain::is_session_file(Path::new("/s/config.ndjson")));
    assert!(!domain::is_session_file(Path::new("/s/1721400000000.mp4")));
}

// ---------------------------------------------------------------------------
// Linhas do NDJSON (contrato com o parser do frontend)
// ---------------------------------------------------------------------------

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
        obs: None,
        forced_brb: false,
    }
}

/// A maioria das amostras de uma live de 3h não tem mensagem nenhuma. Um `chatBy: {}` por
/// linha engordaria o NDJSON sem dizer nada além do que o `chat: 0` já diz.
#[test]
fn amostra_sem_conversa_nao_carrega_o_mapa_por_canal() {
    let linha = domain::sample_line(100, &snapshot(Some(42.0)), &HashMap::new());
    assert_eq!(linha["chat"], 0);
    assert!(linha.get("chatBy").is_none());
    assert_eq!(linha["kind"], "sample");
    assert_eq!(linha["t"], 100);
    assert_eq!(linha["cpu"], 42.0);
    assert_eq!(linha["targets"][0]["dropped"], 3);
}

/// `chat` é o TOTAL e continua existindo: relatório gravado antes da segregação por canal
/// só tem ele, e a análise precisa seguir lendo os dois formatos.
#[test]
fn amostra_soma_o_total_e_preserva_a_quebra_por_canal() {
    let mut por_canal = HashMap::new();
    por_canal.insert("twitch:fulano".to_string(), 7u64);
    por_canal.insert("kick:fulano".to_string(), 5u64);
    let linha = domain::sample_line(100, &snapshot(None), &por_canal);
    assert_eq!(linha["chat"], 12);
    assert_eq!(linha["chatBy"]["twitch:fulano"], 7);
    assert_eq!(linha["chatBy"]["kick:fulano"], 5);
}

/// Sem canal que exponha o contador, não há linha — em vez de uma linha vazia que a
/// análise teria que aprender a ignorar.
#[test]
fn seguidores_sem_canal_nao_viram_linha() {
    assert!(domain::followers_line(1, &[]).is_none());
    let items = vec![json!({ "source": "twitch:fulano", "total": 900 })];
    let linha = domain::followers_line(1, &items).expect("com canal, tem linha");
    assert_eq!(linha["kind"], "followers");
    assert_eq!(linha["items"][0]["total"], 900);
}

#[test]
fn mensagem_de_chat_so_leva_cor_e_id_quando_existem() {
    let magra = domain::chat_msg_line(5, "twitch", "twitch:f", "zé", None, "oi", None);
    assert_eq!(
        magra,
        json!({ "t": 5, "p": "twitch", "s": "twitch:f", "a": "zé", "m": "oi" })
    );
    let cheia = domain::chat_msg_line(
        5,
        "twitch",
        "twitch:f",
        "zé",
        Some("#fff"),
        "oi",
        Some("abc"),
    );
    assert_eq!(cheia["c"], "#fff");
    assert_eq!(cheia["i"], "abc");
}

/// O `recEnd` da recuperação não tem `seg`: quem recupera não sabe qual segmento estava
/// aberto. Se um dia ganhar um `seg` chutado, o player passa a mentir sobre qual arquivo
/// ficou truncado.
#[test]
fn rec_end_de_recuperacao_nao_inventa_segmento() {
    let linha = domain::truncated_rec_end_line(9);
    assert_eq!(linha["reason"], "truncated");
    assert!(linha.get("seg").is_none());
    assert_eq!(domain::rec_end_line(9, 2, "stopped")["seg"], 2);
}

#[test]
fn cabecalho_declara_a_versao_do_esquema() {
    let linha = domain::meta_line(1721400000000, "multi", vec![json!({ "id": "t1" })]);
    assert_eq!(linha["schemaVersion"], 3);
    assert_eq!(linha["id"], "1721400000000");
    assert_eq!(linha["startedAt"], 1721400000000u64);
    assert_eq!(linha["mode"], "multi");
}

// ---------------------------------------------------------------------------
// Salto de relógio
// ---------------------------------------------------------------------------

/// O amostrador roda a cada ~2s e pode atrasar sob carga. Atraso não é salto — só um
/// desvio grande entre parede e monotônico é acerto de relógio de verdade.
#[test]
fn salto_de_relogio_ignora_atraso_do_amostrador() {
    // amostrador atrasou 1,5s: os dois relógios andaram junto, ninguém mexeu em nada
    assert!(!domain::is_clock_jump(domain::clock_drift_ms(3_500, 3_500)));
    assert!(!domain::is_clock_jump(domain::clock_drift_ms(2_000, 3_900)));
    // NTP puxou 1h pra frente
    assert!(domain::is_clock_jump(domain::clock_drift_ms(
        2_000, 3_602_000
    )));
    // e pra trás — o sinal importa pro front desfazer, mas o salto conta dos dois lados
    assert_eq!(domain::clock_drift_ms(2_000, -3_598_000), -3_600_000);
    assert!(domain::is_clock_jump(-3_600_000));
}

// ---------------------------------------------------------------------------
// Recuperação
// ---------------------------------------------------------------------------

#[test]
fn recuperacao_reconhece_sessao_que_terminou_direito() {
    let raw = "{\"kind\":\"meta\"}\n{\"kind\":\"end\",\"endedAt\":9}\n";
    assert_eq!(domain::recovery_from_tail(raw), Recovery::Complete);
}

#[test]
fn recuperacao_ve_gravacao_aberta_como_truncada() {
    let raw = "{\"kind\":\"recording\",\"seg\":1}\n{\"kind\":\"sample\"}\n";
    assert_eq!(
        domain::recovery_from_tail(raw),
        Recovery::Interrupted {
            was_recording: true
        }
    );
}

/// Segmento que já fechou não pode ser marcado como truncado de novo — o `recEnd` mais
/// recente vence o `recording` anterior.
#[test]
fn recuperacao_respeita_segmento_ja_fechado() {
    let raw = "{\"kind\":\"recording\",\"seg\":1}\n{\"kind\":\"recEnd\",\"seg\":1}\n{\"kind\":\"sample\"}\n";
    assert_eq!(
        domain::recovery_from_tail(raw),
        Recovery::Interrupted {
            was_recording: false
        }
    );
}

/// A cauda é cortada por BYTES: a primeira linha quase sempre chega partida ao meio.
/// Linha quebrada não parseia e é ignorada — não pode entrar em pânico nem confundir o
/// estado final.
#[test]
fn recuperacao_aguenta_linha_cortada_no_meio() {
    let raw = "kind\":\"sample\",\"cpu\":4\n{\"kind\":\"end\",\"endedAt\":9}\n";
    assert_eq!(domain::recovery_from_tail(raw), Recovery::Complete);

    let partida = "\"seg\":1}\n{\"kind\":\"sample\"}\n";
    assert_eq!(
        domain::recovery_from_tail(partida),
        Recovery::Interrupted {
            was_recording: false
        }
    );
}

#[test]
fn arquivo_vazio_ou_gigante_nao_vale_recuperar() {
    assert!(!domain::worth_recovering(0));
    assert!(domain::worth_recovering(1));
    assert!(domain::worth_recovering(domain::MAX_SESSION_BYTES));
    assert!(!domain::worth_recovering(domain::MAX_SESSION_BYTES + 1));
}

// ---------------------------------------------------------------------------
// Cabeçalho
// ---------------------------------------------------------------------------

#[test]
fn cabecalho_estima_a_duracao_pelo_mtime() {
    let linha = r#"{"kind":"meta","id":"1000","startedAt":1000,"mode":"multi","platforms":[]}"#;
    let meta = domain::parse_meta_line(linha, Some(61_000)).expect("cabeçalho válido");
    assert_eq!(meta.id, "1000");
    assert_eq!(meta.duration_sec, 60);
    assert_eq!(meta.ended_at, Some(61_000));
    // sem mtime (arquivo sumiu debaixo da leitura) a lista ainda aparece, com duração zero
    let sem = domain::parse_meta_line(linha, None).expect("cabeçalho válido");
    assert_eq!(sem.duration_sec, 0);
    assert_eq!(sem.ended_at, None);
}

#[test]
fn cabecalho_recusa_o_que_nao_e_cabecalho() {
    assert!(domain::parse_meta_line("{\"kind\":\"sample\",\"t\":1}", Some(2)).is_none());
    assert!(domain::parse_meta_line("lixo", Some(2)).is_none());
    assert!(domain::parse_meta_line("", Some(2)).is_none());
    // meta sem `startedAt` não serve: a lista ordena por ele
    assert!(domain::parse_meta_line("{\"kind\":\"meta\",\"id\":\"1\"}", Some(2)).is_none());
}

// ---------------------------------------------------------------------------
// Poda por contagem
// ---------------------------------------------------------------------------

/// O bug que o filtro de id evita: `<id>.chat.ndjson` também termina em `.ndjson`. Sem o
/// filtro, 3 sessões com chat contariam como 6 e a poda apagaria o dobro do que devia.
#[test]
fn poda_por_contagem_nao_conta_o_arquivo_de_chat() {
    let arquivos = caminhos(&[
        "/s/1000.ndjson",
        "/s/1000.chat.ndjson",
        "/s/2000.ndjson",
        "/s/2000.chat.ndjson",
        "/s/3000.ndjson",
        "/s/3000.chat.ndjson",
    ]);
    assert!(domain::plan_session_prune(&arquivos, 3).is_empty());
}

#[test]
fn poda_por_contagem_tira_as_mais_antigas() {
    let arquivos = caminhos(&[
        "/s/3000.ndjson",
        "/s/1000.ndjson",
        "/s/2000.ndjson",
        "/s/4000.ndjson",
    ]);
    assert_eq!(
        domain::plan_session_prune(&arquivos, 2),
        caminhos(&["/s/1000.ndjson", "/s/2000.ndjson"])
    );
}

// ---------------------------------------------------------------------------
// Poda por espaço
// ---------------------------------------------------------------------------

const GB: u64 = 1024 * 1024 * 1024;

/// Órfão é vídeo cuja sessão já foi podada: sem relatório que o referencie, ele não tem
/// como aparecer na interface. Sai independente do teto.
#[test]
fn poda_de_video_recolhe_orfao_mesmo_com_espaco_de_sobra() {
    let plano = domain::plan_video_prune(
        vec![video("1000", "1000.mp4", GB), video("9999", "9999.mp4", GB)],
        &["1000".to_string()],
        50,
    );
    assert_eq!(plano.orphans, caminhos(&["/v/9999.mp4"]));
    assert!(plano.candidates.is_empty(), "cabe no teto: nada por espaço");
    assert_eq!(plano.total, GB, "órfão não conta pro teto");
}

#[test]
fn poda_de_video_oferece_os_mais_antigos_primeiro() {
    let ids = vec!["1000".to_string(), "2000".to_string(), "3000".to_string()];
    let plano = domain::plan_video_prune(
        vec![
            video("3000", "3000.mp4", 2 * GB),
            video("1000", "1000.mp4", 2 * GB),
            video("2000", "2000.mp4", 2 * GB),
        ],
        &ids,
        5,
    );
    assert_eq!(
        plano.candidates.iter().map(|(p, _)| p).collect::<Vec<_>>(),
        vec![
            Path::new("/v/1000.mp4"),
            Path::new("/v/2000.mp4"),
            Path::new("/v/3000.mp4")
        ]
    );
    assert_eq!(plano.total, 6 * GB);
    assert_eq!(plano.budget, 5 * GB);
}

/// Teto zero é escolha legítima ("não quero guardar vídeo"), e `keep_gb` absurdo não pode
/// estourar a multiplicação e virar teto minúsculo.
#[test]
fn poda_de_video_aguenta_teto_zero_e_teto_absurdo() {
    let zero = domain::plan_video_prune(vec![video("1000", "1000.mp4", 1)], &["1000".into()], 0);
    assert_eq!(zero.budget, 0);
    assert_eq!(zero.candidates.len(), 1);

    let absurdo = domain::plan_video_prune(
        vec![video("1000", "1000.mp4", GB)],
        &["1000".into()],
        u64::MAX,
    );
    assert_eq!(absurdo.budget, u64::MAX);
    assert!(absurdo.candidates.is_empty());
}

// ---------------------------------------------------------------------------
// Aplicação (contra o MemStore)
// ---------------------------------------------------------------------------

/// A recuperação roda no boot seguinte a um crash — o caso mais difícil de reproduzir na
/// mão, e justamente o que os betas viveram.
#[test]
fn recuperacao_fecha_so_a_sessao_que_ficou_aberta() {
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
        "sessão encerrada não podia ganhar linha nenhuma"
    );
    let abertas = store.lines("/s/2000.ndjson");
    assert_eq!(abertas.last().unwrap()["kind"], "end");
    assert_eq!(abertas.last().unwrap()["recovered"], true);
    assert_eq!(abertas.last().unwrap()["endedAt"], 99);
    assert!(
        abertas.iter().all(|l| l["kind"] != "recEnd"),
        "não estava gravando: nada de marcar vídeo truncado"
    );
}

#[test]
fn recuperacao_marca_o_video_truncado_antes_de_fechar() {
    let store = MemStore::with(&[(
        "/s/2000.ndjson",
        "{\"kind\":\"recording\",\"seg\":1}\n{\"kind\":\"sample\"}\n",
    )]);
    super::recover_all(&store, Path::new("/s"), 99);

    let linhas = store.lines("/s/2000.ndjson");
    assert_eq!(linhas[linhas.len() - 2]["kind"], "recEnd");
    assert_eq!(linhas[linhas.len() - 2]["reason"], "truncated");
    assert_eq!(linhas[linhas.len() - 1]["kind"], "end");
}

/// O arquivo de chat também termina em `.ndjson`. Ele não é uma sessão e não pode ganhar
/// um `end` de recuperação — o replay leria isso como mensagem.
#[test]
fn recuperacao_nao_escreve_no_arquivo_de_chat() {
    let store = MemStore::with(&[
        ("/s/2000.ndjson", "{\"kind\":\"meta\"}\n"),
        ("/s/2000.chat.ndjson", "{\"t\":1,\"m\":\"oi\"}\n"),
    ]);
    super::recover_all(&store, Path::new("/s"), 99);

    assert_eq!(
        store.body("/s/2000.chat.ndjson"),
        "{\"t\":1,\"m\":\"oi\"}\n",
        "o chat tem que sair intacto da recuperação"
    );
}

#[test]
fn recuperacao_pula_arquivo_vazio() {
    let store = MemStore::with(&[("/s/2000.ndjson", "")]);
    super::recover_all(&store, Path::new("/s"), 99);
    assert_eq!(store.body("/s/2000.ndjson"), "");
}

/// Sem levar o irmão, o `.chat.ndjson` ficaria órfão pra sempre, sem nada na interface
/// explicando de onde veio.
#[test]
fn poda_leva_o_chat_junto() {
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
fn lista_vem_da_mais_recente_pra_mais_antiga() {
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

    let lista = super::list_in(&store, Path::new("/s"), &["1000".to_string()]);
    assert_eq!(
        lista.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
        vec!["3000", "1000"]
    );
    assert!(lista[0].has_chat, "3000 gravou chat");
    assert!(!lista[0].has_video, "3000 não tem vídeo no disco");
    assert!(!lista[1].has_chat);
    assert!(lista[1].has_video, "1000 tem vídeo no disco");
    assert_eq!(lista[1].duration_sec, 1);
}

/// O teto é POR ARQUIVO: chat barulhento não pode custar o diagnóstico que o relatório
/// já entrega.
#[test]
fn teto_do_arquivo_descarta_a_linha_em_vez_de_estourar() {
    let store = MemStore::with(&[("/s/2000.ndjson", "")]);
    let cheio = "x".repeat(100);
    store.append(Path::new("/s/2000.ndjson"), &json!({ "a": cheio }), 50);
    assert!(!store.body("/s/2000.ndjson").is_empty(), "a primeira cabe");
    store.append(Path::new("/s/2000.ndjson"), &json!({ "b": 1 }), 50);
    assert_eq!(
        store.lines("/s/2000.ndjson").len(),
        1,
        "passou do teto: a linha seguinte é descartada"
    );
}
