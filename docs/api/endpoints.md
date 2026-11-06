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
| `GET` | `/v1/cases/totals` | Conta casos por ambiente, status e `source_schema`, desde a API 0.9.0, e por lote, desde a 0.11.0. |

**Anexos de caso** (desde a API 0.8.0)

| Método | Rota | O que faz |
|---|---|---|
| `PUT` | `/v1/cases/{environment}/{automation}/{case_id}/attachments/{name}` | Grava ou substitui um anexo. |
| `GET` | `/v1/cases/{environment}/{automation}/{case_id}/attachments` | Lista os anexos do caso. |
| `GET` | `/v1/cases/{environment}/{automation}/{case_id}/attachments/{name}` | Baixa um anexo. |
| `DELETE` | `/v1/cases/{environment}/{automation}/{case_id}/attachments/{name}` | Remove um anexo. |

**Token, webhooks e saúde**

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/v1/auth/token` | Emite o token — repasse ao provedor de identidade. Ver [Autenticação](autenticacao.md). |
| `POST` | `/v1/auth/refresh` | Renova o token. |
| — | `/v1/webhooks*` | Sete rotas de assinatura e log de entregas. Ver [Webhooks](webhooks.md). |
| — | `/v1/source-schemas*` | Seis rotas de schema do registro, desde a API 0.9.0. Ver [Schemas do registro](schemas.md). |
| — | `/v1/render-templates*` | Seis rotas de template de montagem, desde a API 0.10.0. Ver [Templates de montagem](templates.md). |
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
| `on_conflict` | enum | — | `update` (default) ou `merge`, desde a API 0.9.0. Ver [Merge do `source_record`](#merge-do-source_record). |

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

## Merge do `source_record`

Desde a API 0.9.0. Por padrão, o `PUT` e o lote **substituem** o
`source_record` inteiro. Quem só acrescenta dado a um caso que já existe
— um enriquecimento, por exemplo — pede a fusão com
`on_conflict: "merge"` e manda só o que é novo:

```json
{
  "status": "em_andamento",
  "started_at": "2026-11-02T09:00:00-03:00",
  "on_conflict": "merge",
  "source_record": {"enriquecimento": {"etapa_b": {"ok": true}}}
}
```

Com o caso gravado como
`{"referencia": 7, "enriquecimento": {"etapa_a": {"ok": true}}}`, o
resultado é
`{"referencia": 7, "enriquecimento": {"etapa_a": {"ok": true}, "etapa_b": {"ok": true}}}`.

| Gravado | Enviado | Resultado |
|---|---|---|
| chave que não vem no envio | — | permanece |
| — | chave nova | é acrescentada |
| objeto | objeto | os dois se fundem, pela mesma regra, em qualquer nível |
| qualquer valor | lista, texto, número, booleano ou `null` | o enviado substitui |
| objeto | valor de outro tipo | o enviado substitui |

!!! tip "Lista substitui, `null` grava"
    Lista não é concatenada: concatenar faria o mesmo `PUT`, reenviado,
    duplicar itens. E `null` enviado é **gravado** — ele não apaga a
    chave, porque `null` vindo da fonte é dado. Para remover uma chave,
    use o `update` com o registro inteiro.

- **Atômico e idempotente.** A leitura, a fusão e a escrita são uma
  operação só: duas fusões simultâneas no mesmo caso terminam com as
  duas contribuições. Reenviar o mesmo corpo deixa o mesmo registro.
- **Os outros campos seguem o `update`**: `status`, `started_at`,
  `batch_ref` e `finished_at` enviados substituem; `source_schema` e
  `temporal_*` omitidos mantêm o gravado.
- **Caso inexistente** é criado com o registro enviado, e a resposta é
  `{"created": true}`. `source_record` omitido mantém o gravado, e `{}`
  não muda nada — no `update`, `{}` limpa.
- **No lote**, `on_conflict: "merge"` vale para todos os itens; os
  gravados, criados ou fundidos, contam em `upserted`.

!!! warning "O teto vale para o registro fundido"
    O resultado da fusão respeita `CASEHUB_MAX_SOURCE_RECORD_BYTES`, como
    qualquer escrita. Passou, o `PUT` responde
    `413 source_record_too_large` e o lote põe o item em `errors[]` com
    esse código. Nos dois casos o caso fica exatamente como estava.

!!! note "`skip` só existe no lote"
    No `PUT`, `on_conflict` aceita `update` e `merge`. `skip` responde
    `400 invalid_request`: a resposta do `PUT` não distinguiria "pulei"
    de "atualizei".

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
| `on_conflict` | enum | — | `update` (default), `skip` ou `merge` (desde a API 0.9.0). O que fazer com um `case_id` que já existe. |
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
| `skipped` | Quantos já existiam e foram deixados como estavam. Sempre `0` com `on_conflict` `update` ou `merge`. |

!!! tip "`on_conflict=skip` para fontes relidas periodicamente"
    Com `update`, o upsert substitui os campos enviados. Quem
    republica a mesma fonte a cada ciclo — uma tela de estoque relida
    de dez em dez minutos, por exemplo — regrava o caso inteiro toda
    vez e apaga o que outro processo tenha acrescentado depois, sem
    erro e sem log. (Quem quer **acrescentar** sem apagar usa `merge`:
    ver [Merge do `source_record`](#merge-do-source_record).)

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

Desde a API 0.10.0, `render_template=<nome>` acrescenta `rendered`, com o
que aquele [template](templates.md) monta para o caso — num `view`, uma
visão do `source_record`. Falha de montagem vem em `rendered.error`, e a
resposta continua `200`. Sem o parâmetro, a resposta é a de sempre.

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
| `present` / `blank` / `matches` / `not_matches` / `in` / `not_in` | Idem, desde a API 0.7.0. |
| `conditions` | A gramática inteira em JSON, com grupos `any`/`all`. |
| `search` | Um termo em qualquer valor do `source_record`, no `case_id` ou no `batch_ref`, desde a API 0.12.0 — ver abaixo. |
| `render_with` | Mostra, em cada item, o que uma assinatura enviaria — ver abaixo. |
| `render_template` / `render_connection` | Mostra, em cada item, o que um template de montagem monta, desde a API 0.10.0 — ver abaixo. |
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

Dez operadores, todos **repetíveis** e somando com `AND` entre si:

| Parâmetro | Pergunta | Exemplo |
|---|---|---|
| `filter=chave=valor` | o campo **é igual** ao valor | `filter=uf=SP` |
| `ne=chave=valor` | o campo existe e **difere** do valor | `ne=uf=SP` |
| `exists=caminho` | a **chave existe** | `exists=enriquecimento` |
| `not_exists=caminho` | a chave **não existe** | `not_exists=erro` |
| `present=caminho` | a chave existe **e tem valor** | `present=email` |
| `blank=caminho` | falta a chave, ou ela está nula ou vazia | `blank=email` |
| `matches=chave=padrão` | o valor casa a expressão regular | `matches=email=@exemplo\.com$` |
| `not_matches=chave=padrão` | o valor existe e **não** casa | `not_matches=doc=^0+$` |
| `in=chave=valor` | o valor está entre os informados | `in=uf=SP&in=uf=RJ` |
| `not_in=chave=valor` | o valor existe e **não** está entre eles | `not_in=uf=SP` |

!!! note "Os seis últimos existem desde a API 0.7.0"
    Uma instalação anterior responde `400` para eles. Os quatro
    primeiros não mudaram: consulta gravada continua selecionando o
    mesmo conjunto.

`in` e `not_in` repetidos **no mesmo caminho** formam uma lista só —
`in=uf=SP&in=uf=RJ` pergunta "SP ou RJ", e não "SP e RJ". Em caminhos
diferentes, continuam somando com `AND`.

```
GET /v1/cases?filter=referencia=REF-12345&filter=uf=SP
```

Caminho aninhado usa ponto (`origem.id`), e **segmento numérico indexa
array** (`telas.0`).

Desde a API 0.11.0, o ponto que faz parte do nome da chave vai escapado
com `\`: `filter=cod\.cliente=123` filtra pela chave `cod.cliente`, e
`filter=origem.nota\.fiscal=7` pela chave `nota.fiscal` dentro de
`origem`. Na URL, a barra invertida vai como `%5C`. `\\` é a barra
invertida literal antes de um ponto ou no fim da chave; antes de qualquer
outro caractere, ela fica como está. A regra é a mesma para todo caminho
sobre o `source_record`: condições, assinaturas, templates e o
`token_path` das conexões.

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

!!! tip "`present` é a pergunta que `exists` não responde"
    `exists` casa com `null` e com texto vazio; `present` não. Para
    "tem e-mail para onde mandar", use `present=email`. "Vazio" é só
    espaço **ASCII** — um espaço não separável conta como valor.

    `blank` é o complemento exato de `present`, e inclui a ausência:
    um caminho que não existe é `blank`, e não é `present`.

    Os operadores `not_*` **não casam com ausência**: `not_matches`,
    `not_in` e `ne` exigem que o campo exista e seja escalar.

!!! note "Teto de filtros"
    Cada filtro vira um predicado no `WHERE`. Todos os operadores contam
    para o **mesmo** teto, somados — dividir a consulta entre eles não
    dobra o limite, e condição dentro de grupo conta igual. Acima de
    `CASEHUB_MAX_SOURCE_FILTERS` (default 20) a resposta é 400, melhor
    que uma consulta arbitrariamente cara sem explicação.

**Expressão regular: um subconjunto portável**

`matches` e `not_matches` aceitam só o que significa a mesma coisa no
serviço e no banco: literais, `.`, classes `[...]`, `\d \w \s` (em
**ASCII** — `Ç` não é `\w`), âncoras `^` e `$`, grupos `( )` e `(?: )`,
alternância `|` e repetições `* + ? {m} {m,n}` até 255.

Fora disso o cadastro responde `400`: `\b`, lookaround, retrovisor,
grupo nomeado, flags, quantificador preguiçoso, quantificador aninhado
e **grupo repetido cujas alternativas podem começar no mesmo ponto**.
`(?:ab|cd)+` vale; `(?:a|aa)+` e `(?:[ab]|c)+` não — dê a cada
alternativa um primeiro caractere literal diferente, ou troque por uma
classe (`[ab]+`).

`.` casa quebra de linha, `$` é o fim do texto, a comparação distingue
maiúsculas e o texto é recortado em 10 000 caracteres antes de casar.

!!! note "A recusa é de forma, não de gosto"
    O que sai do subconjunto ou significaria coisas diferentes nos dois
    lados — e aí o mesmo filtro selecionaria conjuntos diferentes, sem
    erro nenhum — ou custaria tempo exponencial numa consulta que roda
    a cada ciclo.

**A gramática inteira: `conditions`**

Os parâmetros acima sempre somam com `AND`. Para perguntar "uma coisa
**ou** outra", mande a árvore em JSON:

```
GET /v1/cases?conditions=[{"any":[
  {"path":"uf","op":"eq","value":"SP"},
  {"all":[{"path":"regiao","op":"eq","value":"sudeste"},
          {"path":"email","op":"present"}]}]}]
