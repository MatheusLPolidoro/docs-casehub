# Installation

## The `casehub` SDK

What an automation needs. It brings the synchronous client, the
asynchronous one and the CLI.

<div class="pm-terminal" data-pm-terminal data-pm-command="pip install casehub">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">pip install casehub</span>
<span data-ty="progress"></span>
<span data-ty>Successfully installed casehub</span>
</div>
</div>

Requires **Python 3.11+**. The runtime dependencies are `httpx`, `typer`,
`toml` and `rich`.

!!! warning "Pin the version"
    The current SDK version is **0.7.2**, and the API is at **0.5.0**.
    Prefer `pip install "casehub==0.7.2"` over installing with no floor, so
    that an environment does not wake up on an incompatible version.

    Do not install **0.7.0**: it shipped with `casehub.__version__` stuck
    at `'0.6.1'` while the distribution already said `0.7.0`, so anyone
    reading `__version__` gets the wrong version. 0.7.1 fixes it.

    What each version changed for consumers is in
    [What changed](mudancas.md).

!!! info "Internal registry"
    The package is published to the internal registry, not to public PyPI.
    If `pip` cannot find it, what is missing is the index configuration
    (`PIP_INDEX_URL` / `pip.conf`), not the package name.

### Verifying the installation

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub --help">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub --help</span>
<span data-ty>Usage: casehub [OPTIONS] COMMAND [ARGS]...</span>
<span data-ty>  configure, health, readiness, list-cases, get-case,</span>
<span data-ty>  upsert-case, patch-case-status, upsert-cases-batch</span>
</div>
</div>

---

## The `fast-casehub` API

Only whoever operates the service needs this. Anyone who just consumes the
API needs the SDK above and an address.

### With Docker (recommended)

Brings up the API, Postgres and Keycloak together.

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

The `.env` has to exist first: compose reads it through `env_file`, and
without it the values fall back to development defaults.

### Directly, for development

<div class="pm-terminal" data-pm-terminal data-pm-command="python -m casehub_api --storage memory">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">pip install -e ".[dev]"</span>
<span data-ty="progress"></span>
<span data-ty="input">python -m casehub_api --storage memory</span>
<span data-ty>INFO:     Uvicorn running on http://127.0.0.1:8080</span>
</div>
</div>

`--storage memory` runs without Postgres — the in-memory mock implements the
same contract and is enough to develop against the API with no
infrastructure.

!!! warning "`--storage memory` persists nothing"
    Restart the process and every case is gone. It is for development and
    testing, never for a shared environment.

---

## Environment variables

### For the SDK

| Variable | For what |
|---|---|
| `CASEHUB_BASE_URL` | The API address. |
| `CASEHUB_CLIENT_ID` / `CASEHUB_CLIENT_SECRET` / `CASEHUB_TOKEN_URL` | OIDC credentials. **All three together, or none.** |

### For the API

| Variable | Default | For what |
|---|---|---|
| `CASEHUB_STORAGE` | `memory` | `memory` or `postgres`. |
| `CASEHUB_AUTH_MODE` | `oidc` | The only accepted value; anything else refuses to start. See [Authentication](api/autenticacao.md). |
| `CASEHUB_OIDC_ISSUER` | — | Required: without it the service does not start. |
| `CASEHUB_OIDC_JWKS_URL` | — | Required: without it the service does not start. |
| `CASEHUB_OIDC_AUDIENCE` | empty | Empty = `aud` is not validated. See the warning in [Authentication](api/autenticacao.md). |
| `CASEHUB_DB` | — | Full Postgres URL. Takes precedence over `CASEHUB_DB_*`. |
| `CASEHUB_MAX_BATCH_ITEMS` | `1000` | Ceiling of items per batch. |
| `CASEHUB_MAX_SOURCE_RECORD_BYTES` | `262144` | Ceiling per `source_record`. |
| `CASEHUB_MAX_SOURCE_FILTERS` | `20` | Ceiling of `source_record` filters per query — and per webhook subscription. |
| `CASEHUB_RETENTION_ENABLED` | `true` | Turns the purge job on. |
| `CASEHUB_WEBHOOK_ENABLED` | `true` | Turns the webhook dispatcher on. The other `CASEHUB_WEBHOOK_*` are in [Webhooks](api/webhooks.md#operations). |
| `CASEHUB_NGINX_MAX_BODY` | `300m` | Maximum body the reverse proxy accepts. |
| `CASEHUB_HOST` | `127.0.0.1` | Interface Uvicorn listens on. |
| `CASEHUB_PORT` | `8080` | Service port. |
| `CASEHUB_OIDC_LEEWAY_SECONDS` | `10` | Clock tolerance when validating the token. |
| `CASEHUB_OIDC_JWKS_CACHE_TTL_SECONDS` | `300` | How long the JWKS is cached. |

!!! tip "The last two explain 401s that look causeless"
    `LEEWAY_SECONDS` is the clock slack accepted between the issuer and the
    service: an intermittent 401 on a machine with a drifting clock is
    usually skew larger than that value, not an invalid token.

    `JWKS_CACHE_TTL_SECONDS` is the maximum delay between rotating the key
    in Keycloak and it taking effect here — during that window, tokens
    signed with the new key are rejected.

!!! danger "Incomplete configuration kills the process, on purpose"
    Without `issuer`/`jwks_url` the service **refuses to start**. That is
    deliberate: failing at deploy is far cheaper than finding out through
    an unexplainable 401 in production — or, worse, starting up accepting
    every request.

### One-off API commands

Besides the server, the package installs two commands that run a single
pass of the jobs already scheduled inside the process. They complement
the scheduler, they do not replace it — useful right after a deploy, or
after re-enabling a subscription, without waiting for the cycle.

| Command | What it does |
|---|---|
| `casehub-retention` | One purge pass. See [Retention](api/retencao.md). |
| `casehub-webhook` | One discovery and delivery pass. See [Webhooks](api/webhooks.md). |

### For the database

These only apply with `CASEHUB_STORAGE=postgres`. `CASEHUB_DB` (the full
URL, in the table above) **takes precedence over all of them** — when it is
set, the rest are ignored.

| Variable | Default | For what |
|---|---|---|
| `CASEHUB_DB_HOST` | empty | Postgres host. |
| `CASEHUB_DB_PORT` | `5432` | Port. |
| `CASEHUB_DB_NAME` | empty | Database name. |
| `CASEHUB_DB_USER` | empty | User. |
| `CASEHUB_DB_PASSWORD` | empty | Password. |
| `CASEHUB_DB_DRIVER` | `postgresql+psycopg` | SQLAlchemy driver. |
| `CASEHUB_DB_POOL_SIZE` | `5` | Connections kept open in the pool. |
| `CASEHUB_DB_MAX_OVERFLOW` | `10` | Extra connections beyond the pool under peak. |
| `CASEHUB_DB_POOL_TIMEOUT` | `30` | Seconds waiting for a free connection. |
| `CASEHUB_DB_POOL_RECYCLE` | `1800` | Seconds until an idle connection is recycled. |
| `CASEHUB_DB_CONNECT_TIMEOUT` | `10` | Seconds to establish the connection. |
| `CASEHUB_DB_ECHO` | `false` | Logs the SQL emitted. |

!!! danger "`CASEHUB_DB_ECHO` leaks `source_record` to stdout"
    SQLAlchemy's echo prints the query **with its parameters**, and that
    includes the content of `source_record`. It is for local debugging and
    **must not be turned on in a shared environment** — see
    [Observability](operacao/observabilidade.md).
