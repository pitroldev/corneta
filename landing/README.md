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
