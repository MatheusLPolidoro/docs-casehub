# Instalação

## SDK `casehub`

O que uma automação precisa. Traz o cliente síncrono, o assíncrono e a
CLI.

<div class="pm-terminal" data-pm-terminal data-pm-command="pip install casehub">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">pip install casehub</span>
<span data-ty="progress"></span>
<span data-ty>Successfully installed casehub</span>
</div>
</div>

Requer **Python 3.11+**. As dependências de runtime são `httpx`,
`typer`, `toml` e `rich`.

!!! warning "Fixe a versão"
    A versão atual do SDK é a **0.3.0**, e a da API é a **0.1.0**.
    Prefira `pip install "casehub==0.3.0"` a instalar sem piso, para que
    um ambiente não acorde numa versão incompatível.

    Duas versões mudaram comportamento. A **0.2.0** renomeou `worker_id`
    para `case_id` em todo o client e na CLI, então um SDK anterior a ela
    **não fala** o contrato que a API atende hoje. A **0.3.0** mudou três
    coisas que quem consome percebe: lote inválido levanta `ValueError`
    antes de gastar requisição; um lote com item sem `case_id` deixa de
    ser reenviado automaticamente depois de um 401, e o erro sobe como
    `APIHTTPError`; e `ConnectTimeout`/`WriteTimeout`/`PoolTimeout`
    passaram a virar `APITimeoutError`. Ver [O que mudou](mudancas.md).

!!! info "Registry interno"
    O pacote é publicado no registry interno, não no PyPI público. Se o
    `pip` não encontrar, é a configuração de índice que falta
    (`PIP_INDEX_URL` / `pip.conf`), não o nome do pacote.

### Verificando a instalação

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub --help">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub --help</span>
<span data-ty>Usage: casehub [OPTIONS] COMMAND [ARGS]...</span>
<span data-ty>  configure, health, readiness, list-cases,</span>
<span data-ty>  get-case, upsert-case, upsert-cases-batch</span>
</div>
</div>

---

## API `fast-casehub`

Só quem opera o serviço precisa disto. Quem apenas consome a API
precisa do SDK acima e de um endereço.

### Com Docker (recomendado)

Sobe API, Postgres e Keycloak juntos.

<div class="pm-terminal" data-pm-terminal data-pm-command="docker compose --profile uat up -d">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">cp .env.example .env</span>
<span data-ty="input">docker compose --profile uat up -d</span>
<span data-ty="progress"></span>
<span data-ty>✔ Container postgres_casehub  Healthy</span>
<span data-ty>✔ Container keycloak          Healthy</span>
<span data-ty>✔ Container casehub_api_uat   Started</span>
</div>
</div>

O `.env` precisa existir antes: o compose lê dele via `env_file`, e sem
ele os valores caem em defaults de desenvolvimento.

### Direto, para desenvolvimento

<div class="pm-terminal" data-pm-terminal data-pm-command="python -m casehub_api --storage memory">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">pip install -e ".[dev]"</span>
<span data-ty="progress"></span>
<span data-ty="input">python -m casehub_api --storage memory</span>
<span data-ty>INFO:     Uvicorn running on http://127.0.0.1:8080</span>
</div>
</div>

`--storage memory` sobe sem Postgres — o mock in-memory implementa o
mesmo contrato e serve para desenvolver contra a API sem infraestrutura.

!!! warning "`--storage memory` não persiste nada"
    Ao reiniciar o processo, todos os casos somem. É para desenvolvimento
    e teste, nunca para um ambiente compartilhado.

---

## Variáveis de ambiente

### Do SDK

| Variável | Para quê |
|---|---|
| `CASEHUB_BASE_URL` | Endereço da API. |
| `CASEHUB_CLIENT_ID` / `CASEHUB_CLIENT_SECRET` / `CASEHUB_TOKEN_URL` | Credenciais OIDC. **Os três juntos, ou nenhum.** |
| `CASEHUB_API_KEY` | Modo legado. Só onde a API ainda aceita. |

### Da API

