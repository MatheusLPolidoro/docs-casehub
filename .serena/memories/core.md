## docs-casehub — o site publicado

Documentação central do ecossistema CaseHub (a API `fast-casehub` e o SDK
`casehub`). mkdocs-material, **português e inglês**, versionada por `mike` — a versão
do site é própria (`VERSION`, hoje `1.1.0`), **não** a da API nem a do SDK, porque ele
documenta os dois com números diferentes.

**Publicada em dois lugares, a partir do mesmo `main`** (2026-08-21):

| Onde | URL | Quem publica |
|---|---|---|
| GitHub Pages (público) | `https://matheuslpolidoro.github.io/docs-casehub/` | `.github/workflows/pages.yml` |
| GitLab Pages (interno) | `http://docs-casehub-0dafe0.pages.127.0.0.1.nip.io:8090` | job `pages` do `.gitlab-ci.yml` |

Não é redundância por descuido: o interno é o que a rede fechada alcança e
continua no ar sem internet. A mecânica difere porque o provedor difere — o
GitLab Pages publica um artefato (o job extrai a árvore da `gh-pages` para
`public/`), o GitHub publica a branch direto (`mike --push` basta, e o
`GITHUB_TOKEN` cobre o push, sem o `MIKE_TOKEN`).

**Dois remotos, e o nome importa**: `gitlab` (interno, `id 9`) e `origin`
(GitHub). `git push origin main` vai para o GitHub — o interno é
`git push gitlab main`. Branches `main` e `desenv`, promoção por merge
`--no-ff`.

### Bilinguismo — o que ele impõe

`mkdocs-static-i18n`, `docs_structure: suffix`: `pagina.md` é o português,
`pagina.en.md` o inglês. O build em `pt` vai para a raiz e o `en` para `/en/`.
**Página nova entra em dois arquivos** — com `fallback_to_default: true`, esquecer
o inglês entrega a página em português sem aviso nenhum.

**Editar usando um heading como ancora engole o heading.** Ao inserir
secao nova por `replace('## X', 'secao nova

## X')`, esquecer de
recolocar o `## X` numa das linguas deixa o conteudo orfao sob o
heading errado — e **nada reprova**: `--strict` passa, o link continua
resolvendo, a pagina so perde uma secao. Foi o que aconteceu com
`## Retention` em `arquitetura.en.md` (2026-09-11). O que pega isso e
comparar a estrutura das duas linguas — contagem de `##`/`###`,
admonicoes, abas, tabelas e fences por par `pagina.md`/`pagina.en.md`.
Rode essa comparacao antes de fechar qualquer edicao bilingue.

Os assets ficam **só na raiz**; não existe `/en/assets/`. `extra_css` e
`extra_javascript` resolvem sozinhos, mas `<img src>` cru em HTML apontaria para
um caminho inexistente no inglês — use imagem em Markdown dentro de bloco com
atributo `markdown`. Em JavaScript, derive a URL de `document.currentScript.src`.

`overrides/partials/alternate.html` existe por um defeito do plugin: ele desiste
de relativizar o link do seletor quando `page.url` é `.`, e o `/en/` absoluto que
sobra cai fora da árvore que o `mike` publica sob `/latest/` — 404 só na capa,
nos dois idiomas. `site_url` não resolve: apontaria todas as versões para a
`latest`.

### A página "Estrutura" é um hook, e não gen-files

`hooks/estrutura.py` grava `docs/estrutura.md` e `docs/estrutura.en.md` **dentro
do `docs_dir`**, em `on_config`, antes da coleta. Os dois são artefatos de build,
ignorados pelo git.

Era um script do `mkdocs-gen-files`, e a troca **não é preferência**: o i18n
classifica cada arquivo por `is_relative_to(file.abs_src_path, docs_dir)`, e o
gen-files cria a página num diretório temporário. Ela cai no ramo final do
`reconfigure_files`, sai de lá como `Unhandled file case` e reprova o `--strict`.
**Reordenar os plugins não resolve**: o `on_files` do i18n tem
`event_priority(-100)` e roda por último de qualquer jeito. O `mkdocs-gen-files`
saiu do `requirements.txt` junto.

O hook só grava quando o conteúdo mudou — o `mkdocs serve` observa o `docs_dir`,
e reescrever igual a cada `on_config` faria o watcher entrar em laço.

### Terceiro destino: cópia no fast-casehub, servida em /mkdocs (2026-09-16)

`fast-casehub/mkdocs/` tem `docs/`, `hooks/`, `overrides/` e `mkdocs.yml`
**copiados daqui** (origem registrada no `mkdocs/README.md` de lá), servidos
pela VM de produção da API em `https://casehub.callink.com.br/mkdocs/`. Este
repositório continua sendo a fonte da verdade — **uma edição aqui não chega lá
sozinha**: depois de promover, rode `fast-casehub/mkdocs/sincronizar.sh` e
commite no fast-casehub. Tudo o que é só daquele destino (`site_url` do
subcaminho, `mike` desligado, pins exatos, Dockerfile) fica em arquivos
próprios de lá, para a cópia continuar fiel.

