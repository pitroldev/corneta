//! Testes do gravador.
//!
//! A política de supervisão (ancorar, considerar morto, retomar, desistir) é testada
//! direto no núcleo puro — sem subir FFmpeg, sem esperar relógio.

use std::path::{Path, PathBuf};

use super::domain::{
    self, AfterSegment, DirCheck, DirProblem, RestartBudget, SegmentProgress, DISK_FLOOR,
    DISK_START_FLOOR, MAX_RESTARTS, REASON_DIED, REASON_DISK, REASON_STOP, SOURCE_RETRY_MS,
    SYNC_EVERY_MS,
};

const GB: u64 = 1024 * 1024 * 1024;
/// Já passou a paciência com o OBS: daqui pra frente falha conta como falha.
const DEPOIS_DA_ESPERA: u128 = domain::WAIT_FOR_SOURCE_MS + 1;

#[cfg(windows)]
fn bundled_ffmpeg() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join("ffmpeg-x86_64-pc-windows-msvc.exe")
}

// ---------------------------------------------------------------------------
// Nomes e argumentos
// ---------------------------------------------------------------------------

#[test]
fn out_time_e_lido_em_milissegundos_de_verdade() {
    // O campo `out_time_ms` do FFmpeg vem em MICROssegundos apesar do nome; por isso
    // o parser lê `out_time=`. Se algum dia alguém "otimizar" pra ler o outro campo,
    // este teste é quem pega o fator 1000.
    assert_eq!(
        domain::parse_out_time_ms("out_time=00:00:01.000000"),
        Some(1_000)
    );
    assert_eq!(
        domain::parse_out_time_ms("out_time=01:02:03.500000"),
        Some(3_723_500)
    );
    assert_eq!(
        domain::parse_out_time_ms("out_time=00:00:00.000000"),
        Some(0)
    );
}

#[test]
fn linhas_que_nao_sao_progresso_sao_ignoradas() {
    assert_eq!(domain::parse_out_time_ms("out_time_ms=1000000"), None);
    assert_eq!(domain::parse_out_time_ms("out_time=N/A"), None);
    assert_eq!(domain::parse_out_time_ms("frame=30"), None);
    assert_eq!(domain::parse_out_time_ms("progress=continue"), None);
    assert_eq!(domain::parse_out_time_ms(""), None);
    assert_eq!(domain::parse_out_time_ms("out_time=lixo"), None);
}

#[test]
fn nome_do_segmento_casa_com_a_trava_da_poda() {
    let d = Path::new("D:/Lives");
    assert!(domain::video_path(d, "1721400000000", 1).ends_with("1721400000000.mp4"));
    assert!(domain::video_path(d, "1721400000000", 3).ends_with("1721400000000.p3.mp4"));
    // O que o gravador escreve tem que ser exatamente o que a poda reconhece — senão
    // ou os arquivos ficam órfãos pra sempre, ou a poda não acha o que apagar.
    for seg in 1..4 {
        let p = domain::video_path(d, "1721400000000", seg);
        let name = p.file_name().unwrap().to_str().unwrap();
        assert!(
            crate::session::parse_video_name(name).is_some(),
            "a poda não reconheceria {name}"
        );
    }
}

/// O "tentar de novo" sobe o gravador uma segunda vez na MESMA live. Recomeçar do
/// segmento 1 sobrescreveria o que já tinha sido gravado — o oposto do que o botão promete.
#[test]
fn retomar_continua_de_onde_a_pasta_parou() {
    let nomes = |v: &[&str]| v.iter().map(|s| (*s).to_string()).collect::<Vec<_>>();

    // pasta limpa: começa no 1
    assert_eq!(domain::next_segment(&[], "1721400000000"), 1);
    // já gravou o primeiro (sem sufixo) e mais dois
    assert_eq!(
        domain::next_segment(
            &nomes(&[
                "1721400000000.mp4",
                "1721400000000.p2.mp4",
                "1721400000000.p3.mp4"
            ]),
            "1721400000000"
        ),
        4
    );
    // vídeo de OUTRA sessão na mesma pasta não empurra a numeração desta
    assert_eq!(
        domain::next_segment(
            &nomes(&["1799999999999.p9.mp4", "1721400000000.mp4"]),
            "1721400000000"
        ),
        2
    );
    // arquivo alheio do streamer não conta (é a mesma trava da poda)
    assert_eq!(
        domain::next_segment(
            &nomes(&["ferias.mp4", "2024-07-30 21-15-03.mp4"]),
            "1721400000000"
        ),
        1
    );
}

