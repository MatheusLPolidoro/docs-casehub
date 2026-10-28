# Errors

Every API error comes out in the same envelope. That holds for unexpected
failures too — an internal bug does not escape in another format.

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Payload inválido para o contrato v1.",
    "details": []
  }
}
```

## Codes

| Code | HTTP | When |
|---|:---:|---|
| `unauthorized` | 401 | Credential missing, invalid or expired. |
| `forbidden` | 403 | Authenticated, but the token's automation does not match the call's. |
| `invalid_request` | 400 | Payload outside the contract, batch empty or too large, too many filters, malformed webhook condition. |
| `invalid_source_record` | 400 | `source_record` is not a JSON object, or carries the null character (`U+0000`). |
| `source_record_too_large` | 413 | Above `CASEHUB_MAX_SOURCE_RECORD_BYTES`. |
| `case_not_found` | 404 | The case does not exist. |
| `status_conflict` | 409 | The `PATCH`'s `expected_status` does not match the current state — and nothing was written. |
| `invalid_webhook_url` | 400 | The subscription `url` is not an absolute `http(s)` URL; or `null` came in a `PATCH`. |
| `invalid_request_spec` | 400 | The request specification is malformed: unknown directive, invalid path, a regular expression that does not compile, or one of the ceilings exceeded. |
| `invalid_connection_config` | 400 | The delivery connection does not fit the declared mode: required field missing, `base_url` without `https` or pointing at an internal address, duplicate name within the automation. |
| `connection_not_found` | 404 | The connection does not exist, or belongs to another automation. |
| `connection_in_use` | 409 | A subscription points at the connection — it is not removed, and nothing was changed. |
| `webhook_not_found` | 404 | The subscription (or the delivery) does not exist, or belongs to another automation. |
| `attachment_not_found` | 404 | The case has no attachment by that name. |
| `invalid_attachment_name` | 400 | The attachment name strays from `[A-Za-z0-9][A-Za-z0-9._-]*` or is longer than 200 characters. |
| `unsupported_attachment_type` | 415 | The attachment type is not accepted by the service, or the content lacks the signature of the declared type. |
| `attachment_too_large` | 413 | The attachment is over the size limit (25 MB by default). |
| `checksum_mismatch` | 400 | The received content does not match the `X-Content-SHA256` sent. Nothing was stored. |
| `attachment_limit_exceeded` | 507 | The case already holds the maximum number of attachments (50 by default) and the name is new. |
| `attachment_quota_exceeded` | 507 | Storing it would exceed the automation's attachment space quota in that environment. |
| `attachment_store_unavailable` | 503 | The attachment storage is down or switched off in this environment. Comes with `Retry-After`; try again after that time. |
| `internal_error` | 500 | Unexpected service failure. |

!!! note "409 shows up in two places, with different meanings"
    On a case `PATCH` it is `status_conflict`: another process wrote
    first, and your conditional change did not happen. On a webhook
    delivery redrive it is a delivery still `pending` or already
    delivered (`succeeded`) — the guard that keeps an accidental resend
    from becoming a duplicate. See
    [Webhooks](webhooks.md#re-sending-a-delivery-redrive).

!!! note "507 is an attachment limit, not the server running out of disk"
    `attachment_limit_exceeded` and `attachment_quota_exceeded` say that
    **your** automation reached its own limit. Retrying does not help: you
    need to remove attachments (or wait for their term) before storing
    others.

!!! note "Payload validation is a 400, not a 422"
    FastAPI would use 422 by default; the contract converts it to 400 with
    `details[]` describing each field. A client that treats 422 as a special
    case is handling something that does not happen.

## `details[]`

Filled in on payload validation errors, one entry per field:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Payload inválido para o contrato v1.",
    "details": [
      {
        "loc": ["body", "status"],
        "msg": "Input should be 'aberto', 'em_andamento', ...",
        "type": "enum"
      }
    ]
  }
}
```

On the other codes it comes empty.

## Internal error

!!! danger "A 500 response never carries the detail of the failure"
    The message is always generic (`"Erro interno do serviço."`). The
    traceback goes only to the log, correlated by `trace_id`/`span_id`.

    That is deliberate: the original exception may carry a connection
    string, a fragment of SQL or the content of `source_record` — and an
    error response is precisely where that kind of leak goes unnoticed.

If you need to investigate a 500, the path is the service log/trace, not the
response body.

## Per-item errors, in a batch

`POST /v1/cases/batch` is the only place where an error does **not** become
an error response. An invalid item lands in `errors[]` and the batch
continues:

```json
{
  "upserted": 2,
  "errors": [
    {"case_id": "b", "code": "invalid_request"},
    {"case_id": "c", "code": "source_record_too_large"}
  ]
}
```

The status is 200.

!!! danger "It is the most common integration mistake"
    An automation that only checks `status_code == 200` considers the whole
    batch published and moves on — while cases were discarded. **Always
    inspect `errors[]`.**

    Note too that `errors[]` carries only `case_id` and `code`, never the
    record that failed: `source_record` may hold sensitive data, and error
    messages end up in logs.

## On the SDK side

The SDK normalizes all of this into exceptions. See
[Synchronous client](../sdk/cliente.md#error-handling).

| Exception | Origin |
|---|---|
| `APIHTTPError` | The API answered with an error status. Exposes `status_code` and `message` as attributes. |
| `APIConnectionError` | The API could not be reached. |
| `APITimeoutError` | The API did not answer in time. |
| `OidcTokenError` | Failure obtaining the token from the configured `token_url`. |
| `APIUnexpectedError` | Anything else. |
