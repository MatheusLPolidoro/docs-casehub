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
| `invalid_request` | 400 | Payload outside the contract, batch empty or too large, too many filters. |
| `invalid_source_record` | 400 | `source_record` is not a JSON object. |
| `source_record_too_large` | 413 | Above `CASEHUB_MAX_SOURCE_RECORD_BYTES`. |
| `case_not_found` | 404 | The case does not exist. |
| `internal_error` | 500 | Unexpected service failure. |

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
| `APIHTTPError` | The API answered with an error status. Carries status and body. |
| `APIConnectionError` | The API could not be reached. |
| `APITimeoutError` | The API did not answer in time. |
| `OidcTokenError` | Failure obtaining the token from Keycloak. |
| `APIUnexpectedError` | Anything else. |
