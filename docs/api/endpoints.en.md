# Endpoints

Contract v1 has **four business routes** and two health ones. Every business
route lives under `/v1` and requires authentication; `/health` and `/ready`
never do.

| Method | Route | What it does |
|---|---|---|
| `PUT` | `/v1/cases/{environment}/{automation}/{case_id}` | Creates or updates a case. |
| `PATCH` | `/v1/cases/{environment}/{automation}/{case_id}` | Changes only a case's status. |
| `POST` | `/v1/cases/batch` | Creates or updates several cases. |
| `GET` | `/v1/cases/{environment}/{automation}/{case_id}` | Fetches one case. |
| `GET` | `/v1/cases` | Lists and counts cases. |
| `GET` | `/health` | Liveness — does not touch the database. |
| `GET` | `/ready` | Readiness — `SELECT 1`, answers 503 if the database is down. |

---

## `PUT` — upsert of one case

```
PUT /v1/cases/{environment}/{automation}/{case_id}
```

Idempotent: repeating the same payload leaves the same state.

**Body**

| Field | Type | Required | Note |
|---|---|:---:|---|
| `status` | enum | ✅ | `aberto`, `em_andamento`, `concluido`, `falhou`, `pausado`, `cancelado`. |
| `started_at` | datetime | ✅ | **Needs a timezone.** |
| `finished_at` | datetime | — | |
| `batch_ref` | string | — | Free reference to the source batch. |
| `source_schema` | string | — | Version of the `source_record` format. |
| `source_record` | object | — | Free JSON with the automation's data. |
| `temporal_workflow_id` | string | — | Correlation, with no foreign key. |
| `temporal_run_id` | string | — | Correlation, with no foreign key. |

**Response** `200` — `{"created": true}` the first time, `false`
afterwards.

!!! warning "An unknown field is an error, it is not ignored"
    The contract is strict (`extra='forbid'`). A misspelled field answers
    400 instead of being silently discarded — which turns a hard-to-find
    integration mistake into an immediate, explicit failure.

!!! tip "Omitting ≠ clearing"
    Omitting `source_record` keeps what was already stored. Sending
    `source_record: {}` clears it. The same holds for `source_schema` and
    for the `temporal_*` fields.

---

## `PATCH` — change only the status

```
PATCH /v1/cases/{environment}/{automation}/{case_id}
```

Changes `status` and nothing else. It exists because `PUT` and the batch
both require `status` **and** `started_at`: to correct just the state you
would have to read the case first and rewrite the rest identically — two
calls, with a window between them.

**Body**

| Field | Type | Required | Note |
|---|---|:---:|---|
| `status` | enum | ✅ | The new state. |
| `expected_status` | enum | — | The state you believe the case is in right now. |

**Response** `200` — the updated case, without `source_record`.

!!! tip "`expected_status` is what makes it safe to decide from a read"
    When set, the change only happens if the current state matches; if it
    does not, the API answers `409` and **writes nothing**. Between your
    read and your write another process may have touched the case —
    without this check you would erase its decision without knowing.

    Omitted, the change is unconditional. That suits manual correction,
    where the caller already knows what they are doing.

| Situation | Response |
|---|---|
| Changed | `200` with the case |
| `expected_status` does not match | `409`, code `status_conflict` |
| Case does not exist | `404`, code `case_not_found` |

---

## `POST` — batch upsert

```
POST /v1/cases/batch
```

**Body**

| Field | Type | Required | Note |
|---|---|:---:|---|
| `environment` | enum | ✅ | Applies to every item. |
| `automation` | string | ✅ | Applies to every item. |
| `source_schema` | string | — | Batch default; each item may override it. |
| `on_conflict` | enum | — | `update` (default) or `skip`. What to do with a `case_id` that already exists. |
| `cases` | list | ✅ | 1 to `CASEHUB_MAX_BATCH_ITEMS` items (default 1000). |

Each item accepts the same fields as the `PUT`, plus `case_id` — which here
is **optional**.

**Response** `200`

