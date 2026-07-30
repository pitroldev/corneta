# Landing page da Corneta

LP pública em Next.js 16, React Server Components e Tailwind CSS 4. O HTML principal é renderizado
no servidor e a página não envia JavaScript de interação desnecessário ao navegador.

## Desenvolvimento

```bash
pnpm --dir landing dev
pnpm --dir landing check
```

## Variáveis

Copie `.env.example` para `.env.local` quando necessário:

- `NEXT_PUBLIC_SITE_URL`: URL canônica usada em metadata, sitemap e robots;
- `NEXT_PUBLIC_PRIMARY_CTA_URL`: URL pública do instalador/release. Enquanto a URL real não
  estiver disponível, a página usa `https://example.com/corneta-download` como placeholder
  explícito.

### Páginas legais

`/legal/privacy` e `/legal/terms-of-use` são estáticas e descrevem o comportamento real do
produto: o que o app guarda no computador, o que a API de login (`/api/v1/*`) processa e o que
nenhum dos dois faz. Ao mudar fluxo de dados no app ou nas rotas de API, atualize os dois
documentos e a data em `lib/legal.ts`.

A identificação vive em **`lib/legal.ts`** — configuração fixa, sem variável de ambiente: tudo
ali é impresso na página pública. O arquivo separa duas figuras de propósito: a **pessoa
jurídica** que opera o site, a API e oferece os termos (controladora dos dados na LGPD) e o
**autor** titular dos direitos autorais do código no `LICENSE`. Trocar a titularidade do código
para a empresa exigiria uma cessão de direitos — não é edição de texto.

Dois campos seguem vazios e imprimem uma pendência vermelha na página até serem preenchidos:

- `LEGAL_VENUE`: comarca do foro eleito nos termos (normalmente a do domicílio da empresa);
- `LEGAL_HOST`: provedor de hospedagem citado como operador dos logs de acesso.
