# Endpoints

O contrato v1 tem **quatro rotas de negócio** e duas de saúde. Todas as
rotas de negócio vivem sob `/v1` e exigem autenticação; `/health` e
`/ready` nunca exigem.

| Método | Rota | O que faz |
|---|---|---|
| `PUT` | `/v1/cases/{environment}/{automation}/{case_id}` | Cria ou atualiza um caso. |
| `POST` | `/v1/cases/batch` | Cria ou atualiza vários casos. |
| `GET` | `/v1/cases/{environment}/{automation}/{case_id}` | Consulta um caso. |
| `GET` | `/v1/cases` | Lista e conta casos. |
| `GET` | `/health` | Liveness — não toca o banco. |
| `GET` | `/ready` | Readiness — `SELECT 1`, responde 503 se o banco caiu. |

---

## `PUT` — upsert de um caso

```
PUT /v1/cases/{environment}/{automation}/{case_id}
```

Idempotente: repetir o mesmo payload deixa o mesmo estado.

**Corpo**

| Campo | Tipo | Obrigatório | Observação |
|---|---|:---:|---|
| `status` | enum | ✅ | `aberto`, `em_andamento`, `concluido`, `falhou`, `pausado`. |
| `started_at` | datetime | ✅ | **Precisa de timezone.** |
| `finished_at` | datetime | — | |
| `batch_ref` | string | — | Referência livre do lote de origem. |
| `source_schema` | string | — | Versão do formato do `source_record`. |
| `source_record` | objeto | — | JSON livre com o dado da automação. |
| `temporal_workflow_id` | string | — | Correlação, sem chave estrangeira. |
| `temporal_run_id` | string | — | Correlação, sem chave estrangeira. |

**Resposta** `200` — `{"created": true}` na primeira vez, `false` nas
seguintes.

!!! warning "Campo desconhecido é erro, não é ignorado"
    O contrato é estrito (`extra='forbid'`). Um campo digitado errado
    responde 400 em vez de ser silenciosamente descartado — o que
    transforma um erro de integração difícil de achar em uma falha
    imediata e explícita.

!!! tip "Omitir ≠ limpar"
    Omitir `source_record` mantém o que já estava gravado. Enviar
    `source_record: {}` limpa. Vale igual para `source_schema` e para os
    campos `temporal_*`.

---

## `POST` — upsert em lote

```
POST /v1/cases/batch
```

**Corpo**

| Campo | Tipo | Obrigatório | Observação |
|---|---|:---:|---|
| `environment` | enum | ✅ | Vale para todos os itens. |
| `automation` | string | ✅ | Vale para todos os itens. |
| `source_schema` | string | — | Default do lote; cada item pode sobrescrever. |
| `cases` | lista | ✅ | 1 a `CASEHUB_MAX_BATCH_ITEMS` itens (default 1000). |

Cada item aceita os mesmos campos do `PUT`, mais `case_id` — que aqui é
**opcional**.

**Resposta** `200`

```json
{
  "upserted": 2,
  "errors": [
    {"case_id": "b", "code": "invalid_request"}
  ]
}
```

!!! danger "200 não significa que tudo foi gravado"
    O lote é tudo-ou-nada **por item**: um item inválido entra em
    `errors[]` e os demais são gravados. O status continua 200. Uma
    integração que só checa o código HTTP vai perder falhas
    silenciosamente — **leia `errors[]`**.

`errors[]` traz apenas `case_id` e `code`, nunca o conteúdo do
registro. É deliberado: `source_record` pode carregar dado sensível, e
mensagens de erro tendem a acabar em log.

!!! warning "Lote vazio e lote grande demais são 400"
    Lote vazio é erro do chamador, não um no-op que responde 200 sem ter
    feito nada. Acima do teto, a mensagem do 400 informa o limite
    efetivo do ambiente — que é configurável, então não vale assumir
    1000 fixo.

---

## `GET` — consultar um caso

```
GET /v1/cases/{environment}/{automation}/{case_id}
```

**Resposta** `200` com o caso completo, `source_record` incluído.
`404 case_not_found` se não existir.

---

## `GET` — listar e contar

```
GET /v1/cases
```

**Filtros fixos**

| Parâmetro | Observação |
|---|---|
| `environment` | |
| `automation` | Em OIDC, o token já restringe — ver abaixo. |
| `status` | |
| `batch_ref` | |
| `source_schema` | |
| `started_from` / `started_to` | Janela sobre `started_at`. |
| `page` | Default 1. |
| `page_size` | Default 50, máximo 500. |
| `include` | `include=source_record` para trazer o JSON. |

**Filtros dinâmicos sobre `source_record`**

Qualquer parâmetro prefixado com `f.` vira um filtro sobre o caminho
correspondente dentro do JSON:

```
GET /v1/cases?f.referencia=REF-12345&f.uf=SP
```

A comparação é **em texto**, então `f.valor=10` casa com o JSON tendo
número ou string — sem ambiguidade de tipo na query string.

!!! note "Teto de filtros"
    Cada `f.` vira um predicado no `WHERE`. Acima de
    `CASEHUB_MAX_SOURCE_FILTERS` (default 20) a resposta é 400 — melhor
    que uma consulta arbitrariamente cara sem explicação.

!!! tip "`source_record` não vem por padrão na listagem"
    Só com `include=source_record`. Uma listagem de 500 casos com o JSON
    completo de cada um é um payload grande e raramente é o que se quer.

**Autorização na listagem** — um cliente OIDC não consegue ver outras
automações simplesmente omitindo o filtro: o claim do token **é** o
filtro quando ele não é informado, e um filtro explícito divergente
responde 403.

---

## `/health` e `/ready`

| Rota | Toca o banco | Uso |
|---|:---:|---|
| `/health` | ❌ | Liveness probe. Responde enquanto o processo estiver de pé. |
| `/ready` | ✅ | Readiness probe. `503` se o banco estiver inacessível. |

Usar `/health` como readiness é um erro comum: o processo pode estar de
pé com o banco fora, e o balanceador continuaria mandando tráfego.