```json
{
  "upserted": 2,
  "created": ["a"],
  "skipped": 0,
  "errors": [
    {"case_id": "b", "code": "invalid_request"}
  ]
}
```

| Field | Meaning |
|---|---|
| `upserted` | Items actually **written** — created plus updated. What was skipped does not count: nothing was written. |
| `created` | The `case_id`s created **in this call**. It is what lets a publisher act only on what is new — kicking off an enrichment, say — without a prior query. It is a list, not a count, because a count does not say *which*. |
| `skipped` | How many already existed and were left as they were. Always `0` with `on_conflict=update`. |

!!! tip "`on_conflict=skip` for periodically re-read sources"
    The upsert replaces the fields you send, **without merging**. A
    publisher that republishes the same source every cycle — an
    inventory screen re-read every ten minutes, say — rewrites the
    whole case each time and wipes whatever another process added to
    it afterwards, with no error and no log.

    `skip` writes **nothing** to a case that already exists: not
    `status`, not `started_at`, not `source_record`. It still creates
    what does not exist yet — it is about the conflict, not about the
    insert.

    Expect this consequence: in steady state `upserted` drops to `0`
    and `skipped` runs high. That is success, not failure — which is
    precisely why the two numbers are reported separately.

!!! danger "200 does not mean everything was stored"
    The batch is all-or-nothing **per item**: an invalid item lands in
    `errors[]` and the rest are stored. The status is still 200. An
    integration that only checks the HTTP code will lose failures
    silently — **read `errors[]`**.

`errors[]` carries only `case_id` and `code`, never the record's content.
That is deliberate: `source_record` may carry sensitive data, and error
messages tend to end up in logs.

!!! warning "An empty batch and an oversized batch are both 400"
    An empty batch is a caller error, not a no-op that answers 200 having
    done nothing. Above the ceiling, the 400 message reports the
    environment's effective limit — which is configurable, so do not assume
    a fixed 1000.

---

## `GET` — fetch one case

```
GET /v1/cases/{environment}/{automation}/{case_id}
```

**Response** `200` with the full case, `source_record` included.
`404 case_not_found` if it does not exist.

---

## `GET` — list and count

```
GET /v1/cases
```

**Fixed filters**

| Parameter | Note |
|---|---|
| `environment` | |
| `automation` | Under OIDC the token already restricts it — see below. |
| `status` | |
| `filter` | Filter over `source_record` — see below. |
| `batch_ref` | |
| `source_schema` | |
| `started_from` / `started_to` | Window over `started_at`. |
| `page` | Default 1. |
| `page_size` | Default 50, maximum 500. |
| `include` | Empty or `source_record`, to bring the JSON. |

**Filters over `source_record`**

The `filter` parameter takes `key=value` and is repeated once per
filter:

```
GET /v1/cases?filter=referencia=REF-12345&filter=uf=SP
```

Nested paths use a dot: `filter=origem.id=42`.

Only the **first** `=` separates key from value, so a value containing
`=` goes through whole — `filter=expr=a=b` filters `expr` by the value
`a=b`.

The comparison is **textual**, so `filter=valor=10` matches the JSON
holding either a number or a string — no type ambiguity in the query
string.

!!! note "Filter ceiling"
    Each filter becomes a predicate in the `WHERE`. Above
    `CASEHUB_MAX_SOURCE_FILTERS` (default 20) the answer is 400 — better
    than an arbitrarily expensive query with no explanation.

!!! tip "`source_record` does not come by default in a listing"
    Only with `include=source_record`. A listing of 500 cases with each
    one's full JSON is a large payload and rarely what you want.

**Authorization on listings** — an OIDC client cannot see other automations
by simply omitting the filter: the token's claim **is** the filter when none
is given, and an explicit filter that disagrees answers 403.

---

## `/health` and `/ready`

| Route | Touches the database | Use |
|---|:---:|---|
| `/health` | ❌ | Liveness probe. Answers as long as the process is up. |
| `/ready` | ✅ | Readiness probe. `503` if the database is unreachable. |

Using `/health` as readiness is a common mistake: the process can be up with
the database down, and the load balancer would keep sending traffic.