#[test]
fn args_de_gravacao_sao_copia_pura_e_fragmentados() {
    let a = domain::record_args("rtmp://x/live/obs_program", Path::new("D:/a.mp4"));
    let joined = a.join(" ");
    assert!(joined.contains("-c copy"), "gravar não pode re-encodar");
    assert!(
        joined.contains("frag_keyframe"),
        "precisa sobreviver a queda"
    );
    assert!(
        joined.contains("default_base_moof") && !joined.contains("default_base_is_moof"),
        "a flag precisa usar o nome aceito pelo muxer MP4 do FFmpeg"
    );
    assert!(
        joined.contains("-progress pipe:1"),
        "sem isso não há âncora"
    );
    assert!(
        !joined.contains("faststart"),
        "faststart é do remux, não da gravação"
    );
}

#[test]
fn remux_indexa_sem_reencodar() {
    let a = domain::remux_args(Path::new("a.mp4"), Path::new("b.mp4")).join(" ");
    assert!(a.contains("-c copy"));
    assert!(a.contains("+faststart"));
}

#[test]
fn teste_de_5s_nao_depende_de_fonte_ao_vivo() {
    // É o que faz o botão funcionar ANTES da primeira live.
    let a = domain::test_args(Path::new("t.mp4")).join(" ");
    assert!(a.contains("lavfi"));
    assert!(a.contains("-t 5"));
    assert!(!a.contains("rtmp"));
}

// ---------------------------------------------------------------------------
// Âncora e reancoragem
// ---------------------------------------------------------------------------

/// A âncora é `agora - out_time`, não "quando spawnei": com `-c copy` o arquivo só começa
/// no keyframe seguinte, e o atraso até ele chega a um GOP inteiro.
#[test]
fn primeira_linha_de_progresso_ancora_e_as_seguintes_nao() {
    let mut p = SegmentProgress::default();
    assert!(!p.anchored());

    let primeira = p.observe(240);
    assert_eq!(primeira.anchor_out_ms, Some(240));
    assert!(primeira.advanced);
    assert!(p.anchored());

    let segunda = p.observe(2_000);
    assert_eq!(
        segunda.anchor_out_ms, None,
        "ancorar é uma vez por segmento"
    );
    assert!(segunda.advanced);
}

#[test]
fn reancora_a_cada_cinco_minutos_e_nao_antes() {
    let mut p = SegmentProgress::default();
    assert_eq!(p.observe(0).sync_out_ms, None);
    assert_eq!(p.observe(SYNC_EVERY_MS - 1).sync_out_ms, None);
    assert_eq!(p.observe(SYNC_EVERY_MS).sync_out_ms, Some(SYNC_EVERY_MS));
    // a janela seguinte conta a partir da última reancoragem, não do começo
    assert_eq!(p.observe(SYNC_EVERY_MS + 1).sync_out_ms, None);
    assert_eq!(
        p.observe(2 * SYNC_EVERY_MS).sync_out_ms,
        Some(2 * SYNC_EVERY_MS)
    );
}

/// O FFmpeg repete a mesma linha de progresso quando não há pacote novo. Isso NÃO é o
/// vídeo andando — se contasse, o watchdog de morte silenciosa nunca dispararia.
#[test]
fn progresso_repetido_nao_conta_como_avanco() {
    let mut p = SegmentProgress::default();
    p.observe(1_000);
    assert!(!p.observe(1_000).advanced);
    assert!(!p.observe(500).advanced, "nem retrocesso conta");
    assert!(p.observe(1_001).advanced);
}

/// Antes do primeiro pacote não existe "parou de andar", existe "ainda não começou" — e
/// essa espera tem prazo próprio. Sem esta guarda, todo spawn morreria em 10s.
#[test]
fn watchdog_de_morte_silenciosa_so_vale_depois_de_ancorado() {
    assert!(!domain::is_stalled(false, 60_000));
    assert!(!domain::is_stalled(true, domain::STALL_MS));
    assert!(domain::is_stalled(true, domain::STALL_MS + 1));
}

