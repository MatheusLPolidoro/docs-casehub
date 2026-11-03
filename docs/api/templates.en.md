# Render templates

Since API 0.10.0. The engine that builds the request of a
[delivery to another API](entregas.md) now has **its own registry**,
outside any webhook subscription. A template stored by name serves every
way a case leaves the service:

- the **reads** — `GET /v1/cases` and the single-case lookup —, which is
  how a frontend reads the same case in different views;
- the **subscription with a connection**, instead of an inline
  `request_spec`;
- the **classic webhook**, where the view goes out in place of the
  `source_record`.

There are two kinds, with the same engine and the same directives:

| `kind` | What it is | Where it applies |
|---|---|---|
| `request` | The whole request — `method`, `path`, `query`, `headers`, `body` —, exactly the [`request_spec`](entregas.md) grammar. It is the **delivery** pattern. | Reads and subscriptions with `connection_id`. |
| `view` | A single node: the body, built from the case. It is a **view** of the `source_record`: it reshapes the record on the way out, and **nothing stored changes**. | Reads and the classic webhook (no `connection_id`). |

| Method | Route | What it does |
|---|---|---|
| `PUT` | `/v1/render-templates/{name}` | Creates or replaces the template. |
| `GET` | `/v1/render-templates` | Lists the token's automation templates. |
| `GET` | `/v1/render-templates/{name}` | Reads the template, with the fields it reads and who uses it. |
| `DELETE` | `/v1/render-templates/{name}` | Removes the template. Refused while a subscription uses it. |
| `POST` | `/v1/render-templates/{name}/preview` | Renders the template against a case, sending nothing. |
| `POST` | `/v1/render-templates/preview` | Validates and renders a draft, storing nothing. |

The `name` follows the [record schemas](schemas.md) rule: letters,
digits, `.`, `_` and `-`, starting with a letter or digit, up to 200
characters. Otherwise, `400 invalid_render_template_name`. The template
belongs to the token's automation; another automation's answers `404`,
never `403`.

---

## Registering

```
PUT /v1/render-templates/mailing.v1
```

```json
{
  "kind": "view",
  "source_schema": "registro.v1",
  "description": "Customer for the service screen",
  "definition": {
    "nome": {"$from": "case.source_record.cliente.nome", "$transforms": [{"op": "trim"}]},
    "documento": {"$from": "case.source_record.cliente.documento", "$transforms": [{"op": "keep_digits"}]},
    "telefones": {
      "$each": "case.source_record.telefones",
      "$as": "tel",
      "$template": {"numero": {"$from": "tel.numero"}}
    },
    "caso": {"$from": "case.case_id"}
  }
}
```

**Response** `200` — the same view as the lookup, plus `created` (`true`
when no template had that name) and `warnings`. Replacing is always
accepted.

- **Key order is kept as sent**, and rendering follows it on Postgres
  too. (A subscription's inline `request_spec` does not guarantee that: it
  lives in a column that reorders keys.)
- **A `view` only sees `case.*` and `now.*`**, plus a `$each` alias.
  `delivery.*`, `subscription.*`, `event` and `delivered_at` do not exist
  outside a delivery, and are refused at registration with
  `400 invalid_render_template`, pointing at the path.
- `$secret` does not exist in any template.
- The definition is validated like a `request_spec`: the same message,
  with the code `invalid_render_template`.