```

A lista de nível superior é um `AND`; `{"any": [...]}` é OU e
`{"all": [...]}` é E, aninháveis até 3 níveis. JSON malformado, grupo
vazio ou operador desconhecido respondem `400`. O `conditions` soma
com os parâmetros simples — e com o mesmo teto.

**Procurar sem saber o campo: `search`**

Desde a API 0.12.0, `search=<termo>` casa o caso em que o termo aparece
como **parte do texto** de algum valor do `source_record` — texto,
número ou booleano, em qualquer nível, inclusive dentro de listas —, do
`case_id` ou do `batch_ref`:

```
GET /v1/cases?search=maria&started_from=2026-11-01T00:00:00-03:00
```

| Detalhe | Comportamento |
|---|---|
| maiúsculas | não diferencia: `search=ação` acha `AÇÃO` |
| acentos | diferencia: `search=acao` **não** acha `ação` |
| nomes de chave | não entram: `search=telefone` não acha `{"telefone": "1234"}` |
| `null`, objeto e lista como um todo | não casam; os valores dentro deles, sim |
| número e booleano | pelo texto que o banco escreve: `true`, `false`, e o número sem expoente |
| `%`, `_` e `\` | são texto, nunca curinga |
| combinação | soma com todos os outros filtros, em E; `total` e paginação são os do conjunto encontrado |
| espaços nas pontas | removidos; termo vazio é o mesmo que não mandar |
| tamanho | até 200 caracteres; acima, `400 invalid_request` |
| teto de filtros | a busca **não** conta para ele |

!!! warning "Mande sempre o período"
    A busca não usa índice: ela lê os registros que sobram depois dos
    outros filtros. Uma consulta que passa de 15 segundos é cortada e
    responde `400 invalid_request`, pedindo um período menor
    (`started_from`) ou um termo mais específico.

!!! note "O termo não vai para log nem trace"
    O termo pode ser dado pessoal. A API registra só o tamanho dele, e
    a query string sai redigida da linha de acesso e do trace — ver
    [Observabilidade](../operacao/observabilidade.md).

!!! tip "Numa API anterior à 0.12.0"
    O parâmetro é ignorado sem erro, e a listagem vem **sem** a busca.
    Confira a versão (`/v1/openapi.json`) antes de depender dele.

!!! tip "`source_record` não vem por padrão na listagem"
    Só com `include=source_record`. Uma listagem de 500 casos com o JSON
    completo de cada um é um payload grande e raramente é o que se quer.

!!! warning "A página com `source_record` tem orçamento de bytes"
    Desde a API 0.8.0, um `source_record` pode ter até 10 MB. Para a
    memória do serviço aguentar, a página que devolve ou monta os
    registros (`include=source_record` ou `render_with`) soma o tamanho
    deles contra `CASEHUB_MAX_LIST_SOURCE_BYTES` (100 MB por padrão).
    Passou, a resposta é `400 invalid_request`: peça um `page_size`
    menor. Uma página de um item sempre cabe.

**Ver o que uma assinatura enviaria: `render_with`**

`render_with=<id da assinatura>` acrescenta a cada item um `rendered`
com o que aquela assinatura montaria para aquele caso — verbo, URL,
cabeçalhos redigidos, corpo e avisos —, na mesma forma do
[`/preview`](entregas.md#4-conferir-antes-de-ligar). **Nada é enviado e
nenhuma entrega é registrada.**

| Detalhe | Comportamento |
|---|---|
| assinatura de outra automação | `404`, como em todo o resto |
| assinatura sem `request_spec` nem `template` | `400`: não há o que montar |
| assinatura desligada | funciona do mesmo jeito |
| caso que falha ao montar | o item traz o erro, e a página continua |
| `page_size` | teto próprio de 100 itens |

!!! warning "Ele não filtra pelas regras da assinatura"
    `render_with` responde *"o que sairia para este caso"*, não *"quais
    casos sairiam"*. Para ver o recorte, repita as condições da
    assinatura nos parâmetros da listagem.

**Ler pela visão de um template: `render_template`**

Desde a API 0.10.0, `render_template=<nome>` faz o mesmo com um
[template de montagem](templates.md#leituras-montadas) cadastrado, sem
assinatura. Num `view`, cada `rendered` traz `body`, `warnings` e
`error` — uma visão do `source_record`, que é como um frontend lê os
casos no formato que precisa. Num `request`, a forma do `render_with`, e
`render_connection=<id>` monta a URL completa. Não se combina com
`render_with`, tem o mesmo teto de página e não aplica projeção.

**A resposta**

| Campo | Significado |
|---|---|
| `total` | Quantos itens bateram o filtro, não quantos vieram. |
| `page` / `page_size` | A página pedida e o tamanho dela. |
| `total_pages` | `ceil(total / page_size)`. Lista vazia devolve `0`, não `1` — sem registro não há página de conteúdo nenhuma. |
| `items` | Os casos desta página. |

!!! note "`total_pages` existe desde a API 0.5.0"
    Uma instalação em versão anterior não devolve o campo, e quem a
    consome segue calculando `ceil(total / page_size)` por conta própria.

    O campo é **aditivo** — nenhum campo existente mudou —, então o
    cliente que já trata a resposta continua funcionando nos dois casos.
    As três listagens paginadas da API o ganharam de uma vez: esta,
    `GET /v1/webhooks` e `GET /v1/webhooks/{id}/deliveries`. No SDK,
    `list_cases` devolve o corpo como veio: o campo aparece no dicionário
    sem precisar atualizar o `casehub`.

**Autorização na listagem** — um cliente OIDC não consegue ver outras
automações simplesmente omitindo o filtro: o claim do token **é** o
filtro quando ele não é informado, e um filtro explícito divergente
responde 403.

---

## `GET` — totais

```
GET /v1/cases/totals
```

Desde a API 0.9.0. Quantos casos casam com os filtros, e quantos em cada
grupo — sem buscar página de casos nem ler o `source_record`. É a rota de
um painel: a listagem conta um conjunto por chamada e devolve uma página
junto; os totais devolvem todas as combinações numa consulta só. O
agrupamento por lote (`batch_ref`) existe desde a 0.11.0.

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

**Parâmetros**

| Parâmetro | Observação |
|---|---|
| Os filtros da listagem | Todos os de `GET /v1/cases` — `environment`, `automation`, `status`, `batch_ref`, `source_schema`, as datas, o cursor, `filter` e os operadores sobre o `source_record`, `conditions` e, desde a API 0.12.0, `search` —, opcionais, com a mesma semântica e os mesmos erros. |
| `group_by` | Repetível: `environment`, `status`, `source_schema` e, desde a API 0.11.0, `batch_ref`, sem repetição. Sem ele, só o `total`. |

**A resposta**

| Campo | Significado |
|---|---|
| `total` | Quantos casos casam com os filtros — o mesmo `total` que a listagem daria com eles. |
| `group_by` | As dimensões pedidas, na ordem pedida. |
| `groups` | Uma entrada por combinação que tem casos, com as dimensões pedidas e `count`. |
| `truncated` | `true` quando `groups` foi cortado no teto de 1000 grupos. |

!!! tip "Ordem e grupo nulo"
    Os grupos saem ordenados pelas dimensões, na ordem do `group_by`, por
    ponto de código (`A` antes de `a`, que vem antes de `b`), com `null`
    por último. Caso sem `source_schema` entra no grupo
    `"source_schema": null`, caso sem lote entra no grupo
    `"batch_ref": null`, e combinação sem caso não aparece — o painel
    completa com zero o que precisar mostrar.

!!! note "Cortar não muda o `total`"
    Passando de 1000 grupos, a resposta traz os 1000 primeiros e
    `truncated: true`; o `total` continua sendo o do conjunto inteiro.
    O corte é por combinação: com `group_by=batch_ref&group_by=status`,
    o último lote da resposta pode vir só com parte dos status. Com o
    lote, chegar ao teto é comum — veja abaixo como montar um painel por
    lote.

!!! warning "Dimensão desconhecida ou repetida é 400"
    `group_by=case_id`, `group_by=automation` e
    `group_by=status&group_by=status` respondem `400 invalid_request` —
    e `group_by=batch_ref` também, numa API anterior à 0.11.0. A
    automação é sempre a do token, como na listagem.

**Lotes num painel** — desde a API 0.11.0, são duas chamadas:

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

A primeira dá o total de cada lote, completo; a segunda, a divisão por
status. Não some a segunda para ter o total do lote: quando ela vem com
`truncated: true`, o último lote está pela metade. Se os lotes com status
passarem do teto, limite pela data, com `started_from`.

**Desempenho** — com filtros fixos (`environment`, `status`,
`source_schema`...), a contagem sai de um índice próprio, sem ler a
tabela. Desde a API 0.11.0, a contagem por lote, sozinho ou com status,
também. Filtro sobre o `source_record` ou por data obriga a ler a
tabela: o resultado continua certo, só custa mais.

---

## Anexos de caso

Desde a API 0.8.0, um caso pode guardar documentos binários junto dele —
o PDF de um comprovante, por exemplo — que qualquer fluxo que lê o caso
recupera depois. O conteúdo fica num storage de objetos próprio do
serviço, atrás da API: **nenhuma automação recebe endereço nem
credencial dele**, só fala com estas rotas. A autorização é a do caso:
token de outra automação recebe `403 forbidden`.

No SDK, desde a 0.8.1: `upsert_attachment`, `list_attachments`,
`download_attachment` e `delete_attachment`, que mandam e conferem o
sha256 sozinhos. Ver [Cliente síncrono](../sdk/cliente.md#anexos-de-caso).

### `PUT` — gravar ou substituir

```
PUT /v1/cases/{environment}/{automation}/{case_id}/attachments/{name}
Content-Type: application/pdf
X-Content-SHA256: <sha256 em hex>     (opcional)

