# Endpoints

Every case route lives under `/v1` and requires authentication.
`/health`, `/ready` and `/v1/auth/*` never do — the token routes are the
way to obtain the credential.

**Cases**

| Method | Route | What it does |
|---|---|---|
| `PUT` | `/v1/cases/{environment}/{automation}/{case_id}` | Creates or updates a case. |
| `PATCH` | `/v1/cases/{environment}/{automation}/{case_id}` | Changes only a case's status. |
| `POST` | `/v1/cases/batch` | Creates or updates several cases. |
| `GET` | `/v1/cases/{environment}/{automation}/{case_id}` | Fetches one case. |
| `GET` | `/v1/cases` | Lists and counts cases. |
| `GET` | `/v1/cases/totals` | Counts cases by environment, status and `source_schema`, since API 0.9.0, and by batch, since 0.11.0. |

**Case attachments** (since API 0.8.0)

| Method | Route | What it does |
|---|---|---|
| `PUT` | `/v1/cases/{environment}/{automation}/{case_id}/attachments/{name}` | Stores or replaces an attachment. |
| `GET` | `/v1/cases/{environment}/{automation}/{case_id}/attachments` | Lists the case's attachments. |
| `GET` | `/v1/cases/{environment}/{automation}/{case_id}/attachments/{name}` | Downloads an attachment. |
| `DELETE` | `/v1/cases/{environment}/{automation}/{case_id}/attachments/{name}` | Removes an attachment. |

**Token, webhooks and health**

| Method | Route | What it does |
|---|---|---|
| `POST` | `/v1/auth/token` | Issues the token — relayed to the identity provider. See [Authentication](autenticacao.md). |
| `POST` | `/v1/auth/refresh` | Renews the token. |
| — | `/v1/webhooks*` | Seven routes for subscriptions and the delivery log. See [Webhooks](webhooks.md). |
| — | `/v1/source-schemas*` | Six record-schema routes, since API 0.9.0. See [Record schemas](schemas.md). |
| — | `/v1/render-templates*` | Six render-template routes, since API 0.10.0. See [Render templates](templates.md). |
| `GET` | `/health` | Liveness — does not touch the database. |
| `GET` | `/ready` | Readiness — `SELECT 1`, answers 503 if the database is down. |

