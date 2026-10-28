# Synchronous client

`CaseHubClient` is the standard way to consume the API from synchronous
Python code.

```python
from casehub import CaseHubClient

with CaseHubClient(
    base_url='https://casehub.interno',
    client_id='minha-automacao',
    client_secret='...',
    token_url='https://casehub.internal/v1/auth/token',
) as client:
    client.upsert_case(
        environment='prod',
        automation='minha-automacao',
        case_id='a1b2c3',
        status='aberto',
        started_at='2026-08-20T09:00:00-03:00',
        source_record={'referencia': 'REF-12345', 'origem': 'lote-a'},
    )
```

!!! tip "Use `with` (or call `close()`)"
    The client keeps a persistent HTTP session — that is what avoids
    reopening a connection on every call and lets the cached OIDC token be
    reused. Without closing it, the connection leaks.

## Construction

```python
CaseHubClient(
    base_url,
    *,
    client_id=None,
    client_secret=None,
    token_url=None,
    timeout=30,
)
```

| Parameter | Note |
|---|---|
| `base_url` | The API address. |
| `client_id` / `client_secret` / `token_url` | OIDC. **All three together, or none** — a partial configuration raises `ValueError` at construction. |
| `timeout` | Seconds, default 30. |

With both mechanisms configured, **OIDC takes precedence** on every call.
The `token_url` points at the API itself (`/v1/auth/token`), which
forwards to the identity provider.

## Methods

| Method | Corresponds to |
|---|---|
| `health()` | `GET /health` |
| `readiness()` | `GET /ready` |
| `upsert_case(...)` | `PUT /v1/cases/{env}/{automation}/{case_id}` |
| `patch_case_status(...)` | `PATCH /v1/cases/{env}/{automation}/{case_id}` |
| `upsert_cases_batch(...)` | `POST /v1/cases/batch` |
| `get_case(...)` | `GET /v1/cases/{env}/{automation}/{case_id}` |
| `list_cases(...)` | `GET /v1/cases` |
| `upsert_attachment(...)` | `PUT /v1/cases/{env}/{automation}/{case_id}/attachments/{name}` |
| `list_attachments(...)` | `GET /v1/cases/{env}/{automation}/{case_id}/attachments` |
| `download_attachment(...)` | `GET /v1/cases/{env}/{automation}/{case_id}/attachments/{name}` |
| `delete_attachment(...)` | `DELETE /v1/cases/{env}/{automation}/{case_id}/attachments/{name}` |
| `close()` | Closes the HTTP session. |

They return the response JSON as a `dict`, with two exceptions:
`download_attachment` returns the attachment's `bytes`, and
`delete_attachment` returns `None`.