/// Chutar a âncora exige prova de que o arquivo está crescendo. Sem o `bytes > 0`, um
/// FFmpeg que nunca escreveu nada ganharia uma âncora inventada e o replay apontaria
/// pra um arquivo vazio.
#[test]
fn ancora_estimada_exige_arquivo_crescendo() {
    assert!(!domain::should_estimate_anchor(
        false,
        domain::ANCHOR_TIMEOUT_MS + 1,
        0
    ));
    assert!(!domain::should_estimate_anchor(false, 1_000, 4_096));
    assert!(!domain::should_estimate_anchor(
        true,
        domain::ANCHOR_TIMEOUT_MS + 1,
        4_096
    ));
    assert!(domain::should_estimate_anchor(
        false,
        domain::ANCHOR_TIMEOUT_MS + 1,
        4_096
    ));
}

// ---------------------------------------------------------------------------
// Disco
// ---------------------------------------------------------------------------

/// Plataforma que não sabe medir não pode virar "não grava": recusar por ignorância seria
/// pior do que tentar.
#[test]
fn nao_saber_medir_o_disco_nao_bloqueia() {
    assert!(!domain::blocks_start(None));
    assert!(!domain::hit_floor(None));
}

#[test]
fn os_dois_pisos_de_disco_sao_diferentes() {
    // 3 GiB: não dá pra COMEÇAR, mas quem já está gravando segue.
    assert!(domain::blocks_start(Some(3 * GB)));
    assert!(!domain::hit_floor(Some(3 * GB)));
    // 1 GiB: para na hora.
    assert!(domain::hit_floor(Some(GB)));
    assert!(domain::blocks_start(Some(GB)));
    // no limite, ninguém barra
    assert!(!domain::blocks_start(Some(DISK_START_FLOOR)));
    assert!(!domain::hit_floor(Some(DISK_FLOOR)));
}

/// A máquina é do streamer: caminho de rede, caminho longo e pouco espaço AVISAM, mas não
/// impedem. Só as três causas de `problem` impedem.
#[test]
fn pasta_de_rede_avisa_mas_deixa_gravar() {
    let rede = DirCheck::healthy("\\\\servidor\\lives", Some(50 * GB));
    assert!(rede.ok);
    assert!(rede.removable_or_network);
    assert!(!rede.low_space);
    assert!(rede.error.is_none());

    let apertada = DirCheck::healthy("D:/Lives", Some(GB));
    assert!(apertada.ok, "pouco espaço avisa, não barra a escolha");
    assert!(apertada.low_space);

    let longa = DirCheck::healthy(&format!("D:/{}", "a".repeat(250)), None);
    assert!(longa.long_path);
    assert!(longa.free_bytes.is_none());
}

#[test]
fn pasta_que_nao_serve_devolve_o_codigo_que_o_front_traduz() {
    for (problema, codigo) in [
        (DirProblem::Missing, "missing"),
        (DirProblem::NotDir, "notDir"),
        (DirProblem::ReadOnly, "readonly"),
    ] {
        let c = DirCheck::problem(problema);
        assert!(!c.ok);
        assert_eq!(c.error.as_deref(), Some(codigo));
    }
}

// ---------------------------------------------------------------------------
// Política de retomada — é ela que decide o `recording_gave_up` da telemetria
// ---------------------------------------------------------------------------

#[test]
fn parar_a_live_nao_e_falha_e_nao_gasta_retomada() {
    let mut b = RestartBudget::default();
    assert_eq!(b.after_segment(1, true, REASON_STOP, 0), AfterSegment::Stop);
    assert_eq!(b.used(), 0);
    // mesmo que o segmento tenha morrido feio, parar vence o diagnóstico
    assert_eq!(b.after_segment(1, true, REASON_DIED, 0), AfterSegment::Stop);
    assert_eq!(b.used(), 0);
}

/// Disco cheio não é erro transitório: retomar só encheria de novo. Não gasta retomada
/// porque nem chega a tentar.
#[test]
fn disco_cheio_encerra_sem_gastar_retomada() {
    let mut b = RestartBudget::default();
    assert_eq!(
        b.after_segment(1, false, REASON_DISK, 0),
        AfterSegment::DiskFull
    );
    assert_eq!(b.used(), 0);
}