!!! tip "Swagger shows the paths without `/v1`"
    The prefix is FastAPI's `root_path`, and `/docs` offers it in a
    "Servers" selector at the top. Real calls still use `/v1/...`.

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
| `on_conflict` | enum | — | `update` (default) or `merge`, since API 0.9.0. See [Merging `source_record`](#merging-source_record). |

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

!!! warning "`source_record` must be a JSON object, and carry no null character"
    A non-object is `400 invalid_source_record`; above
    `CASEHUB_MAX_SOURCE_RECORD_BYTES` it is `413
    source_record_too_large`.

    The null character (`U+0000`) in any key or value is also `400
    invalid_source_record`: Postgres rejects it unconditionally in text
    and JSONB. It is common in data coming from mainframe fixed-width
    files, which sometimes carry binary junk — and in a batch the
    rejection is **for that item**, without taking the others down.

---

## Merging `source_record`

Since API 0.9.0. By default, the `PUT` and the batch **replace** the
whole `source_record`. A publisher that only adds data to a case that
already exists — an enrichment, say — asks for the merge with
`on_conflict: "merge"` and sends only what is new:

```json
{
  "status": "em_andamento",
  "started_at": "2026-11-02T09:00:00-03:00",
  "on_conflict": "merge",
  "source_record": {"enriquecimento": {"etapa_b": {"ok": true}}}
}
```

With the case stored as
`{"referencia": 7, "enriquecimento": {"etapa_a": {"ok": true}}}`, the
result is
`{"referencia": 7, "enriquecimento": {"etapa_a": {"ok": true}, "etapa_b": {"ok": true}}}`.

| Stored | Sent | Result |
|---|---|---|
| a key not in the request | — | stays |
| — | a new key | is added |
| object | object | the two merge, by the same rule, at any depth |
| any value | list, text, number, boolean or `null` | the sent value replaces it |
| object | a value of another type | the sent value replaces it |

!!! tip "A list replaces, `null` is stored"
    Lists are not concatenated: concatenating would make the same `PUT`,
    resent, duplicate items. And a `null` you send is **stored** — it
    does not delete the key, because a `null` coming from the source is
    data. To remove a key, use `update` with the whole record.

- **Atomic and idempotent.** The read, the merge and the write are a
  single operation: two simultaneous merges on the same case end with
  both contributions. Resending the same body leaves the same record.
- **The other fields follow `update`**: `status`, `started_at`,
  `batch_ref` and `finished_at` replace the stored values when sent;
  `source_schema` and `temporal_*` keep the stored value when omitted.
- **A case that does not exist** is created with the record you sent,
  and the response is `{"created": true}`. An omitted `source_record`
  keeps the stored one, and `{}` changes nothing — under `update`, `{}`
  clears it.
- **In a batch**, `on_conflict: "merge"` applies to every item; the
  items written, created or merged, count in `upserted`.

!!! warning "The ceiling applies to the merged record"
    The result of the merge honours `CASEHUB_MAX_SOURCE_RECORD_BYTES`, as
    any write does. Above it, the `PUT` answers
    `413 source_record_too_large` and the batch puts the item in
    `errors[]` with that code. Either way the case stays exactly as it
    was.

!!! note "`skip` only exists in the batch"
    On the `PUT`, `on_conflict` accepts `update` and `merge`. `skip`
    answers `400 invalid_request`: the `PUT` response could not tell
    "skipped" from "updated".

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
| `on_conflict` | enum | — | `update` (default), `skip` or `merge` (since API 0.9.0). What to do with a `case_id` that already exists. |
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
| `skipped` | How many already existed and were left as they were. Always `0` with `on_conflict` `update` or `merge`. |

!!! tip "`on_conflict=skip` for periodically re-read sources"
    Under `update`, the upsert replaces the fields you send. A
    publisher that republishes the same source every cycle — an
    inventory screen re-read every ten minutes, say — rewrites the
    whole case each time and wipes whatever another process added to
    it afterwards, with no error and no log. (A publisher that wants to
    **add** without erasing uses `merge`: see
    [Merging `source_record`](#merging-source_record).)

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

Since API 0.10.0, `render_template=<name>` adds `rendered`, with what
that [template](templates.md) builds for the case — for a `view`, a view
of the `source_record`. A rendering failure comes in `rendered.error`, and
the response stays `200`. Without the parameter, the response is the
usual one.

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
| `filter` / `ne` / `exists` / `not_exists` | Filters over `source_record` — see below. |
| `present` / `blank` / `matches` / `not_matches` / `in` / `not_in` | Same, since API 0.7.0. |
| `conditions` | The whole grammar as JSON, with `any`/`all` groups. |
| `search` | A term in any value of `source_record`, in `case_id` or in `batch_ref`, since API 0.12.0 — see below. |
| `render_with` | Shows, on each item, what a subscription would send — see below. |
| `render_template` / `render_connection` | Shows, on each item, what a render template builds, since API 0.10.0 — see below. |
| `batch_ref` | |
| `source_schema` | |
| `started_from` / `started_to` | Window over `started_at` — the record's date **at the source**. |
| `created_since` / `updated_since` | Incremental cursor: only what was created / changed from that instant on. |
| `page` | Default 1. |
| `page_size` | Default 50, maximum 500. |
| `include` | Empty or `source_record`, to bring the JSON. |

!!! tip "Incremental consumption: use the cursor, don't page everything"
    `created_since` and `updated_since` answer *"what changed since I
    last looked"*. Keep the highest `created_at` (or `updated_at`) you
    received and send it on the next call.

    Do not confuse it with `started_from`: that one filters the
    record's date **at the source**, which may be years old on a case
    created today.

    The two answer different questions — `created_since` brings only
    new cases; `updated_since` also brings state changes.

    When either is used, the listing orders by the cursor's field.
    Without them, the order stays `started_at`.

!!! danger "Re-read a window of a few seconds"
    A row stamped earlier may be **written** later: the transaction
    that created it can take a while to commit, and it would show up
    behind a cursor you already passed. If you advance the cursor to
    the last instant you received, that row is never returned again —
    no error, no log.

    That is why the filters are `>=`: repeating the instant returns the
    boundary row again. Key your cases by `case_id` and the repetition
    costs nothing; the loss cannot be undone.

**Filters over `source_record`**

Ten operators, all **repeatable**, combined with `AND`:

| Parameter | Question | Example |
|---|---|---|
| `filter=key=value` | the field **equals** the value | `filter=uf=SP` |
| `ne=key=value` | the field exists and **differs** from the value | `ne=uf=SP` |
| `exists=path` | the **key exists** | `exists=enriquecimento` |
| `not_exists=path` | the key **does not exist** | `not_exists=erro` |
| `present=path` | the key exists **and has a value** | `present=email` |
| `blank=path` | the key is missing, null or empty | `blank=email` |
| `matches=key=pattern` | the value matches the regular expression | `matches=email=@example\.com$` |
| `not_matches=key=pattern` | the value exists and does **not** match | `not_matches=doc=^0+$` |
| `in=key=value` | the value is among the given ones | `in=uf=SP&in=uf=RJ` |
| `not_in=key=value` | the value exists and is **not** among them | `not_in=uf=SP` |

!!! note "The last six exist since API 0.7.0"
    An earlier installation answers `400` for them. The first four did
    not change: a stored query keeps selecting the same set.

`in` and `not_in` repeated **on the same path** form a single list —
`in=uf=SP&in=uf=RJ` asks for "SP or RJ", not "SP and RJ". On different
paths they keep combining with `AND`.

```
GET /v1/cases?filter=referencia=REF-12345&filter=uf=SP
```

Nested paths use a dot (`origem.id`), and a **numeric segment indexes an
array** (`telas.0`).

Since API 0.11.0, a dot that is part of the key's name is escaped with
`\`: `filter=cod\.cliente=123` filters by the key `cod.cliente`, and
`filter=origem.nota\.fiscal=7` by the key `nota.fiscal` inside `origem`.
In the URL, the backslash goes as `%5C`. `\\` is a literal backslash
before a dot or at the end of the key; before any other character, it
stays as it is. The rule is the same for every path over `source_record`:
conditions, subscriptions, templates and the connections' `token_path`.

In `filter=` and `ne=`, only the **first** `=` separates key from value,
so a value containing `=` goes through whole — `filter=expr=a=b` filters
`expr` by the value `a=b`.

The comparison is **textual**, so `filter=valor=10` matches the JSON
holding either a number or a string — no type ambiguity in the query
string.

!!! danger "Two things intuition gets wrong, and both cost an empty answer with no error"
    **`not_exists` is not `ne`.** Comparing a value requires a value to
    exist, so a missing path matches neither `ne` **nor** `filter`. For
    "the key is absent", only `not_exists` works.

    **`exists` asks about the key, not the value.** It matches when the
    value is `null`, an object or a list — an empty list included. That
    is what lets you ask "has this case been enriched?" without knowing
    what the automation writes into the enrichment. `filter=` and `ne=`
    only compare scalars: objects and lists match neither.

!!! tip "`present` is the question `exists` does not answer"
    `exists` matches `null` and empty text; `present` does not. For
    "there is an email to send to", use `present=email`. "Empty" is
    **ASCII** whitespace only — a non-breaking space counts as a value.

    `blank` is the exact complement of `present`, and includes
    absence: a path that does not exist is `blank`, and is not
    `present`.

    The `not_*` operators **do not match absence**: `not_matches`,
    `not_in` and `ne` require the field to exist and be scalar.

!!! note "Filter ceiling"
    Each filter becomes a predicate in the `WHERE`. All operators count
    towards the **same** ceiling, added up — splitting the query
    between them does not double the limit, and a condition inside a
    group counts the same. Above `CASEHUB_MAX_SOURCE_FILTERS`
    (default 20) the answer is 400, better than an arbitrarily
    expensive query with no explanation.

**Regular expressions: a portable subset**

`matches` and `not_matches` only accept what means the same thing in the
service and in the database: literals, `.`, classes `[...]`, `\d \w \s`
(in **ASCII** — `Ç` is not `\w`), the `^` and `$` anchors, `( )` and
`(?: )` groups, alternation `|` and greedy repetitions `* + ? {m} {m,n}`
up to 255.

Anything else is rejected with `400` at registration: `\b`, lookaround,
backreference, named group, inline flags, lazy quantifier, nested
quantifier, and a **repeated group whose alternatives can start at the
same point**. `(?:ab|cd)+` is fine; `(?:a|aa)+` and `(?:[ab]|c)+` are
not — give each alternative a different literal first character, or use
a class instead (`[ab]+`).

`.` matches a line break, `$` is the end of the text, the comparison is
case-sensitive and the text is cut at 10,000 characters before matching.

!!! note "The rejection is about form, not taste"
    What falls outside the subset would either mean different things on
    each side — and then the same filter would select different sets,
    with no error at all — or cost exponential time in a query that
    runs on every cycle.

**The whole grammar: `conditions`**

The parameters above always combine with `AND`. To ask for "one thing
**or** another", send the tree as JSON:

```
GET /v1/cases?conditions=[{"any":[
  {"path":"uf","op":"eq","value":"SP"},
  {"all":[{"path":"regiao","op":"eq","value":"sudeste"},
          {"path":"email","op":"present"}]}]}]
```

The top-level list is an `AND`; `{"any": [...]}` is OR and
`{"all": [...]}` is AND, nestable up to 3 levels. Malformed JSON, an
empty group or an unknown operator answer `400`. `conditions` adds up
with the simple parameters — and shares the same ceiling.

**Search without knowing the field: `search`**

Since API 0.12.0, `search=<term>` matches the case in which the term
appears as **part of the text** of some value of `source_record` —
text, number or boolean, at any level, including inside lists —, of
`case_id` or of `batch_ref`:

```
GET /v1/cases?search=maria&started_from=2026-11-01T00:00:00-03:00
```

| Detail | Behavior |
|---|---|
| case | ignored: `search=ação` finds `AÇÃO` |
| accents | not ignored: `search=acao` does **not** find `ação` |
| key names | not searched: `search=telefone` does not find `{"telefone": "1234"}` |
| `null`, object and list as a whole | do not match; the values inside them do |
| numbers and booleans | by the text the database writes: `true`, `false`, and the number without exponent |
| `%`, `_` and `\` | are text, never wildcards |
| combination | adds up with every other filter, as AND; `total` and paging are those of the matched set |
| surrounding spaces | trimmed; an empty term is the same as not sending it |
| length | up to 200 characters; above it, `400 invalid_request` |
| filter ceiling | the search does **not** count towards it |

!!! warning "Always send the period"
    The search uses no index: it reads the records left after the other
    filters. A query that takes longer than 15 seconds is cut and
    answers `400 invalid_request`, asking for a shorter period
    (`started_from`) or a more specific term.

!!! note "The term goes to no log or trace"
    The term may be personal data. The API records only its length, and
    the query string is redacted from the access line and from the
    trace — see [Observability](../operacao/observabilidade.md).

!!! tip "On an API older than 0.12.0"
    The parameter is ignored without error, and the listing comes back
    **without** the search. Check the version (`/v1/openapi.json`)
    before relying on it.

!!! tip "`source_record` does not come by default in a listing"
    Only with `include=source_record`. A listing of 500 cases with each
    one's full JSON is a large payload and rarely what you want.

!!! warning "A page with `source_record` has a byte budget"
    Since API 0.8.0, a `source_record` can be up to 10 MB. So that the
    service's memory holds, a page that returns or renders the records
    (`include=source_record` or `render_with`) adds up their size against
    `CASEHUB_MAX_LIST_SOURCE_BYTES` (100 MB by default). Past it, the
    response is `400 invalid_request`: ask for a smaller `page_size`. A
    one-item page always fits.

**Seeing what a subscription would send: `render_with`**

`render_with=<subscription id>` adds a `rendered` to each item with what
that subscription would build for that case — verb, URL, redacted
headers, body and warnings —, in the same shape as
[`/preview`](entregas.md#4-check-before-turning-it-on). **Nothing is
sent and no delivery is recorded.**

| Detail | Behaviour |
|---|---|
| subscription of another automation | `404`, as everywhere else |
| subscription with neither `request_spec` nor `template` | `400`: there is nothing to build |
| disabled subscription | works just the same |
| a case that fails to build | the item carries the error, and the page goes on |
| `page_size` | its own ceiling of 100 items |

!!! warning "It does not filter by the subscription's rules"
    `render_with` answers *"what would go out for this case"*, not
    *"which cases would go out"*. To see the selection, repeat the
    subscription's conditions in the listing parameters.

**Reading through a template's view: `render_template`**

Since API 0.10.0, `render_template=<name>` does the same with a registered
[render template](templates.md#rendered-reads), with no subscription. For
a `view`, each `rendered` carries `body`, `warnings` and `error` — a view
of the `source_record`, which is how a frontend reads cases in the shape
it needs. For a `request`, the `render_with` shape, and
`render_connection=<id>` builds the full URL. It does not combine with
`render_with`, has the same page ceiling and applies no projection.

**The response**

| Field | Meaning |
|---|---|
| `total` | How many items matched the filter, not how many came back. |
| `page` / `page_size` | The requested page and its size. |
| `total_pages` | `ceil(total / page_size)`. An empty list returns `0`, not `1` — with no records there is no page of content at all. |
| `items` | The cases on this page. |

!!! note "`total_pages` exists since API 0.5.0"
    An installation on an earlier version does not return the field, and
    whoever consumes it keeps computing `ceil(total / page_size)` on their
    own.

    The field is **additive** — no existing field changed — so a client
    that already handles the response keeps working either way. All three
    paginated listings gained it at once: this one, `GET /v1/webhooks`
    and `GET /v1/webhooks/{id}/deliveries`. In the SDK, `list_cases`
    returns the body as it came: the field shows up in the dictionary
    without upgrading `casehub`.

**Authorization on listings** — an OIDC client cannot see other automations
by simply omitting the filter: the token's claim **is** the filter when none
is given, and an explicit filter that disagrees answers 403.

---

## `GET` — totals

```
GET /v1/cases/totals
```

Since API 0.9.0. How many cases match the filters, and how many in each
group — without fetching a page of cases or reading `source_record`. It is
the route for a dashboard: the listing counts one set per call and returns
a page along with it; the totals return every combination in a single
query. Grouping by batch (`batch_ref`) exists since 0.11.0.

```
GET /v1/cases/totals?environment=prod&group_by=source_schema&group_by=status
```

```json
{
  "total": 1520,
  "group_by": ["source_schema", "status"],
  "groups": [
    {"source_schema": "registro.v1", "status": "aberto", "count": 1000},
    {"source_schema": "registro.v1", "status": "concluido", "count": 500},
    {"source_schema": null, "status": "aberto", "count": 20}
  ],
  "truncated": false
}
```

**Parameters**

| Parameter | Note |
|---|---|
| The listing's filters | All of `GET /v1/cases` — `environment`, `automation`, `status`, `batch_ref`, `source_schema`, the dates, the cursor, `filter` and the operators over `source_record`, `conditions` and, since API 0.12.0, `search` —, optional, with the same semantics and the same errors. |
| `group_by` | Repeatable: `environment`, `status`, `source_schema` and, since API 0.11.0, `batch_ref`, without repetition. Without it, only `total`. |

**The response**

| Field | Meaning |
|---|---|
| `total` | How many cases match the filters — the same `total` the listing would give with them. |
| `group_by` | The requested dimensions, in the requested order. |
| `groups` | One entry per combination that has cases, with the requested dimensions and `count`. |
| `truncated` | `true` when `groups` was cut at the ceiling of 1000 groups. |

!!! tip "Order and the null group"
    Groups come sorted by the dimensions, in `group_by` order, by code
    point (`A` before `a`, which comes before `b`), with `null` last. A
    case without `source_schema` lands in the `"source_schema": null`
    group, a case without a batch in the `"batch_ref": null` group, and a
    combination with no cases does not appear — the dashboard fills in
    zero for whatever it needs to show.

!!! note "Cutting does not change `total`"
    Beyond 1000 groups, the response carries the first 1000 and
    `truncated: true`; `total` is still that of the whole set. The cut
    is per combination: with `group_by=batch_ref&group_by=status`, the
    last batch in the response may come with only some of its statuses.
    With the batch, reaching the ceiling is common — see below how to
    build a dashboard by batch.

!!! warning "An unknown or repeated dimension is 400"
    `group_by=case_id`, `group_by=automation` and
    `group_by=status&group_by=status` answer `400 invalid_request` — and
    so does `group_by=batch_ref` on an API older than 0.11.0. The
    automation is always the token's, as in the listing.

**Batches on a dashboard** — since API 0.11.0, it takes two calls:

```
GET /v1/cases/totals?environment=prod&group_by=batch_ref
GET /v1/cases/totals?environment=prod&group_by=batch_ref&group_by=status
```

```json
{
  "total": 1200,
  "group_by": ["batch_ref"],
  "groups": [
    {"batch_ref": "lote-a", "count": 700},
    {"batch_ref": "lote-b", "count": 480},
    {"batch_ref": null, "count": 20}
  ],
  "truncated": false
}
```

The first gives each batch's total, complete; the second, the split by
status. Do not add up the second to get a batch's total: when it comes
with `truncated: true`, the last batch is incomplete. If batches with
statuses go past the ceiling, narrow them by date, with `started_from`.

**Performance** — with fixed filters (`environment`, `status`,
`source_schema`...), the count comes from a dedicated index, without
reading the table. Since API 0.11.0, so does the count by batch, alone or
with status. A filter over `source_record` or by date forces a read of
the table: the result is still correct, it just costs more.

---

## Case attachments

Since API 0.8.0, a case can keep binary documents alongside it — the PDF
of a receipt, for example — that any flow reading the case retrieves
later. The content lives in the service's own object storage, behind the
API: **no automation ever gets its address or credential**, it only talks
to these routes. Authorization is the case's: a token from another
automation gets `403 forbidden`.

In the SDK, since 0.8.1: `upsert_attachment`, `list_attachments`,
`download_attachment` and `delete_attachment`, which send and check the
sha256 on their own. See [Synchronous client](../sdk/cliente.md#case-attachments).

### `PUT` — store or replace

```
PUT /v1/cases/{environment}/{automation}/{case_id}/attachments/{name}
Content-Type: application/pdf
X-Content-SHA256: <hex sha256>     (optional)

<the raw content>
```

The body is the **raw** content, neither JSON nor `multipart`. The
response is always `200`:

```json
{
  "name": "receipt.pdf",
  "content_type": "application/pdf",
  "size_bytes": 48213,
  "sha256": "9f2c...",
  "created_at": "2026-10-27T12:00:00Z",
  "updated_at": "2026-10-27T12:00:00Z",
  "created": true,
  "changed": true
}
```

| Situation | `created` | `changed` |
|---|:---:|:---:|
| New name in the case | `true` | `true` |
| Same name, different content: **replaces** | `false` | `true` |
| Same name, same content: nothing is stored, `updated_at` does not change | `false` | `false` |

!!! tip "Retrying is cheap and safe"
    Sending the same content again under the same name neither stores it
    again nor restarts the attachment's term. An automation can repeat the
    `PUT` after a timeout without worry.

**Rules:**

- **Name**: `[A-Za-z0-9][A-Za-z0-9._-]*`, up to 200 characters. Otherwise,
  `400 invalid_attachment_name` (`..` and spaces included).
- **Type**: only the ones the service accepts (by default,
  `application/pdf`), ignoring case and parameters such as `; charset=`.
  The content must carry the signature of the declared type (PDF, PNG,
  JPEG, TIFF, ZIP and Office). Otherwise, `415 unsupported_attachment_type`.
- **Size**: up to 25 MB by default; above that, `413 attachment_too_large`.
  An empty body is `400 invalid_request`.
- **Integrity**: with `X-Content-SHA256`, a body that arrives different is
  refused with `400 checksum_mismatch`, and the previous attachment stays
  intact.
- **Limits**: up to 50 attachments per case (`507 attachment_limit_exceeded`
  for a new name; replacing is still allowed) and a space quota per
  automation and environment (`507 attachment_quota_exceeded`; on a
  replacement, only the size difference counts).
- **Missing case**: `404 case_not_found`, and nothing is stored.

### `GET` — list

```
GET /v1/cases/{environment}/{automation}/{case_id}/attachments
```

`200` with `{"items": [...]}`: the current attachments, ordered by `name`,
each with the fields above (without `created`/`changed`) and **without the
content**. A case with no attachments returns an empty list. No
pagination: the per-case limit makes it unnecessary.

### `GET` — download

```
GET /v1/cases/{environment}/{automation}/{case_id}/attachments/{name}
```

The content, streamed, with:

| Header | Value |
|---|---|
| `Content-Type` | the stored type |
| `Content-Length` | the size |
| `Content-Disposition` | `attachment; filename="<name>"` |
| `ETag` | `"<sha256>"` |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `private, no-store` |

!!! warning "Check the `ETag` against what arrived"
    The API checks the content while sending it, but the bytes are already
    gone when the sum closes. The final check is the client's: the sha256
    of what you received must match the `ETag`.

`404 attachment_not_found` if the case has no attachment by that name.

### `DELETE` — remove

`204`. The attachment disappears from the listing and the download right
away; the content leaves the storage right away or, if the storage is
down, on the first cleanup cycle after it comes back.
`404 attachment_not_found` if it does not exist.

### Storage down or switched off

The attachment routes answer `503 attachment_store_unavailable` with a
`Retry-After` header, **without** any detail about the storage. The case
routes and `/ready` do not depend on it. Listing and removal keep working
with the storage down; storing and downloading do not.

In the in-memory mock (the backend automations use in their tests),
attachments work with no configuration at all.

An attachment has its own term, separate from the case's, and never
outlives its case. See [Retention](retencao.md#case-attachments).

---

## Delivery connections and delivering to other APIs

Seven routes used by [delivering to a third-party API](entregas.en.md).
The dedicated page explains the design; this is just the map.

| Method | Route | What it does |
|---|---|---|
| `POST` | `/v1/delivery-connections` | registers a connection: base URL, auth mode, credentials, throughput |
| `GET` | `/v1/delivery-connections` | lists the automation's connections, paginated |
| `GET` | `/v1/delivery-connections/{connection_id}` | reads one |
| `PATCH` | `/v1/delivery-connections/{connection_id}` | changes it; this is where a credential is rotated |
| `DELETE` | `/v1/delivery-connections/{connection_id}` | removes it, if no subscription uses it |
| `POST` | `/v1/delivery-connections/{connection_id}/test` | authenticates for real and returns the outcome |
| `POST` | `/v1/webhooks/{webhook_id}/preview` | shows what **would** be sent, without sending |

!!! warning "The credential goes in and never comes back"
    None of these routes returns `auth_secrets` or the cached token. If
    lost, the credential is rewritten via `PATCH`.

A connection belongs to the automation in the `azp` claim, like
everything else: another automation's id answers `404`, never `403`.

## `/health` and `/ready`

| Route | Touches the database | Use |
|---|:---:|---|
| `/health` | ❌ | Liveness probe. Answers as long as the process is up. |
| `/ready` | ✅ | Readiness probe. `503` if the database is unreachable. |

Using `/health` as readiness is a common mistake: the process can be up with
the database down, and the load balancer would keep sending traffic.
