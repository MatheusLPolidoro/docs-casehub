# CLI

The package installs the `casehub` executable, for ad-hoc inspection and
operation in the terminal — not for production automation (that is the
[SDK](cliente.md)).

## Configuring the connection

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub configure">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub configure</span>
<span data-ty="input" data-ty-prompt="Base URL:">https://casehub.interno</span>
<span data-ty>✔ Configuração salva em ~/.casehub.toml</span>
</div>
</div>

!!! danger "The configuration file stores secrets in plain text"
    `~/.casehub.toml` is written with no permission restriction and may hold
    a `client_secret`. On a shared machine, prefer
    environment variables and tighten the file permission by hand.

    Passing `--client-secret` straight on the command line also leaves the
    secret in the shell history.

## Commands

| Command | What it does |
|---|---|
| `configure` | Writes base URL and credentials to `~/.casehub.toml`. |
| `health` | Queries `/health`. |
| `readiness` | Queries `/ready`. |
| `list-cases` | Lists cases, with filters. |
| `get-case` | Fetches one case by its key. |
| `upsert-case` | Creates/updates one case. |
| `upsert-cases-batch` | Publishes a batch from JSON. |

All of them accept overriding the connection by flag (`--base-url`,
`--api-key`, `--client-id`, …) without depending on the file.

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

### Publishing a batch from a file

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub upsert-cases-batch --cases-file casos.json --environment prod --automation minha-automacao">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub upsert-cases-batch --cases-file casos.json \</span>
<span data-ty="input">  --environment prod --automation minha-automacao</span>
<span data-ty>{'upserted': 2, 'errors': []}</span>
</div>
</div>

The file is a JSON list of items, in the same format as the `cases` field of
the [batch endpoint](../api/endpoints.md#post-batch-upsert).

!!! warning "The CLI does not validate the file's content"
    It sends the JSON as it is. A malformed item is only rejected by the
    API, and shows up in `errors[]` — not as a CLI error.
