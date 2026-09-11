# Endpoints

Todas as rotas de caso vivem sob `/v1` e exigem autenticação. `/health`,
`/ready` e `/v1/auth/*` nunca exigem — as de token são o caminho para
obter a credencial.

**Casos**

| Método | Rota | O que faz |
|---|---|---|
| `PUT` | `/v1/cases/{environment}/{automation}/{case_id}` | Cria ou atualiza um caso. |
| `PATCH` | `/v1/cases/{environment}/{automation}/{case_id}` | Troca só o status de um caso. |
| `POST` | `/v1/cases/batch` | Cria ou atualiza vários casos. |
| `GET` | `/v1/cases/{environment}/{automation}/{case_id}` | Consulta um caso. |
| `GET` | `/v1/cases` | Lista e conta casos. |

**Token, webhooks e saúde**

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/v1/auth/token` | Emite o token — repasse ao provedor de identidade. Ver [Autenticação](autenticacao.md). |
| `POST` | `/v1/auth/refresh` | Renova o token. |
| — | `/v1/webhooks*` | Sete rotas de assinatura e log de entregas. Ver [Webhooks](webhooks.md). |
| `GET` | `/health` | Liveness — não toca o banco. |
| `GET` | `/ready` | Readiness — `SELECT 1`, responde 503 se o banco caiu. |

!!! tip "Os paths no Swagger aparecem sem `/v1`"
    O prefixo é o `root_path` do FastAPI, e o `/docs` o oferece num
    seletor "Servers" no topo. As chamadas reais continuam usando
    `/v1/...`.

---

## `PUT` — upsert de um caso

```
PUT /v1/cases/{environment}/{automation}/{case_id}
```

Idempotente: repetir o mesmo payload deixa o mesmo estado.

**Corpo**

| Campo | Tipo | Obrigatório | Observação |
|---|---|:---:|---|
| `status` | enum | ✅ | `aberto`, `em_andamento`, `concluido`, `falhou`, `pausado`, `cancelado`. |
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

!!! warning "`source_record` precisa ser objeto JSON, e sem caractere nulo"
    Não-objeto é `400 invalid_source_record`; acima de
    `CASEHUB_MAX_SOURCE_RECORD_BYTES` é `413 source_record_too_large`.

    O caractere nulo (`U+0000`) em qualquer chave ou valor também é
    `400 invalid_source_record`: o Postgres o rejeita incondicionalmente
    em texto e JSONB. É comum em dado vindo de arquivo de largura fixa
    de mainframe, que às vezes carrega lixo binário — e no lote a recusa
    é **daquele item**, sem derrubar os demais.

---

## `PATCH` — trocar só o status

```
PATCH /v1/cases/{environment}/{automation}/{case_id}
```

Muda o `status` e mais nada. Existe porque o `PUT` e o lote exigem
`status` **e** `started_at`: quem só quer corrigir o estado teria que
ler o caso antes para reescrever o resto igual — duas chamadas, e uma
janela entre elas.

**Corpo**

| Campo | Tipo | Obrigatório | Observação |
|---|---|:---:|---|
| `status` | enum | ✅ | O novo estado. |
| `expected_status` | enum | — | Estado que você acredita que o caso tem agora. |

**Resposta** `200` — o caso já atualizado, sem `source_record`.

!!! tip "`expected_status` é o que torna seguro decidir a partir de uma leitura"
    Preenchido, a troca só acontece se o estado atual bater; se não
    bater, responde `409` e **não escreve nada**. Entre você ler o caso
    e mandar a mudança, outro processo pode ter mexido nele — sem essa
    checagem, você apagaria a decisão dele sem saber.

    Omitido, a troca é incondicional. Serve para correção manual, em que
    quem chama já sabe o que está fazendo.

| Situação | Resposta |
|---|---|
| Trocou | `200` com o caso |
| `expected_status` não bate | `409`, código `status_conflict` |
| Caso não existe | `404`, código `case_not_found` |

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
| `on_conflict` | enum | — | `update` (default) ou `skip`. O que fazer com um `case_id` que já existe. |
| `cases` | lista | ✅ | 1 a `CASEHUB_MAX_BATCH_ITEMS` itens (default 1000). |

Cada item aceita os mesmos campos do `PUT`, mais `case_id` — que aqui é
**opcional**.

**Resposta** `200`

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

| Campo | Significado |
|---|---|
| `upserted` | Itens efetivamente **gravados** — criados mais atualizados. O que foi pulado não entra: nada foi escrito. |
| `created` | Os `case_id` criados **nesta chamada**. É o que permite agir só sobre o que é novo — disparar um enriquecimento, por exemplo — sem uma consulta antes. Vem como lista, não contagem, porque a contagem não diz *quais*. |
| `skipped` | Quantos já existiam e foram deixados como estavam. Sempre `0` com `on_conflict=update`. |

!!! tip "`on_conflict=skip` para fontes relidas periodicamente"
    O upsert substitui os campos enviados, **sem merge**. Quem
    republica a mesma fonte a cada ciclo — uma tela de estoque relida
    de dez em dez minutos, por exemplo — regrava o caso inteiro toda
    vez e apaga o que outro processo tenha acrescentado depois, sem
    erro e sem log.

    `skip` não escreve **nada** no caso que já existe: nem `status`,
    nem `started_at`, nem `source_record`. Ele continua criando o que
    ainda não existe — é sobre conflito, não sobre inserção.

    Consequência a esperar: em regime estacionário `upserted` vai a
    `0` e `skipped` fica alto. Isso é sucesso, não falha — é por isso
    que os dois números vêm separados.

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
| `filter` / `ne` / `exists` / `not_exists` | Filtros sobre `source_record` — ver abaixo. |
| `batch_ref` | |
| `source_schema` | |
| `started_from` / `started_to` | Janela sobre `started_at` — a data do registro **na origem**. |
| `created_since` / `updated_since` | Cursor incremental: só o que foi criado / alterado a partir do instante. |
| `page` | Default 1. |
| `page_size` | Default 50, máximo 500. |
| `include` | Vazio ou `source_record`, para trazer o JSON. |

!!! tip "Consumo incremental: use o cursor, não pagine tudo"
    `created_since` e `updated_since` respondem *"o que mudou desde a
    última vez que olhei"*. Guarde o maior `created_at` (ou
    `updated_at`) que recebeu e mande-o na chamada seguinte.

    Não confunda com `started_from`: aquele filtra a data do registro
    **na origem**, que pode ser de anos atrás num caso criado hoje.

    Os dois respondem perguntas diferentes — `created_since` traz só
    caso novo; `updated_since` traz também mudança de estado.

    Quando um deles é usado, a listagem passa a ordenar pelo campo do
    cursor. Sem eles, a ordem continua sendo por `started_at`.

!!! danger "Releia uma janela de alguns segundos para trás"
    Uma linha carimbada antes pode ser **gravada** depois: a transação
    que a criou pode demorar a concluir, e ela apareceria atrás de um
    cursor que você já passou. Se você avançar o cursor até o último
    instante recebido, essa linha nunca mais é devolvida — sem erro e
    sem log.

    Por isso os filtros são `>=`: repetir o instante devolve a linha do
    limite de novo. Trate os casos por `case_id` e a repetição sai de
    graça; a perda, não tem conserto.

**Filtros sobre `source_record`**

Quatro operadores, todos **repetíveis** e somando com `AND` entre si:

| Parâmetro | Pergunta | Exemplo |
|---|---|---|
| `filter=chave=valor` | o campo **é igual** ao valor | `filter=uf=SP` |
| `ne=chave=valor` | o campo existe e **difere** do valor | `ne=uf=SP` |
| `exists=caminho` | a **chave existe** | `exists=enriquecimento` |
| `not_exists=caminho` | a chave **não existe** | `not_exists=erro` |

```
GET /v1/cases?filter=referencia=REF-12345&filter=uf=SP
```

Caminho aninhado usa ponto (`origem.id`), e **segmento numérico indexa
array** (`telas.0`).

Em `filter=` e `ne=`, só o **primeiro** `=` separa a chave do valor, então
um valor que contenha `=` atravessa inteiro — `filter=expr=a=b` filtra
`expr` pelo valor `a=b`.

A comparação é **em texto**, então `filter=valor=10` casa com o JSON tendo
número ou string — sem ambiguidade de tipo na query string.

!!! danger "Duas coisas que a intuição erra, e as duas custam uma resposta vazia sem erro"
    **`not_exists` não é `ne`.** Comparar valor exige que haja valor,
    então um caminho ausente não casa com `ne` **nem** com `filter`. Para
    "não tem a chave", só `not_exists` serve.

    **`exists` pergunta pela chave, não pelo valor.** Casa quando o valor
    é `null`, um objeto ou uma lista — inclusive lista vazia. É o que
    permite perguntar "este caso já foi enriquecido?" sem saber o que a
    automação grava no enriquecimento. Já `filter=` e `ne=` só comparam
    escalares: objeto e lista não casam com nenhum dos dois.

!!! note "Teto de filtros"
    Cada filtro vira um predicado no `WHERE`. Os quatro operadores contam
    para o **mesmo** teto, somados — dividir a consulta entre eles não
    dobra o limite. Acima de `CASEHUB_MAX_SOURCE_FILTERS` (default 20) a
    resposta é 400, melhor que uma consulta arbitrariamente cara sem
    explicação.

!!! tip "`source_record` não vem por padrão na listagem"
    Só com `include=source_record`. Uma listagem de 500 casos com o JSON
    completo de cada um é um payload grande e raramente é o que se quer.

**A resposta**

| Campo | Significado |
|---|---|
| `total` | Quantos itens bateram o filtro, não quantos vieram. |
| `page` / `page_size` | A página pedida e o tamanho dela. |
| `total_pages` | `ceil(total / page_size)`. Lista vazia devolve `0`, não `1` — sem registro não há página de conteúdo nenhuma. |
| `items` | Os casos desta página. |

!!! note "`total_pages` ainda não saiu numa release"
    Ele está em `main` e no `openapi.yaml` publicado, mas é posterior ao
    corte da **0.4.2**: quem roda a versão publicada não recebe o campo e
    segue calculando `ceil(total / page_size)` por conta própria.

    O campo é **aditivo** — nenhum campo existente mudou —, então o
    cliente que já trata a resposta continua funcionando nos dois casos.
    As três listagens paginadas da API o ganharam de uma vez: esta,
    `GET /v1/webhooks` e `GET /v1/webhooks/{id}/deliveries`.

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
