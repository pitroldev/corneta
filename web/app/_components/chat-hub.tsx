import { PlatformGlyph } from "./decor";
import { BellIcon, CoinIcon, HeartIcon, InfoIcon, RaidIcon, StarIcon } from "./icons";

// Chat unificado, alertas e overlay pro OBS — as três coisas que a tela de Chat
// do app faz. Abas em CSS puro (radios), sem JavaScript.

export function ChatHub() {
  return (
    <div className="switch">
      <input type="radio" name="hub" id="hub-chat" defaultChecked />
      <input type="radio" name="hub" id="hub-alertas" />
      <input type="radio" name="hub" id="hub-overlay" />

      <div className="switch-tabs" role="group" aria-label="Chat, alertas e overlay">
        <label className="switch-tab" htmlFor="hub-chat">
          <strong>Chat unificado</strong>
          <em>ler, responder, moderar</em>
        </label>
        <label className="switch-tab" htmlFor="hub-alertas">
          <strong>Alertas</strong>
          <em>quem chegou e apoiou</em>
        </label>
        <label className="switch-tab" htmlFor="hub-overlay">
          <strong>Overlay pro OBS</strong>
          <em>uma URL, uma vez só</em>
        </label>
      </div>

      <div className="switch-panels">
        {/* ---------------- Chat ---------------- */}
        <div className="switch-panel" data-panel="chat">
          <div className="hub-board">
            <div className="demo-label">
              <span>chat reunido · 3 plataformas</span>
              <span>prévia ilustrativa</span>
            </div>

            <div className="msg">
              <PlatformGlyph id="twitch" />
              <div>
                <div className="msg-head">
                  <strong>gabizera</strong>
                  <span className="msg-badge-mod msg-badge">mod</span>
                  <span className="msg-time">21:42</span>
                </div>
                <p>
                  salve salve, chegando! <span className="msg-emote">:D</span>
                </p>
                <div className="msg-tools">
                  <span>apagar</span>
                  <span>timeout</span>
                  <span>responder</span>
                </div>
              </div>
            </div>

            <div className="msg">
              <PlatformGlyph id="youtube" />
              <div>
                <div className="msg-head">
                  <strong>Marcos L.</strong>
                  <span className="msg-badge">membro</span>
                  <span className="msg-time">21:42</span>
                </div>
                <p>áudio tá limpo hoje 👏</p>
              </div>
            </div>

            <div className="msg">
              <PlatformGlyph id="kick" />
              <div>
                <div className="msg-head">
                  <strong>duduxx</strong>
                  <span className="msg-time">21:43</span>
                </div>
                <p>bora cornetar!!</p>
              </div>
            </div>

            <div className="msg">
              <PlatformGlyph id="twitch" />
              <div>
                <div className="msg-head">
                  <strong>bot_spam_xyz</strong>
                  <span className="msg-time">21:43</span>
                </div>
                <p className="msg-dead">mensagem removida pela moderação</p>
              </div>
            </div>

            <div className="chat-compose">
              Manda no chat…
              <b>enviar pra todas</b>
            </div>
          </div>

          <p className="hub-note">
            <InfoIcon />
            <span>
            Twitch, Kick e YouTube no mesmo feed — até dois canais da Twitch de
            uma vez. Emotes (BTTV, FFZ, 7TV), selos, horário e envio pelo mesmo
            campo. Apagar e dar timeout acontece direto daqui: a mensagem vira
            lápide no feed em vez de sumir sem explicação.
            </span>
          </p>
        </div>

        {/* ---------------- Alertas ---------------- */}
        <div className="switch-panel" data-panel="alertas">
          <div className="hub-board">
            <div className="demo-label">
              <span>alertas ao vivo</span>
              <span>prévia ilustrativa</span>
            </div>

            <div className="alert">
              <span className="alert-kind alert-kind-ok">
                <HeartIcon />
              </span>
              <div>
                <strong>lucasrmk seguiu você</strong>
                <small>Twitch · agora</small>
              </div>
            </div>

            <div className="alert">
              <span className="alert-kind">
                <StarIcon />
              </span>
              <div>
                <strong>ana.play assinou</strong>
                <small>Twitch · tier 1 · “tô desde o começo!”</small>
              </div>
              <span className="alert-amount">3 meses</span>
            </div>

            <div className="alert">
              <span className="alert-kind alert-kind-tomate">
                <RaidIcon />
              </span>
              <div>
                <strong>canal_do_ze mandou um raid</strong>
                <small>Twitch · trouxe gente nova pro chat</small>
              </div>
              <span className="alert-amount">42</span>
            </div>

            <div className="alert">
              <span className="alert-kind">
                <CoinIcon />
              </span>
              <div>
                <strong>Superchat de Marcos L.</strong>
                <small>YouTube · “explica o setup!”</small>
              </div>
              <span className="alert-amount">R$ 20</span>
            </div>

            <div className="alert-src">
              <span className="chip chip-quiet">bits</span>
              <span className="chip chip-quiet">subgift</span>
              <span className="chip chip-quiet">membro</span>
              <span className="chip chip-quiet">tip</span>
              <span className="chip">Streamlabs</span>
              <span className="chip">StreamElements</span>
            </div>
          </div>

          <p className="hub-note">
            <InfoIcon />
            <span>
            Seguidor, sub, resub, subgift, bits, raid, membro e superchat chegam
            das plataformas; doações e metas entram pelo Streamlabs ou
            StreamElements com o token guardado no cofre. O painel de alertas
            fica ao lado do chat — ou numa janelinha só dele.
            </span>
          </p>
        </div>

        {/* ---------------- Overlay ---------------- */}
        <div className="switch-panel" data-panel="overlay">
          <div className="hub-board">
            <div className="demo-label">
              <span>sua cena no OBS</span>
              <span>prévia ilustrativa</span>
            </div>

            <div className="obs-scene">
              <small>cena · live de sempre</small>

              <div className="obs-alert">
                <BellIcon />
                ana.play assinou · tier 1
              </div>

              {/* A moldura da câmera dá escala à cena e explica por que o meio
                  fica livre: ali é o seu conteúdo. */}
              <span className="obs-cam" aria-hidden="true">
                câmera
              </span>

              <div className="obs-chat" aria-hidden="true">
                <span>
                  <i style={{ background: "var(--twitch)" }} /> gabizera: salve
                  salve!
                </span>
                <span>
                  <i style={{ background: "var(--youtube)" }} /> Marcos L.: áudio
                  tá limpo
                </span>
                <span>
                  <i style={{ background: "var(--kick)" }} /> duduxx: bora
                  cornetar!!
                </span>
              </div>
            </div>

            <div className="url-field">
              <code>http://127.0.0.1:7393/alerts</code>
              <span>copiar</span>
            </div>
            <div className="url-field">
              <code>http://127.0.0.1:7393/chat</code>
              <span>copiar</span>
            </div>
          </div>

          <p className="hub-note">
            <InfoIcon />
            <span>
            Um servidor local joga os alertas e o chat (com emotes) numa URL que
            você adiciona como <strong>Browser Source</strong> — uma vez só, e a
            Corneta consegue até criar a fonte no OBS pra você. Posição, tamanho,
            duração, som, quantas mensagens ficam na tela e esconder comandos
            (“!”) são ajustáveis. Tem botão de alerta de teste pra você conferir
            sem esperar ninguém.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