### `hooks/idiomas.py` e `overrides/404.html` — dois defeitos do i18n (2026-09-16)

Achados na validação daquela cópia, e presentes no GitHub Pages também:

- **404 de `sitemap.xml` a cada página.** Quem busca **não** é o seletor de
  idioma, e sim o `integrations/alternate` do tema: para cada
  `<link rel="alternate" hreflang>` do `<head>` (escrito pelo `base.html` a
  partir de `config.extra.alternate`), ele baixa `sitemap.xml` relativo ao
  `href`. Foi feito para idiomas em sites separados; o i18n reescreve esse
  `href` para a página equivalente, então a busca caía em
  `api/endpoints/sitemap.xml` — e, sob o `mike`, até em `/sitemap.xml` na raiz
  do domínio. O hook tira **só essas tags do `<head>`** (`on_post_page` e
  `on_post_template`). Nada depende delas: o seletor é o `alternate.html`, que
  navega sozinho, e o `hreflang` para buscadores segue no `sitemap.xml` (72
  `xhtml:link`).
- **`404.html` da raiz em inglês.** O i18n gera o 2º idioma chamando `build()`
  de novo no **mesmo `site_dir`**; o `404.html` é *static template* do tema e
  vai sempre para a raiz, então o último idioma vence. O hook guarda o 404 do
  idioma padrão e o devolve no build dos outros. E o título: o `404.html` do
  Material 9.7.7 escreve `404 - Not found` **fixo**, fora das traduções — daí o
  `overrides/404.html`, que escolhe o texto por `config.theme.language`.

Medido com Chromium num deploy **real** do `mike` (repo temporário, servido em
`/docs-casehub/latest/`): sem a correção, 16 pedidos de sitemap num roteiro de
troca de idioma; com ela, zero, e a troca pela capa e por páginas internas
segue funcionando nos dois sentidos, com o seletor de versões intacto.

Sobra um 404 **externo** no console, sem relação: o tema consulta
`api.github.com/.../releases/latest` para a barra do repositório, e o repo não
tem release publicada. O `docs-param-manager` usa o mesmo i18n e
provavelmente tem os mesmos dois defeitos — não verificado.

### Os arquivos de interface são cópias do docs-param-manager

**Byte a byte, e de propósito.** Estes vieram de lá e devem continuar
idênticos, para que uma correção num dos sites seja um `cp` no outro:

    docs/assets/css/{a11y,tipografia,termynal}.css
    docs/assets/js/{pm-i18n,terminal,typography,doc-actions,logo-animation,termynal}.js
    hooks/downloads.py
    overrides/partials/header.html

O que é **deste** site: `docs/assets/css/{marca,extra}.css` (paleta azul e as
regras da árvore de arquivos), `docs/assets/marca-animada.svg`,
`docs/gen_tree.py` e o conteúdo.

Antes de editar qualquer um da lista de cima, considere se a mudança não vale
para o `docs-param-manager` também — e aplique nos dois.

`overrides/partials/header.html` é o parcial do tema copiado inteiro, o que
cria dívida com a próxima atualização. Verificado: a 9.6.12 (usada no
docs-param-manager) e a 9.7.7 (usada aqui) trazem esse arquivo idêntico.

### Animação e terminais

A marca desenha e recomeça a cada 9 s, sem controle na tela. O
`LogoAnimation.js` tem 6 MB e **não** está no `extra_javascript`:
`logo-animation.js` o busca sob demanda, só na página que tem o bloco. O
`termynal-init.js` herdado foi removido — era ele que chamava
`renderLogoAnimation()` em toda página, inclusive onde a função não existia.

Blocos de terminal usam
`<div class="pm-terminal" data-pm-terminal data-pm-command="…">`; os botões
de copiar e parar são montados por `terminal.js`. O formato antigo tinha
`onclick="copyText(...)"` no Markdown e `data-termynal-startDelay`, que o
termynal **nunca leu** (o prefixo dele é `data-ty`).

### Acessibilidade

Não há página sobre o assunto, e é decisão. O registro é
`docs/assets/css/a11y.css`, que cita o critério WCAG de cada bloco e aponta,
no cabeçalho, o que vive nos scripts: as verificações de
`prefers-reduced-motion` em `logo-animation.js` e `terminal.js`, que nenhuma
media query de CSS alcança. Tirá-las de lá reprova o critério sem nada ficar
vermelho no build.

### Exemplos são genéricos, por pedido explícito

Em 2026-08-21 o usuário pediu que a documentação **não** vinculasse os
exemplos a fluxos já implementados. Saíram o nome de automação real (virou
`minha-automacao`), as colunas da fonte real (viraram `referencia`, `origem`,
`item`), o `source_schema` que a nomeava e os rótulos de origem no diagrama do
`sobre.md`. **Ao escrever exemplo novo, não use nome de fluxo real.**

