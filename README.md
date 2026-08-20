# docs-casehub

Documentação central do ecossistema **CaseHub** — a API `fast-casehub`
e o SDK cliente `casehub` (repositório `casehub-connect`), descritos
lado a lado.

## Por que a documentação vive fora dos dois repositórios

A API e o SDK são versionados e publicados de forma independente, mas o
que importa para quem integra é o **contrato entre eles**. Documentar
isso dentro de um dos dois faria a outra metade ficar sempre
desatualizada — e é comum a mudança de contrato ser exatamente o que
não é documentado, porque cada repositório assume que o outro explica.

Aqui não há código: só documentação.

## Rodando localmente

### Versão do Python (pyenv)

O repositório fixa a versão em `.python-version` (**3.13.1**), a mesma
do `fast-casehub`, do `casehub-connect` e do `inflow`. Com
[pyenv-win](https://github.com/pyenv-win/pyenv-win) instalado, entrar
no diretório já seleciona a versão certa.

```powershell
pyenv install 3.13.1      # só na primeira vez
pyenv versions            # confirme que 3.13.1 aparece
python --version          # dentro do repo, deve dizer 3.13.1
```

> **Atenção:** nem todo projeto do workspace usa a mesma versão — o
> `param-manager`, por exemplo, fixa **3.11.1**. Criar o venv daqui com
> o interpretador errado é uma das causas do problema descrito em
> "Quando `mkdocs serve` falha" abaixo.

### Ambiente e servidor

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Silencia o aviso do MkDocs 2.0 neste venv - ver a seção abaixo.
@'
import os
os.environ.setdefault("NO_MKDOCS_2_WARNING", "true")
'@ | Set-Content -Encoding utf8 .venv\Lib\site-packages\sitecustomize.py

mkdocs serve
```

No Linux/macOS, `source .venv/bin/activate`, e o `sitecustomize.py` vai
em `.venv/lib/python3.13/site-packages/`.

### Silenciando o aviso do MkDocs 2.0

A partir da **9.7.2**, o `mkdocs-material` imprime um bloco de aviso
sobre mudanças planejadas no MkDocs 2.0 a cada `build`/`serve`. Não
afeta o build — é ruído do ecossistema, não deste site —, mas enterra as
linhas úteis do console.

**A variável de ambiente `NO_MKDOCS_2_WARNING` é o único desligamento
que existe.** Não há opção no `mkdocs.yml`, não há flag de linha de
comando, e não adianta tentar por `hooks:`: o MkDocs valida a opção
`theme` antes da opção `hooks`, então o tema já foi importado — e o
aviso já saiu — quando o primeiro hook roda. É o que a
[documentação do tema][aviso] diz, e vale para qualquer versão ≥ 9.7.2.

  [aviso]: https://squidfunk.github.io/mkdocs-material/blog/2026/02/18/mkdocs-2.0

O jeito confiável de entregar essa variável é **prendê-la ao venv**, com
um `sitecustomize.py` — módulo que o CPython importa sozinho no start de
todo processo do venv, antes de qualquer código de aplicação:

```powershell
@'
import os
os.environ.setdefault("NO_MKDOCS_2_WARNING", "true")
'@ | Set-Content -Encoding utf8 .venv\Lib\site-packages\sitecustomize.py
```

Vale para `mkdocs`, `mike` e `python -m mkdocs` igualmente, **em shell
novo ou velho**, com ou sem `Activate.ps1`, e morre junto com o venv —
não suja o ambiente da máquina. O `.venv/` é ignorado pelo git, então
esse arquivo faz parte do setup acima: **se o aviso voltar depois de um
`python -m venv` novo, é ele que faltou.**

#### Por que não a variável no ambiente do usuário

Dá para definir no nível User, e funciona:

```powershell
[Environment]::SetEnvironmentVariable("NO_MKDOCS_2_WARNING","true","User")
```

Mas ela **só entra em processos criados depois** — e abrir uma aba nova
no Windows Terminal **não basta**, porque a aba herda o ambiente do
processo do terminal, que continua sendo o de antes. Na prática o aviso
reaparece em terminais de sessões longas mesmo com a variável
corretamente definida, o que faz parecer que a configuração se perdeu ou
que o tema mudou. Não é nem um nem outro.

Se acontecer, o diagnóstico são estas duas linhas:

```powershell
[Environment]::GetEnvironmentVariable("NO_MKDOCS_2_WARNING","User")  # persistente
$env:NO_MKDOCS_2_WARNING                                             # sessão atual
```

Primeiro responde `true` e o segundo vem vazio ⇒ shell velho. Conserto
imediato, sem fechar nada: `$env:NO_MKDOCS_2_WARNING = "true"`.

Para tirar do nível User:
`[Environment]::SetEnvironmentVariable("NO_MKDOCS_2_WARNING",$null,"User")`.

O `sitecustomize.py` existe justamente para tirar esse modo de falha do
caminho. O CI não precisa dele: define a variável em `variables`, e cada
job é um processo novo.

#### Fixar versão não resolve

O `requirements.txt` fixa o piso em **9.7.7** porque é a versão que
restringe o aviso ao entrypoint do `mkdocs` (o `mike` e outros
importadores do tema ficam limpos), mas ela **continua imprimindo** no
`build`/`serve`. Silenciar por versão exigiria travar em `<9.7.2`,
abrindo mão de cinco releases do tema por um bloco cosmético. O
comentário no `requirements.txt` tem o histórico completo.

> **O nome é `NO_`, não `DISABLE_`.** Existiam **dois** avisos parecidos,
> de projetos diferentes e com variáveis diferentes. O segundo vinha do
> `properdocs`, um fork do MkDocs que o `mkdocs-gen-files` 0.6+ declara
> como dependência obrigatória e que se anunciava no console. Esse saiu
> do ambiente junto com o pin do `mkdocs-gen-files` — ver
> `requirements.txt`. Se um dia o bloco de propaganda voltar, é sinal de
> que o pin foi solto.

O site sobe em **`http://127.0.0.1:8009`** — a porta está fixada em
`dev_addr` no `mkdocs.yml`, não é a 8000 padrão do mkdocs. Neste
workspace a 8000 é a da API do `fast-casehub` em Docker.

Para conferir o build como o CI faz (link quebrado vira erro):

```powershell
mkdocs build --strict
```

## Quando `mkdocs serve` falha

Dois problemas com sintoma parecido e causa completamente diferente.

### `PermissionError: [WinError 10013]`

A mensagem fala em permissão, mas quase sempre é **porta ocupada** — o
Windows devolve 10013 em vez de "endereço já em uso" quando outro
processo detém o socket.

```powershell
netstat -ano | Select-String ":8009\s"          # PID de quem está na porta
Get-Process -Id <PID> | Select-Object Id, ProcessName, Path
```

Costuma ser um `mkdocs serve` de uma sessão anterior que não morreu.
Encerre o processo, ou suba noutra porta:

```powershell
mkdocs serve -a 127.0.0.1:8010
```

Vale checar também se a porta caiu numa faixa reservada pelo Windows
(Hyper-V, WSL e Docker reservam intervalos dinâmicos):

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

### O traceback aponta para outro projeto

Se a pilha de erro mostrar caminhos de **outro** repositório — por
exemplo `C:\mlp\produtos\param-manager\.venv\Scripts\mkdocs.exe` —, o
`mkdocs` que rodou não é o deste projeto.

O `(.venv)` no prompt **não identifica qual** venv está ativo: toda
pasta de ambiente aqui se chama `.venv`, então o prompt fica idêntico
em todos os projetos. Trocar de diretório não troca o ambiente ativo.

Confirme antes de investigar qualquer outra coisa:

```powershell
(Get-Command mkdocs).Source     # tem que apontar para ESTE repositório
python --version                # tem que bater com o .python-version
$env:VIRTUAL_ENV                # o venv realmente ativo
```

Se estiver errado, `deactivate` e ative o daqui. O sintoma é traiçoeiro
porque o build até **funciona** — só que com o conjunto de plugins do
outro projeto, que pode divergir do `requirements.txt` deste.

## Versionamento com `mike`

O site é publicado **versionado**. O job `pages` roda o `mike`, que
mantém cada versão numa pasta própria dentro da branch `gh-pages`, e só
então extrai aquela árvore para `public/` — que é o que o GitLab Pages
serve.

```
gh-pages/
├── versions.json     ← o que o seletor de versões busca
├── index.html        ← redirect para latest/
├── latest/           ← alias, aponta para a versão corrente
└── 1.0.0/            ← uma pasta por versão publicada
```

> **As URLs passaram a ter prefixo de versão.** A raiz redireciona para
> `latest/`, então uma página vive em `/latest/instalacao/` e em
> `/1.0.0/instalacao/`. **`/instalacao/` sem prefixo responde 404.**
> Link antigo, sem prefixo, precisa ser atualizado.

### De onde sai o número

Do arquivo **`VERSION`** na raiz do repositório, lido pelo job com
`cat`. É uma versão **própria do site**, deliberadamente não a da API
nem a do SDK: o site documenta os dois, e eles têm números diferentes
(hoje API 0.1.0 e SDK 0.2.0), então amarrar em um faria o seletor mentir
sobre o outro. O mapeamento entre eles está declarado na página de
[instalação](docs/instalacao.md).

Para publicar uma versão nova: edite o `VERSION`, comite, e promova para
a `main`. O `mike` cria a pasta nova, move o alias `latest` para ela e
acrescenta a entrada no `versions.json`.

### O token, e o que se perde sem ele

A persistência entre pipelines depende de uma variável de CI chamada
**`MIKE_TOKEN`**, um token de projeto com escopo `write_repository`. O
`CI_JOB_TOKEN` **não serve** — ele não empurra para o repositório.

O job foi escrito para degradar, não para quebrar: sem o token ele
publica assim mesmo e avisa no log. O que se perde é a **acumulação** —
cada pipeline recomeça a `gh-pages` do zero e o `versions.json` fica só
com a versão corrente. Inofensivo enquanto existir uma versão só, e
passa a apagar histórico assim que existir a segunda. **Crie o token
antes de publicar a segunda versão.**

### O 404 de `versions.json` no `serve` local continua

Rodando `mkdocs serve`, o console segue repetindo:

```
WARNING -  "GET /versions.json HTTP/1.1" code 404
```

Isso **não** mudou e não é defeito. O `mike` só entra no deploy; no
`serve` quem responde é o servidor de desenvolvimento do mkdocs, que
serve o build direto, sem estrutura de versões. O mesmo acontece no
`docs-param-manager`. No site publicado o arquivo existe e o seletor
funciona.

### Para desligar o versionamento

Remova as três linhas de `extra.version` do `mkdocs.yml` e devolva o job
`pages` a um `mkdocs build --strict --site-dir public`. O 404 some do
serve, as URLs voltam a não ter prefixo, e o seletor desaparece.

## A página "Estrutura"

`docs/gen_tree.py` gera a árvore dos **repositórios documentados** no
momento do build, procurando por `../fast-casehub` e
`../casehub-connect`.

Ausentes, a página diz isso em vez de sair vazia — um checkout
incompleto não deve quebrar o build da documentação. Para ver a árvore
completa, mantenha os três repositórios lado a lado:

```
produtos/
├── casehub-connect/
├── docs-casehub/      <- este
└── fast-casehub/
```

## Estrutura

| Caminho | O que é |
|---|---|
| `docs/*.md` | Páginas de visão geral, instalação e tutorial. |
| `docs/api/` | Contrato do `fast-casehub`: autenticação, endpoints, erros, retenção. |
| `docs/sdk/` | SDK `casehub`: cliente síncrono, assíncrono e CLI. |
| `docs/operacao/` | Deploy e observabilidade. |
| `docs/assets/` | Logo animado, ícones e o terminal animado (termynal). |
| `docs/gen_tree.py` | Gera a página "Estrutura" no build. |

## Convenções

- Português no texto; identificadores de código em inglês, como nos
  repositórios de origem.
- Diagramas em **mermaid**, dentro de blocos ```mermaid — renderizados
  nativamente pelo tema.
- Comandos de terminal usam o bloco `termynal` com botão de cópia; o
  texto copiado fica no `onclick`, então **precisa ser atualizado junto
  com o comando exibido**.
- Cada afirmação sobre comportamento deve corresponder ao código real.
  Ao mudar API ou SDK, esta documentação faz parte da mudança.
