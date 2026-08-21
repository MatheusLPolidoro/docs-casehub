"""
Hook que publica o fonte Markdown de cada página ao lado do HTML.

O botão "baixar .md" do tema aponta para `index.md` relativo à própria
página. Como `use_directory_urls` está ligado, `/api/endpoints/` resolve
para `/api/endpoints/index.md` — que é exatamente onde este hook grava.

Por que um hook e não um plugin: o que se quer é uma cópia byte a byte do
fonte, sem passar por nenhum processamento do mkdocs. Qualquer plugin de
export entrega o Markdown já transformado, e aí o arquivo baixado deixa de
ser o que está no repositório.

**Por que `on_post_page` e não `on_post_build`.** O mkdocs-static-i18n roda
um build por idioma dentro do mesmo processo. No `on_post_build` o
`site_dir` já voltou a ser o da raiz, então a passagem do inglês regravava
o Markdown em português por cima da árvore `pt` e deixava `site/en` sem
nenhum `.md` — build verde, botão de download quebrado no site inteiro
menos num idioma. O `on_post_page` dispara com os caminhos do idioma
corrente ainda válidos.

Só chegam aqui páginas que estão de fato sendo renderizadas naquele
idioma, o que também elimina o outro sintoma da primeira versão: os
diretórios fantasma `site/<pagina>.en/` contendo apenas o Markdown.
"""

import logging
import shutil
from pathlib import Path

log = logging.getLogger('mkdocs.hooks.downloads')

_contagem = {}


def on_post_page(output, page, config):
    origem = Path(page.file.abs_src_path or '')
    if not origem.is_file():
        # Página gerada em memória: não há fonte para oferecer.
        return output

    destino = Path(page.file.abs_dest_path).with_suffix('.md')
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(origem, destino)

    raiz = str(config['site_dir'])
    _contagem[raiz] = _contagem.get(raiz, 0) + 1
    return output


def on_post_build(config):
    raiz = str(config['site_dir'])
    log.info(
        'downloads: %d fontes .md publicados a partir de %s',
        _contagem.get(raiz, 0),
        raiz,
    )
    _contagem[raiz] = 0
