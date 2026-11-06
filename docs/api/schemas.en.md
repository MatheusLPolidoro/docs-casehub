# Record schemas

Since API 0.9.0. A case's `source_schema` is still a free label, but each
automation can **register the structure** of the `source_record` of each
`source_schema` it publishes — the keys, the types and the lists. It serves
two purposes:

- a frontend looks the structure up to draw its screen, without guessing
  keys or types;
- writing a case warns when the record does not follow what was declared.

**Nothing is rejected because of a schema.** A case outside the schema is
stored as it always was; the response only starts carrying the warnings.
With no schema registered, nothing changes.

| Method | Route | What it does |
|---|---|---|
| `PUT` | `/v1/source-schemas/{name}` | Registers or replaces the schema. |
| `GET` | `/v1/source-schemas` | Lists the schemas of the token's automation. |
| `GET` | `/v1/source-schemas/{name}` | Fetches the schema, with the flat `fields` list. |
| `DELETE` | `/v1/source-schemas/{name}` | Removes the schema. No case changes. |
| `GET` | `/v1/source-schemas/{name}/inferred` | Infers the schema from the stored cases. |
| `POST` | `/v1/source-schemas/{name}/validate` | Checks a record against the schema, without storing anything. |

`name` is the same text cases carry in `source_schema`: letters, digits,
`.`, `_` and `-`, starting with a letter or a digit, up to 200 characters.
Outside that, `400 invalid_source_schema_name`. The schema belongs to the
token's automation — the same `name` in two automations is two schemas —
and it holds in all three environments: the name already carries the
version (`registro.v1`).

---

## Registering

```
PUT /v1/source-schemas/registro.v1
```

```json
{
  "schema": {
    "type": "object",
    "title": "Registro de origem",
    "properties": {
      "referencia": {"type": "integer", "title": "Referência"},
      "origem": {"type": ["string", "null"]},
      "itens": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {"valor": {"type": "number"}},
          "required": ["valor"]
        }
      }
    },
    "required": ["referencia"]
  }
}
```

**Response** `200` — the same view as the fetch, plus `created` (`true`
when there was no schema with that name) and `warnings` (the incompatible
changes relative to the previous one; empty on creation). Repeating the same
body leaves the same state.

**The format** is a subset of JSON Schema 2020-12, with the same meaning
it has there:

| Keyword | Where it applies | Meaning |
|---|---|---|
| `type` | every node (required) | A type, or a list without repetition: `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`. |
| `properties` | type with `object` | The expected keys, each with its own node. |
| `required` | type with `object` | The `properties` keys that must be present. |
| `additionalProperties` | type with `object` | `false` makes a key outside `properties` a warning. Default `true`. |
| `items` | type with `array` | The node that describes every item of the list. |
| `title`, `description` | every node | Text for the screen (up to 200 and 2000 characters). |

The root is always `object`. A schema has at most 32 levels, 5000 nodes and
512 KB.

!!! warning "A keyword outside the subset is rejected, not ignored"
    `$ref`, `enum`, `pattern`, `format`, `oneOf` and the rest answer
    `400 invalid_source_schema`, with a message pointing at where the
    problem is (`schema inválido em /properties/itens/items: ...`).
    Ignored, they would give the impression that they are checked.

---

## Fetching, and the `fields` list

```
GET /v1/source-schemas/registro.v1
```

```json
{
  "name": "registro.v1",
  "schema": {"type": "object", "title": "Registro de origem", "properties": {...}, "required": ["referencia"]},
  "fields": [
    {"path": "referencia", "segments": ["referencia"], "type": ["integer"], "required": true, "title": "Referência", "description": null},
    {"path": "origem", "segments": ["origem"], "type": ["string", "null"], "required": false, "title": null, "description": null},
    {"path": "itens", "segments": ["itens"], "type": ["array"], "required": false, "title": null, "description": null},
    {"path": "itens[]", "segments": ["itens", null], "type": ["object"], "required": false, "title": null, "description": null},
    {"path": "itens[].valor", "segments": ["itens", null, "valor"], "type": ["number"], "required": true, "title": null, "description": null}
  ],
  "created_at": "2026-11-02T12:00:00Z",
  "updated_at": "2026-11-02T12:00:00Z"
}
```

`schema` comes back as it was registered, **in declaration order** — the
order in which the screen shows the fields. `fields` is the same structure
flattened, one entry per declared key and per `items`, at any depth, in
that same order:

| Field | Meaning |
|---|---|
| `path` | The path as text, with `.` between keys and `[]` for each list item. |
| `segments` | The same path as a list, with `null` in place of each list item. |
| `type` | The types, **always as a list**, even with a single one. |
| `required` | Whether the key is in the parent object's `required` (`false` for a list item). |
| `title`, `description` | As declared, or `null`. |

!!! tip "`segments` exists because a key may contain a dot"
    A record coming from a spreadsheet or a fixed-width file has keys
    like `DT.ULT.ALT.`, which no text path can split without escaping.
    `segments` is unambiguous: use `path` to display and `segments` to
    navigate. To filter by such a key, escape the dot:
    `filter=DT\.ULT\.ALT\.=...`, since API 0.11.0.

