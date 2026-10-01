# Cliente síncrono

`CaseHubClient` é o caminho padrão para consumir a API a partir de
código Python síncrono.

```python
from casehub import CaseHubClient

with CaseHubClient(
    base_url='https://casehub.interno',
    client_id='minha-automacao',
    client_secret='...',
    token_url='https://casehub.interno/v1/auth/token',
) as client:
    client.upsert_case(
        environment='prod',
        automation='minha-automacao',
        case_id='a1b2c3',
        status='aberto',
        started_at='2026-08-20T09:00:00-03:00',
        source_record={'referencia': 'REF-12345', 'origem': 'lote-a'},
    )
```

!!! tip "Use `with` (ou chame `close()`)"
    O cliente mantém uma sessão HTTP persistente — é o que evita
    reabrir conexão a cada chamada e permite reaproveitar o token OIDC
    em cache. Sem fechar, a conexão vaza.

## Construção

```python
CaseHubClient(
    base_url,
    *,
    client_id=None,
    client_secret=None,
    token_url=None,
    timeout=30,
)
```

| Parâmetro | Observação |
|---|---|
| `base_url` | Endereço da API. |
| `client_id` / `client_secret` / `token_url` | OIDC. **Os três juntos, ou nenhum** — configuração parcial levanta `ValueError` na construção. |
| `timeout` | Segundos, default 30. |

O `token_url` aponta para a própria API (`/v1/auth/token`), que
repassa ao provedor de identidade.

## Métodos

| Método | Corresponde a |
|---|---|
| `health()` | `GET /health` |
| `readiness()` | `GET /ready` |
| `upsert_case(...)` | `PUT /v1/cases/{env}/{automation}/{case_id}` |
| `patch_case_status(...)` | `PATCH /v1/cases/{env}/{automation}/{case_id}` |
| `upsert_cases_batch(...)` | `POST /v1/cases/batch` |
| `get_case(...)` | `GET /v1/cases/{env}/{automation}/{case_id}` |
| `list_cases(...)` | `GET /v1/cases` |
| `close()` | Fecha a sessão HTTP. |

Todos devolvem o JSON da resposta como `dict`.