<o conteúdo cru>
```

O corpo é o conteúdo **cru**, não JSON nem `multipart`. A resposta é
sempre `200`:

```json
{
  "name": "comprovante.pdf",
  "content_type": "application/pdf",
  "size_bytes": 48213,
  "sha256": "9f2c...",
  "created_at": "2026-10-27T12:00:00Z",
  "updated_at": "2026-10-27T12:00:00Z",
  "created": true,
  "changed": true
}
```

| Situação | `created` | `changed` |
|---|:---:|:---:|
| Nome novo no caso | `true` | `true` |
| Mesmo nome, conteúdo diferente: **substitui** | `false` | `true` |
| Mesmo nome, mesmo conteúdo: nada é gravado, `updated_at` não muda | `false` | `false` |

!!! tip "Retentativa é barata e segura"
    Reenviar o mesmo conteúdo com o mesmo nome não grava de novo nem
    reinicia o prazo do anexo. Uma automação pode repetir o `PUT` depois
    de um timeout sem medo.

**Regras:**

- **Nome**: `[A-Za-z0-9][A-Za-z0-9._-]*`, até 200 caracteres. Fora disso,
  `400 invalid_attachment_name` (`..` e espaço incluídos).
- **Tipo**: só os aceitos pelo serviço (por padrão, `application/pdf`),
  ignorando maiúsculas e parâmetros como `; charset=`. O conteúdo
  precisa ter a assinatura do tipo declarado (PDF, PNG, JPEG, TIFF, ZIP
  e Office). Senão, `415 unsupported_attachment_type`.
- **Tamanho**: até 25 MB por padrão; acima, `413 attachment_too_large`.
  Corpo vazio é `400 invalid_request`.
- **Integridade**: com `X-Content-SHA256`, um corpo que chegue diferente
  é recusado com `400 checksum_mismatch`, e o anexo anterior fica
  intacto.
- **Limites**: até 50 anexos por caso (`507 attachment_limit_exceeded`
  para um nome novo; substituir continua permitido) e uma cota de espaço
  por automação e ambiente (`507 attachment_quota_exceeded`; na
  substituição, conta só a diferença de tamanho).
- **Caso inexistente**: `404 case_not_found`, e nada é gravado.

### `GET` — listar

```
GET /v1/cases/{environment}/{automation}/{case_id}/attachments
```

`200` com `{"items": [...]}`: os anexos vigentes, em ordem de `name`,
cada um com os campos acima (sem `created`/`changed`) e **sem o
conteúdo**. Caso sem anexos devolve a lista vazia. Sem paginação: o
limite por caso a dispensa.

### `GET` — baixar

```
GET /v1/cases/{environment}/{automation}/{case_id}/attachments/{name}
```

O conteúdo em streaming, com:

| Header | Valor |
|---|---|
| `Content-Type` | o tipo gravado |
| `Content-Length` | o tamanho |
| `Content-Disposition` | `attachment; filename="<name>"` |
| `ETag` | `"<sha256>"` |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `private, no-store` |

!!! warning "Confira o `ETag` contra o que chegou"
    A API confere o conteúdo enquanto envia, mas os bytes já saíram
    quando a conta fecha. A conferência final é do cliente: o sha256 do
    que você recebeu tem de bater com o `ETag`.

`404 attachment_not_found` se o caso não tem anexo com o nome.

### `DELETE` — remover

`204`. O anexo some da listagem e do download na hora; o conteúdo sai
do storage na hora ou, se o storage estiver fora do ar, no primeiro
ciclo de limpeza com ele de volta. `404 attachment_not_found` se não
existir.

### Storage fora do ar ou desligado

As rotas de anexo respondem `503 attachment_store_unavailable` com o
header `Retry-After`, **sem** detalhe nenhum do storage. As rotas de
caso e o `/ready` não dependem dele. A listagem e a remoção continuam
funcionando com o storage fora; a gravação e o download não.

No mock em memória (o backend que as automações usam nos testes), os
anexos funcionam sem configuração nenhuma.

O prazo do anexo é próprio, separado do do caso, e o anexo nunca
sobrevive ao caso dele. Ver [Retenção](retencao.md#anexos-de-caso).

---

## Conexões de destino e entrega para outras APIs

Sete rotas que a [entrega para uma API de terceiro](entregas.md) usa. A
página dedicada explica o desenho; aqui fica só o mapa.

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/v1/delivery-connections` | cadastra uma conexão: URL base, modo de autenticação, credenciais, vazão |
| `GET` | `/v1/delivery-connections` | lista as conexões da automação, paginado |
| `GET` | `/v1/delivery-connections/{connection_id}` | consulta uma |
| `PATCH` | `/v1/delivery-connections/{connection_id}` | altera; é aqui que se rotaciona credencial |
| `DELETE` | `/v1/delivery-connections/{connection_id}` | remove, se nenhuma assinatura usar |
| `POST` | `/v1/delivery-connections/{connection_id}/test` | autentica de verdade no destino e devolve o desfecho |
| `POST` | `/v1/webhooks/{webhook_id}/preview` | mostra o que **seria** enviado, sem enviar |

!!! warning "A credencial entra e nunca volta"
    Nenhuma dessas rotas devolve `auth_secrets` nem o token em cache.
    Perdida, a credencial se regrava por `PATCH`.

A conexão pertence à automação do claim `azp`, como todo o resto: id de
outra automação responde `404`, nunca `403`.

## `/health` e `/ready`

| Rota | Toca o banco | Uso |
|---|:---:|---|
| `/health` | ❌ | Liveness probe. Responde enquanto o processo estiver de pé. |
| `/ready` | ✅ | Readiness probe. `503` se o banco estiver inacessível. |

Usar `/health` como readiness é um erro comum: o processo pode estar de
pé com o banco fora, e o balanceador continuaria mandando tráfego.
