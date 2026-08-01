// ============================================================
// Idioma do backend: catálogo de mensagens, resolução do "automático" e o
// locale ativo do processo.
//
// Espelho do `src/lib/i18n/locale.ts` do frontend. Lá o contrato é
// `Record<MessageKey, string>` — o TypeScript não deixa faltar tradução. Aqui o
// contrato é ENUM + `match` exaustivo: falta de tradução é
// `error[E0004]: non-exhaustive patterns`, não uma string vazia na cara do
// streamer no meio da live.
//
// ------------------------------------------------------------
// AS DUAS LEIS DESTE ARQUIVO
// ------------------------------------------------------------
//
// 1. PROIBIDO `_ =>` no `match` de `Msg::text`. O braço curinga mata a
//    exaustividade e devolve a este arquivo exatamente o buraco que ele existe
//    pra fechar. (`#[deny(clippy::wildcard_enum_match_arm)]` na impl.)
//
// 2. PROIBIDO `#[non_exhaustive]` no `Msg`. Mesmo motivo.
//
// ------------------------------------------------------------
// O QUE ENTRA AQUI
// ------------------------------------------------------------
//
// Se o valor atravessa a fronteira Rust↔TS, Rust↔disco ou Rust↔OBS e alguém o
// compara com `==`, ele é ASCII e NÃO entra neste arquivo. Se um humano lê e
// reage, entra.
//
// Fora, por serem PROTOCOLO: `EngineSnapshot.state` (stopped/starting/live/
// error), `TargetStatus.state` (live/reconnecting/error/signal-lost/paused/
// waiting/brb/connecting), `chat://status`, `alert://status`, os enums de
// `AppConfig`, o `kind` das linhas do NDJSON de sessão, os nomes de fonte do
// OBS ("Corneta · Mesa", "Corneta · Alertas") e a assinatura de cache dos
// encoders ("gpu-desconhecida", "ffmpeg-indisponível").
//
// Fora também: `log::{info,warn,error,debug}!`, `expect` e `panic`. Log é
// diagnóstico e continua em português — quem lê log é quem escreveu o código.
// ============================================================

use std::sync::atomic::{AtomicU32, AtomicU8, Ordering};

// ---------------------------------------------------------------------------
// Locale
// ---------------------------------------------------------------------------

/// Os idiomas que existem. Mesma lista do `LOCALES` do TS.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash)]
pub enum Locale {
    PtBr,
    En,
}

/// Nada casando (um Windows em espanhol, por exemplo) cai aqui — igual ao
/// `DEFAULT_LOCALE` do TS.
pub const DEFAULT_LOCALE: Locale = Locale::PtBr;

impl Locale {
    /// Para varrer os dois idiomas em teste.
    pub const ALL: [Locale; 2] = [Locale::PtBr, Locale::En];

    /// Tag BCP-47 como o TS grava em `settings.language`.
    pub fn tag(self) -> &'static str {
        match self {
            Locale::PtBr => "pt-BR",
            Locale::En => "en",
        }
    }

    /// Tag exata (`"pt-BR"` | `"en"`) → idioma. Espelha o `isLocale` do TS:
    /// só aceita o que está no catálogo, sem casamento por prefixo.
    pub fn from_tag(tag: &str) -> Option<Locale> {
        match tag {
            "pt-BR" => Some(Locale::PtBr),
            "en" => Some(Locale::En),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Locale ativo do processo
// ---------------------------------------------------------------------------
//
// O idioma é UM valor por processo, imutável em 99,99% do tempo e lido no hot
// path: o supervisor do FFmpeg formata mensagem por linha de stderr, por
// destino. Um `Mutex`/`RwLock` ali seria contenção pura por um `u8`; um
// `AtomicU8` em `Relaxed` compila pra um `mov`, sem barreira. Um leitor
// atrasado em ~µs no instante exato da troca de idioma é irrelevante.
//
// Por que global e não `AppHandle` como parâmetro: as mensagens nascem em
// threads que não têm `AppHandle` nenhum — supervisor do FFmpeg
// (`std::thread::spawn` em `commands.rs`), leitores de chat (`chat.rs`),
// sockets de alerta (`alerts.rs`) e o servidor HTTP do callback de OAuth
// (`auth.rs`, que serve HTML pro navegador do usuário). Passar handle por dez
// camadas pra buscar um `u8` é plumbing que ninguém mantém.
//
// Por que não `thread_local!`: essas threads nascem espalhadas em
// `tauri::async_runtime::spawn_blocking` e `std::thread::spawn`; cada uma
// precisaria lembrar de inicializar o seu, e uma esquecida volta pro padrão
// calada.

static ACTIVE: AtomicU8 = AtomicU8::new(0); // 0 = pt-BR, 1 = en
static GENERATION: AtomicU32 = AtomicU32::new(0);

/// Idioma ativo. Chame UMA vez no topo do adapter e passe adiante — não é caro,
/// mas duas leituras na mesma função podem divergir se o idioma mudar no meio.
pub fn locale() -> Locale {
    if ACTIVE.load(Ordering::Relaxed) == 1 {
        Locale::En
    } else {
        Locale::PtBr
    }
}

/// Troca o idioma ativo. Chamado no boot (`lib.rs` `.setup()`) e sempre que a
/// config muda (`save_config` / `import_config` / comando `set_locale`).
pub fn set_locale(l: Locale) {
    ACTIVE.store(u8::from(l == Locale::En), Ordering::Relaxed);
    GENERATION.fetch_add(1, Ordering::Relaxed);
}

/// Quantas vezes o idioma foi trocado.
///
/// Serve pra INVALIDAR CACHE de texto já renderizado. O caso concreto é o
/// `update_tray`, que só reescreve o título da janela quando ele muda: com a
/// live no ar, o estado do motor não muda na troca de idioma, então sem esta
/// generation o título fica em português até a próxima transição de estado.
pub fn generation() -> u32 {
    GENERATION.load(Ordering::Relaxed)
}

/// `settings.language` → idioma efetivo. Único lugar que sabe o que "auto"
/// significa do lado Rust. Espelha o `resolveLocale` do TS.
pub fn resolve(setting: &str) -> Locale {
    Locale::from_tag(setting).unwrap_or_else(system_locale)
}

/// `resolve` + `set_locale`, que é sempre como os dois aparecem juntos.
/// Devolve o idioma que passou a valer.
pub fn apply_setting(setting: &str) -> Locale {
    let l = resolve(setting);
    set_locale(l);
    l
}

/// Casa uma tag BCP-47 com um idioma que a gente tem, PELO IDIOMA BASE:
/// `pt-PT` cai no pt-BR e `en-GB` no inglês. Igual ao `matchLocale` do TS.
fn match_tag(tag: &str) -> Option<Locale> {
    let base = tag
        .split(['-', '_'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    match base.as_str() {
        "pt" => Some(Locale::PtBr),
        "en" => Some(Locale::En),
        _ => None,
    }
}

/// Primeiro idioma de EXIBIÇÃO do Windows que a gente conhece.
///
/// `GetUserPreferredUILanguages`, não `GetUserDefaultLocaleName`: o segundo
/// devolve o FORMATO REGIONAL, e um brasileiro com Windows em inglês receberia
/// `pt-BR` aqui enquanto o `navigator.languages` do WebView2 (a fonte do
/// `detectSystemLocale` do TS) devolve `en-US` — app em inglês, erro do backend
/// em português. `GetUserPreferredUILanguages` é a mesma fonte que o WebView2
/// lê, então os dois lados concordam.
#[cfg(windows)]
pub fn system_locale() -> Locale {
    use windows::core::PWSTR;
    use windows::Win32::Globalization::{GetUserPreferredUILanguages, MUI_LANGUAGE_NAME};

    // Buffer: lista de tags terminadas em NUL, com um NUL extra no fim
    // ("en-US\0pt-BR\0\0"). A primeira chamada só mede.
    unsafe {
        let mut count: u32 = 0;
        let mut len: u32 = 0;
        if GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut count, Some(PWSTR::null()), &mut len)
            .is_err()
            || len == 0
        {
            return DEFAULT_LOCALE;
        }
        let mut buf = vec![0u16; len as usize];
        if GetUserPreferredUILanguages(
            MUI_LANGUAGE_NAME,
            &mut count,
            Some(PWSTR(buf.as_mut_ptr())),
            &mut len,
        )
        .is_err()
        {
            return DEFAULT_LOCALE;
        }
        for tag in buf.split(|&c| c == 0) {
            if tag.is_empty() {
                continue;
            }
            if let Some(hit) = match_tag(&String::from_utf16_lossy(tag)) {
                return hit;
            }
        }
    }
    DEFAULT_LOCALE
}

/// Fora do Windows a Corneta só roda em teste/CI; o padrão basta.
#[cfg(not(windows))]
pub fn system_locale() -> Locale {
    DEFAULT_LOCALE
}

// ---------------------------------------------------------------------------
// O catálogo
// ---------------------------------------------------------------------------

/// Gera o `Msg`, o `text()` exaustivo e o `key()`.
///
/// Forma de cada entrada:
///
/// ```text
/// Variante { campo: tipo, … } = "chave.no.dicionario.TS" =>
///     pt: "texto com {campo}",
///     en: "text with {campo}";
/// ```
///
/// Os campos da variante são validados pelo compilador contra os buracos do
/// literal nos DOIS idiomas: `{nome}` numa variante sem campo `nome` é
/// `error: cannot find value 'nome'`, e um campo que o literal não usa é
/// `error: named argument never used`. É a garantia que o `interpolate()` do TS
/// não tem.
macro_rules! messages {
    ($(
        $variant:ident $({ $($field:ident : $ty:ty),* $(,)? })? = $key:literal =>
            pt: $pt:literal,
            en: $en:literal;
    )*) => {
        /// Toda string que o USUÁRIO lê. Fora daqui, `&str` de texto humano é
        /// bug — o compilador não pega, a revisão pega.
        //
        // NÃO adicione `#[non_exhaustive]`: ele desliga a checagem que este
        // arquivo inteiro existe pra ter.
        #[derive(Clone, Copy, PartialEq, Eq, Debug)]
        pub enum Msg<'a> {
            $( $variant $({ $($field: $ty),* })? ),*
        }

        #[deny(clippy::wildcard_enum_match_arm)]
        impl Msg<'_> {
            /// Renderiza no idioma pedido. NÚCLEO PURO: recebe o `Locale` como
            /// parâmetro e nunca lê o global, pra continuar testável nos dois
            /// idiomas.
            pub fn text(&self, l: Locale) -> String {
                match self {
                    $(
                        Msg::$variant $({ $($field),* })? => match l {
                            Locale::PtBr => format!($pt $($(, $field = $field)*)?),
                            Locale::En => format!($en $($(, $field = $field)*)?),
                        }
                    ),*
                }
            }

            /// Renderiza no idioma ATIVO do processo. Atalho pros ADAPTERS
            /// (`commands.rs`, `chat.rs`, `auth.rs`, `alerts.rs`, `obs.rs`),
            /// onde a mensagem nasce e é consumida na mesma linha:
            /// `Err(Msg::TargetNotFound.now())`.
            ///
            /// No núcleo puro (`engine_policy.rs`) NÃO use isto — lá o `Locale`
            /// entra por parâmetro, pra continuar testável nos dois idiomas.
            pub fn now(&self) -> String {
                self.text(locale())
            }

            /// Chave desta mensagem no dicionário do frontend
            /// (`src/lib/i18n/*.ts`). Serve pra cruzar os dois catálogos por
            /// script — não use em runtime.
            pub fn key(&self) -> &'static str {
                match self {
                    $( Msg::$variant { .. } => $key ),*
                }
            }
        }

        #[cfg(test)]
        fn all_samples() -> Vec<Msg<'static>> {
            vec![
                $( Msg::$variant $({ $($field: Sample::sample()),* })? ),*
            ]
        }
    };
}

