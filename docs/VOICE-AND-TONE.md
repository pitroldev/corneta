# Corneta voice and tone

Contributor guide for the copy in the app, the site, Help and Guides. The
language should help the streamer understand the current state and the next
action. For product limits, see [the public reference](../web/PRODUCT.md); for
tokens and components, see [the app design](../DESIGN.md) and [the site
design](../web/DESIGN.md).

The guide applies to both dictionaries. English is the default locale; the
examples below are pt-BR because they show the Brazilian register, and the
English copy follows the same principles in natural English.

## 1. Who we write for

Talk to someone who sets up scenes in OBS but does not need to know Docker,
FFmpeg or Corneta's architecture to go live. Address the reader directly
(“você” in Portuguese, “you” in English) and explain the result before the
technology. Technical text for contributors can use the module and protocol
names the subject requires.

## 2. Say the specific thing

Prefer an action, a state or something that appears on screen over phrases like
“otimizar sua experiência” (“optimize your experience”). Use the real names of
the controls and platforms.

A number goes in only if it can be checked in the code, the API, the screen or
an appropriate source. Do not invent wait times, benchmarks, usage statistics or
guarantees to make a sentence more convincing. When the cause is uncertain,
present it as a hypothesis and explain how to check.

## 3. Voice traits

- The app speaks in the first person about actions it has finished: “Atualizei a
  grade no OBS” (en: “Updated your OBS layout”). Do not announce success before
  the operation finishes.
- A failure says what could not be done and what the person can do: “Não
  consegui atualizar a grade no OBS — vê se ele tá aberto” (en: “Couldn't update
  your OBS layout — check that OBS is open”).
- In Portuguese interface copy, contractions such as “tá”, “pra” and “vê se” are
  natural. Legal text and permission descriptions use the precision the subject
  demands.
- State limits and costs before the decision: upload, load, delay, experimental
  feature or unsupported platform. A safety net is not a guarantee.
- English keeps the same fact and the same register, without translating
  Brazilian expressions literally. Keep the localized names of the controls.

## 4. What to avoid

### 4.1 Antithesis without information

Sentences with two mirrored halves do not replace an explanation. State the
concrete cause or effect: “O vídeo sai do seu PC direto para cada plataforma”
(“The video goes from your PC straight to each platform”).

### 4.2 Lists of synonyms

Each item must add a fact. Three ways of saying “more control” are still one
vague claim.

### 4.3 Abstractions instead of action

“Experiência”, “jornada”, “solução” and “cuidado” (“experience”, “journey”,
“solution”, “care”) do not explain what a button does or what happened to the
stream.

### 4.4 Slang without content

Informality does not call for a catchphrase. If a translation changes the
metaphor and loses the fact, rewrite the sentence. Also read the neighboring
sections so you do not repeat the same joke or caveat.

### 4.5 Internal names in front of the streamer

Color, file or module names are not interface vocabulary. Write “a tela JÁ
VOLTO” (“the BE RIGHT BACK screen”), not “o slate”; “a live continua no ar”
(“the stream stays on air”), not “o compositor segue publicando” (“the
compositor keeps publishing”). Terms such as latão (brass), tomate (tomato),
splicer, NDJSON and schemaVersion belong to the code and the technical
documentation, not to explanations for the streamer.

## 5. Text next to images and data

Explain what the visual means, not what it looks like: “A Twitch ficou 8s fora”
(“Twitch was down for 8s”) makes sense if that data exists; “a barra amarela
sumiu” (“the yellow bar disappeared”) depends on the decoration. Important
information must also be available as text.

An illustrative preview does not prove a real stream. Label examples, and do
not present synthetic metrics, old screenshots or experimental features as
current results. The [editorial protocol](../web/content/README.md) defines
evidence, dates, authorship and care with screenshots.

## 6. Mechanics

| Item                     | Rule                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Person                   | “você” in the Portuguese interface, “you” in English; technical or legal language when the context needs it.                     |
| Platform                 | Use “plataforma” (en: “platform”), not a generic name that hides which destination is meant.                                     |
| Gender (pt)              | a Twitch, a Kick, o YouTube.                                                                                                     |
| Contraction              | “pra” in the Portuguese interface; “para” when a formal register is required.                                                    |
| Button                   | A verb that names the action: “Atualizar agora”, “Copiar imagem”, “Abrir pasta” (en: “Update now”, “Copy image”, “Open folder”). |
| Error                    | What could not be done, a hypothesis when there is one, and a safe next step.                                                    |
| `aria-label` and `title` | Functional, no jokes: “Fechar o aviso da atualização” (en: “Close the update notice”).                                           |
| Number                   | A verifiable value with its unit; do not invent precision.                                                                       |
| Ellipsis                 | Waiting state, such as “Baixando…” (en: “Downloading…”).                                                                         |
| CAPS                     | Names of controls/states such as BORA AO VIVO and JÁ VOLTO (en: GO LIVE and BE RIGHT BACK), not generic emphasis.                |
| Emoji                    | Rare and functional; never the only carrier of a piece of information.                                                           |
| Punctuation              | Supporting sentences end with a period; short titles can skip it.                                                                |

## 7. Before you submit the change

- Check that the names match the version of the interface being described.
- Confirm facts and numbers; if you do not know the cause, do not state a
  diagnosis.
- Keep the meaning and the caveats in both languages.
- Check the waiting, failure, missing-data and completion states separately.
- Do not expose keys, personal paths, chat content or internal terms.
- Read the text aloud and reread the neighboring sections.
- Run the i18n tests and, for articles, the relevant editorial checks.