#[test]
fn backoff_cresce_a_cada_retomada() {
    let mut b = RestartBudget::default();
    b.earned(); // já gravou: daqui pra frente falha é falha, não espera pela fonte
    assert_eq!(
        b.after_segment(1, false, REASON_DIED, 0),
        AfterSegment::Resume {
            seg: 2,
            backoff_ms: 500
        }
    );
    assert_eq!(
        b.after_segment(2, false, REASON_DIED, 0),
        AfterSegment::Resume {
            seg: 3,
            backoff_ms: 1_000
        }
    );
    assert_eq!(
        b.after_segment(3, false, REASON_DIED, 0),
        AfterSegment::Resume {
            seg: 4,
            backoff_ms: 1_500
        }
    );
}

#[test]
fn desiste_depois_do_teto_de_retomadas() {
    let mut b = RestartBudget::default();
    b.earned(); // gravou uma vez; o que vier depois é falha de verdade
    for seg in 1..=MAX_RESTARTS {
        assert!(
            matches!(
                b.after_segment(seg, false, REASON_DIED, 0),
                AfterSegment::Resume { .. }
            ),
            "a retomada {seg} ainda cabe no orçamento"
        );
    }
    assert_eq!(
        b.after_segment(MAX_RESTARTS + 1, false, REASON_DIED, 0),
        AfterSegment::GiveUp
    );
}

/// O cenário que o orçamento existe pra proteger: live de 6h com uma queda de rede por
/// hora. Cada segmento GRAVOU antes de cair — desistir na sexta queda jogaria fora um
/// gravador que estava funcionando.
#[test]
fn gravar_de_verdade_devolve_o_orcamento() {
    let mut b = RestartBudget::default();
    let mut progress;
    for hora in 1..=6u32 {
        // o segmento ancora (gravou de verdade) e só depois cai
        progress = SegmentProgress::default();
        assert_eq!(progress.observe(1_000).anchor_out_ms, Some(1_000));
        b.earned();

        assert!(
            matches!(
                b.after_segment(hora, false, REASON_DIED, 0),
                AfterSegment::Resume { .. }
            ),
            "a queda da hora {hora} não podia desistir: o segmento tinha gravado"
        );
    }
}

/// O BUG que o beta viveu: o streamer aperta BORA e só então o OBS começa a empurrar.
/// Antes, os 5 spawns que morreram por falta de fonte queimavam o orçamento inteiro em
/// menos de 15 segundos e a gravação desistia antes de a live existir.
#[test]
fn obs_demorando_a_subir_nao_faz_a_gravacao_desistir() {
    let mut b = RestartBudget::default();
    // 40 segundos de OBS abrindo, uma tentativa a cada 2s
    for tentativa in 0..20u128 {
        let decisao = b.after_segment(1, false, REASON_DIED, tentativa * SOURCE_RETRY_MS as u128);
        assert_eq!(
            decisao,
            AfterSegment::WaitingForSource {
                seg: 1,
                backoff_ms: SOURCE_RETRY_MS
            },
            "tentativa {tentativa}: esperar a fonte não é falhar"
        );
    }
    assert_eq!(b.used(), 0, "esperar o OBS não pode gastar orçamento");

    // o OBS subiu: grava, e a partir daí o orçamento vale integral
    b.earned();
    assert!(matches!(
        b.after_segment(1, false, REASON_DIED, 60_000),
        AfterSegment::Resume { seg: 2, .. }
    ));
}

/// Enquanto espera a fonte, o número do segmento NÃO anda: não houve segmento. Se andasse,
/// a gravação de verdade começaria em `.p61.mp4` e o NDJSON teria 60 pares de linha vazios.
#[test]
fn espera_pela_fonte_nao_avanca_o_segmento() {
    let mut b = RestartBudget::default();
    for _ in 0..5 {
        assert_eq!(
            b.after_segment(1, false, REASON_DIED, 1_000),
            AfterSegment::WaitingForSource {
                seg: 1,
                backoff_ms: SOURCE_RETRY_MS
            }
        );
    }
}

