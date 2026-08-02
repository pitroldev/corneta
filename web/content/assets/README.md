# Assets editoriais

- `originals/` guarda masters sanitizados, sem compressão destrutiva adicional.
- `manifest.json` registra procedência e cada derivada pública.
- As derivadas ficam em `web/public/images/editorial/`, fora desta pasta.
- Master e derivada usam o mesmo `baseName`, em inglês e kebab-case.
- Não coloque segredos nos masters: eles são versionados no repositório.

O protocolo completo, inclusive privacidade, formatos, idioma e orçamento de
512 KiB, está em `../README.md`.