!!! info "As rotas de webhook não têm método no SDK"
    `/v1/webhooks*` se chama por HTTP direto, com o mesmo `Bearer`. Ver
    [Webhooks](../api/webhooks.md#o-sdk-nao-cobre-webhooks).

### Publicando em lote

```python
resultado = client.upsert_cases_batch(
    environment='prod',
    automation='minha-automacao',
    cases=[
        {
            'case_id': 'a1',
            'status': 'aberto',
            'started_at': '2026-08-20T09:00:00-03:00',
            'source_record': {'referencia': 'REF-111'},
        },
        {
            'case_id': 'a2',
            'status': 'aberto',
            'started_at': '2026-08-20T09:01:00-03:00',
            'source_record': {'referencia': 'REF-222'},
        },
    ],
)

if resultado['errors']:
    logger.error('itens recusados: %s', resultado['errors'])
```

#### Não sobrescrever o que já existe

`on_conflict='skip'` deixa intacto o caso cujo `case_id` já existe — a
API não escreve **nada** nele. É o que uma fonte relida periodicamente
precisa: sem isso, cada releitura regrava o caso inteiro e desfaz o que
outro processo tenha acrescentado depois, sem erro e sem log.

```python
resultado = client.upsert_cases_batch(
    environment='prod',
    automation='minha-automacao',
    cases=casos,
    on_conflict='skip',
)

# `created` traz os case_id criados NESTA chamada — é o que permite
# agir só sobre o que é novo sem uma consulta antes.
for case_id in resultado['created']:
    disparar_enriquecimento(case_id)
```

Omitido, o campo não é enviado e quem decide o default é o servidor
(`update`, o comportamento de sempre). Com `skip`, espere `upserted`
cair a `0` e `skipped` subir em regime estacionário: é sucesso, não
falha. Ver [Endpoints](../api/endpoints.md).

!!! danger "Sempre inspecione `errors[]`"
    O lote responde 200 mesmo com itens recusados — o SDK **não**
    levanta exceção nesse caso, porque do ponto de vista HTTP a
    requisição funcionou. Ignorar `errors[]` é perder casos em silêncio.

!!! warning "Sempre envie `case_id` explícito"
    A API aceita itens sem `case_id` e gera um `auto-<hex>`, mas isso
    abre mão de idempotência: reprocessar duplica. Calcule uma chave
    natural estável a partir da fonte e envie sempre.

### Trocando só o status

`patch_case_status` existe porque `upsert_case` e `upsert_cases_batch`
exigem `status` **e** `started_at`: corrigir só o estado obrigaria a ler
o caso antes para reescrever o resto igual — duas chamadas, e uma janela
entre elas.

```python
client.patch_case_status(
    environment='prod',
    automation='minha-automacao',
    case_id='a1b2c3',
    status='cancelado',
    expected_status='aberto',   # opcional
)
```

`expected_status` fecha essa janela sem exigir a leitura: se o estado
atual não bater, a API responde 409 e **não escreve nada**. Omitido, a
troca é incondicional.

```python
from casehub.exceptions import APIHTTPError

try:
    client.patch_case_status(..., status='concluido', expected_status='aberto')
except APIHTTPError as e:
    if e.status_code == 409:
        ...   # outro processo escreveu primeiro, com informação mais nova
    elif e.status_code == 404:
        ...   # o caso não existe sob esse environment/automation
    else:
        raise
```

!!! warning "Ao contrário do `upsert_case`, ele **não cria** o caso"
    Um `case_id` que nunca foi importado — ou publicado sob outro
    `environment`/`automation` — responde **404**, nos dois modos. Quem
    trata só o 409 leva essa exceção sem esperar.

!!! tip "`status_code` é atributo, não substring da mensagem"
    Desde a 0.6.1, `APIHTTPError` expõe `status_code` e `message`.
    Distinguir um 409 esperado de um erro de verdade não exige mais
    procurar o número dentro do texto da exceção — texto que muda quando
    alguém reescreve a frase.

### Consultando

```python
pagina = client.list_cases(
    environment='prod',
    automation='minha-automacao',
    status='aberto',
    page=1,
    page_size=100,
    include='source_record',
    source_filters={'referencia': 'REF-12345'},
)

print(pagina['total'], len(pagina['items']))
```

`source_filters` vira um `filter=<caminho>=<valor>` por item na
query string.
Sem `include='source_record'`, os itens vêm sem o JSON.

!!! note "O que a assinatura tipada declara, e o que ela não declara"
    `ListCasesParams` declara `environment`, `automation`, `status`,
    `batch_ref`, `source_schema`, `started_from`, `started_to`,
    `include`, `page` e `page_size`.

    Os parâmetros de cursor (`created_since`, `updated_since`) e os
    operadores `exists`/`not_exists`/`ne` **não** estão declarados. Eles
    atravessam mesmo assim — o que não é `None` vai para a query string
    como veio —, mas um verificador de tipos vai reclamar, e a CLI não
    os expõe. Ver [Endpoints](../api/endpoints.md#get-listar-e-contar).

## Tratamento de erro

O SDK normaliza as falhas em cinco exceções:

```python
from casehub.exceptions import (
    APIConnectionError,
    APIHTTPError,
    APITimeoutError,
    APIUnexpectedError,
    OidcTokenError,
)

try:
    client.upsert_case(...)
except APIHTTPError as e:
    # A API respondeu com status de erro — e.status_code, e.message
    ...
except (APIConnectionError, APITimeoutError):
    # Rede: vale retentar
    ...
except OidcTokenError:
    # Credencial errada, ou o endpoint de token fora do ar
    ...
```

| Exceção | Quando |
|---|---|
| `APIHTTPError` | Status de erro. Expõe `status_code` e `message` como atributos. |
| `APIConnectionError` | Não alcançou a API. |
| `APITimeoutError` | Sem resposta no tempo. |
| `OidcTokenError` | Falha ao obter o token. |
| `APIUnexpectedError` | Qualquer outra. |

## Renovação de token e o retry em 401

O token OIDC é mantido em cache e renovado ao expirar. Além disso,
**uma** resposta 401 dispara uma nova obtenção de token e uma única
repetição da chamada — cobre o caso do token ter sido revogado ou
rotacionado no Keycloak antes do vencimento.

!!! warning "O lote sem `case_id` desliga o retry, de propósito"
    Um 401 espúrio durante um `upsert_cases_batch` cujo lote tenha itens
    **sem** `case_id` republicaria esses itens — e sem chave natural eles
    virariam linhas novas. Por isso, nesse caso específico, o reenvio
    automático não acontece: o 401 sobe como `APIHTTPError` e quem chamou
    decide.

    Reautenticar e reenviar é seguro só para quem sabe o que tem no lote.
    Mandando `case_id` sempre, o reenvio é idempotente e a questão não
    aparece.

O retry acontece uma vez só: um `401` que persiste chega ao chamador.
