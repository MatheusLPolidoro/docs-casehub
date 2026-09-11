# CLI

The package installs the `casehub` executable, for ad-hoc inspection and
operation in the terminal — not for production automation (that is the
[SDK](cliente.md)).

## Configuring the connection

The connection is resolved by **precedence**, and the first one that
exists wins:

1. Command-line flag (`--base-url`, `--client-id`, ...)
2. `~/.casehub.toml`, written by `casehub configure`
3. Environment variables

| Variable | What for |
|---|---|
| `CASEHUB_BASE_URL` | API address, **without** `/v1`. |
| `CASEHUB_CLIENT_ID` | OIDC client — the automation's name. |
| `CASEHUB_CLIENT_SECRET` | The client secret. |
| `CASEHUB_TOKEN_URL` | `<base_url>/v1/auth/token`. |

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub configure">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub configure</span>
<span data-ty="input" data-ty-prompt="Base URL:">https://casehub.internal</span>
<span data-ty>✔ Configuration saved to ~/.casehub.toml</span>
</div>
</div>

!!! warning "Secrets do not go in a flag"
    `--client-secret` on the command line stays in the shell history and
    shows up in `ps` / Task Manager for any process on the machine.
    Prefer the environment variable, or the `casehub configure` prompt,
    which does not echo what you type.

!!! info "`configure` is the **only** command that persists a credential"
    The others store only `base_url`, `client_id` and `token_url` on the
    first run, and warn that the secret was not saved. Persisting a
    credential became a choice, rather than something that happens by
    accident on the first `casehub health`.

    The file is created **already** with permission `600` — restricted
    before a single byte is written, not adjusted afterwards. On Windows
    the mode is ignored and the file inherits the user profile's ACL,
    which is already not readable by other accounts.

!!! warning "Clear-text traffic warning"
    The client raises a `UserWarning` when `base_url` or `token_url` use
    `http://` for a host that is not local: in that case the credentials
    and the Bearer token travel in plain text over the network.

## Commands

| Command | What it does |
|---|---|
| `configure` | Writes base URL and credentials to `~/.casehub.toml`. |
| `health` | Calls `/health`. |
| `readiness` | Calls `/ready`. |
| `list-cases` | Lists cases, with filters. |
| `get-case` | Fetches one case by its key. |
| `upsert-case` | Creates/updates a case. |
| `patch-case-status` | Changes only a case's status. |
| `upsert-cases-batch` | Publishes a batch from JSON. |

All of them accept overriding the connection by flag (`--base-url`,
`--client-id`, `--token-url`, ...) without relying on the file.

!!! note "The CLI covers neither webhooks nor the incremental cursor"
    `/v1/webhooks*`, `created_since`/`updated_since` and the
    `exists`/`not_exists`/`ne` operators have no command and no flag.
    They are direct HTTP calls — see [Webhooks](../api/webhooks.md) and
    [Endpoints](../api/endpoints.md#get-list-and-count).

## Examples

### Checking that the service answers

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub readiness">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub readiness</span>
<span data-ty>{'status': 'ok'}</span>
</div>
</div>

`readiness` touches the database; `health` does not. To know whether the
service is actually usable, use `readiness`.

### Listing cases

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub list-cases --environment prod --status aberto">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub list-cases --environment prod --status aberto</span>
<span data-ty>total: 42  page: 1/1</span>
</div>
</div>

`--filter key=value` filters by `source_record` content, and is
repeatable: `--filter uf=SP --filter origem.id=42`.

### Changing only the status

```bash
casehub patch-case-status --environment prod --automation minha-automacao \
  --case-id a1b2c3 --status cancelado --expected-status aberto
```

`patch-case-status` changes **only** the status and, unlike
`upsert-case`, does **not** create the case: a `case_id` that does not
exist answers 404. With `--expected-status`, the change only happens if
the current state matches; otherwise it answers 409 and nothing is
written.

### Publishing a batch from a file

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub upsert-cases-batch --cases-file casos.json --environment prod --automation minha-automacao">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub upsert-cases-batch --cases-file casos.json \</span>
<span data-ty="input">  --environment prod --automation minha-automacao \</span>
<span data-ty="input">  --on-conflict skip</span>
<span data-ty>{'upserted': 0, 'created': [], 'skipped': 2, 'errors': []}</span>
</div>
</div>

The file is a JSON list of items, in the same format as the `cases` field
of the [batch endpoint](../api/endpoints.md#post-batch-upsert).
`--cases-json` takes the same content inline.

`--on-conflict skip` writes nothing to a case that already exists — it is
what lets you republish the same source without overwriting what has
already been handled. Omitted, nothing is sent and the server decides the
default (`update`).

!!! warning "The CLI does not validate the file's content"
    It sends the JSON as it is. A malformed item is rejected only by the
    API, and shows up in `errors[]` — not as a CLI error.
