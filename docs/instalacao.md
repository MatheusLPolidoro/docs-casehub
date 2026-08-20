# Instalação

## SDK `casehub`

O que uma automação precisa. Traz o cliente síncrono, o assíncrono e a
CLI.

<div style="position: relative;">
  <button class="copy-btn" onclick="copyText('pip install casehub', this)">📋 Copiar</button>
  <div class="termynal" data-termynal data-termynal-startDelay="600" style="min-height: 180px;" data-command="pip install casehub">
    <span data-ty="input">pip install casehub</span>
    <span data-ty="progress"></span>
    <span data-ty>Successfully installed casehub</span>
  </div>
</div>

Requer **Python 3.10+**. As dependências de runtime são `httpx`,
`typer` e `rich`.

!!! info "Registry interno"
    O pacote é publicado no registry interno, não no PyPI público. Se o
    `pip` não encontrar, é a configuração de índice que falta
    (`PIP_INDEX_URL` / `pip.conf`), não o nome do pacote.

### Verificando a instalação

<div style="position: relative;">
  <button class="copy-btn" onclick="copyText('casehub --help', this)">📋 Copiar</button>
  <div class="termynal" data-termynal data-termynal-startDelay="600" style="min-height: 200px;" data-command="casehub --help">
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

<div style="position: relative;">
  <button class="copy-btn" onclick="copyText('docker compose --profile uat up -d', this)">📋 Copiar</button>
  <div class="termynal" data-termynal data-termynal-startDelay="600" style="min-height: 220px;" data-command="docker compose --profile uat up -d">
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

<div style="position: relative;">
  <button class="copy-btn" onclick="copyText('python -m casehub_api --storage memory', this)">📋 Copiar</button>
  <div class="termynal" data-termynal data-termynal-startDelay="600" style="min-height: 220px;" data-command="python -m casehub_api --storage memory">
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

!!! danger "Configuração incompleta derruba o processo, de propósito"
    Com `CASEHUB_AUTH_MODE=oidc` ou `dual` e sem `issuer`/`jwks_url`, o
    serviço **recusa subir**. É deliberado: é muito mais barato falhar
    no deploy do que descobrir por um 401 inexplicável em produção — ou,
    pior, subir aceitando qualquer requisição.