### Selos e repositório na barra

Quatro selos estáticos na capa (SDK, API, Python, contrato). **Não há selo de
PyPI nem de cobertura**: o SDK vai para registry interno e nenhum número de
cobertura é declarado nos dois repositórios — inventar um seria pior.

O `repo_url` aponta para **o repositório desta documentação no GitHub**, e não
para o código: nem o `fast-casehub` nem o `casehub-connect` são públicos, e um
link que responde 404 para o leitor é pior que link nenhum.

### O que este site não pode dizer

A documentação é pública. Duas afirmações foram reescritas por causa disso, e
a regra que as separou vale para o texto novo: **descrever como o software se
comporta é o trabalho da página; declarar em que estado a instalação de alguém
está hoje é informação operacional, e não pertence a um site público.**

O que saiu: que a validação de `aud` segue desligada num ambiente real, com a
condição de exploração junto (`mudancas.md`); e, no `docs-param-manager`, que
`client_secret` reais permanecem num histórico e não foram rotacionados. As
duas viraram descrição de mecanismo — o aviso no log de subida como
verificação, e a regra de rotacionar o que alcança o histórico.

### Alinhamento com o codigo (2026-09-11)

O site foi recolocado em dia com **API 0.4.2** e **SDK 0.7.2** — eram
0.2.0 e 0.4.0 no texto anterior. O que entrou, e onde:

- **`docs/api/webhooks.md`** (pt+en), pagina nova no nav: era a lacuna
  inteira. Sete rotas, assinatura HMAC, `source_conditions`/`events`,
  projecao por `fields`, log de entregas, redrive, pausa por
  `enabled: false`, e as `CASEHUB_WEBHOOK_*`.
- Quatro operadores de `source_record` (`filter`/`ne`/`exists`/
  `not_exists`), o cursor `created_since`/`updated_since`, as rotas
  `/v1/auth/*` na tabela, `status_conflict`/`invalid_webhook_url`/
  `webhook_not_found` nos erros.
- SDK: `patch_case_status`, `APIHTTPError.status_code`, e a CLI com
  `patch-case-status` e `--on-conflict`.
- `mudancas.md` reescrito, mais novo primeiro. Saiu o que so falava de
  versoes anteriores a 0.2.0 (os endpoints de tratamento, o
  `worker_id` -> `case_id`) e a lista da auditoria de agosto que ja
  virou comportamento normal descrito nas outras paginas.

**A entrada da `api-key` em `mudancas.md` continua, e continua
deliberada** — a credencial foi expurgada de todas as outras paginas a
pedido do dono do produto ("como se nunca tivesse existido"), mas
apagar tambem essa deixaria quem integra sem entender por que a
credencial dele parou.

**Tres correcoes de conteudo que estavam erradas, nao so velhas**: o
`on_conflict` era atribuido a API 0.2.0 (e 0.3.0); a `sdk/cli.md`
listava a flag `--api-key`, removida na 0.4.0; e a `sdk/cliente.md`
dizia que o retry de 401 podia duplicar itens de lote sem `case_id` —
desde a 0.3.0 o retry e **desligado** justamente nesse caso.

**Uma ressalva a trocar no proximo corte da API**: `total_pages` (nas
tres listagens paginadas) esta em `main` e no `openapi.yaml`, mas e
posterior a tag `v0.4.2` — nenhuma release cortada devolve o campo. O
site o documenta com uma nota dizendo exatamente isso, em
`api/endpoints.md` e `api/webhooks.md` (pt+en). Quando a proxima versao
sair, troque a nota pelo numero dela. A armadilha que criou a duvida: o
`info.version` do `openapi.yaml` vem do metadado instalado, entao o
arquivo diz `0.4.2` **e ja contem o campo** — o numero nele nao prova o
que ele descreve.

**O que o SDK nao cobre, e o site agora diz**: as rotas de webhook, o
cursor e os operadores `exists`/`not_exists`/`ne` nao tem metodo nem
flag. O cursor atravessa em runtime (`**params` repassa o que nao e
`None`), mas nao esta em `ListCasesParams` — verificado rodando
`_build_list_query`.

### Conferir o render, não só o build

`mkdocs build --strict` fica verde com a página quebrada. Sem extensão de
navegador, use o Chrome em linha de comando:

    chrome --headless=new --disable-gpu --hide-scrollbars \
      --window-size=1300,860 --virtual-time-budget=7000 \
      --screenshot=tela.png http://127.0.0.1:8012/

`--dump-dom` com as mesmas flags devolve o DOM já mexido pelo JavaScript.
`--virtual-time-budget` adianta os temporizadores, então o instante capturado
não é tempo de relógio. E **no Windows a janela não desce abaixo de ~489 px de
viewport**: pedir menos devolve um PNG cortado de uma página que não
transbordou.

O `NO_MKDOCS_2_WARNING=true` silencia o aviso do tema; o CI o define em
`variables`.