With no schema of that name, `404 source_schema_not_found` — and
[inference](#inferring-from-stored-cases) answers anyway.

---

## Listing and removing

`GET /v1/source-schemas` returns `{"items": [...]}`, one item per schema of
the token's automation, in name order, with `name`, the root's `title` and
`description` (or `null`), `created_at` and `updated_at`. The whole schema
comes in each one's fetch.

`DELETE /v1/source-schemas/{name}` answers `200` with `{"ok": true}`, or
`404`. No case changes; writes stop being checked.

---

## Warnings when a schema is replaced

Re-registering a schema is always accepted. When the replacement may stop
accepting data the previous one accepted — or takes away from the frontend
a field it knew —, `warnings` lists each change:

| Code | When |
|---|---|
| `removed` | A `properties` key of the previous schema does not exist in the new one. |
| `type_narrowed` | A path stopped accepting some type; carries `before` and `after`. |
| `now_required` | A key became part of `required`. |
| `closed` | An object now has `additionalProperties: false`. |

```json
{"code": "type_narrowed", "path": "origem", "segments": ["origem"], "before": ["string", "null"], "after": ["string"]}
```

A new optional key, a widened type and a key that is no longer required do
not warn. `integer` to `number` is a widening; `number` to `integer`, a
narrowing.

---

## Checking on write

When a case `PUT` — or a stored batch item — carries `source_schema` and
`source_record`, and the automation registered a schema with that name,
the **stored** record is checked: under `on_conflict: "merge"`, the merged
one. The response gains `schema_check`:

```json
{
  "created": true,
  "schema_check": {
    "source_schema": "registro.v1",
    "conforms": false,
    "warnings": [
      {"code": "type_mismatch", "path": "itens[].valor", "segments": ["itens", null, "valor"], "expected": ["number"], "received": ["string"], "count": 2}
    ],
    "truncated": false
  }
}
```

!!! warning "Nothing is rejected"
    The case is stored, the status is `200` and the fields that were there
    do not change. With no schema registered, no `source_schema` or no
    `source_record` in the request, `schema_check` does not appear and the
    response is the one from before, byte for byte.

| Warning | When |
|---|---|
| `type_mismatch` | The value's type is not among the declared ones. Carries `expected` and `received`. |
| `missing_required` | A `required` key is missing from the object. |
| `unexpected_key` | A key outside `properties` in an object with `additionalProperties: false`. |

- A number with no fractional part satisfies `integer`; every number
  satisfies `number`; a boolean is **never** a number.
- A required key present with `null` is not missing: what is checked on it
  is the type.
- Warnings are **aggregated by path**: list items with the same problem
  become a single warning, with `count`. **No warning carries a value from
  the record** — only path and types.
- At most 100 distinct warnings; beyond that, `truncated: true`.

**In a batch**, `schema_check` aggregates every checked item:

```json
{
  "upserted": 2,
  "created": ["c1", "c2"],
  "skipped": 0,
  "errors": [],
  "schema_check": {
    "checked": 2,
    "nonconforming": ["c2"],
    "warnings": [
      {"source_schema": "registro.v1", "code": "type_mismatch", "path": "referencia", "segments": ["referencia"], "expected": ["integer"], "received": ["string"], "count": 1, "cases": 1}
    ],
    "truncated": false
  }
}
```

`nonconforming` lists the `case_id`s outside the schema; each warning
carries `count` (occurrences) and `cases` (affected items). An item with an
error or a skipped one (`skip`) is not checked.

!!! note "The schema is read before the write"
    One query per request, or one per batch. If it fails, nothing is
    stored. The measured cost of the check on a 1000-item batch was 4% to
    9%.

---

## Inferring from stored cases

```
GET /v1/source-schemas/registro.v1/inferred?sample_size=100
```

Infers the schema from the `source_record` of the token's automation's
cases with that `source_schema`. **It stores nothing** and answers even
without a registration — it is the answer to "what is the structure of
this record?" when nobody declared it, and the starting point for
registering one.

| Parameter | Note |
|---|---|
| `sample_size` | How many cases to read, from the most recently updated. Default 100, maximum 500. |
| `environment` | Optional: restricts the sample to one environment. |

```json
{"name": "registro.v1", "sample_size": 100, "schema": {...}, "fields": [...], "truncated": false}
```

- Every type seen on a path enters its list; a number is always `number`.
- `required` holds only the keys present in **every** object seen there.
- Keys come out in alphabetical order, and an always-empty list gets no
  `items`.
- With no cases, `sample_size: 0` and `{"type": "object"}`.
- The read has the listing's byte budget: beyond it, `400
  invalid_request` asking for a smaller `sample_size`.

!!! tip "What is inferred can be registered"
    The returned `schema` is accepted by the `PUT` as it is, and every
    record of the sample conforms to it. Adjust whatever you want — titles,
    stricter types, `required` — and register it.

---

## Validating without storing

```
POST /v1/source-schemas/registro.v1/validate
```

```json
{"source_record": {"referencia": "sete", "itens": []}}
```

Returns `200` with the same check as the `PUT`'s `schema_check`, without
storing any case. A record that is not a JSON object is
`400 invalid_source_record`; above the write limit,
`413 source_record_too_large`.

---

## Errors

| Code | HTTP | When |
|---|:---:|---|
| `invalid_source_schema_name` | 400 | The name falls outside the pattern. |
| `invalid_source_schema` | 400 | The schema falls outside the format; the message points at where. |
| `invalid_request` | 400 | Unknown field in the body, `sample_size` outside 1–500, sample above the budget. |
| `source_schema_not_found` | 404 | There is no schema with that name in the token's automation. |