| Variável | Default | Para quê |
|---|---|---|
| `CASEHUB_STORAGE` | `memory` | `memory` ou `postgres`. |
| `CASEHUB_AUTH_MODE` | `oidc` | `oidc`, `dual` ou `apikey`. Ver [Autenticação](api/autenticacao.md). |
| `CASEHUB_OIDC_ISSUER` | — | Obrigatória em `oidc`/`dual`. |
| `CASEHUB_OIDC_JWKS_URL` | — | Obrigatória em `oidc`/`dual`. |
| `CASEHUB_OIDC_AUDIENCE` | vazio | Vazio = não valida `aud`. Ver o aviso em [Autenticação](api/autenticacao.md). |
| `CASEHUB_DB` | — | URL completa do Postgres. Tem precedência sobre `CASEHUB_DB_*`. |
| `CASEHUB_MAX_BATCH_ITEMS` | `1000` | Teto de itens por lote. |
| `CASEHUB_MAX_SOURCE_RECORD_BYTES` | `262144` | Teto por `source_record`. |
| `CASEHUB_MAX_SOURCE_FILTERS` | `20` | Teto de filtros `f.` por consulta. |
| `CASEHUB_RETENTION_ENABLED` | `true` | Liga o job de expurgo. |
| `CASEHUB_HOST` | `127.0.0.1` | Interface em que o Uvicorn escuta. |
| `CASEHUB_PORT` | `8080` | Porta do serviço. |
| `CASEHUB_OIDC_LEEWAY_SECONDS` | `10` | Tolerância de relógio ao validar o token. |
| `CASEHUB_OIDC_JWKS_CACHE_TTL_SECONDS` | `300` | Tempo de cache do JWKS. |

!!! tip "As duas últimas explicam 401 que parece sem causa"
    `LEEWAY_SECONDS` é a folga de relógio aceita entre o emissor e o
    serviço: um 401 intermitente em máquina com relógio à deriva
    costuma ser skew maior que esse valor, não token inválido.

    `JWKS_CACHE_TTL_SECONDS` é o atraso máximo entre rotacionar a chave
    no Keycloak e ela passar a valer aqui — durante essa janela, tokens
    assinados com a chave nova são recusados.

!!! danger "Configuração incompleta derruba o processo, de propósito"
    Com `CASEHUB_AUTH_MODE=oidc` ou `dual` e sem `issuer`/`jwks_url`, o
    serviço **recusa subir**. É deliberado: é muito mais barato falhar
    no deploy do que descobrir por um 401 inexplicável em produção — ou,
    pior, subir aceitando qualquer requisição.

### Do banco

Só valem com `CASEHUB_STORAGE=postgres`. `CASEHUB_DB` (a URL completa,
na tabela acima) **tem precedência sobre todas elas** — quando ela está
preenchida, as demais são ignoradas.

| Variável | Default | Para quê |
|---|---|---|
| `CASEHUB_DB_HOST` | vazio | Host do Postgres. |
| `CASEHUB_DB_PORT` | `5432` | Porta. |
| `CASEHUB_DB_NAME` | vazio | Nome do banco. |
| `CASEHUB_DB_USER` | vazio | Usuário. |
| `CASEHUB_DB_PASSWORD` | vazio | Senha. |
| `CASEHUB_DB_DRIVER` | `postgresql+psycopg` | Driver SQLAlchemy. |
| `CASEHUB_DB_POOL_SIZE` | `5` | Conexões mantidas abertas no pool. |
| `CASEHUB_DB_MAX_OVERFLOW` | `10` | Conexões extras além do pool sob pico. |
| `CASEHUB_DB_POOL_TIMEOUT` | `30` | Segundos esperando uma conexão livre. |
| `CASEHUB_DB_POOL_RECYCLE` | `1800` | Segundos até reciclar uma conexão ociosa. |
| `CASEHUB_DB_CONNECT_TIMEOUT` | `10` | Segundos para estabelecer a conexão. |
| `CASEHUB_DB_ECHO` | `false` | Loga o SQL emitido. |

!!! danger "`CASEHUB_DB_ECHO` vaza `source_record` para o stdout"
    O echo do SQLAlchemy imprime a query **com os parâmetros**, e isso
    inclui o conteúdo de `source_record`. Serve para depuração local e
    **não deve ser ligado em ambiente compartilhado** — ver
    [Observabilidade](operacao/observabilidade.md).
