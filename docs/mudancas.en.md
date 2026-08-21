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

## Security audit — August 2026

A review of the ecosystem's three repositories produced 11 fixes, all
already on `main` in `fast-casehub`.

### :material-alert: Require attention from integrators

=== "The default authentication became OIDC"

    **What changed.** The default for `CASEHUB_AUTH_MODE` was `apikey` and
    became `oidc`.

    **Why.** The `apikey` mode accepts any non-empty string as a credential,
    without comparing it to any secret, and per-automation authorization
    does not apply to it — any key could reach any automation in any
    environment.

    **What to do.** Nothing, if you already use OIDC. An environment that
    still depends on `X-API-Key` has to declare `CASEHUB_AUTH_MODE=apikey`
    explicitly — and move off that configuration as soon as possible.

    See [Authentication](api/autenticacao.md).

=== "Dual mode no longer falls back to X-API-Key"

    **What changed.** In `dual` mode, an invalid or expired `Bearer` sent
    **together** with an `X-API-Key` answers 401. It used to fall back to
    the key.

    **Why.** The fallback was not only about authentication: the context
    became `apikey`, per-automation authorization stopped applying, and the
    client **lost its scope along with the token**. The condition that
    triggered it — both credentials in the same request — is exactly the
    scenario `dual` mode exists for.

    **What to do.** Make sure the token is renewed before it expires. A
    client that relied on "it expired, but the key saves me" now gets a 401.
    Whoever sends **only** `X-API-Key` is unaffected.

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

### :material-progress-clock: Pending, and not code

!!! warning "Validating `aud` still depends on Keycloak"
    The service validates the `aud` claim as soon as
    `CASEHUB_OIDC_AUDIENCE` is filled in — nothing is missing in the code.
    But filling it in requires first provisioning a dedicated audience on
    the Keycloak clients of each environment.

    Until that happens, **any valid token from the same issuer is accepted
    as authentication**. Per-automation authorization still applies, so the
    exposure is narrow: it would take a client whose `client_id` coincided
    with the name of an automation.

    The plan is in
    [Authentication](api/autenticacao.md#validating-aud) — and the order
    matters: inverting it knocks consumers out with 401s.
