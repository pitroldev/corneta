import type { Locale } from "./i18n";

export type EditorialCollectionName = "help" | "guides";

type CollectionCopy = {
  label: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

type EditorialCopy = {
  chrome: {
    home: string;
    help: string;
    guides: string;
    search: string;
    navLabel: string;
    skipLabel: string;
    languageLabel: string;
    languageAria: string;
  };
  search: {
    label: string;
    title: string;
    description: string;
    inputLabel: string;
    placeholder: string;
    submit: string;
    emptyTitle: string;
    emptyDescription: string;
    noResultsTitle: string;
    noResultsDescription: string;
    resultSingular: string;
    resultPlural: string;
  };
  collections: Record<EditorialCollectionName, CollectionCopy>;
  categories: Record<string, { title: string; description: string }>;
  common: {
    breadcrumbLabel: string;
    categoriesLabel: string;
    categoriesDescription: string;
    latestTitle: string;
    readArticle: string;
    backToCollection: string;
    tableOfContents: string;
    tableOfContentsLabel: string;
    relatedTitle: string;
    published: string;
    productVersion: string;
    testedWith: string;
    readingTime: string;
    sourceLabel: string;
    zoomLabel: string;
    zoomCloseLabel: string;
    zoomInLabel: string;
    zoomOutLabel: string;
    zoomFitLabel: string;
    articleKinds: Record<string, string>;
  };
};

const COPY: Record<Locale, EditorialCopy> = {
  "pt-BR": {
    chrome: {
      home: "Início",
      help: "Ajuda",
      guides: "Guias",
      search: "Buscar",
      navLabel: "Navegação editorial",
      skipLabel: "Pular para o conteúdo",
      languageLabel: "English",
      languageAria: "Abrir esta coleção em inglês",
    },
    search: {
      label: "Pesquisa",
      title: "O que você quer resolver?",
      description:
        "Busque por OBS, upload, stream key, plataforma ou pela mensagem que apareceu.",
      inputLabel: "Buscar nos guias e na ajuda",
      placeholder: "Ex.: live travando, configurar OBS...",
      submit: "Buscar",
      emptyTitle: "Procure pelo que aconteceu.",
      emptyDescription:
        "Use poucas palavras. Você pode buscar por uma tela, uma configuração ou um sintoma.",
      noResultsTitle: "Não achei isso por aqui.",
      noResultsDescription:
        "Tente menos palavras ou procure pelo nome que aparece na tela da Corneta.",
      resultSingular: "resultado",
      resultPlural: "resultados",
    },
    collections: {
      help: {
        label: "Central de ajuda",
        title: "Resolva o problema e volte para a live.",
        description:
          "Respostas diretas, verificações seguras e caminhos de diagnóstico para usar a Corneta.",
        emptyTitle: "Os primeiros artigos estão em revisão.",
        emptyDescription:
          "A estrutura já está pronta. Só publicaremos respostas testadas na versão indicada do produto.",
      },
      guides: {
        label: "Guias Corneta",
        title: "Entenda a live antes de apertar o botão.",
        description:
          "Guias completos sobre multistream, OBS Studio, qualidade, operação e segurança.",
        emptyTitle: "Os primeiros guias estão em produção.",
        emptyDescription:
          "Eles aparecerão aqui depois de teste técnico, revisão editorial e conferência das fontes.",
      },
    },
    categories: {
      "getting-started": {
        title: "Primeiros passos",
        description: "Instalação, primeira configuração e primeira live.",
      },
      "streaming-software": {
        title: "Software de transmissão",
        description:
          "OBS Studio, Streamlabs Desktop, XSplit e outros programas RTMP.",
      },
      platforms: {
        title: "Plataformas",
        description:
          "Contas, destinos, chaves e particularidades de cada serviço.",
      },
      quality: {
        title: "Qualidade e desempenho",
        description: "Upload, bitrate, encoder, resolução e carga da máquina.",
      },
      "chat-and-alerts": {
        title: "Chat e alertas",
        description: "Mensagens reunidas, moderação, notificações e overlays.",
      },
      "reports-and-data": {
        title: "Relatórios e dados",
        description:
          "Métricas, histórico, exportações e diagnóstico compartilhável.",
      },
      troubleshooting: {
        title: "Solução de problemas",
        description:
          "Árvores de diagnóstico para falhas antes, durante e depois da live.",
      },
      multistream: {
        title: "Multistream",
        description:
          "Métodos, destinos, limites e decisões para transmitir em vários lugares.",
      },
      operations: {
        title: "Operação da live",
        description:
          "Fluxos práticos para acompanhar e proteger uma transmissão ao vivo.",
      },
      security: {
        title: "Segurança",
        description:
          "Stream keys, RTMPS, privacidade e compartilhamento seguro.",
      },
      comparisons: {
        title: "Comparações",
        description:
          "Escolhas testadas entre abordagens, ferramentas e configurações.",
      },
    },
    common: {
      breadcrumbLabel: "Caminho desta página",
      categoriesLabel: "Encontre por assunto",
      categoriesDescription:
        "Escolha o ponto de partida mais próximo do que você quer configurar ou resolver.",
      latestTitle: "Conteúdo publicado",
      readArticle: "Ler conteúdo",
      backToCollection: "Voltar para a coleção",
      tableOfContents: "Nesta página",
      tableOfContentsLabel: "Sumário do artigo",
      relatedTitle: "Continue por aqui",
      published: "Publicado",
      productVersion: "Versão da Corneta",
      testedWith: "Testado com",
      readingTime: "Tempo de leitura",
      sourceLabel: "Fonte",
      zoomLabel: "Ampliar imagem",
      zoomCloseLabel: "Fechar imagem ampliada",
      zoomInLabel: "Aumentar zoom",
      zoomOutLabel: "Diminuir zoom",
      zoomFitLabel: "Ajustar",
      articleKinds: {
        guide: "Guia",
        help: "Ajuda",
        comparison: "Comparação",
        troubleshooting: "Diagnóstico",
      },
    },
  },
  en: {
    chrome: {
      home: "Home",
      help: "Help",
      guides: "Guides",
      search: "Search",
      navLabel: "Editorial navigation",
      skipLabel: "Skip to content",
      languageLabel: "Português",
      languageAria: "Open this collection in Portuguese",
    },
    search: {
      label: "Search",
      title: "What do you want to solve?",
      description:
        "Search for OBS, upload, stream keys, platforms, or the message you saw.",
      inputLabel: "Search guides and help",
      placeholder: "For example: stream stuttering, set up OBS...",
      submit: "Search",
      emptyTitle: "Search for what happened.",
      emptyDescription:
        "Use a few words. You can search for a screen, a setting, or a symptom.",
      noResultsTitle: "Nothing matched that search.",
      noResultsDescription:
        "Try fewer words or use the label shown in the Corneta interface.",
      resultSingular: "result",
      resultPlural: "results",
    },
    collections: {
      help: {
        label: "Help center",
        title: "Fix the problem and get back to your stream.",
        description:
          "Direct answers, safe checks, and troubleshooting paths for using Corneta.",
        emptyTitle: "The first help articles are under review.",
        emptyDescription:
          "The foundation is ready. We will only publish answers tested against the stated product version.",
      },
      guides: {
        label: "Corneta guides",
        title: "Understand your stream before you press the button.",
        description:
          "Complete guides to multistreaming, OBS Studio, quality, operations, and security.",
        emptyTitle: "The first guides are in production.",
        emptyDescription:
          "They will appear here after technical testing, editorial review, and source verification.",
      },
    },
    categories: {
      "getting-started": {
        title: "Getting started",
        description: "Installation, initial setup, and your first stream.",
      },
      "streaming-software": {
        title: "Streaming software",
        description:
          "OBS Studio, Streamlabs Desktop, XSplit, and other RTMP apps.",
      },
      platforms: {
        title: "Platforms",
        description:
          "Accounts, destinations, keys, and service-specific details.",
      },
      quality: {
        title: "Quality and performance",
        description:
          "Upload, bitrate, encoders, resolution, and computer load.",
      },
      "chat-and-alerts": {
        title: "Chat and alerts",
        description:
          "Unified messages, moderation, notifications, and overlays.",
      },
      "reports-and-data": {
        title: "Reports and data",
        description: "Metrics, history, exports, and shareable diagnostics.",
      },
      troubleshooting: {
        title: "Troubleshooting",
        description:
          "Decision trees for failures before, during, and after a stream.",
      },
      multistream: {
        title: "Multistreaming",
        description:
          "Methods, destinations, limits, and multi-platform decisions.",
      },
      operations: {
        title: "Stream operations",
        description:
          "Practical workflows for monitoring and protecting a live stream.",
      },
      security: {
        title: "Security",
        description: "Stream keys, RTMPS, privacy, and safe sharing.",
      },
      comparisons: {
        title: "Comparisons",
        description:
          "Tested choices between approaches, tools, and configurations.",
      },
    },
    common: {
      breadcrumbLabel: "Breadcrumb",
      categoriesLabel: "Browse by topic",
      categoriesDescription:
        "Choose the starting point closest to what you want to set up or solve.",
      latestTitle: "Published content",
      readArticle: "Read article",
      backToCollection: "Back to collection",
      tableOfContents: "On this page",
      tableOfContentsLabel: "Article table of contents",
      relatedTitle: "Keep reading",
      published: "Published",
      productVersion: "Corneta version",
      testedWith: "Tested with",
      readingTime: "Reading time",
      sourceLabel: "Source",
      zoomLabel: "Enlarge image",
      zoomCloseLabel: "Close enlarged image",
      zoomInLabel: "Zoom in",
      zoomOutLabel: "Zoom out",
      zoomFitLabel: "Fit",
      articleKinds: {
        guide: "Guide",
        help: "Help",
        comparison: "Comparison",
        troubleshooting: "Troubleshooting",
      },
    },
  },
};

export function editorialCopy(locale: Locale) {
  return COPY[locale];
}

export function editorialCategoryCopy(locale: Locale, category: string) {
  return (
    COPY[locale].categories[category] ?? {
      title: category,
      description: "",
    }
  );
}

export function editorialCount(locale: Locale, count: number) {
  if (locale === "en")
    return `${count} ${count === 1 ? "article" : "articles"}`;
  return `${count} ${count === 1 ? "artigo" : "artigos"}`;
}

export function formatEditorialDate(locale: Locale, isoDate: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
