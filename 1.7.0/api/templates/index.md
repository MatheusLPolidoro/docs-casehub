# Templates de montagem

Desde a API 0.10.0. O motor que monta a requisição de uma
[entrega para outra API](entregas.md) passa a ter **cadastro próprio**,
fora de qualquer assinatura de webhook. Um template guardado por nome
serve a toda saída de caso:

- às **leituras** — `GET /v1/cases` e a consulta de um caso —, que é
  como um frontend lê o mesmo caso em visões diferentes;
- à **assinatura com conexão**, no lugar do `request_spec` inline;
- ao **webhook clássico**, onde a visão sai no lugar do `source_record`.

Há dois tipos, com o mesmo motor e as mesmas diretivas:

| `kind` | O que é | Onde vale |
|---|---|---|
| `request` | A requisição inteira — `method`, `path`, `query`, `headers`, `body` —, exatamente a gramática do [`request_spec`](entregas.md). É o padrão de **entrega**. | Leituras e assinatura com `connection_id`. |
| `view` | Um nó só: o corpo, montado a partir do caso. É uma **visão** do `source_record`: transforma o registro na saída, e **nada gravado muda**. | Leituras e webhook clássico (sem `connection_id`). |

| Método | Rota | O que faz |
|---|---|---|
| `PUT` | `/v1/render-templates/{name}` | Cadastra ou substitui o template. |
| `GET` | `/v1/render-templates` | Lista os templates da automação do token. |
| `GET` | `/v1/render-templates/{name}` | Consulta o template, com os campos que ele lê e quem o usa. |
| `DELETE` | `/v1/render-templates/{name}` | Remove o template. Recusado se alguma assinatura o usa. |
| `POST` | `/v1/render-templates/{name}/preview` | Monta o template contra um caso, sem enviar nada. |
| `POST` | `/v1/render-templates/preview` | Valida e monta um rascunho, sem gravar nada. |

O `name` segue a regra dos [schemas do registro](schemas.md): letras,
dígitos, `.`, `_` e `-`, começando por letra ou dígito, até 200
caracteres. Fora disso, `400 invalid_render_template_name`. O template é
da automação do token; o de outra automação responde `404`, nunca `403`.

---

## Cadastrar

```
PUT /v1/render-templates/mailing.v1
```

