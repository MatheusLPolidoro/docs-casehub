## docs-casehub — o site publicado

Documentação central do ecossistema CaseHub (a API `fast-casehub` e o SDK
`casehub`). mkdocs-material, **português e inglês**, versionada por `mike` — a versão
do site é própria (`VERSION`, hoje `1.0.0`), **não** a da API nem a do SDK, porque ele
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

### Divergencia conhecida com o codigo (2026-08-24)

O site descreve autenticacao so por OIDC, que e o que vale - a
`api-key` foi expurgada de todas as paginas, nos dois idiomas, a
pedido do dono do produto ("como se nunca tivesse existido"). O que
sobrou de historico e uma entrada em `docs/mudancas.md`, deliberada:
apagar tambem essa deixaria quem integra sem entender por que a
credencial dele parou.

**O site esta atras das versoes.** Ele fala do SDK na 0.3.0; o
`casehub-connect` esta na **0.4.0** (removeu o parametro `api_key`, e a
CLI parou de pedir credencial interativamente) e o `fast-casehub` na
**0.2.0** (removeu o modo `apikey`, ganhou `/v1/auth/token` e
`/v1/auth/refresh`). Falta secao em `docs/mudancas.md` para as duas.
O texto pronto esta nos `CHANGELOG.md` de cada repo.

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
