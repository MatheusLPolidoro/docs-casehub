# Erros

Todo erro da API sai no mesmo envelope. Isso vale inclusive para falhas
inesperadas — um bug interno não escapa em outro formato.

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Payload inválido para o contrato v1.",
    "details": []
  }
}
```

## Códigos

| Código | HTTP | Quando |
|---|:---:|---|
| `unauthorized` | 401 | Credencial ausente, inválida ou expirada. |
| `forbidden` | 403 | Autenticado, mas a automação do token não bate com a da chamada. |
| `invalid_request` | 400 | Payload fora do contrato, lote vazio/grande demais, filtros demais, condição de webhook malformada. |
| `invalid_source_record` | 400 | `source_record` não é objeto JSON, ou carrega o caractere nulo (`U+0000`). |
| `source_record_too_large` | 413 | Acima de `CASEHUB_MAX_SOURCE_RECORD_BYTES`. |
| `case_not_found` | 404 | O caso não existe. |
| `status_conflict` | 409 | O `expected_status` do `PATCH` não bate com o estado atual — e nada foi escrito. |
| `invalid_webhook_url` | 400 | A `url` da assinatura não é `http(s)` absoluta; ou veio `null` num `PATCH`. |
| `webhook_not_found` | 404 | A assinatura (ou a entrega) não existe, ou é de outra automação. |
| `internal_error` | 500 | Falha inesperada do serviço. |

!!! note "409 aparece em dois lugares, com sentidos diferentes"
    No `PATCH` de caso é `status_conflict`: outro processo escreveu
    primeiro, e a sua troca condicional não aconteceu. No redrive de uma
    entrega de webhook é uma entrega que ainda está `pending` ou já
    chegou (`succeeded`) — a guarda que impede um reenvio por engano de
    virar duplicata. Ver [Webhooks](webhooks.md#reenviar-uma-entrega-redrive).

!!! note "Validação de payload é 400, não 422"
    O FastAPI usaria 422 por padrão; o contrato converte para 400 com
    `details[]` descrevendo cada campo. Um cliente que trate 422 como
    caso especial está tratando algo que não acontece.

## `details[]`

Preenchido em erros de validação de payload, com uma entrada por campo:

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

Nos demais códigos vem vazio.

## Erro interno

!!! danger "A resposta de 500 nunca carrega o detalhe da falha"
    A mensagem é sempre genérica (`"Erro interno do serviço."`). O
    traceback vai apenas para o log, correlacionado por
    `trace_id`/`span_id`.

    É deliberado: a exceção original pode carregar string de conexão,
    fragmento de SQL ou conteúdo de `source_record` — e resposta de erro
    é justamente o lugar onde esse tipo de vazamento passa despercebido.

Se você precisa investigar um 500, o caminho é o log/trace do serviço,
não o corpo da resposta.

## Erro por item, no lote

`POST /v1/cases/batch` é o único lugar onde um erro **não** vira uma
resposta de erro. Item inválido entra em `errors[]` e o lote continua:

```json
{
  "upserted": 2,
  "errors": [
    {"case_id": "b", "code": "invalid_request"},
    {"case_id": "c", "code": "source_record_too_large"}
  ]
}
```

O status é 200.

!!! danger "É o erro de integração mais comum"
    Uma automação que só checa `status_code == 200` considera o lote
    inteiro publicado e segue em frente — enquanto casos foram
    descartados. **Sempre inspecione `errors[]`.**

    Repare também que `errors[]` traz apenas `case_id` e `code`, nunca o
    registro que falhou: `source_record` pode ter dado sensível, e
    mensagens de erro acabam em log.

## Do lado do SDK

O SDK normaliza tudo isso em exceções. Ver
[Cliente síncrono](../sdk/cliente.md#tratamento-de-erro).

| Exceção | Origem |
|---|---|
| `APIHTTPError` | A API respondeu com status de erro. Expõe `status_code` e `message` como atributos. |
| `APIConnectionError` | Não foi possível alcançar a API. |
| `APITimeoutError` | A API não respondeu no tempo. |
| `OidcTokenError` | Falha ao obter o token no `token_url` configurado. |
| `APIUnexpectedError` | Qualquer outra coisa. |