```json
{
  "kind": "view",
  "source_schema": "registro.v1",
  "description": "Cliente para a tela de atendimento",
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

**Resposta** `200` — a mesma vista da consulta, mais `created` (`true`
quando não havia template com esse nome) e `warnings`. Substituir é sempre
aceito.

- **A ordem das chaves é guardada como foi enviada**, e a montagem sai
  nessa ordem também no Postgres. (O `request_spec` inline de uma
  assinatura não garante isso: ele mora numa coluna que reordena as
  chaves.)
- **Um `view` só enxerga `case.*` e `now.*`**, além do apelido de um
  `$each`. `delivery.*`, `subscription.*`, `event` e `delivered_at` não
  existem fora de uma entrega, e são recusados no cadastro com
  `400 invalid_render_template`, apontando o caminho.
- `$secret` não existe em template nenhum.
- A definição é validada como o `request_spec`: a mesma mensagem, com o
  código `invalid_render_template`.

!!! warning "A referência é viva"
    As assinaturas que usam o template passam a montar pela definição nova
    **na próxima entrega**. Antes de regravar um template em uso, confira
    o rascunho na [prévia](#previa-de-um-rascunho) e o resultado em volume
    com [`render_template`](#leituras-montadas). `used_by` diz quem será
    afetado. Mudar o `kind` de um template em uso responde
    `409 render_template_in_use`.

---

## Consultar: `inputs` e `used_by`

```
GET /v1/render-templates/mailing.v1
```

```json
{
  "name": "mailing.v1",
  "kind": "view",
  "source_schema": "registro.v1",
  "description": "Cliente para a tela de atendimento",
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

`inputs` traz cada caminho do `source_record` que o template lê, na ordem
da primeira aparição, **no mesmo formato do `fields`** de um
[schema](schemas.md#consultar-e-a-lista-fields) — um frontend cruza os
dois sem interpretar a gramática do template:

| Campo | Significado |
|---|---|
| `path`, `segments` | O caminho, em texto e como lista (`null` para cada item de lista). Um índice (`telefones.0.numero`) casa com o item da lista do schema. |
| `required` | Algum uso do caminho declara `$required`. |
| `schema_type` | O tipo no schema cadastrado para o `source_schema` do template; `null` sem schema ou fora dele. |
| `in_schema` | Se o schema declara o caminho; `null` quando não há schema para comparar. |

`envelope_paths` lista os outros caminhos lidos (`case.case_id`,
`now.iso`), como escritos. `used_by` lista os ids das assinaturas que
montam por ele.

**Alertas do cadastro**, em `warnings` — nunca recusam:

| Código | Quando |
|---|---|
| `unknown_path` | O template lê um caminho que o schema não declara. Traz `path` e `segments`. |
| `schema_not_found` | O `source_schema` do template não tem schema cadastrado. |

!!! tip "Template antes do schema é um fluxo válido"
    O `source_schema` do template é só rótulo. Cadastre o schema depois, e
    a próxima consulta do template já confere os caminhos contra ele.

---

## Listar e remover

`GET /v1/render-templates` devolve `{"items": [...]}`, em ordem de nome,
com `name`, `kind`, `source_schema`, `description`, `created_at` e
`updated_at` — sem a definição. Dois filtros opcionais:

| Parâmetro | Uso |
|---|---|
| `source_schema` | Só os templates deste `source_schema`. |
| `kind` | Só `request` ou só `view`. |

`?source_schema=registro.v1&kind=view` é **como um frontend descobre as
visões** de um schema. Não existe visão padrão: quem lê escolhe.

`DELETE /v1/render-templates/{name}` responde `200` com `{"ok": true}`,
ou `404`. Com assinatura usando o template, `409 render_template_in_use`,
com os ids na mensagem: troque a especificação delas antes.

---

## Prévia de um template gravado

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

**Nada é enviado nem gravado.** O caso é, no máximo um destes:

| No corpo | Caso usado |
|---|---|
| `case_id` (com `environment`) | Aquele caso gravado. |
| `source_record` | Um caso **sintético**, não gravado: `case_id` `exemplo`, a automação do token, o `environment` informado (padrão `dev`) e `status` `aberto`. |
| nenhum dos dois | O caso mais recente da automação com o `source_schema` do template. Sem caso, `404`. |

Os dois juntos são `400`. Num `request`, `connection_id` monta a URL
completa e mescla os headers da conexão, **redigidos**; sem ele, `url`
traz só o caminho montado. Num `view`, a resposta traz só o corpo, e
`connection_id` é recusado. Falha de montagem para o caso escolhido é
`400 invalid_render_template`, com o caminho que não resolveu.

---

## Prévia de um rascunho

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

É o laço de um editor de templates: a mesma validação do cadastro, a
montagem como na prévia de um gravado, e mais `inputs`, `envelope_paths` e
`schema_warnings` (os alertas que o `PUT` devolveria). **Nada é gravado.**

---

## Leituras montadas

`GET /v1/cases` e `GET /v1/cases/{environment}/{automation}/{case_id}`
aceitam `render_template=<nome>`, e devolvem em cada caso `rendered`:

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

- Num `view`, `rendered` traz `body`, `warnings` e `error`. Num `request`,
  a forma da [pré-visualização](entregas.md): `method`, `url`, `query`,
  `headers` (redigidos), `body`, `warnings` e `error`, com
  `render_connection=<id>` para a URL sair completa.
- Falha de montagem de **um** caso vem em `rendered.error`: os outros itens
  seguem, e a consulta de um caso continua `200`.
- `render_template` não se combina com `render_with`, e tem o mesmo teto de
  página.
- **Sem projeção**: quem lê já enxerga o `source_record` inteiro da própria
  automação.
- Sem o parâmetro, a resposta é a de sempre, sem a chave `rendered`.

---

## Em uma assinatura

Uma assinatura pode apontar `template` para um template cadastrado, no
lugar de `request_spec`. O tipo segue a assinatura:

| Assinatura | Template | O que é entregue |
|---|---|---|
| Com `connection_id` | `request` | A requisição que o template monta, pela conexão — como um `request_spec`. |
| Sem `connection_id` | `view` | O payload clássico (`event`, `delivered_at`, `case`), com o `source_record` **trocado pelo que a visão monta**, e a assinatura HMAC sobre esses bytes. |

```json
{"url": "https://parceiro.exemplo.com/hook", "template": "mailing.v1"}
```

- `template` e `request_spec` são exclusivos. Trocar um pelo outro é um
  `PATCH` só: `{"template": "mailing.v1", "request_spec": null}`;
  `{"template": null}` volta ao que era.
- A projeção da assinatura (`fields`) recorta o registro **antes** da
  visão: template não fura a projeção.
- Uma visão no webhook clássico precisa de `include_source: true` e de um
  objeto literal na raiz — ela vai no lugar do `source_record`, que é
  objeto. Se a montagem falhar para um caso, a entrega termina `abandoned`,
  com o motivo, sem nova tentativa.
- `/webhooks/{id}/preview` e `render_with` montam pelo template da
  assinatura.
- Assinatura sem `template` responde e entrega exatamente como antes —
  inclusive sem a chave `template` na resposta.

Ver [Webhooks](webhooks.md) e [Entregas para outras APIs](entregas.md).

---

## Erros

| Código | HTTP | Quando |
|---|:---:|---|
| `invalid_render_template_name` | 400 | O nome foge do padrão. |
| `invalid_render_template` | 400 | A definição foge da gramática ou do perfil; ou a montagem falhou na prévia. |
| `invalid_request` | 400 | `case_id` e `source_record` juntos, `connection_id` num `view`, `render_with` com `render_template`, tipo que não combina com a assinatura. |
| `render_template_not_found` | 404 | Não há template com esse nome na automação do token. |
| `render_template_in_use` | 409 | Remover, ou mudar o `kind`, com assinatura usando. |
