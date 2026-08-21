# Endpoints

Contract v1 has **four business routes** and two health ones. Every business
route lives under `/v1` and requires authentication; `/health` and `/ready`
never do.

| Method | Route | What it does |
|---|---|---|
| `PUT` | `/v1/cases/{environment}/{automation}/{case_id}` | Creates or updates a case. |
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
| `status` | enum | ✅ | `aberto`, `em_andamento`, `concluido`, `falhou`, `pausado`. |
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
| `cases` | list | ✅ | 1 to `CASEHUB_MAX_BATCH_ITEMS` items (default 1000). |

Each item accepts the same fields as the `PUT`, plus `case_id` — which here
is **optional**.

**Response** `200`

```json
{
  "upserted": 2,
  "errors": [
    {"case_id": "b", "code": "invalid_request"}
  ]
}
```

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
| `batch_ref` | |
| `source_schema` | |
| `started_from` / `started_to` | Window over `started_at`. |
| `page` | Default 1. |
| `page_size` | Default 50, maximum 500. |
| `include` | `include=source_record` to bring the JSON. |

**Dynamic filters over `source_record`**

Any parameter prefixed with `f.` becomes a filter over the corresponding
path inside the JSON:

```
GET /v1/cases?f.referencia=REF-12345&f.uf=SP
```

The comparison is **textual**, so `f.valor=10` matches the JSON holding
either a number or a string — no type ambiguity in the query string.

!!! note "Filter ceiling"
    Each `f.` becomes a predicate in the `WHERE`. Above
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