messages! {
    // ---- config ------------------------------------------------------------
    ConfigSaveStaleRevision = "rust.config.save.staleRevision" =>
        pt: "configuração mudou em outra janela; tente novamente",
        en: "your settings changed in another window — try again";
    ConfigFilePickerFilter = "rust.config.filePicker.filter" =>
        pt: "Config da Corneta",
        en: "Corneta settings";
    ConfigImportTooBig = "rust.config.import.tooBig" =>
        pt: "config excede o limite de 2 MiB",
        en: "that settings file is over the 2 MiB limit";
    ConfigImportInvalidJson { e: &'a str } = "rust.config.import.invalidJson" =>
        pt: "config inválida: {e}",
        en: "Couldn't read that settings file: {e}";
    ConfigLimitExceeded { label: &'a str, max: usize } = "rust.config.limitExceeded" =>
        pt: "{label} excede o limite de {max} bytes",
        en: "{label} is over the {max}-byte limit";
    ConfigInvalidValue { label: &'a str } = "rust.config.invalidValue" =>
        pt: "não consegui usar {label} — vale de 1 a 80 caracteres, só letra, número, traço (-) e sublinhado (_)",
        en: "Couldn't use {label} — 1 to 80 characters, letters, numbers, hyphen (-) and underscore (_) only";
    ConfigLabelIngestApp = "rust.config.label.ingestApp" =>
        pt: "app do ingest",
        en: "the ingest app";
    ConfigLabelIngestKey = "rust.config.label.ingestKey" =>
        pt: "chave do ingest",
        en: "the ingest key";
    ConfigLabelTargetName = "rust.config.label.targetName" =>
        pt: "nome do destino",
        en: "the destination name";
    ConfigLabelProfileName = "rust.config.label.profileName" =>
        pt: "nome do perfil",
        en: "the profile name";
    ConfigInvalidSecretNamespace = "rust.config.invalidSecretNamespace" =>
        pt: "esse lugar do cofre não é válido",
        en: "that secret slot isn't valid";
    ConfigSchemaTooNew { n: u32 } = "rust.config.schemaTooNew" =>
        pt: "config criada por uma versão mais nova (schema {n})",
        en: "these settings came from a newer version of Corneta (schema {n})";
    ConfigTooManyTargetsOrProfiles = "rust.config.tooManyTargetsOrProfiles" =>
        pt: "config excede o limite de destinos ou perfis",
        en: "too many destinations or profiles in this file";
    ConfigIngestMustBeRtmp = "rust.config.ingestMustBeRtmp" =>
        pt: "o ingest local deve usar RTMP",
        en: "the local ingest has to be RTMP";
    ConfigIngestMustBeLoopback = "rust.config.ingestMustBeLoopback" =>
        pt: "o ingest deve escutar somente em 127.0.0.1",
        en: "the local ingest can only listen on 127.0.0.1";
    ConfigInvalidIngestPort = "rust.config.invalidIngestPort" =>
        pt: "porta de ingest inválida",
        en: "that ingest port isn't valid";
    ConfigInvalidEncodingMode = "rust.config.invalidEncodingMode" =>
        pt: "modo de encoding inválido",
        en: "that encoding mode isn't valid";
    ConfigInvalidTarget = "rust.config.invalidTarget" =>
        pt: "destino possui id ou plataforma inválida",
        en: "a destination has an invalid id or platform";
    ConfigUnsupportedProtocol = "rust.config.unsupportedProtocol" =>
        pt: "protocolo de saída não suportado; use RTMP ou RTMPS",
        en: "that output protocol isn't supported — use RTMP or RTMPS";
    ConfigInvalidIngestUrl { name: &'a str } = "rust.config.invalidIngestUrl" =>
        pt: "URL de ingest inválida em {name}",
        en: "the ingest URL in {name} isn't valid";
    ConfigInvalidEncodingIn { name: &'a str } = "rust.config.invalidEncodingIn" =>
        pt: "encoding inválido em {name}",
        en: "the encoding in {name} isn't valid";
    ConfigPresetOutOfRange { name: &'a str } = "rust.config.presetOutOfRange" =>
        pt: "preset fora dos limites em {name}",
        en: "the preset in {name} is out of range";
    ConfigInvalidProfile = "rust.config.invalidProfile" =>
        pt: "perfil possui id inválido ou destinos demais",
        en: "a profile has an invalid id or too many destinations";
    ConfigInvalidProfileMode = "rust.config.invalidProfileMode" =>
        pt: "perfil possui modo inválido",
        en: "a profile has an invalid mode";
    ConfigInvalidActiveProfile = "rust.config.invalidActiveProfile" =>
        pt: "perfil ativo inválido",
        en: "the active profile isn't valid";
    ConfigInvalidOverlayPort = "rust.config.invalidOverlayPort" =>
        pt: "porta do overlay inválida",
        en: "that overlay port isn't valid";

    // ---- vault -------------------------------------------------------------
    VaultNamespaceNotInConfig = "rust.vault.namespaceNotInConfig" =>
        pt: "esse lugar do cofre não está na sua configuração atual",
        en: "that secret slot isn't in your current setup";
    VaultSecretTooBig = "rust.vault.secretTooBig" =>
        pt: "segredo excede o limite de 8 KiB",
        en: "that secret is over the 8 KiB limit";

    // ---- upload ------------------------------------------------------------
    UploadMeasureFailed = "rust.upload.measureFailed" =>
        pt: "Não consegui medir o upload — sem internet?",
        en: "Couldn't measure your upload — no internet?";

    // ---- window ------------------------------------------------------------
    WindowTitleLive = "rust.window.title.live" =>
        pt: "Corneta — NO AR",
        en: "Corneta — LIVE";
    WindowTitleStarting = "rust.window.title.starting" =>
        pt: "Corneta — aguardando o OBS",
        en: "Corneta — waiting on OBS";
    WindowTitleError = "rust.window.title.error" =>
        pt: "Corneta — erro na transmissão",
        en: "Corneta — stream error";
    WindowTitleIdle = "rust.window.title.idle" =>
        pt: "Corneta",
        en: "Corneta";
    WindowChatPopoutTitle = "rust.window.chatPopout.title" =>
        pt: "Corneta — Chat",
        en: "Corneta — Chat";

    // ---- brb ---------------------------------------------------------------
    BrbFilePickerFilter = "rust.brb.filePicker.filter" =>
        pt: "Imagem ou vídeo",
        en: "Image or video";
    BrbFileNoExtension = "rust.brb.fileNoExtension" =>
        pt: "arquivo sem extensão — escolha uma imagem ou vídeo",
        en: "that file has no extension — pick an image or a video";
    BrbCopyFailed { e: &'a str } = "rust.brb.copyFailed" =>
        pt: "não consegui copiar o arquivo: {e}",
        en: "Couldn't copy the file: {e}";
    BrbStreamNotLive = "rust.brb.streamNotLive" =>
        pt: "a transmissão não está no ar.",
        en: "you're not live.";
    BrbNotArmed = "rust.brb.notArmed" =>
        pt: "o JÁ VOLTO não está armado nesta live — arme nas Configurações e recomece.",
        en: "BE RIGHT BACK isn't armed on this stream — turn it on in Settings and start over.";

    // ---- frame -------------------------------------------------------------
    FrameNoSignal = "rust.frame.noSignal" =>
        pt: "sem sinal — entre ao vivo no OBS pra capturar o frame",
        en: "no signal — go live in OBS so I can grab the frame";
    FrameGrabFailed = "rust.frame.grabFailed" =>
        pt: "não consegui capturar o frame (sinal instável?)",
        en: "Couldn't grab the frame — signal acting up?";

    // ---- notify ------------------------------------------------------------
    NotifyTargetDownTitle = "rust.notify.targetDown.title" =>
        pt: "Plataforma caiu",
        en: "A platform went down";
    NotifyTargetDownBody { name: &'a str } = "rust.notify.targetDown.body" =>
        pt: "{name} — reconectando…",
        en: "{name} — reconnecting…";
    NotifySignalLostTitle = "rust.notify.signalLost.title" =>
        pt: "O sinal do OBS caiu",
        en: "OBS dropped the signal";
    // CAPS só em BORA AO VIVO e JÁ VOLTO — são nomes, não ênfase (TOM-DE-VOZ.md §6).
    NotifySignalLostBody = "rust.notify.signalLost.body" =>
        pt: "Sua live está sem imagem — confira o OBS.",
        en: "Your stream has no picture — check OBS.";
    NotifyYoutubeAutoFailedTitle = "rust.notify.youtubeAutoFailed.title" =>
        pt: "YouTube automático falhou",
        en: "YouTube autopilot failed";
    NotifyYoutubeAutoFailedBody = "rust.notify.youtubeAutoFailed.body" =>
        pt: "Vou usar sua configuração manual — confira se a live apareceu no seu canal.",
        en: "I'll use your manual setup — check that the stream showed up on your channel.";
    NotifyBitrateDownTitle = "rust.notify.bitrateDown.title" =>
        pt: "Internet apertou",
        en: "Your internet choked";
    NotifyBitrateDownBody { target_name: &'a str } = "rust.notify.bitrateDown.body" =>
        pt: "{target_name}: baixei a qualidade por um tempo pra live não travar.",
        en: "{target_name}: I dropped the quality for a bit so the stream wouldn't stutter.";
    NotifyBitrateUpTitle = "rust.notify.bitrateUp.title" =>
        pt: "Internet estabilizou",
        en: "Your internet settled down";
    NotifyBitrateUpBody { target_name: &'a str } = "rust.notify.bitrateUp.body" =>
        pt: "{target_name}: qualidade de volta ao normal.",
        en: "{target_name}: quality's back to normal.";
    NotifyLiveTitle = "rust.notify.live.title" =>
        pt: "Corneta no ar 📣",
        en: "Corneta's on air 📣";
    NotifyLiveBody = "rust.notify.live.body" =>
        pt: "Sua transmissão começou.",
        en: "Your stream started.";
    NotifyTargetErrorTitle = "rust.notify.targetError.title" =>
        pt: "Destino com erro",
        en: "Destination error";
    NotifyTargetErrorBody { name: &'a str, msg: &'a str } = "rust.notify.targetError.body" =>
        pt: "{name}: {msg}",
        en: "{name}: {msg}";

    // ---- target ------------------------------------------------------------
    TargetErrorKeyRejected = "rust.target.error.keyRejected" =>
        pt: "Chave recusada — cole a chave nova em Plataformas e clique em Tentar de novo.",
        en: "The platform turned down your stream key — paste the new one in Platforms and hit Try again.";
    TargetSignalLostMessage = "rust.target.signalLost.message" =>
        pt: "sua live está sem imagem — confira o OBS",
        en: "your stream has no picture — check OBS";
    TargetYoutubeAutoFallback = "rust.target.youtubeAutoFallback" =>
        pt: "YouTube automático falhou — usando sua config manual.",
        en: "YouTube autopilot failed — using your manual setup.";
    TargetNotLive = "rust.target.notLive" =>
        pt: "destino não está ao vivo",
        en: "that destination isn't live";
    TargetNotInThisStream = "rust.target.notInThisStream" =>
        pt: "essa plataforma não está nesta transmissão.",
        en: "that platform isn't in this stream.";
    TargetNotFound = "rust.target.notFound" =>
        pt: "destino não encontrado",
        en: "destination not found";
    TargetErrorNoConnection = "rust.target.error.noConnection" =>
        pt: "Sem conexão com a plataforma — tentando de novo.",
        en: "No connection to the platform — trying again.";
    TargetErrorConnectionDropped = "rust.target.error.connectionDropped" =>
        pt: "A conexão caiu — reconectando.",
        en: "The connection dropped — reconnecting.";
    TargetErrorShaky = "rust.target.error.shaky" =>
        pt: "Instabilidade no envio — reconectando.",
        en: "Something's shaky on the way out — reconnecting.";

    // ---- engine ------------------------------------------------------------
    EngineAlreadyLive = "rust.engine.alreadyLive" =>
        pt: "já está no ar.",
        en: "you're already live.";
    EngineNoPlatformEnabled = "rust.engine.noPlatformEnabled" =>
        pt: "Nenhuma plataforma ativa.",
        en: "No platforms are turned on.";
    EngineMissingSidecar = "rust.engine.missingSidecar" =>
        pt: "Faltam arquivos internos da Corneta — reinstale o app.",
        en: "Corneta's own files are missing — reinstall the app.";
    EngineMediamtxNoStart = "rust.engine.mediamtxNoStart" =>
        pt: "Não consegui subir o servidor de ingestão — reinicie a Corneta e tente de novo.",
        en: "Couldn't start the ingest server — restart Corneta and try again.";
    EngineIngestPortInUse = "rust.engine.ingestPortInUse" =>
        pt: "A porta de ingestão já está em uso. Feche o que estiver usando a porta 1935.",
        en: "Something else is already on port 1935. Close whatever's using it.";
    EngineMediamtxDied = "rust.engine.mediamtxDied" =>
        pt: "O servidor de ingestão caiu — tenta de novo.",
        en: "The ingest server crashed — try again.";

    // ---- youtube -----------------------------------------------------------
    YoutubeDefaultBroadcastTitle = "rust.youtube.defaultBroadcastTitle" =>
        pt: "Ao vivo",
        en: "Live";

    // ---- session -----------------------------------------------------------
    SessionNotFound = "rust.session.notFound" =>
        pt: "não achei o relatório dessa live",
        en: "couldn't find that stream's report";
    SessionDirUnavailable = "rust.session.dirUnavailable" =>
        pt: "não consegui chegar na pasta dos relatórios",
        en: "couldn't reach the reports folder";
    SessionDefaultMarkerLabel = "rust.session.defaultMarkerLabel" =>
        pt: "Momento",
        en: "Moment";
    SessionNotRecording = "rust.session.notRecording" =>
        pt: "não estou gravando nenhuma live agora",
        en: "I'm not recording a stream right now";
    SessionInvalidId = "rust.session.invalidId" =>
        pt: "essa live não tem um id válido",
        en: "that stream id isn't valid";
    SessionDeleteFailed { e: &'a str } = "rust.session.deleteFailed" =>
        pt: "não consegui apagar o relatório dessa live: {e}",
        en: "Couldn't delete that stream's report: {e}";
    RecordDirUnusable = "rust.record.dirUnusable" =>
        pt: "não consigo gravar nessa pasta — confira se ela existe e se dá pra escrever nela",
        en: "I can't record to that folder — check that it exists and is writable";

    // ---- open --------------------------------------------------------------
    OpenExternalRefused = "rust.open.externalRefused" =>
        pt: "Não vou abrir esse link — só abro endereço que começa com https://",
        en: "I won't open that link — it has to be a plain https:// address";
    OpenExternalFailed { e: &'a str } = "rust.open.externalFailed" =>
        pt: "não consegui abrir o link — abre no navegador na mão: {e}",
        en: "Couldn't open the link — open it in your browser by hand: {e}";

    // ---- test --------------------------------------------------------------
    // "resolver" é vocabulário de DNS: "não resolvi twitch.tv" não diz nada pra
    // quem só colou uma URL no teste de conexão.
    TestHostUnresolved { host: &'a str } = "rust.test.hostUnresolved" =>
        pt: "não achei {host} — confira o endereço",
        en: "Couldn't find {host} — check the address";
    TestAddressUnresolved { host: &'a str } = "rust.test.addressUnresolved" =>
        pt: "não consegui achar o endereço de {host} — confira a URL",
        en: "Couldn't find an address for {host} — check the URL";
    TestHostAnswered { host: &'a str } = "rust.test.hostAnswered" =>
        pt: "{host} respondeu",
        en: "{host} answered";
    TestNoAnswer { host: &'a str, port: u16 } = "rust.test.noAnswer" =>
        pt: "sem resposta de {host}:{port} — confira a URL/rede",
        en: "No answer from {host}:{port} — check the URL and your connection";

    // ---- alertSource -------------------------------------------------------
    AlertSourceNotFound = "rust.alertSource.notFound" =>
        pt: "fonte não encontrada",
        en: "source not found";
    AlertSourcePasteTokenFirst = "rust.alertSource.pasteTokenFirst" =>
        pt: "cole o token primeiro",
        en: "paste the token first";
    AlertSourceTokenOk = "rust.alertSource.tokenOk" =>
        pt: "token válido",
        en: "token works";

    // ---- diag --------------------------------------------------------------
    DiagWatchlistOmitted { n: usize } = "rust.diag.watchlistOmitted" =>
        pt: "<{n} termos omitidos>",
        en: "<{n} term(s) left out>";
    DiagReportHeader { version: &'a str, os: &'a str, arch: &'a str, config: &'a str } = "rust.diag.reportHeader" =>
        pt: "Corneta {version}\nSO: {os} {arch}\n\nRESUMO DA CONFIGURAÇÃO (somente campos técnicos permitidos)\n{config}\n",
        en: "Corneta {version}\nOS: {os} {arch}\n\nCONFIGURATION SUMMARY (allowlisted technical fields only)\n{config}\n";
    DiagFilePickerFilter = "rust.diag.filePicker.filter" =>
        pt: "Diagnóstico da Corneta",
        en: "Corneta diagnostics";

    // ---- overlay -----------------------------------------------------------
    OverlayDemoAlertMessage = "rust.overlay.demo.alertMessage" =>
        pt: "bora cornetar! 📣",
        en: "let's gooo!! 📣";
    OverlayDemoChatText = "rust.overlay.demo.chatText" =>
        pt: "salve, bora cornetar! Kappa",
        en: "yo yo, let's gooo! Kappa";
    OverlayDemoChatTextFragment = "rust.overlay.demo.chatTextFragment" =>
        pt: "salve, bora cornetar! ",
        en: "yo yo, let's gooo! ";
    OverlayDemoSource = "rust.overlay.demo.source" =>
        pt: "teste",
        en: "test";

    // ---- privacySettings ---------------------------------------------------
    PrivacySettingsUnknown = "rust.privacySettings.unknown" =>
        pt: "configuração desconhecida",
        en: "I don't know that setting";

    // ---- tray --------------------------------------------------------------
    TrayTooltipIdle = "rust.tray.tooltip.idle" =>
        pt: "Corneta",
        en: "Corneta";
    TrayTooltipStarting = "rust.tray.tooltip.starting" =>
        pt: "Corneta · aguardando OBS",
        en: "Corneta · waiting on OBS";
    TrayTooltipError = "rust.tray.tooltip.error" =>
        pt: "Corneta · erro",
        en: "Corneta · error";
    TrayTooltipLive { n: usize } = "rust.tray.tooltip.live" =>
        pt: "Corneta · no ar ({n})",
        en: "Corneta · live ({n})";
    TrayTargetReconnecting = "rust.tray.target.reconnecting" =>
        pt: "reconectando",
        en: "reconnecting";
    TrayTargetError = "rust.tray.target.error" =>
        pt: "erro",
        en: "error";
    TrayTargetSignalLost = "rust.tray.target.signalLost" =>
        pt: "sem sinal do OBS",
        en: "no signal from OBS";
    TrayTargetPaused = "rust.tray.target.paused" =>
        pt: "pausado",
        en: "paused";
    TrayTargetWaiting = "rust.tray.target.waiting" =>
        pt: "aguardando sinal",
        en: "waiting for signal";
    TrayTargetBrb = "rust.tray.target.brb" =>
        pt: "JÁ VOLTO no ar",
        en: "BE RIGHT BACK on air";
    TrayTargetConnecting = "rust.tray.target.connecting" =>
        pt: "conectando",
        en: "connecting";

    // ---- obs ---------------------------------------------------------------
    ObsConnectionClosed = "rust.obs.connectionClosed" =>
        pt: "o OBS fechou a conexão",
        en: "OBS closed the connection";
    ObsConnectFailed { url: &'a str, e: &'a str } = "rust.obs.connectFailed" =>
        pt: "não consegui conectar no obs-websocket ({url}): {e}. No OBS, ative em Ferramentas → Configurações do Servidor WebSocket.",
        en: "Couldn't connect to obs-websocket ({url}): {e}. In OBS, turn it on under Tools → WebSocket Server Settings.";
    ObsPasswordRequired = "rust.obs.passwordRequired" =>
        pt: "O obs-websocket tá com senha — cola ela em Configurações → OBS.",
        en: "obs-websocket has a password — put it in Settings → OBS.";
    ObsIdentifyFailed { identified: &'a str } = "rust.obs.identifyFailed" =>
        pt: "não consegui entrar no OBS (senha errada?): {identified}",
        en: "Couldn't sign in to OBS (wrong password?): {identified}";
    ObsRefusedConfig { response: &'a str } = "rust.obs.refusedConfig" =>
        pt: "o OBS recusou a configuração: {response}",
        en: "OBS turned down the setup: {response}";
    ObsRefusedRequest { req_type: &'a str, response: &'a str } = "rust.obs.refusedRequest" =>
        pt: "o OBS recusou {req_type}: {response}",
        en: "OBS turned down {req_type}: {response}";
    ObsSourceNameTaken { input_name: &'a str, kind: &'a str } = "rust.obs.sourceNameTaken" =>
        pt: "já existe uma fonte \"{input_name}\" no OBS (do tipo {kind}). Renomeie ou apague pra a Mesa usar esse nome.",
        en: "There's already a source called \"{input_name}\" in OBS (a {kind}). Rename or delete it so the Table can use that name.";
    ObsCurrentSceneUnknown = "rust.obs.currentSceneUnknown" =>
        pt: "não consegui descobrir a cena atual do OBS",
        en: "Couldn't tell which OBS scene is on";
    ObsRefusedSceneItem { added: &'a str } = "rust.obs.refusedSceneItem" =>
        pt: "o OBS recusou pôr a Mesa na cena atual: {added}",
        en: "OBS wouldn't put the Table into the current scene: {added}";
    ObsRefusedSource { resp: &'a str } = "rust.obs.refusedSource" =>
        pt: "o OBS recusou a fonte da Mesa: {resp}",
        en: "OBS turned down the Table source: {resp}";
    ObsRefusedRemoveSource { resp: &'a str } = "rust.obs.refusedRemoveSource" =>
        pt: "o OBS recusou remover a fonte da Mesa: {resp}",
        en: "OBS wouldn't remove the Table source: {resp}";

    // ---- chat --------------------------------------------------------------
    ChatUnknownUser = "rust.chat.unknownUser" =>
        pt: "alguém",
        en: "someone";
    ChatEmptyMessage = "rust.chat.emptyMessage" =>
        pt: "mensagem vazia",
        en: "nothing to send";
    // Nasce de um `Mutex::lock()` envenenado: outra thread entrou em pânico segurando
    // a trava, e o processo não se recupera sozinho. Por isso a saída é reabrir, não
    // "tenta de novo" — tentar de novo daria o mesmo erro pra sempre.
    ChatStateLocked = "rust.chat.stateLocked" =>
        pt: "Não consegui enviar a mensagem — feche e abra a Corneta.",
        en: "Couldn't send your message — close and reopen Corneta.";
    ChatSelfAuthor = "rust.chat.selfAuthor" =>
        pt: "você",
        en: "you";
    ChatNoChannelSignedIn = "rust.chat.noChannelSignedIn" =>
        pt: "nenhum canal logado pra enviar",
        en: "you're not signed in to any channel — sign in first";
    ChatBadgeMember = "rust.chat.badge.member" =>
        pt: "MEMBRO",
        en: "MEMBER";
    ChatYoutubeNotSignedIn = "rust.chat.youtube.notSignedIn" =>
        pt: "entre no YouTube pra mandar mensagem",
        en: "sign in to YouTube to send messages";
    ChatYoutubeNoActiveLive = "rust.chat.youtube.noActiveLive" =>
        pt: "Nenhuma live ativa no YouTube agora",
        en: "No live stream running on YouTube right now";
    ChatYoutubeApiError { c: u16, body: &'a str } = "rust.chat.youtube.apiError" =>
        pt: "YouTube {c}: {body}",
        en: "YouTube {c}: {body}";
    ChatYoutubeTransportError { e: &'a str } = "rust.chat.youtube.transportError" =>
        pt: "YouTube: {e}",
        en: "YouTube: {e}";

    // ---- alerts ------------------------------------------------------------
    AlertsTokenInvalidOrExpired = "rust.alerts.tokenInvalidOrExpired" =>
        pt: "token inválido ou expirado",
        en: "that token is invalid or expired";
    AlertsNoConnection { kind: &'a str } = "rust.alerts.noConnection" =>
        pt: "sem conexão ({kind})",
        en: "no connection ({kind})";
    AlertsConnectFailed = "rust.alerts.connectFailed" =>
        pt: "não consegui conectar",
        en: "Couldn't connect";
    AlertsUnknownSourceKind = "rust.alerts.unknownSourceKind" =>
        pt: "fonte de alerta desconhecida",
        en: "I don't know that alert source";
    AlertsStreamElementsTimeout = "rust.alerts.streamElementsTimeout" =>
        pt: "o StreamElements não confirmou a tempo — tente de novo",
        en: "StreamElements didn't confirm in time — try again";
    AlertsProbeTimeout = "rust.alerts.probeTimeout" =>
        pt: "sem resposta a tempo — tente de novo",
        en: "No answer in time — try again";

    // ---- youtubeKey --------------------------------------------------------
    YoutubeKeyPasteFirst = "rust.youtubeKey.pasteFirst" =>
        pt: "cole a API key primeiro",
        en: "paste the API key first";
    YoutubeKeyValid = "rust.youtubeKey.valid" =>
        pt: "chave válida",
        en: "key works";
    YoutubeKeyInvalid = "rust.youtubeKey.invalid" =>
        pt: "chave inválida — confira se copiou certo",
        en: "that key's wrong — check you copied all of it";
    YoutubeKeyApiNotEnabled = "rust.youtubeKey.apiNotEnabled" =>
        pt: "ative a YouTube Data API v3 no projeto dessa chave",
        en: "turn on YouTube Data API v3 in that key's project";
    YoutubeKeyRestricted = "rust.youtubeKey.restricted" =>
        pt: "essa chave tem restrição de app/IP — libere pra uso geral",
        en: "that key is locked to an app or IP — open it up for general use";
    YoutubeKeyValidQuotaMaxed = "rust.youtubeKey.validQuotaMaxed" =>
        pt: "chave válida (mas a cota do dia está no limite)",
        en: "key works (but today's quota is maxed out)";
    YoutubeKeyApiError { code: u16, msg: &'a str } = "rust.youtubeKey.apiError" =>
        pt: "YouTube {code}: {msg}",
        en: "YouTube {code}: {msg}";
    YoutubeKeyApiStatus { code: u16 } = "rust.youtubeKey.apiStatus" =>
        pt: "YouTube respondeu {code}",
        en: "YouTube answered {code}";
    YoutubeKeyNoConnection = "rust.youtubeKey.noConnection" =>
        pt: "sem conexão com o YouTube (rede/proxy?)",
        en: "No connection to YouTube — network or proxy?";

    // ---- auth --------------------------------------------------------------
    AuthBrokerDown = "rust.auth.brokerDown" =>
        pt: "Não consegui falar com o serviço de login — sem internet?",
        en: "Couldn't reach the login service — no internet?";
    AuthSetupApiMissing = "rust.auth.setupApiMissing" =>
        pt: "serviço de login não configurado (VITE_SETUP_API_URL vazio)",
        en: "login service isn't set up (VITE_SETUP_API_URL is empty)";
    AuthSetupApiNotHttps { base: &'a str } = "rust.auth.setupApiNotHttps" =>
        pt: "o serviço de login precisa ser HTTPS ({base})",
        en: "the login service has to be HTTPS ({base})";
    AuthSetupApiUnreachable { base: &'a str } = "rust.auth.setupApiUnreachable" =>
        pt: "não consegui falar com o serviço de login em {base}",
        en: "Couldn't reach the login service at {base}";
    AuthSetupApiStatus { base: &'a str, code: u16 } = "rust.auth.setupApiStatus" =>
        pt: "o serviço de login em {base} respondeu {code}",
        en: "the login service at {base} answered {code}";
    AuthSetupApiWrongService { base: &'a str } = "rust.auth.setupApiWrongService" =>
        pt: "{base} respondeu, mas não é a setup API da Corneta",
        en: "{base} answered, but that's not Corneta's setup API";
    AuthGoogleWrongClientType = "rust.auth.google.wrongClientType" =>
        pt: "credenciais recusadas — o cliente OAuth precisa ser do tipo \"TVs e dispositivos de entrada limitada\" e no mesmo projeto do Client Secret",
        en: "Google turned down those credentials — the OAuth client has to be the \"TVs and Limited Input devices\" type, in the same project as the Client Secret";
    AuthGoogleNoConnection = "rust.auth.google.noConnection" =>
        pt: "sem conexão com o Google (rede/proxy?)",
        en: "No connection to Google — network or proxy?";
    AuthGoogleErrorPassthrough { desc: &'a str } = "rust.auth.google.errorPassthrough" =>
        pt: "Google: {desc}",
        en: "Google: {desc}";
    AuthGoogleStatus { code: u16 } = "rust.auth.google.status" =>
        pt: "Google respondeu {code}",
        en: "Google answered {code}";
    AuthByokFillClientIdAndSecret = "rust.auth.byok.fillClientIdAndSecret" =>
        pt: "preencha o Client ID e o Client Secret",
        en: "fill in the Client ID and the Client Secret";
    AuthYoutubeOfficialUnavailableReason { reason: &'a str } = "rust.auth.youtube.officialUnavailableReason" =>
        pt: "Login oficial do YouTube indisponível: {reason}. Suas credenciais continuam salvas",
        en: "The official YouTube login isn't available: {reason}. Your credentials are still saved";
    AuthYoutubeOfficialNotEnabled = "rust.auth.youtube.officialNotEnabled" =>
        pt: "O login oficial do YouTube ainda não está habilitado no servidor. Suas credenciais continuam salvas",
        en: "The server hasn't switched on the official YouTube login yet. Your credentials are still saved";
    AuthByokNoSavedCreds = "rust.auth.byok.noSavedCreds" =>
        pt: "não achei credenciais próprias salvas — cole o Client ID e o Secret",
        en: "Couldn't find any saved credentials of your own — paste the Client ID and the Secret";
    AuthKickFillValidCreds = "rust.auth.kick.fillValidCreds" =>
        pt: "preencha credenciais válidas da Kick",
        en: "fill in valid Kick credentials";
    AuthKickOfficialUnavailableReason { reason: &'a str } = "rust.auth.kick.officialUnavailableReason" =>
        pt: "Login oficial da Kick indisponível: {reason}. Suas credenciais continuam salvas",
        en: "The official Kick login isn't available: {reason}. Your credentials are still saved";
    AuthKickOfficialNotEnabled = "rust.auth.kick.officialNotEnabled" =>
        pt: "O login oficial da Kick ainda não está habilitado no servidor. Suas credenciais continuam salvas",
        en: "The server hasn't switched on the official Kick login yet. Your credentials are still saved";
    AuthTwitchMissingClientId = "rust.auth.twitch.missingClientId" =>
        pt: "Falta VITE_TWITCH_CLIENT_ID no .env",
        en: "VITE_TWITCH_CLIENT_ID is missing from .env";
    AuthStartFailed = "rust.auth.startFailed" =>
        pt: "Não consegui iniciar o login",
        en: "Couldn't start the login";
    AuthTwitchBadResponse = "rust.auth.twitch.badResponse" =>
        pt: "Resposta inválida da Twitch",
        en: "Twitch sent back something I couldn't read";
    AuthCodeExpired = "rust.auth.codeExpired" =>
        pt: "Código expirou — tente de novo",
        en: "That code expired — try again";
    AuthYoutubeServerNotEnabled = "rust.auth.youtube.serverNotEnabled" =>
        pt: "o servidor ainda não habilitou o YouTube oficial",
        en: "the server hasn't switched on the official YouTube login yet";
    AuthOfficialUnavailable { reason: &'a str } = "rust.auth.officialUnavailable" =>
        pt: "Login oficial indisponível ({reason}). Use credenciais próprias nas opções avançadas",
        en: "Official login isn't available ({reason}). Use your own credentials under advanced options";
    AuthGoogleBadResponse = "rust.auth.google.badResponse" =>
        pt: "Resposta inválida do Google",
        en: "Google sent back something I couldn't read";
    AuthYoutubeOfficialNotConfigured = "rust.auth.youtube.officialNotConfigured" =>
        pt: "Login oficial do YouTube não configurado",
        en: "The official YouTube login isn't set up";
    // "callback" não aparece em lugar nenhum da tela — o que falhou de verdade é o
    // bind de uma porta local, e "porta" o app já usa com o streamer.
    AuthYoutubeCallbackOpenFailed = "rust.auth.youtube.callbackOpenFailed" =>
        pt: "Não consegui abrir a porta local pro login do YouTube",
        en: "Couldn't open the local port for the YouTube login";
    AuthYoutubeCallbackPrepFailed = "rust.auth.youtube.callbackPrepFailed" =>
        pt: "Não consegui preparar a porta local pro login do YouTube",
        en: "Couldn't set up the local port for the YouTube login";
    AuthGoogleWrongDesktopClient = "rust.auth.google.wrongDesktopClient" =>
        pt: "O Client ID do Google precisa ser do tipo Aplicativo para computador",
        en: "That Google Client ID has to be the Desktop app type";
    AuthGoogleLoginRefused { status: u16 } = "rust.auth.google.loginRefused" =>
        pt: "Google recusou o login ({status})",
        en: "Google turned down the login ({status})";
    AuthGoogleNoRefreshableSession = "rust.auth.google.noRefreshableSession" =>
        pt: "O Google não retornou uma sessão renovável",
        en: "Google didn't send back a session I can renew";
    AuthTwitchTokenInvalid = "rust.auth.twitch.tokenInvalid" =>
        pt: "token da Twitch inválido",
        en: "that Twitch token isn't valid";
    AuthTwitchApiError { c: u16, body: &'a str } = "rust.auth.twitch.apiError" =>
        pt: "Twitch {c}: {body}",
        en: "Twitch {c}: {body}";
    AuthTwitchTransportError { e: &'a str } = "rust.auth.twitch.transportError" =>
        pt: "Twitch: {e}",
        en: "Twitch: {e}";
    AuthKickServerNotEnabled = "rust.auth.kick.serverNotEnabled" =>
        pt: "o servidor ainda não habilitou a Kick oficial",
        en: "the server hasn't switched on the official Kick login yet";
    AuthKickPortBusy { port: u16 } = "rust.auth.kick.portBusy" =>
        pt: "Porta {port} ocupada",
        en: "Port {port} is taken";
    AuthCallbackPageOk = "rust.auth.callbackPage.ok" =>
        pt: "Pronto! Pode fechar esta aba e voltar pra Corneta.",
        en: "Done! You can close this tab and head back to Corneta.";
    AuthCallbackPageError = "rust.auth.callbackPage.error" =>
        pt: "Não consegui concluir o login. Volte pra Corneta e tente de novo.",
        en: "Couldn't finish the login. Head back to Corneta and try again.";
    AuthCallbackPageWaiting = "rust.auth.callbackPage.waiting" =>
        pt: "Corneta — aguardando a conclusão do login…",
        en: "Corneta — waiting for the login to finish…";
    AuthLoginExpired { provider: &'a str } = "rust.auth.loginExpired" =>
        pt: "Login do {provider} expirou (5 min)",
        en: "The {provider} login expired (5 min)";
    AuthAuthorizationDenied { provider: &'a str, err: &'a str } = "rust.auth.authorizationDenied" =>
        pt: "{provider} não me deixou entrar ({err}) — tente de novo",
        en: "{provider} didn't let me in ({err}) — try again";
    AuthKickBrokerNotConfigured = "rust.auth.kick.brokerNotConfigured" =>
        pt: "Serviço de login da Kick não configurado",
        en: "Kick's login service isn't set up";
    AuthKickLoginFailed = "rust.auth.kick.loginFailed" =>
        pt: "Não consegui concluir o login da Kick",
        en: "Couldn't finish the Kick login";
    AuthKickLoginRefused { status: u16 } = "rust.auth.kick.loginRefused" =>
        pt: "Kick recusou o login ({status})",
        en: "Kick turned down the login ({status})";
    AuthKickEmptyToken = "rust.auth.kick.emptyToken" =>
        pt: "Kick: token vazio",
        en: "Kick: empty token";
    AuthKickNoRefreshableSession = "rust.auth.kick.noRefreshableSession" =>
        pt: "Kick não retornou uma sessão renovável",
        en: "Kick didn't send back a session I can renew";
    AuthKickSignInFirst = "rust.auth.kick.signInFirst" =>
        pt: "entre na Kick primeiro",
        en: "sign in to Kick first";
    AuthKickSessionExpired = "rust.auth.kick.sessionExpired" =>
        pt: "Kick: sessão expirou, entre de novo",
        en: "Kick: your session expired — sign in again";
    AuthKickApiError { c: u16, body: &'a str } = "rust.auth.kick.apiError" =>
        pt: "Kick {c}: {body}",
        en: "Kick {c}: {body}";
    AuthKickTransportError { e: &'a str } = "rust.auth.kick.transportError" =>
        pt: "Kick: {e}",
        en: "Kick: {e}";
    AuthKickStillFailingAfterRefresh = "rust.auth.kick.stillFailingAfterRefresh" =>
        pt: "Kick: falha após renovar a sessão",
        en: "Kick: still failing after renewing the session";
    AuthKickChannelHasNoName = "rust.auth.kick.channelHasNoName" =>
        pt: "Kick: canal sem nome",
        en: "Kick: the channel has no name";
    AuthKickBadResponse = "rust.auth.kick.badResponse" =>
        pt: "Kick: resposta inválida",
        en: "Kick: I couldn't read that answer";
    AuthKickChannelNotFound = "rust.auth.kick.channelNotFound" =>
        pt: "Kick: canal não encontrado",
        en: "Kick: channel not found";
    AuthYoutubeBadResponse = "rust.auth.youtube.badResponse" =>
        pt: "YouTube: resposta inválida",
        en: "YouTube: I couldn't read that answer";
    AuthYoutubeStreamNoId = "rust.auth.youtube.streamNoId" =>
        pt: "YouTube: stream sem id",
        en: "YouTube: the stream came back with no id";
    AuthYoutubeNoIngestionInfo = "rust.auth.youtube.noIngestionInfo" =>
        pt: "YouTube: sem ingestionInfo",
        en: "YouTube: no ingestionInfo came back";
    AuthYoutubeNoIngestionAddress = "rust.auth.youtube.noIngestionAddress" =>
        pt: "YouTube: sem ingestionAddress",
        en: "YouTube: no ingestionAddress came back";
    AuthYoutubeNoStreamName = "rust.auth.youtube.noStreamName" =>
        pt: "YouTube: sem streamName",
        en: "YouTube: no streamName came back";
    AuthYoutubeBroadcastNoId = "rust.auth.youtube.broadcastNoId" =>
        pt: "YouTube: broadcast sem id",
        en: "YouTube: the broadcast came back with no id";

    // ---- moderate ----------------------------------------------------------
    ModeratePlatformUnsupported = "rust.moderate.platformUnsupported" =>
        pt: "ainda não sei moderar nessa plataforma",
        en: "I can't moderate on that platform yet";
    ModerateTwitchSignInFirst = "rust.moderate.twitch.signInFirst" =>
        pt: "entre na Twitch pra moderar",
        en: "sign in to Twitch to moderate";
    ModerateTwitchChannelNotFound = "rust.moderate.twitch.channelNotFound" =>
        pt: "canal não encontrado",
        en: "channel not found";
    ModerateNoMessageId = "rust.moderate.noMessageId" =>
        pt: "sem id da mensagem",
        en: "no message id";
    ModerateNoUser = "rust.moderate.noUser" =>
        pt: "sem o nome de quem mandou",
        en: "no username";
    ModerateUserNotFound = "rust.moderate.userNotFound" =>
        pt: "não achei essa pessoa na Twitch",
        en: "couldn't find that person on Twitch";
    ModerateInvalidAction = "rust.moderate.invalidAction" =>
        pt: "ação inválida",
        en: "I don't know that action";
    ModerateYoutubeSignInFirst = "rust.moderate.youtube.signInFirst" =>
        pt: "entre no YouTube pra moderar",
        en: "sign in to YouTube to moderate";
    ModerateYoutubeDeleteOnly = "rust.moderate.youtube.deleteOnly" =>
        pt: "no YouTube, por enquanto só dá pra apagar a mensagem",
        en: "on YouTube, deleting the message is all I can do for now";
    ModerateKickDeleteOnly = "rust.moderate.kick.deleteOnly" =>
        pt: "na Kick, por enquanto só dá pra apagar a mensagem",
        en: "on Kick, deleting the message is all I can do for now";

    // ---- streamInfo --------------------------------------------------------
    StreamInfoEmptyTitle = "rust.streamInfo.emptyTitle" =>
        pt: "digite um título",
        en: "type a title";
    StreamInfoNoPlatformSignedIn = "rust.streamInfo.noPlatformSignedIn" =>
        pt: "entre em alguma plataforma primeiro (aba Conta)",
        en: "sign in to a platform first (Account tab)";
    StreamInfoTwitchSignIn = "rust.streamInfo.twitch.signIn" =>
        pt: "entre na Twitch",
        en: "sign in to Twitch";
    StreamInfoCategoryNotFound { category: &'a str } = "rust.streamInfo.categoryNotFound" =>
        pt: "categoria \"{category}\" não encontrada",
        en: "couldn't find the category \"{category}\"";
    StreamInfoTwitchMissingScope = "rust.streamInfo.twitch.missingScope" =>
        pt: "entre de novo na Twitch (faltou a permissão de editar a live)",
        en: "sign in to Twitch again (the permission to edit the stream is missing)";
    StreamInfoYoutubeSignIn = "rust.streamInfo.youtube.signIn" =>
        pt: "entre no YouTube",
        en: "sign in to YouTube";
    StreamInfoYoutubeNoActiveBroadcast = "rust.streamInfo.youtube.noActiveBroadcast" =>
        pt: "nenhuma transmissão ativa no YouTube agora",
        en: "no stream running on YouTube right now";
    StreamInfoYoutubeVideoNotFound = "rust.streamInfo.youtube.videoNotFound" =>
        pt: "YouTube: vídeo da live não encontrado",
        en: "YouTube: couldn't find the stream's video";
    StreamInfoYoutubeTitleTruncated = "rust.streamInfo.youtube.titleTruncated" =>
        pt: "título cortado em 100 (limite do YouTube)",
        en: "title cut at 100 characters (YouTube's limit)";
    StreamInfoKickMissingScope = "rust.streamInfo.kick.missingScope" =>
        pt: "entre de novo na Kick (faltou a permissão channel:write)",
        en: "sign in to Kick again (the channel:write permission is missing)";
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

/// Valor de exemplo por tipo de campo, só pra varrer o catálogo em teste.
/// Campo de tipo novo = mais uma impl aqui; o compilador cobra.
#[cfg(test)]
trait Sample {
    fn sample() -> Self;
}

#[cfg(test)]
impl Sample for &'static str {
    fn sample() -> Self {
        "x"
    }
}

#[cfg(test)]
impl Sample for u16 {
    fn sample() -> Self {
        7
    }
}

#[cfg(test)]
impl Sample for u32 {
    fn sample() -> Self {
        7
    }
}

#[cfg(test)]
impl Sample for usize {
    fn sample() -> Self {
        7
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// O compilador garante que existe UM texto por idioma. Não garante que
    /// alguém não colou o português no slot do inglês — isso é aqui.
    #[test]
    fn toda_mensagem_foi_de_fato_traduzida() {
        // Não há mais exceção: o inglês diz BE RIGHT BACK, GO LIVE e Table.
        // O único nome que atravessa os dois idiomas é "Corneta", sem acento.
        const NOMES_PROPRIOS: [&str; 0] = [];
        const ACENTOS: &str = "áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ";
        for m in all_samples() {
            let pt = m.text(Locale::PtBr);
            let en = m.text(Locale::En);
            assert!(!pt.trim().is_empty(), "{} sem pt", m.key());
            assert!(!en.trim().is_empty(), "{} sem en", m.key());
            if pt == en {
                continue; // "Corneta — Chat", "{name}: {msg}" e afins
            }
            let mut limpo = en.clone();
            for nome in NOMES_PROPRIOS {
                limpo = limpo.replace(nome, "");
            }
            assert!(
                !limpo.chars().any(|c| ACENTOS.contains(c)),
                "{}: o texto em inglês parece português — {en}",
                m.key()
            );
        }
    }

    /// Chave duplicada = duas variantes apontando pro mesmo texto do TS, que é
    /// sempre engano de copiar-colar.
    #[test]
    fn as_chaves_do_dicionario_sao_unicas() {
        let mut chaves: Vec<&str> = all_samples().iter().map(|m| m.key()).collect();
        chaves.sort_unstable();
        let total = chaves.len();
        chaves.dedup();
        assert_eq!(total, chaves.len(), "chave repetida no catálogo");
        assert!(
            all_samples().iter().all(|m| m.key().starts_with("rust.")),
            "chave fora do namespace rust.*"
        );
    }

    #[test]
    fn interpolacao_entra_nos_dois_idiomas() {
        let m = Msg::NotifyTargetErrorBody {
            name: "Twitch",
            msg: "sem conexão",
        };
        assert_eq!(m.text(Locale::PtBr), "Twitch: sem conexão");
        assert_eq!(m.text(Locale::En), "Twitch: sem conexão");

        let m = Msg::TrayTooltipLive { n: 3 };
        assert_eq!(m.text(Locale::PtBr), "Corneta · no ar (3)");
        assert_eq!(m.text(Locale::En), "Corneta · live (3)");
    }

    #[test]
    fn resolve_espelha_o_ts() {
        assert_eq!(resolve("en"), Locale::En);
        assert_eq!(resolve("pt-BR"), Locale::PtBr);
        // "auto" e qualquer lixo caem no sistema — que em teste é o padrão.
        assert_eq!(resolve("auto"), system_locale());
        assert_eq!(resolve(""), system_locale());
        assert_eq!(resolve("klingon"), system_locale());
        // Tag inteira só casa exata; o casamento por base é do sistema.
        assert_eq!(resolve("pt-PT"), system_locale());
    }

    #[test]
    fn tag_do_sistema_casa_pelo_idioma_base() {
        assert_eq!(match_tag("pt-BR"), Some(Locale::PtBr));
        assert_eq!(match_tag("pt-PT"), Some(Locale::PtBr));
        assert_eq!(match_tag("en-GB"), Some(Locale::En));
        assert_eq!(match_tag("EN"), Some(Locale::En));
        assert_eq!(match_tag("es-ES"), None);
        assert_eq!(match_tag(""), None);
        assert_eq!(system_locale(), match_tag(system_locale().tag()).unwrap());
    }

    #[test]
    fn tag_ida_e_volta() {
        for l in Locale::ALL {
            assert_eq!(Locale::from_tag(l.tag()), Some(l));
        }
        assert_eq!(Locale::from_tag("auto"), None);
    }

    /// O global é do processo inteiro; o teste devolve como estava pra não
    /// contaminar quem rodar em paralelo.
    #[test]
    fn locale_ativo_troca_e_marca_a_generation() {
        let antes = locale();
        let g = generation();
        set_locale(Locale::En);
        assert_eq!(locale(), Locale::En);
        set_locale(Locale::PtBr);
        assert_eq!(locale(), Locale::PtBr);
        assert!(generation() > g);
        set_locale(antes);
    }
}
