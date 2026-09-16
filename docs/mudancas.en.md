# What changed

A record of the behaviour changes that affect whoever integrates. It does
not replace each repository's `CHANGELOG.md` — only the ones that change
the **contract** or require action from a consumer live here.

Current versions: **API 0.5.0** and **SDK 0.7.2**.

---

## HTTPS on the `prod` profile and `total_pages` — API 0.5.0

The switch to HTTPS **requires action** from whoever consumes an
installation on the `prod` profile. `total_pages` is additive.

=== "HTTPS only on `prod`"

    **What changed.** The nginx of the `prod` profile now serves the API
    over HTTPS only, on port 443. Port 80 answers `308` to the `https://`
    address and no longer serves the API. The `uat` profile stays on HTTP.

    **Why.** The Bearer token travelled in clear text between the consumer
    and the proxy.

    **What to do.** Switch `CASEHUB_BASE_URL` and `CASEHUB_TOKEN_URL` to
    `https://`. **The SDK does not follow redirects**: a client still on
    `http://` gets the `308` as an HTTP error instead of being taken to
    HTTPS — and the token of that attempt has already gone out in clear
    text.

=== "`total_pages` on listings"

    **What changed.** `GET /v1/cases`, `GET /v1/webhooks` and
    `GET /v1/webhooks/{id}/deliveries` return `total_pages` next to
    `total`, `page` and `page_size`. An empty list returns `0`.

    **Why.** Knowing how many pages a listing had meant computing
    `ceil(total / page_size)` on the client.

    **What to do.** Nothing is required: the field is additive. In the SDK,
    `list_cases` returns the body as it came, so the field already shows
    up without upgrading `casehub`.

---

## Webhooks — API 0.4.0

A consumer can now register a URL of its own and **receive** the cases it
cares about, instead of only polling `GET /v1/cases` in a loop.

=== "What changed"

    Seven new routes under `/v1/webhooks`: create, list, read, update,
    delete, the delivery log and the resend of a failed delivery.

    Each subscription's rules are **the same filters the listing already
    accepts** — no new query vocabulary. The subscription belongs to the
    automation of the OIDC client that created it, like everything else
    in the service.

    Every delivery is signed with HMAC-SHA256 in the
    `X-Casehub-Signature` header, over `<t>.<body>`. The secret is
    returned **exactly once**, at creation.

=== "What to do"

    Nothing is mandatory: whoever consumes through `GET /v1/cases` keeps
    consuming the same way. The incremental cursor remains the long-term
    recovery path — the delivery log has a 30-day deadline.

    If you are going to register one, read first the rule that decides
    whether the subscription will work at all: **a content rule requires
    `cursor_field: updated`**. With `created`, the case is evaluated only
    at the instant it is born, and whatever the automation writes later
    is never reconsidered — the subscription goes silent, with no error.

    See [Webhooks](api/webhooks.md).

!!! info "The SDK does not cover these routes"
    `casehub` covers the case routes. The webhook ones are called over
    plain HTTP, with the same `Bearer`. Registering is a configuration
    operation, done once — not a flow one.

### Finer delivery rules, and re-evaluation — API 0.4.0 and 0.4.1

`source_conditions` (`exists`, `not_exists`, `eq`, `ne` over
`source_record`) and `events` (`case.created`, `case.updated`) together
answer *"only send it to me once the automation has finished assembling
the case"*.

The rule is **re-evaluated at delivery time**, and since 0.4.1 that
covers **every** rule of the subscription — `status`, `batch_ref`,
`source_schema`, `source_filters` and the event type. Tightening a rule
with a `PATCH` makes whatever was already queued and stopped matching end
up `abandoned`, with the reason in the log, without going out to the
partner URL.

!!! warning "Boolean conditions were inverted before 0.4.1"
    `{"op": "eq", "value": true}` was stored as `"True"` while the
    database compares `"true"`: the condition never matched, and the
    equivalent `ne` always did — with no error anywhere. If you
    registered a condition with a boolean value before 0.4.1,
    **register it again**.

---

## Incremental cursor and three new filters — API 0.4.0

=== "`created_since` / `updated_since`"

    **What changed.** `GET /v1/cases` now accepts both cursor parameters.
    Until now there was no way to ask "what changed since I last looked":
    `started_from` filters the record's date **at the source**, which may
    be years old on a case created today.

    When either is used, the listing orders by the cursor field; without
    them, it keeps ordering by `started_at`.

    **What to do.** If you were paging the whole list to find news,
    switch to the cursor — and **re-read a window of a few seconds
    backwards**. A row stamped earlier may be written later, and would
    appear behind a cursor you already passed. The filters are `>=`, so
    repeating the instant returns the boundary row again: key by
    `case_id` and the repetition costs nothing. The loss cannot be
    undone.

