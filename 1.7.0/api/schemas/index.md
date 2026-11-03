# Schemas do registro

Desde a API 0.9.0. O `source_schema` de um caso continua sendo um rótulo
livre, mas cada automação pode **cadastrar a estrutura** do
`source_record` de cada `source_schema` que publica — as chaves, os tipos e
as listas. Isso serve a duas coisas:

- um frontend consulta a estrutura para desenhar a tela, sem adivinhar
  chave nem tipo;
- a gravação de caso avisa quando o registro não segue o que foi
  declarado.

**Nada é recusado por causa de schema.** Um caso fora do schema é gravado
como sempre foi; a resposta só passa a trazer os alertas. Sem schema
cadastrado, nada muda.

| Método | Rota | O que faz |
|---|---|---|
| `PUT` | `/v1/source-schemas/{name}` | Cadastra ou substitui o schema. |
| `GET` | `/v1/source-schemas` | Lista os schemas da automação do token. |
| `GET` | `/v1/source-schemas/{name}` | Consulta o schema, com a lista plana `fields`. |
| `DELETE` | `/v1/source-schemas/{name}` | Remove o schema. Nenhum caso muda. |
| `GET` | `/v1/source-schemas/{name}/inferred` | Deduz o schema dos casos gravados. |
| `POST` | `/v1/source-schemas/{name}/validate` | Confere um registro contra o schema, sem gravar. |

O `name` é o mesmo texto que os casos levam em `source_schema`: letras,
dígitos, `.`, `_` e `-`, começando por letra ou dígito, até 200
caracteres. Fora disso, `400 invalid_source_schema_name`. O schema é da
automação do token — a mesma `name` em duas automações são dois schemas — e
vale nos três ambientes: o nome já carrega a versão (`registro.v1`).

---

## Cadastrar

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

**Resposta** `200` — a mesma vista da consulta, mais `created` (`true`
quando não havia schema com esse nome) e `warnings` (as mudanças
incompatíveis em relação ao anterior; vazia na criação). Repetir o mesmo
corpo deixa o mesmo estado.

**O formato** é um subconjunto de JSON Schema 2020-12, com o mesmo
significado de lá:

| Palavra-chave | Onde vale | Significado |
|---|---|---|
| `type` | todo nó (obrigatória) | Um tipo, ou uma lista sem repetição: `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`. |
| `properties` | tipo com `object` | As chaves esperadas, cada uma com o próprio nó. |
| `required` | tipo com `object` | As chaves de `properties` que precisam estar presentes. |
| `additionalProperties` | tipo com `object` | `false` faz chave fora de `properties` virar alerta. Padrão `true`. |
| `items` | tipo com `array` | O nó que descreve todo item da lista. |
| `title`, `description` | todo nó | Texto para a tela (até 200 e 2000 caracteres). |

A raiz é sempre `object`. O schema tem no máximo 32 níveis, 5000 nós e
512 KB.

!!! warning "Palavra-chave fora do subconjunto é recusada, não ignorada"
    `$ref`, `enum`, `pattern`, `format`, `oneOf` e as demais respondem
    `400 invalid_source_schema`, numa mensagem que aponta onde está o
    problema (`schema inválido em /properties/itens/items: ...`).
    Ignoradas, elas dariam a impressão de que são conferidas.

---

## Consultar e a lista `fields`

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

`schema` volta como foi cadastrado, **na ordem da declaração** — é a
ordem em que a tela mostra os campos. `fields` é a mesma estrutura
achatada, uma entrada por chave declarada e por `items`, em qualquer
nível, nessa mesma ordem:

| Campo | Significado |
|---|---|
| `path` | O caminho em texto, com `.` entre chaves e `[]` para cada item de lista. |
| `segments` | O mesmo caminho como lista, com `null` no lugar de cada item de lista. |
| `type` | Os tipos, **sempre como lista**, mesmo com um só. |
| `required` | Se a chave consta em `required` do objeto pai (`false` para item de lista). |
| `title`, `description` | Os declarados, ou `null`. |

!!! tip "`segments` existe porque chave pode ter ponto"
    Registro vindo de planilha ou de arquivo de largura fixa tem chave
    como `DT.ULT.ALT.`, que nenhum caminho em texto separa sem escape.
    `segments` não tem ambiguidade: use `path` para mostrar e `segments`
    para navegar.