!!! warning "The reference is live"
    Subscriptions that use the template render from the new definition
    **on their next delivery**. Before rewriting a template in use, check
    the draft in the [preview](#previewing-a-draft) and the result in
    bulk with [`render_template`](#rendered-reads). `used_by` tells who
    will be affected. Changing the `kind` of a template in use answers
    `409 render_template_in_use`.

---

## Reading: `inputs` and `used_by`

```
GET /v1/render-templates/mailing.v1
```

```json
{
  "name": "mailing.v1",
  "kind": "view",
  "source_schema": "registro.v1",
  "description": "Customer for the service screen",
  "definition": {...},
  "inputs": [
    {"path": "cliente.nome", "segments": ["cliente", "nome"], "required": false, "schema_type": ["string"], "in_schema": true},
    {"path": "cliente.documento", "segments": ["cliente", "documento"], "required": false, "schema_type": ["string"], "in_schema": true},
    {"path": "telefones", "segments": ["telefones"], "required": false, "schema_type": ["array"], "in_schema": true},
    {"path": "telefones[].numero", "segments": ["telefones", null, "numero"], "required": false, "schema_type": null, "in_schema": false}
  ],
  "envelope_paths": ["case.case_id"],
  "used_by": [],
  "created_at": "2026-11-03T12:00:00Z",
  "updated_at": "2026-11-03T12:00:00Z"
}
```

`inputs` lists each `source_record` path the template reads, in order of
first appearance, **in the same format as the `fields`** of a
[schema](schemas.md#fetching-and-the-fields-list) — a frontend matches the
two without interpreting the template grammar:

| Field | Meaning |
|---|---|
| `path`, `segments` | The path, as text and as a list (`null` for each list item). An index (`telefones.0.numero`) matches the schema's list item. |
| `required` | Some use of the path declares `$required`. |
| `schema_type` | The type in the schema registered for the template's `source_schema`; `null` without a schema or outside it. |
| `in_schema` | Whether the schema declares the path; `null` when there is no schema to compare. |

`envelope_paths` lists the other paths read (`case.case_id`, `now.iso`),
as written. `used_by` lists the ids of the subscriptions that render
through it.

**Registration warnings**, in `warnings` — they never refuse:

| Code | When |
|---|---|
| `unknown_path` | The template reads a path the schema does not declare. Carries `path` and `segments`. |
| `schema_not_found` | The template's `source_schema` has no registered schema. |

!!! tip "A template before its schema is a valid flow"
    The template's `source_schema` is only a label. Register the schema
    later, and the next lookup of the template already checks the paths
    against it.

---

## Listing and removing

`GET /v1/render-templates` returns `{"items": [...]}`, ordered by name,
with `name`, `kind`, `source_schema`, `description`, `created_at` and
`updated_at` — without the definition. Two optional filters:

| Parameter | Use |
|---|---|
| `source_schema` | Only the templates of this `source_schema`. |
| `kind` | Only `request` or only `view`. |

`?source_schema=registro.v1&kind=view` is **how a frontend discovers the
views** of a schema. There is no default view: the reader chooses.

`DELETE /v1/render-templates/{name}` answers `200` with `{"ok": true}`,
or `404`. With a subscription using the template,
`409 render_template_in_use`, with the ids in the message: change their
specification first.

---

## Previewing a stored template

```
POST /v1/render-templates/mailing.v1/preview
```

```json
{"source_record": {"cliente": {"nome": " Ana ", "documento": "012.345"}, "telefones": [{"numero": "11 99999"}]}}
```

```json
{
  "kind": "view",
  "body": {"nome": "Ana", "documento": "012345", "telefones": [{"numero": "11 99999"}], "caso": "exemplo"},
  "case_id": "exemplo",
  "environment": "dev",
  "warnings": []
}
```

**Nothing is sent or stored.** The case is at most one of these:

| In the body | Case used |
|---|---|
| `case_id` (with `environment`) | That stored case. |
| `source_record` | A **synthetic** case, not stored: `case_id` `exemplo`, the token's automation, the given `environment` (default `dev`) and `status` `aberto`. |
| neither | The automation's most recent case with the template's `source_schema`. With no case, `404`. |

Both together are `400`. For a `request`, `connection_id` builds the full
URL and merges the connection headers, **redacted**; without it, `url`
carries only the rendered path. For a `view`, the response carries only
the body, and `connection_id` is refused. A rendering failure for the
chosen case is `400 invalid_render_template`, with the path that did not
resolve.

---

## Previewing a draft

```
POST /v1/render-templates/preview
```

```json
{
  "kind": "view",
  "source_schema": "registro.v1",
  "definition": {"nome": {"$from": "case.source_record.cliente.nome"}},
  "source_record": {"cliente": {"nome": "Ana"}}
}
```

It is a template editor's loop: the same validation as registration, the
rendering as in a stored preview, plus `inputs`, `envelope_paths` and
`schema_warnings` (the warnings the `PUT` would return). **Nothing is
stored.**

---

## Rendered reads

`GET /v1/cases` and `GET /v1/cases/{environment}/{automation}/{case_id}`
accept `render_template=<name>`, and return `rendered` on each case:

```
GET /v1/cases?source_schema=registro.v1&render_template=mailing.v1
```

```json
{
  "items": [
    {
      "case_id": "c-1",
      "status": "aberto",
      "rendered": {"body": {"nome": "Ana", "documento": "012345", "telefones": [], "caso": "c-1"}, "warnings": [], "error": null}
    }
  ]
}
```

- For a `view`, `rendered` carries `body`, `warnings` and `error`. For a
  `request`, the [preview](entregas.md) shape: `method`, `url`, `query`,
  `headers` (redacted), `body`, `warnings` and `error`, with
  `render_connection=<id>` for a full URL.
- A rendering failure of **one** case comes in `rendered.error`: the other
  items follow, and the single-case lookup stays `200`.
- `render_template` does not combine with `render_with`, and has the same
  page ceiling.
- **No projection**: the reader already sees its own automation's whole
  `source_record`.
- Without the parameter, the response is the usual one, without the
  `rendered` key.

---

## In a subscription

A subscription can point `template` at a registered template, instead of
`request_spec`. The kind follows the subscription:

| Subscription | Template | What is delivered |
|---|---|---|
| With `connection_id` | `request` | The request the template builds, through the connection — like a `request_spec`. |
| Without `connection_id` | `view` | The classic payload (`event`, `delivered_at`, `case`), with the `source_record` **replaced by what the view builds**, and the HMAC signature over those bytes. |

```json
{"url": "https://parceiro.exemplo.com/hook", "template": "mailing.v1"}
```

- `template` and `request_spec` are exclusive. Switching one for the other
  is a single `PATCH`: `{"template": "mailing.v1", "request_spec": null}`;
  `{"template": null}` goes back.
- The subscription's projection (`fields`) trims the record **before** the
  view: a template does not get around the projection.
- A view on the classic webhook needs `include_source: true` and a literal
  object at its root — it goes in place of the `source_record`, which is
  an object. If rendering fails for a case, the delivery ends `abandoned`,
  with the reason, and is not retried.
- `/webhooks/{id}/preview` and `render_with` render through the
  subscription's template.
- A subscription without `template` answers and delivers exactly as
  before — including no `template` key in the response.

See [Webhooks](webhooks.md) and [Delivering to other APIs](entregas.md).

---

## Errors

| Code | HTTP | When |
|---|:---:|---|
| `invalid_render_template_name` | 400 | The name breaks the pattern. |
| `invalid_render_template` | 400 | The definition breaks the grammar or the profile; or rendering failed in the preview. |
| `invalid_request` | 400 | `case_id` and `source_record` together, `connection_id` on a `view`, `render_with` with `render_template`, a kind that does not match the subscription. |
| `render_template_not_found` | 404 | No template with that name in the token's automation. |
| `render_template_in_use` | 409 | Removing, or changing the `kind`, while a subscription uses it. |
