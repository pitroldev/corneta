# Compatibilidade e atualização

Referência: linha desktop 0.7.0. Status experimental.

| Superfície         | Contrato atual                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop            | Windows x64, Tauri/WebView2 e toolchain fixado no repositório; hardware/driver ainda requerem validação de mídia real.               |
| Outras plataformas | macOS, Linux e Windows ARM não têm distribuição validada; compilar não equivale a suportar.                                          |
| Demonstração       | Navegador Chromium, estado simulado; não testa cofre, OBS, OAuth nem GPU nativa.                                                     |
| OBS                | Integração obs-websocket v5; sinal de vídeo entra no servidor de ingestão local. Permissões e rede continuam relevantes.             |
| API/site           | Workspace web com versão própria; verificações de payload/manifesto e políticas de origem devem continuar compatíveis com o desktop. |
| Relatórios         | NDJSON e arquivos de chat/vídeo separados; parsers têm suporte legado testado. Não editar versões à mão para forçar aceitação.       |
| Configuração/cofre | Migrações na camada nativa; segredos não pertencem ao JSON exportável. Configuração de versão futura pode ser recusada.              |
| Contributor        | Identificador próprio: não deve usar automaticamente o cofre, updater ou dados da instalação oficial. Não é sandbox.                 |

Antes de mudar um formato, adicione fixtures antigas, teste leitura/migração/ausência de campos e documente o que muda. Nunca corrija incompatibilidade apagando dados silenciosamente. Os catálogos de idioma ficam em `src/lib/i18n/` e `web/lib/i18n/`.

Antes de um upgrade real, feche a live e preserve configuração, relatórios e vídeos por procedimento apropriado à sua instalação. Um backup de arquivos não garante portabilidade do cofre do Windows. Teste a atualização em conta/VM descartável e confira preservação de dados e encerramento de sidecars. Não execute builds experimentais contra o perfil de produção.

Downgrade não é garantido: uma versão antiga pode não entender dados novos. A assinatura do updater autentica o artefato; checksum e Authenticode cumprem papéis diferentes. Consulte [assinaturas](ASSINATURA.md) e o [guia de publicação](PUBLICACAO.md).
