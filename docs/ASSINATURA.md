# Assinatura e confiança na distribuição

Atualizado em 2026-09-06. A decisão registrada em 2026-07-30 permanece: lançamento inicial
sem compra de certificado Authenticode. Isso **não** dispensa a assinatura do updater.

| Proteção | O que comprova | Política atual |
| --- | --- | --- |
| Assinatura do updater | O instalador corresponde à chave pública embutida no app | Obrigatória; verificada criptograficamente antes de gerar a release |
| Authenticode | Identidade do publicador e integridade do executável Windows | Adiada por decisão de orçamento; assinatura existente inválida bloqueia |
| SHA-256 | O arquivo baixado tem os bytes publicados | Gerado em SHA256SUMS.txt; não substitui assinatura |

## SmartScreen: sem promessas falsas

Um instalador sem assinatura pode mostrar “aplicativo não reconhecido”. A presença e a forma
do aviso dependem da reputação e das políticas do Windows; não é correto prometer que todos
verão a mesma tela. Certificados OV e EV também não garantem ausência de avisos. EV não recebe
mais um bypass automático de reputação, conforme a
[documentação da Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

Antes de baixar, o usuário deve encontrar o domínio/repositório oficial, a explicação sobre
o certificado e o SHA-256. Não orientar a desativar o antivírus ou a ignorar detecções de malware.
Uma análise antivírus sem detecções não é garantia de segurança.

## Verificação implementada

```powershell
pwsh -NoProfile -File scripts/check-windows-signature.ps1 -InstallerPath CAMINHO_DO_INSTALADOR.exe
```

O workflow executa essa verificação no artefato que será anexado. Por padrão aceita
`NotSigned` com aviso, conforme a decisão de orçamento, ou `Valid`. Outros estados bloqueiam.

Quando houver certificado, configure o mecanismo de assinatura do Tauri e a variável de
Environment `REQUIRE_WINDOWS_CODE_SIGNING=1`. O mesmo script aceita `-RequireSigned` localmente.
Não substitua a chave do updater para resolver um problema de Authenticode.

Configuração suportada pelo Tauri: `bundle.windows.certificateThumbprint`,
`digestAlgorithm`, `timestampUrl`, ou um `signCommand` que integre o serviço escolhido.
Consulte a [documentação oficial de assinatura Windows](https://v2.tauri.app/distribute/sign/windows/)
ao escolher o fornecedor e confirme elegibilidade, preços e proteção da chave naquele momento.
Não guardar certificado, chave privada ou senha no repositório.

## O que ainda exige validação

- Publicar o aviso no fluxo real de download e conferir o instalador baixado, não só o arquivo local.
- Testar instalação em Windows limpo com as políticas de segurança normais.
- Confirmar backup seguro da chave do updater e ensaiar N-1 → N.
- Reavaliar Authenticode quando houver orçamento, sem tratar compra de EV como solução garantida.

Veja [ATUALIZACAO-AUTOMATICA.md](./ATUALIZACAO-AUTOMATICA.md) e
[GATES-DE-RELEASE.md](./GATES-DE-RELEASE.md).
