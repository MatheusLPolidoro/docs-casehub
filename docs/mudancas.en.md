# What changed

A record of the behaviour changes that affect whoever integrates. It does
not replace each repository's `CHANGELOG.md` — only the ones that change the
**contract** or demand action from consumers live here.

## Contract v1 — treatments are gone

Two breaks from the same cycle, one on each side. Anyone integrating from an
earlier version has to act on both.

=== "Treatments removed from the contract"

    **What changed.** The treatment endpoints left v1, along with `sub_id`,
    `processing_round`, the `Idempotency-Key` header and the `is_latest`
    field. In the SDK, `create_treatment` and `patch_treatment` are gone,
    and with them the `MissingIdempotencyKeyError` exception.

    **Why.** The `case_treatment` table duplicated execution and attempt
    control that Temporal already solves natively — `run_id`, `RetryPolicy`,
    deduplication by `WorkflowID`. There was no real consumer in production.

    **What to do.** Correlate through Temporal: the case gained
    `temporal_workflow_id` and `temporal_run_id`, both optional and with no
    foreign key — they are for investigation, not for referential integrity.
    See [Endpoints](api/endpoints.md).

=== "`worker_id` became `case_id`"

    **What changed.** The field was renamed across the client and the CLI —
    `get_case`, `upsert_case`, `upsert_cases_batch` and `list-cases`.

    **Why.** To align the SDK with the name the server contract uses. The
    identifier was always the case's natural key, not a worker's.

    **What to do.** Rename it in your calls and pin a version from 0.2.0
    onwards — today, `casehub==0.3.0`. This is the change that makes an
    older SDK incompatible with the current API — and the symptom is a 400
    about an unknown field, because the contract is strict
    (`extra='forbid'`), not a field silently ignored. See
    [Installation](instalacao.md).

**Something new in the same release, with no action needed.** SDK 0.2.0
brought `AsyncCaseHubClient`, with the same public API and the same
authentication behaviour as the synchronous client. Whoever uses the
synchronous one does not have to change anything. See
[Asynchronous client](sdk/assincrono.md).

## Token from the API itself — API 0.2.0 and SDK 0.4.0

Consumers no longer need to know the identity provider's address: the
token is requested from the CaseHub API itself.

=== "Request the token at `/v1/auth/token`"

    **What changed.** The API exposes `POST /v1/auth/token` and
    `POST /v1/auth/refresh`. Both accept the OAuth2 form
    (`application/x-www-form-urlencoded`) as well as JSON, and neither
    requires a credential — they are how you obtain one.

    **Why.** The realm address becomes the service's configuration,
    rather than something every automation carries in every
    environment.

    **What to do.** Point the SDK's `token_url` at
    `<base_url>/v1/auth/token`. Nothing else changes: the API forwards
    to the identity provider, which is still what signs the token.

    ```python
    client = CaseHubClient(
        base_url='https://casehub.internal',
        client_id='my-automation',
        client_secret='...',
        token_url='https://casehub.internal/v1/auth/token',
    )
    ```

    Requesting straight from the provider still works — it is the way
    to debug with the API down.

    See [Authentication](api/autenticacao.md).

=== "SDK 0.4.0: `api_key` is gone"

    **What changed.** The `api_key` parameter was removed from
    `CaseHubClient`/`AsyncCaseHubClient`, along with the CLI's
    `--api-key` flag. Passing it raises `TypeError` at construction.

    The CLI **stopped asking for a credential interactively**: seven
    commands used to prompt for a key before anything else.
    `casehub health` now answers straight away.

    **Why.** The API accepts `Authorization: Bearer <JWT>` and nothing
    else, so the parameter only led to `401` — and, being
    configurable, suggested an alternative that does not exist.

    **What to do.** Configure `client_id`, `client_secret` and
    `token_url` (all three together; partial configuration fails at
    construction). A client that only had `api_key` needs a
    `client_credentials` client provisioned in the identity provider.

## Security audit — August 2026

A review of the ecosystem's three repositories produced 11 fixes, all
already on `main` in `fast-casehub`.

### :material-alert: Require attention from integrators

=== "Authentication is OIDC only"

    **What changed.** `Authorization: Bearer <JWT>` is the only accepted
    credential, and `CASEHUB_AUTH_MODE` takes a single value, `oidc`.
    Any other value refuses to start the service.

    **Why.** Authentication and per-automation authorization now apply
    to every access, with no exception — there is no second path with
    different guarantees.

    **What to do.** Nothing, if you already use OIDC. Otherwise,
    provision one `client_credentials` client per automation, with
    `client_id` equal to its name, and request the token at
    `POST /v1/auth/token`.

    See [Authentication](api/autenticacao.md).

=== "Batches gained a ceiling"

    **What changed.** `POST /v1/cases/batch` rejects an empty batch or one
    above `CASEHUB_MAX_BATCH_ITEMS` (default 1000), with a 400.

    **Why.** With no ceiling, a single request could carry tens of gigabytes
    and take the service down on memory.

    **What to do.** Publish in blocks. The default has 10x headroom over the
    size consumers use today — the 400 message reports the environment's
    effective limit, which is configurable.

    See [Endpoints](api/endpoints.md#post-batch-upsert).

### :material-wrench: Fixes with no action needed

**An unexpected error now respects the contract.** An internal failure
answered in the framework's default format (`{"detail": ...}`), breaking the
error handling of anyone reading `error.code` — precisely when the service
was already in trouble. It now answers 500 in the single envelope. See
[Errors](api/erros.md#internal-error).

**Retention stopped crossing environments.** The purge is now always scoped
by `environment`, and accepts a per-environment term
(`RETENTION_DAYS_<AUTOMATION>_<ENVIRONMENT>`). Before, a short term set up to
clean `dev` also wiped the `prod` history of the same automation, silently.
See [Retention](api/retencao.md).

**Limits now come from the environment.** The size ceilings were read once at
service import time — configured in the `.env`, they were silently ignored
and the process started with the default. Anyone running through Docker was
never affected, because compose injects the variables before the process is
born.

**A warning when `aud` is not validated.** With `CASEHUB_OIDC_AUDIENCE`
empty, the service now warns at startup that it accepts any token from the
same issuer. There is also `CASEHUB_OIDC_REQUIRE_AUDIENCE` to lock the
configuration down once Keycloak is provisioned.

**Reproducible build and secret scanning.** The image is now built from a
versioned lockfile, and the pipeline scans the full history with gitleaks.

### :material-progress-clock: What depends on provisioning

!!! warning "Validating `aud` is not a code change"
    The service validates the `aud` claim as soon as
    `CASEHUB_OIDC_AUDIENCE` is filled in — nothing is missing in the code.
    What it requires first is provisioning a dedicated audience on the
    Keycloak clients of each environment, which is realm administration
    work.

    With the variable empty, the service accepts any valid token from the
    same issuer as authentication, and **says so in the startup log**. That
    warning is the check: if it is there, the configuration is not complete
    in that environment yet.

    The plan is in
    [Authentication](api/autenticacao.md#validating-aud) — and the order
    matters: inverting it knocks consumers out with 401s.
