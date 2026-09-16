"""
Hook com duas correções da convivência entre o `mkdocs-static-i18n` e o
`mkdocs-material`. As duas só aparecem no navegador: o `--strict` passa e o
site parece certo.

**1. `sitemap.xml` com 404 a cada página.** O `base.html` do tema escreve no
`<head>` um `<link rel="alternate" hreflang>` por idioma, a partir de
`config.extra.alternate`, que o i18n reescreve em cada página apontando para a
página equivalente no outro idioma. O JavaScript do tema
(`integrations/alternate`) busca `sitemap.xml` relativo ao `href` de **cada**
um desses links: ele foi feito para idiomas publicados como sites separados,
cada um na raiz de um diretório com o próprio sitemap. Aqui o link aponta para
uma página, e a busca cai em `api/endpoints/sitemap.xml`, `en/api/endpoints/
sitemap.xml`... — 404 no console e no log do servidor, página a página.

O que se retira são só essas tags do `<head>`. Nada que funciona depende
delas:

- o seletor de idioma é o `overrides/partials/alternate.html`, que monta o
  link da página equivalente e navega sozinho — o JavaScript só interceptaria
  o clique para refazer o que o link já faz;
- a indicação de idioma para buscadores continua no `sitemap.xml`, que o i18n
  gera com um `xhtml:link hreflang` por página.

**2. A página 404 em inglês.** O i18n gera cada idioma chamando o build do
MkDocs de novo **no mesmo `site_dir`**: as páginas do inglês vão para `en/`,
mas o `404.html` é um *static template* do tema, sempre gravado na raiz. O
idioma padrão é construído primeiro, e o seguinte sobrescreve o arquivo. Este
hook guarda o `404.html` renderizado no idioma padrão e o devolve também
quando os outros idiomas vão gravar o deles.
"""

import re

# `<link ... rel="alternate" ... hreflang="..." ...>`, em qualquer ordem de
# atributos e quebrado em várias linhas, como o tema escreve. Exigir o
# `hreflang` deixa passar um `rel="alternate"` de outra natureza (RSS, que o
# tema escreve sem ele).
_ALTERNATE_DE_IDIOMA = re.compile(
    r'[ \t]*<link\b(?=[^>]*\brel="alternate")(?=[^>]*\bhreflang=)[^>]*>\n?'
)

# `404.html` renderizado no idioma padrão, reaproveitado pelos outros builds.
_pagina_404_padrao = None


def _sem_alternates_de_idioma(html):
    """Remove os links de idioma só do `<head>`, onde o tema os escreve."""
    fim_head = html.find('</head>')
    if fim_head == -1:
        return html
    head = _ALTERNATE_DE_IDIOMA.sub('', html[:fim_head])
    return head + html[fim_head:]


def on_post_page(output, page, config):
    return _sem_alternates_de_idioma(output)


def on_post_template(output_content, template_name, config):
    global _pagina_404_padrao

    if template_name != '404.html':
        return output_content

    output_content = _sem_alternates_de_idioma(output_content)

    i18n = config.plugins.get('i18n')
    if i18n is None:
        return output_content

    if i18n.current_language == i18n.default_language:
        _pagina_404_padrao = output_content
        return output_content

    # Build de um idioma que não é o padrão: o arquivo é o mesmo `404.html`
    # da raiz, então grava de novo o do idioma padrão por cima.
    return _pagina_404_padrao or output_content