Sem schema com esse nome, `404 source_schema_not_found` — e a
[inferência](#inferir-dos-casos-gravados) responde mesmo assim.

---

## Listar e remover

`GET /v1/source-schemas` devolve `{"items": [...]}`, um item por schema da
automação do token, em ordem de nome, com `name`, `title` e `description`
da raiz (ou `null`), `created_at` e `updated_at`. O schema inteiro sai na
consulta de cada um.

`DELETE /v1/source-schemas/{name}` responde `200` com `{"ok": true}`, ou
`404`. Nenhum caso muda; a gravação deixa de ser conferida.

---

## Alerta ao trocar um schema

Regravar um schema é sempre aceito. Quando a troca pode deixar de aceitar
dado que o anterior aceitava — ou tira do frontend um campo que ele
conhecia —, `warnings` lista cada mudança:

| Código | Quando |
|---|---|
| `removed` | Uma chave de `properties` do anterior não existe no novo. |
| `type_narrowed` | Um caminho deixou de aceitar algum tipo; traz `before` e `after`. |
| `now_required` | Uma chave passou a constar em `required`. |
| `closed` | Um objeto passou a ter `additionalProperties: false`. |

```json
{"code": "type_narrowed", "path": "origem", "segments": ["origem"], "before": ["string", "null"], "after": ["string"]}
```

Chave nova opcional, tipo ampliado e chave que deixa de ser obrigatória
não alertam. `integer` para `number` é ampliação; `number` para
`integer`, restrição.

---

## Conferência na gravação

Quando o `PUT` de caso — ou um item gravado do lote — traz
`source_schema` e `source_record`, e a automação cadastrou um schema com
esse nome, o registro **gravado** é conferido: com
`on_conflict: "merge"`, o fundido. A resposta ganha `schema_check`:

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

!!! warning "Nada é recusado"
    O caso é gravado, o status é `200` e os campos de antes não mudam.
    Sem schema cadastrado, sem `source_schema` ou sem `source_record` na
    requisição, `schema_check` não aparece e a resposta é a de antes,
    byte por byte.

| Alerta | Quando |
|---|---|
| `type_mismatch` | O tipo do valor não está entre os declarados. Traz `expected` e `received`. |
| `missing_required` | Uma chave de `required` falta no objeto. |
| `unexpected_key` | Chave fora de `properties` num objeto com `additionalProperties: false`. |

- Número sem parte fracionária satisfaz `integer`; todo número satisfaz
  `number`; booleano **nunca** é número.
- Chave obrigatória presente com `null` não falta: o que se confere nela
  é o tipo.
- Os alertas são **agregados por caminho**: itens de uma lista com o mesmo
  problema viram um alerta só, com `count`. **Nenhum alerta traz valor do
  registro** — só caminho e tipos.
- No máximo 100 alertas distintos; passando disso, `truncated: true`.

**No lote**, `schema_check` agrega todos os itens conferidos:

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

`nonconforming` traz os `case_id` fora do schema; cada alerta traz
`count` (ocorrências) e `cases` (itens afetados). Item com erro ou pulado
(`skip`) não é conferido.

!!! note "O schema é lido antes de gravar"
    Uma consulta por requisição, ou uma por lote. Se ela falhar, nada é
    gravado. O custo medido da conferência num lote de 1000 itens foi de
    4% a 9%.

---

## Inferir dos casos gravados

```
GET /v1/source-schemas/registro.v1/inferred?sample_size=100
```

Deduz o schema dos `source_record` dos casos da automação do token com
esse `source_schema`. **Não grava nada** e responde mesmo sem cadastro — é
a resposta para "qual é a estrutura deste registro?" quando ninguém a
declarou, e o ponto de partida do cadastro.

| Parâmetro | Observação |
|---|---|
| `sample_size` | Quantos casos ler, dos atualizados mais recentemente. Padrão 100, máximo 500. |
| `environment` | Opcional: restringe a amostra a um ambiente. |

```json
{"name": "registro.v1", "sample_size": 100, "schema": {...}, "fields": [...], "truncated": false}
```

- Todo tipo visto num caminho entra na lista dele; número é sempre
  `number`.
- `required` traz só as chaves presentes em **todos** os objetos vistos
  ali.
- As chaves saem em ordem alfabética, e lista sempre vazia fica sem
  `items`.
- Sem casos, `sample_size: 0` e `{"type": "object"}`.
- A leitura tem o orçamento de bytes da listagem: passando dele,
  `400 invalid_request` pedindo um `sample_size` menor.

!!! tip "O inferido serve de cadastro"
    O `schema` devolvido é aceito pelo `PUT` como está, e todo registro da
    amostra é conforme a ele. Ajuste o que quiser — títulos, tipos mais
    estritos, `required` — e cadastre.

---

## Validar sem gravar

```
POST /v1/source-schemas/registro.v1/validate
```

```json
{"source_record": {"referencia": "sete", "itens": []}}
```

Devolve `200` com a mesma conferência do `schema_check` do `PUT`, sem
gravar caso nenhum. Registro que não é objeto JSON é
`400 invalid_source_record`; acima do limite de escrita,
`413 source_record_too_large`.

---

## Erros

| Código | HTTP | Quando |
|---|:---:|---|
| `invalid_source_schema_name` | 400 | O nome foge do padrão. |
| `invalid_source_schema` | 400 | O schema foge do formato; a mensagem aponta o local. |
| `invalid_request` | 400 | Campo desconhecido no corpo, `sample_size` fora de 1–500, amostra acima do orçamento. |
| `source_schema_not_found` | 404 | Não há schema com esse nome na automação do token. |
