# Cliente síncrono

`CaseHubClient` é o caminho padrão para consumir a API a partir de
código Python síncrono.

```python
from casehub import CaseHubClient

with CaseHubClient(
    base_url='https://casehub.interno',
    client_id='minha-automacao',
    client_secret='...',
    token_url='https://keycloak.interno/realms/x/protocol/openid-connect/token',
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
    api_key=None,
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
| `api_key` | Modo legado (`X-API-Key`). |
| `client_id` / `client_secret` / `token_url` | OIDC. **Os três juntos, ou nenhum** — configuração parcial levanta `ValueError` na construção. |
| `timeout` | Segundos, default 30. |

Com os dois mecanismos configurados, **OIDC tem precedência** em toda
chamada. Não é preciso remover a `api_key` para migrar.

## Métodos

| Método | Corresponde a |
|---|---|
| `health()` | `GET /health` |
| `readiness()` | `GET /ready` |
| `upsert_case(...)` | `PUT /v1/cases/{env}/{automation}/{case_id}` |
| `upsert_cases_batch(...)` | `POST /v1/cases/batch` |
| `get_case(...)` | `GET /v1/cases/{env}/{automation}/{case_id}` |
| `list_cases(...)` | `GET /v1/cases` |
| `close()` | Fecha a sessão HTTP. |

Todos devolvem o JSON da resposta como `dict`.

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

!!! danger "Sempre inspecione `errors[]`"
    O lote responde 200 mesmo com itens recusados — o SDK **não**
    levanta exceção nesse caso, porque do ponto de vista HTTP a
    requisição funcionou. Ignorar `errors[]` é perder casos em silêncio.

!!! warning "Sempre envie `case_id` explícito"
    A API aceita itens sem `case_id` e gera um `auto-<hex>`, mas isso
    abre mão de idempotência: reprocessar duplica. Calcule uma chave
    natural estável a partir da fonte e envie sempre.

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

`source_filters` vira os parâmetros `f.<caminho>` da query string.
Sem `include='source_record'`, os itens vêm sem o JSON.

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
    # A API respondeu com status de erro — e.status_code, e.body
    ...
except (APIConnectionError, APITimeoutError):
    # Rede: vale retentar
    ...
except OidcTokenError:
    # Credencial OIDC errada ou Keycloak fora do ar
    ...
```

| Exceção | Quando |
|---|---|
| `APIHTTPError` | Status de erro. Carrega o status e o corpo. |
| `APIConnectionError` | Não alcançou a API. |
| `APITimeoutError` | Sem resposta no tempo. |
| `OidcTokenError` | Falha ao obter o token. |
| `APIUnexpectedError` | Qualquer outra. |

## Renovação de token e o retry em 401

O token OIDC é mantido em cache e renovado ao expirar. Além disso,
**uma** resposta 401 dispara uma nova obtenção de token e uma única
repetição da chamada — cobre o caso do token ter sido revogado ou
rotacionado no Keycloak antes do vencimento.

!!! danger "O retry pode duplicar itens de lote sem `case_id`"
    Se um 401 espúrio ocorrer durante um `upsert_cases_batch` cujo lote
    tenha itens **sem** `case_id`, o reenvio automático republica esses
    itens — e sem chave natural eles viram linhas novas.

    É mais uma razão para sempre enviar `case_id` explícito: com ele, o
    reenvio é idempotente e o retry é inofensivo.

O retry acontece apenas no caminho OIDC. Um 401 de `X-API-Key` nunca é
mascarado por repetição.
