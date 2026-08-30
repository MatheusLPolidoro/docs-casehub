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
| `upsert_cases_batch(...)` | `POST /v1/cases/batch` |
| `get_case(...)` | `GET /v1/cases/{env}/{automation}/{case_id}` |
| `list_cases(...)` | `GET /v1/cases` |
| `close()` | Closes the HTTP session. |

All of them return the response JSON as a `dict`.

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

!!! warning "Always send an explicit `case_id`"
    The API accepts items without `case_id` and generates an `auto-<hex>`,
    but that gives up idempotency: reprocessing duplicates. Compute a stable
    natural key from the source and always send it.

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

## Error handling

The SDK normalizes failures into five exceptions:

```python
from casehub.exceptions import (
    APIConnectionError,
    APIHTTPError,
    APITimeoutError,
    APIUnexpectedError,
    OidcTokenError,
)

try:
    client.upsert_case(...)
except APIHTTPError as e:
    # A API respondeu com status de erro — e.status_code, e.body
    ...
except (APIConnectionError, APITimeoutError):
    # Rede: vale retentar
    ...
except OidcTokenError:
    # Credencial OIDC errada ou Keycloak fora do ar
    ...
```

| Exception | When |
|---|---|
| `APIHTTPError` | An error status. Carries the status and the body. |
| `APIConnectionError` | The API was not reached. |
| `APITimeoutError` | No answer in time. |
| `OidcTokenError` | Failure obtaining the token. |
| `APIUnexpectedError` | Anything else. |

## Token renewal and the retry on 401

The OIDC token is cached and renewed when it expires. Beyond that, **one**
401 response triggers a fresh token and a single repeat of the call — it
covers the case of the token having been revoked or rotated in Keycloak
before its expiry.

!!! danger "The retry can duplicate batch items without `case_id`"
    If a spurious 401 happens during an `upsert_cases_batch` whose batch has
    items **without** `case_id`, the automatic resend republishes those
    items — and with no natural key they become new rows.

    It is one more reason to always send an explicit `case_id`: with it, the
    resend is idempotent and the retry is harmless.

The retry happens once: a `401` that persists reaches the caller.