/// A paciência tem prazo. Passada a janela sem nunca gravar nada, o problema não é o OBS
/// demorando — é erro de verdade (codec, pasta, permissão) — e o orçamento volta a contar.
#[test]
fn passada_a_janela_a_falha_volta_a_contar() {
    let mut b = RestartBudget::default();
    assert!(matches!(
        b.after_segment(1, false, REASON_DIED, domain::WAIT_FOR_SOURCE_MS - 1),
        AfterSegment::WaitingForSource { .. }
    ));
    assert_eq!(b.used(), 0);
    assert!(matches!(
        b.after_segment(1, false, REASON_DIED, domain::WAIT_FOR_SOURCE_MS),
        AfterSegment::Resume { seg: 2, .. }
    ));
    assert_eq!(b.used(), 1);
}

/// Parar a live e encher o disco vencem a espera: nenhum dos dois melhora esperando mais.
#[test]
fn espera_pela_fonte_nao_engole_parada_nem_disco_cheio() {
    let mut b = RestartBudget::default();
    assert_eq!(b.after_segment(1, true, REASON_DIED, 0), AfterSegment::Stop);
    let mut b = RestartBudget::default();
    assert_eq!(
        b.after_segment(1, false, REASON_DISK, 0),
        AfterSegment::DiskFull
    );
}

/// E o contrário: cinco spawns que NUNCA ancoraram (o disco não aceita, o codec não casa)
/// não podem virar laço infinito de spawn.
#[test]
fn falha_seguida_sem_gravar_nada_desiste() {
    let mut b = RestartBudget::default();
    let mut ultimo = AfterSegment::Stop;
    for seg in 1..=MAX_RESTARTS + 1 {
        // nenhuma linha de progresso: nada de `earned()`
        ultimo = b.after_segment(seg, false, REASON_DIED, DEPOIS_DA_ESPERA);
    }
    assert_eq!(ultimo, AfterSegment::GiveUp);
}

/// O motivo gravado na sessão. Parada pedida pelo streamer vence o diagnóstico do laço —
/// senão toda live encerrada normalmente apareceria no relatório como "o gravador morreu".
#[test]
fn motivo_final_nao_acusa_morte_quando_o_streamer_parou() {
    assert_eq!(domain::final_reason(true, REASON_DIED), REASON_STOP);
    assert_eq!(domain::final_reason(true, REASON_DISK), REASON_STOP);
    assert_eq!(domain::final_reason(false, REASON_DIED), REASON_DIED);
    assert_eq!(domain::final_reason(false, REASON_DISK), REASON_DISK);
}

/// Executa os argumentos reais contra o binário que vai no instalador. O teste puro acima
/// protege a intenção; este protege a compatibilidade — uma movflag escrita errado fazia
/// todos os testes passarem e o FFmpeg de produção recusar a gravação antes do 1º frame.
#[cfg(windows)]
#[test]
fn ffmpeg_empacotado_aceita_e_decodifica_a_gravacao() {
    use std::process::Command;

    let ffmpeg = bundled_ffmpeg();
    assert!(
        ffmpeg.is_file(),
        "o sidecar FFmpeg precisa existir para validar a gravação"
    );
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "corneta-recorder-test-{}-{nonce}",
        std::process::id()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let source = dir.join("source.mp4");
    let recorded = dir.join("recorded.mp4");

    let generated = Command::new(&ffmpeg)
        .args(domain::test_args(&source))
        .output()
        .unwrap();
    assert!(
        generated.status.success(),
        "fonte sintética falhou: {}",
        String::from_utf8_lossy(&generated.stderr)
    );

    let recording = Command::new(&ffmpeg)
        .args(domain::record_args(&source.to_string_lossy(), &recorded))
        .output()
        .unwrap();
    assert!(
        recording.status.success(),
        "argumentos reais de gravação foram rejeitados: {}",
        String::from_utf8_lossy(&recording.stderr)
    );

    for selector in ["0:v:0", "0:a:0"] {
        let decoded = Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-xerror",
                "-v",
                "error",
                "-i",
                &recorded.to_string_lossy(),
                "-map",
                selector,
                "-f",
                "null",
                "NUL",
            ])
            .output()
            .unwrap();
        assert!(
            decoded.status.success(),
            "stream {selector} não decodificou limpo: {}",
            String::from_utf8_lossy(&decoded.stderr)
        );
    }

    let _ = std::fs::remove_file(source);
    let _ = std::fs::remove_file(recorded);
    let _ = std::fs::remove_dir(dir);
}
