# Template: troubleshooting

Copie para `{locale}/help/troubleshooting/{english-slug}.mdx` e use
`kind: troubleshooting`.

Estruture o corpo por decisão:

1. sintoma exato e estado esperado;
2. primeiro teste seguro, do mais provável e barato ao mais invasivo;
3. para cada ramo: causa provável → como confirmar → correção;
4. como saber que a correção funcionou;
5. quando desfazer a mudança;
6. quais dados sanitizados exportar para suporte;
7. o que nunca compartilhar.

Separe rede, renderização, codificação, autenticação e falha isolada por destino.
Não esconda hipóteses diferentes sob “reinicie tudo”. Screenshots mostram apenas
o estado que evita ambiguidade e seguem o protocolo de privacidade do README.