=== "`exists`, `not_exists` and `ne`"

    **What changed.** Three new operators over `source_record`, adding to
    the `filter` that already existed. All repeatable, combined with
    `AND`.

    **What to do.** Nothing — they are additive. But know that
    **`not_exists` is not `ne`**: comparing a value requires a value to
    exist, so a missing path matches neither `ne` nor `filter`. And
    `exists` asks about the **key**, not the value: it matches even when
    the value is `null`, an object or a list.

    All four operators count towards the **same** ceiling
    (`CASEHUB_MAX_SOURCE_FILTERS`), now added up — splitting the query
    between them no longer doubles the limit.

    See [Endpoints](api/endpoints.md#get-list-and-count).

!!! note "The SDK does not declare these parameters"
    `ListCasesParams` includes neither the cursor nor the three
    operators. They go through anyway, but a type checker complains, and
    the CLI does not expose them. See
    [Synchronous client](sdk/cliente.md).

---

## Changing only the status — API 0.4.0 and SDK 0.6.0

=== "Case `PATCH` and the `cancelado` status"

    **What changed.** A new route
    `PATCH /v1/cases/{environment}/{automation}/{case_id}`, which changes
    **only the status**. And a new status, `cancelado` — for a case that
    ceased to exist at the source before being handled, distinct from
    `concluido` (handled and finished) and `falhou` (tried and failed).

    **Why.** `PUT` and the batch require `status` **and** `started_at`,
    so fixing only the state forced a read of the case first, to rewrite
    the rest unchanged — two calls, and a window between them.

    **What to do.** Adding a value to the enum is additive: nothing that
    was accepted before stopped being accepted. If your code validates
    `status` against a list of its own, add `cancelado` to it.

=== "SDK: `patch_case_status`"

    **What changed.** The method exists on both clients, synchronous and
    asynchronous. `expected_status` is optional: filled in, the change
    only happens if the current state matches, and the API answers 409
    without writing anything when it does not.

    **What to do.** Pin `casehub>=0.6.0` and the API from 0.4.0 on.

    ```python
    client.patch_case_status(
        environment='prod',
        automation='minha-automacao',
        case_id='a1b2c3',
        status='cancelado',
        expected_status='aberto',
    )
    ```

    !!! danger "It does **not** create the case — and that is a 404"
        Unlike `upsert_case`. A `case_id` that was never imported, or
        published under a different `environment`/`automation`, raises
        `APIHTTPError` with `status_code=404`, in both modes. Anyone
        handling only the 409 gets that exception unexpectedly.

=== "SDK 0.6.1: `status_code` became an attribute"

    **What changed.** `APIHTTPError` now exposes `status_code` and
    `message` as attributes.

    **Why.** The number only existed inside the formatted message, so
    telling an expected error from an unexpected one meant searching for
    a substring in the exception text — text that changes whenever
    somebody rewrites the sentence. The concrete case is the 409 from
    `expected_status`, which is not a failure: it is another process
    having written first, with newer information.

    **What to do.** Replace the substring search with
    `except APIHTTPError as e: if e.status_code == 409:`.

---

## The batch can skip what already exists — API 0.3.0 and SDK 0.5.0

Nothing to do to keep things as they are: the default did not change and
the new response keys are additive. It is opt-in.

=== "`on_conflict` in the batch"

    **What changed.** `POST /v1/cases/batch` accepts `on_conflict`, with
    `update` (default, identical to before) or `skip`. In the SDK,
    `upsert_cases_batch` gained the parameter of the same name on both
    clients; omitted, nothing is sent and the server decides. Since
    **0.7.0** the CLI exposes it too, as `--on-conflict`.

    **Why.** The upsert replaces the fields sent, **without merging**.
    Whoever republishes the same source every cycle rewrites the whole
    case every time and erases what another process added afterwards —
    with no error and no log.

    **What to do.** If your source is re-read periodically, pass
    `on_conflict='skip'` and pin `casehub>=0.5.0`. Expect `upserted` to
    fall to `0` in steady state — that is success, and the `skipped`
    beside it is what says why.

    !!! tip "It is also what keeps a webhook quiet when nothing changed"
        In `update` mode a re-capture stamps `updated_at` on everything,
        and a subscription with `cursor_field: updated` would receive the
        whole base every cycle.

=== "`created` and `skipped` in the response"

    **What changed.** The batch response carries `created` (the
    `case_id`s created in that call) and `skipped` (how many already
    existed and were left alone), besides the usual `upserted`.

    **Why.** The information already existed on the server side and was
    discarded. Without it, a publisher cannot act only on what is new —
    triggering an enrichment, say — without an extra query.

    **What to do.** Nothing is mandatory. `upserted` keeps meaning "rows
    written", so what was skipped is not counted in it. The SDK passes
    the body through as it came.

---

## Token from the API itself — API 0.2.0 and SDK 0.4.0

Whoever integrates no longer needs to know the identity provider's
address: the token is requested from the CaseHub API itself.

=== "Ask for the token at `/v1/auth/token`"

    **What changed.** The API exposes `POST /v1/auth/token` and
    `POST /v1/auth/refresh`. Both accept the OAuth2 format
    (`application/x-www-form-urlencoded`) and JSON, and neither requires
    a credential — they are the way to obtain one.

    **Why.** The realm address becomes configuration of the service, not
    something each automation carries in each environment.

    **What to do.** Point the SDK's `token_url` at
    `<base_url>/v1/auth/token`. Nothing else changes: the API relays to
    the identity provider, which is still the one signing the token.

    ```python
    client = CaseHubClient(
        base_url='https://casehub.internal',
        client_id='minha-automacao',
        client_secret='...',
        token_url='https://casehub.internal/v1/auth/token',
    )
    ```

    Asking the provider directly still works — it is the way to debug
    with the API down.

    See [Authentication](api/autenticacao.md).

=== "`api_key` is gone — and is not coming back"

    **What changed.** `Authorization: Bearer <JWT>` is the only way to
    authenticate. On the server, the `apikey` and `dual` modes were
    removed: a service configured with them **does not start**. In the
    SDK, the `api_key` parameter left
    `CaseHubClient`/`AsyncCaseHubClient`, along with the CLI's
    `--api-key` flag.

    The CLI **stopped asking for a credential interactively**: before,
    seven commands asked for a key before anything else. `casehub health`
    answers straight away.

    **Why.** The `X-API-Key` header authenticated with any non-empty
    string and escaped per-automation authorization. What remained in the
    SDK was a path that only produced `401` — configurable, and therefore
    able to mislead.

    **What to do.** Provision a `client_credentials` client per
    automation, with `client_id` equal to its name, and configure
    `client_id`, `client_secret` and `token_url` (the three together;
    partial configuration fails at construction).

---

## SDK versions to avoid

!!! danger "Do not install 0.7.0"
    It shipped with `casehub.__version__` stuck at `'0.6.1'` while the
    distribution already said `0.7.0`: any consumer reading
    `__version__` gets the wrong version. Use **0.7.1** or later.

!!! warning "Exceptions survive `pickle` again — SDK 0.7.0"
    `APIHTTPError`, `APIConnectionError` and `APITimeoutError` raised
    `TypeError` when reconstructed, which **masked the real HTTP error**
    exactly where it crosses a process boundary: `ProcessPoolExecutor`,
    multiprocessing, or any retry layer that serialises the captured
    exception.

    That started to matter more from 0.6.1 on, which asks the caller to
    keep and inspect the exception to read `status_code`.

---

## Contract robustness — API 0.4.0

No action required, but they change what you see when something goes
wrong.

**A null character in `source_record` becomes a per-item error, not a
500.** A `U+0000` in any key or value is rejected with
`invalid_source_record` — in a batch, without taking the other items
down. Before, the driver's exception reached the generic handler and
became `500 internal_error` without saying which item of the batch
failed. It is common in data coming from mainframe fixed-width files.

**The response `status` now declares the enum in the published schema**,
instead of a free string. The input already declared the possible states
and the output did not — whoever read only the response contract in
Swagger had no way to know which values to expect.

**`created_at` and `updated_at` are stamped by the database**, not by the
process clock. No consequence with a single process, and a prerequisite
for any reliable incremental consumption once there is more than one.

**The `/docs` page opens again.** The `/v1/auth/*` routes declared their
body by reference to a schema that was never registered, and Swagger UI
replaced the whole page with "Could not resolve reference" — no route was
shown at all.
