# Asynchronous client

`AsyncCaseHubClient` has the **same public API** as the synchronous client —
same methods, same parameters, same exceptions. What differs is the
transport (`httpx.AsyncClient`) and the fact that the methods are
coroutines.

```python
from casehub import AsyncCaseHubClient

async with AsyncCaseHubClient(
    base_url='https://casehub.interno',
    client_id='minha-automacao',
    client_secret='...',
    token_url='https://casehub.internal/v1/auth/token',
) as client:
    await client.upsert_cases_batch(
        environment='prod',
        automation='minha-automacao',
        cases=[...],
    )
```

## When to use it

!!! danger "Inside asynchronous code, the synchronous client blocks the event loop"
    Calling `CaseHubClient` from inside a coroutine blocks the whole loop
    for the duration of the HTTP request. In a worker serving several flows
    in the same process, that delays **everything** — including heartbeats
    of other tasks, which may miss their window and be cancelled.

    That is exactly why `AsyncCaseHubClient` exists.

Rule of thumb:

| Context | Client |
|---|---|
| Script, synchronous job, CLI | `CaseHubClient` |
| An `async def` Activity, FastAPI, any coroutine | `AsyncCaseHubClient` |

## Usage differences

| | Synchronous | Asynchronous |
|---|---|---|
| Context manager | `with` | `async with` |
| Closing | `close()` | `await aclose()` |
| Calling | `client.get_case(...)` | `await client.get_case(...)` |

Nothing else changes: method names, parameters and exceptions are
identical.

## Sharing between concurrent tasks

`httpx.AsyncClient` is *task-safe*, so a single instance can be shared by
several tasks running in parallel with `asyncio.gather`. That is the
recommended pattern: build the client once per worker life cycle and reuse
it.

```python
async def executar(origens: list[str]) -> None:
    async with AsyncCaseHubClient(...) as client:
        # o mesmo client, em N tarefas concorrentes
        await asyncio.gather(*[
            processar(client, origem) for origem in origens
        ])
```

!!! tip "Building one per call wastes what the client offers"
    A new client on every publication throws away the connection pool and
    the OIDC token cache — going back to fetching a fresh token from
    Keycloak on every batch.
