# Architecture

## The path of a case, from source to database

```mermaid
sequenceDiagram
    autonumber
    participant W as Automation / Worker
    participant S as casehub SDK
    participant K as Keycloak
    participant A as fast-casehub
    participant P as Postgres

    W->>S: upsert_cases_batch(environment, automation, cases)
    Note over S: Only on the first call,<br/>or when the token expires
    S->>K: POST /token (client_credentials)
    K-->>S: access_token (JWT)
    S->>A: POST /v1/cases/batch<br/>Authorization: Bearer ...
    A->>K: fetches public key (JWKS, cached)
    A->>A: validates signature, iss, exp
    A->>A: enforce_automation(azp == automation)
    loop per batch item
        A->>A: validates item + source_record
        A->>P: INSERT ... ON CONFLICT DO UPDATE
    end
    A-->>S: 200 {upserted, errors[]}
    S-->>W: dict with the result
```

!!! note "A per-item error does not bring the batch down"
    An invalid item lands in `errors[]` with the reason, and the rest are
    stored normally. The status is still 200 — the caller has to **read
    `errors[]`**, not just the HTTP code.

## Authentication and authorization

They are two distinct steps, and conflating them is the source of most of
the confusion.

```mermaid
flowchart TD
    R["Request arrives"] --> B{"Bearer present?"}

    B -->|no| E401["401 unauthorized"]
    B -->|yes| V{"Token valid?<br/><small>signature, iss, exp</small>"}

    V -->|no| E401
    V -->|yes| Z{"azp claim ==<br/>call's automation?"}

    Z -->|no| E403["403 forbidden"]
    Z -->|yes| OK["Proceeds to the route"]
```

!!! danger "There is no second door"
    Until 2026-08-23 there were `apikey` and `dual` modes, where an
    `X-API-Key` header holding **any non-empty string** authenticated —
    never checked against any secret — and **skipped the automation
    check entirely**. Any key reached any automation in any
    environment. Both modes were removed, and a service configured with
    them refuses to start.

Details in [Authentication](api/autenticacao.md).

## Idempotency: what happens when you republish

```mermaid
flowchart TD
    P["Publication arrives with<br/>(environment, automation, case_id)"] --> Q{"Does that key<br/>already exist?"}
    Q -->|no| I["INSERT<br/><small>created: true</small>"]
    Q -->|yes| U["UPDATE of the fields sent<br/><small>created: false</small>"]
    U --> O{"Was the field<br/>omitted?"}
    O -->|yes| M["Keeps the current value"]
    O -->|"no, came as null/empty"| C["Overwrites"]
```

This is the rule that confuses integrations the most: **omitting a field is
not the same as sending it empty.** Omitting preserves what was already
stored; sending `source_record: {}` clears the object.

It is what lets an automation republish a case only to update `status`,
without re-sending the whole `source_record` — and what makes a re-capture
preserve the original `started_at`.

## Retention

```mermaid
flowchart LR
    T["In-process scheduler<br/><small>every N hours</small>"] --> L["Lists pairs<br/>(automation, environment)"]
    L --> R["Resolves the term<br/>in ParamManager"]
    R --> D["DELETE where<br/>started_at < cutoff"]
    R -.->|"no parameter,<br/>or ParamManager down"| DF["Default: 90 days"]
    DF --> D
```

The term is resolved in this order, and the first one that exists wins:

1. `RETENTION_DAYS_<AUTOMATION>_<ENVIRONMENT>`
2. `RETENTION_DAYS_<AUTOMATION>`
3. A default of 90 days

!!! warning "The purge is always scoped by environment"
    Even when only the generic term is configured. Without that scope, a
    short term set up to clean `dev` would wipe the history of `prod` for
    the same automation, silently, on the next cycle.

Details in [Retention](api/retencao.md).

## Service layers

```mermaid
flowchart TB
    RT["routes.py<br/><small>endpoints, per-route authorization</small>"]
    MD["models.py<br/><small>Pydantic contract, source_record validation</small>"]
    ST["storage.py<br/><small>Storage Protocol</small>"]
    IM["InMemoryStorage<br/><small>faithful mock, used in tests</small>"]
    PG["PostgresStorage<br/><small>production</small>"]
    TB["tables.py<br/><small>source of truth for the DDL</small>"]

    RT --> MD
    RT --> ST
    ST --> IM
    ST --> PG
    PG --> TB
```

`InMemoryStorage` is not a permissive stub: it implements the same
`Protocol` and is treated as an *executable contract*. The suite runs
against both backends, so a behaviour difference between the mock and
Postgres shows up as a failing test.