!!! info "The webhook routes have no SDK method"
    `/v1/webhooks*` is called over plain HTTP, with the same `Bearer`. See
    [Webhooks](../api/webhooks.md#the-sdk-does-not-cover-webhooks).

### Publishing in a batch

```python
resultado = client.upsert_cases_batch(
    environment='prod',
    automation='minha-automacao',
    cases=[
        {
            'case_id': 'a1',
            'status': 'aberto',
            'started_at': '2026-08-20T09:00:00-03:00',
            'source_record': {'referencia': 'REF-111'},
        },
        {
            'case_id': 'a2',
            'status': 'aberto',
            'started_at': '2026-08-20T09:01:00-03:00',
            'source_record': {'referencia': 'REF-222'},
        },
    ],
)

if resultado['errors']:
    logger.error('itens recusados: %s', resultado['errors'])
```

!!! danger "Always inspect `errors[]`"
    The batch answers 200 even with rejected items — the SDK does **not**
    raise in that case, because from the HTTP point of view the request
    worked. Ignoring `errors[]` means losing cases in silence.

#### Not overwriting what already exists

`on_conflict='skip'` leaves a case whose `case_id` already exists
untouched — the API writes **nothing** to it. That is what a
periodically re-read source needs: without it, every re-read rewrites
the whole case and undoes whatever another process added to it
afterwards, with no error and no log.

```python
resultado = client.upsert_cases_batch(
    environment='prod',
    automation='minha-automacao',
    cases=casos,
    on_conflict='skip',
)

# `created` carries the case_ids created IN THIS CALL — it is what
# lets you act only on what is new without a prior query.
for case_id in resultado['created']:
    disparar_enriquecimento(case_id)
```

Omit it and the field is not sent, leaving the default to the server
(`update`, the long-standing behaviour). With `skip`, expect `upserted`
to fall to `0` and `skipped` to run high in steady state: that is
success, not failure. See [Endpoints](../api/endpoints.en.md).

!!! warning "Always send an explicit `case_id`"
    The API accepts items without `case_id` and generates an `auto-<hex>`,
    but that gives up idempotency: reprocessing duplicates. Compute a stable
    natural key from the source and always send it.

### Changing only the status

`patch_case_status` exists because `upsert_case` and `upsert_cases_batch`
require `status` **and** `started_at`: fixing only the state would force a
read of the case first, to rewrite the rest unchanged — two calls, and a
window between them.

```python
client.patch_case_status(
    environment='prod',
    automation='minha-automacao',
    case_id='a1b2c3',
    status='cancelado',
    expected_status='aberto',   # optional
)
```

`expected_status` closes that window without requiring the read: if the
current state does not match, the API answers 409 and **writes nothing**.
Omitted, the change is unconditional.

```python
from casehub.exceptions import APIHTTPError

try:
    client.patch_case_status(..., status='concluido', expected_status='aberto')
except APIHTTPError as e:
    if e.status_code == 409:
        ...   # another process wrote first, with newer information
    elif e.status_code == 404:
        ...   # the case does not exist under that environment/automation
    else:
        raise
```

!!! warning "Unlike `upsert_case`, it does **not** create the case"
    A `case_id` that was never imported — or published under a different
    `environment`/`automation` — answers **404**, in both modes. Anyone
    handling only the 409 gets that exception unexpectedly.

!!! tip "`status_code` is an attribute, not a substring of the message"
    Since 0.6.1, `APIHTTPError` exposes `status_code` and `message`.
    Telling an expected 409 from a real error no longer means searching
    for the number inside the exception text — text that changes whenever
    somebody rewrites the sentence.

### Querying

```python
pagina = client.list_cases(
    environment='prod',
    automation='minha-automacao',
    status='aberto',
    page=1,
    page_size=100,
    include='source_record',
    source_filters={'referencia': 'REF-12345'},
)

print(pagina['total'], len(pagina['items']))
```

`source_filters` becomes one `filter=<path>=<value>` per item in the
query string.
Without `include='source_record'`, the items come without the JSON.

!!! note "What the typed signature declares, and what it does not"
    `ListCasesParams` declares `environment`, `automation`, `status`,
    `batch_ref`, `source_schema`, `started_from`, `started_to`,
    `include`, `page`, `page_size` and, since SDK 0.8.0, `render_with`.

    The cursor parameters (`created_since`, `updated_since`), the
    content operators — `exists`, `not_exists`, `ne` and, since API
    0.7.0, `present`, `blank`, `matches`, `not_matches`, `in` and
    `not_in` — and the JSON `conditions` are **not**
    declared. They go
    through anyway — anything that is not `None` reaches the query string
    as given — but a type checker will complain, and the CLI does not
    expose them. See
    [Endpoints](../api/endpoints.md#get-list-and-count).

### Case attachments

Since SDK 0.8.1, with API 0.8.0 or later. The case has to exist.

```python
from pathlib import Path

response = client.upsert_attachment(
    environment='prod',
    automation='my-automation',
    case_id='a1b2c3',
    name='receipt.pdf',
    content=Path('receipt.pdf').read_bytes(),
    content_type='application/pdf',   # the default
)
# response['created']: the case had no attachment under that name
# response['changed']: False when the content equals what is stored

client.list_attachments('prod', 'my-automation', 'a1b2c3')
# {'items': [{'name': ..., 'content_type': ..., 'size_bytes': ...,
#             'sha256': ..., 'created_at': ..., 'updated_at': ...}]}

pdf = client.download_attachment('prod', 'my-automation', 'a1b2c3', 'receipt.pdf')

client.delete_attachment('prod', 'my-automation', 'a1b2c3', 'receipt.pdf')
```

The same name replaces the attachment. Sending the same content again
answers `changed: False` without storing anything, so retrying is safe —
which is why the retry on 401 applies here too.

The SDK checks integrity at both ends, with nothing to do on the
caller's side:

- **On upload**, it computes the content's sha256 and sends it in
  `X-Content-SHA256`. A body that reaches the API altered is rejected
  (`400 checksum_mismatch`) instead of stored.
- **On download**, it checks the bytes against the sha256 the API
  announces in the `ETag`. If a proxy along the way removes or replaces
  the `ETag`, the hash comes from the case's listing, at the cost of one
  more call. Bytes that do not match raise `AttachmentChecksumError`,
  and the content is **not** returned.

!!! warning "The limits are the API's, and arrive as `APIHTTPError`"
    A type outside the list (`415`), an attachment that is too large
    (`413`), too many attachments on the case or the automation's quota
    used up (`507`), a missing case or attachment (`404`) and the
    storage down (`503`, with `Retry-After`). The SDK does not replicate
    these limits: they are configurable in the service. See
    [Endpoints](../api/endpoints.md#case-attachments).

!!! note "The content stays in memory"
    `content` is `bytes`, and the download returns `bytes`. With the
    default limit of 25 MB per attachment that is the simple path; the
    SDK has no streaming upload or download.

## Error handling

The SDK normalizes failures into six exceptions:

```python
from casehub.exceptions import (
    APIConnectionError,
    APIHTTPError,
    APITimeoutError,
    APIUnexpectedError,
    AttachmentChecksumError,
    OidcTokenError,
)

try:
    client.upsert_case(...)
except APIHTTPError as e:
    # The API answered with an error status — e.status_code, e.message
    ...
except (APIConnectionError, APITimeoutError):
    # Network: worth retrying
    ...
except OidcTokenError:
    # Wrong credential, or the token endpoint is down
    ...
```

| Exception | When |
|---|---|
| `APIHTTPError` | An error status. Exposes `status_code` and `message` as attributes. |
| `APIConnectionError` | The API was not reached. |
| `APITimeoutError` | No answer in time. |
| `OidcTokenError` | Failure obtaining the token. |
| `AttachmentChecksumError` | The downloaded attachment does not match the API's sha256. Exposes `expected` (`None` if the API announced none) and `received`. Not an HTTP error: the response was 200. |
| `APIUnexpectedError` | Anything else. |

## Token renewal and the retry on 401

The OIDC token is cached and renewed when it expires. Beyond that, **one**
401 response triggers a fresh token and a single repeat of the call — it
covers the case of the token having been revoked or rotated in Keycloak
before its expiry.

!!! warning "A batch without `case_id` turns the retry off, on purpose"
    A spurious 401 during an `upsert_cases_batch` whose batch has items
    **without** `case_id` would republish those items — and with no
    natural key they would become new rows. So in that specific case the
    automatic resend does not happen: the 401 surfaces as `APIHTTPError`
    and the caller decides.

    Re-authenticating and resending is safe only for someone who knows
    what is in the batch. Always sending `case_id` makes the resend
    idempotent, and the question never comes up.

The retry happens once: a `401` that persists reaches the caller.
