# Cliente assíncrono

`AsyncCaseHubClient` tem a **mesma API pública** do cliente síncrono —
mesmos métodos, mesmos parâmetros, mesmas exceções. A diferença é o
transporte (`httpx.AsyncClient`) e o fato de os métodos serem
corrotinas.

```python
from casehub import AsyncCaseHubClient

async with AsyncCaseHubClient(
    base_url='https://casehub.interno',
    client_id='minha-automacao',
    client_secret='...',
    token_url='https://casehub.interno/v1/auth/token',
) as client:
    await client.upsert_cases_batch(
        environment='prod',
        automation='minha-automacao',
        cases=[...],
    )
```

## Quando usar

!!! danger "Dentro de código assíncrono, o cliente síncrono trava o event loop"
    Chamar `CaseHubClient` de dentro de uma corrotina bloqueia o loop
    inteiro pela duração da requisição HTTP. Num worker que serve vários
    fluxos no mesmo processo, isso atrasa **tudo** — inclusive
    heartbeats de outras tarefas, que podem perder a janela e ser
    cancelados.

    Foi exatamente esse o motivo do `AsyncCaseHubClient` existir.

Regra prática:

| Contexto | Cliente |
|---|---|
| Script, job síncrono, CLI | `CaseHubClient` |
| Activity `async def`, FastAPI, qualquer corrotina | `AsyncCaseHubClient` |

## Diferenças de uso

| | Síncrono | Assíncrono |
|---|---|---|
| Context manager | `with` | `async with` |
| Fechar | `close()` | `await aclose()` |
| Chamada | `client.get_case(...)` | `await client.get_case(...)` |

Nada mais muda: os nomes dos métodos, os parâmetros e as exceções são
idênticos.

Os anexos têm um detalhe só deste lado: o sha256 do conteúdo, que o SDK
calcula no envio e no download, roda numa thread
(`asyncio.to_thread`). Um anexo de 25 MB não para as outras corrotinas
enquanto o hash é calculado.

Os recursos da API 0.9.0 existem nos dois clientes, com os mesmos
nomes: `on_conflict='merge'` em `upsert_case` e `upsert_cases_batch`,
`count_cases` e os seis métodos de schema
(`upsert_source_schema`, `get_source_schema`, `list_source_schemas`,
`delete_source_schema`, `infer_source_schema` e
`validate_source_record`). Aqui, com `await` — por exemplo,
`await client.count_cases(group_by='status')`. Ver
[Cliente síncrono](cliente.md#contando-casos).

Os da API 0.10.0 também: os seis métodos de template
(`upsert_render_template`, `get_render_template`,
`list_render_templates`, `delete_render_template`,
`preview_render_template` e `preview_render_template_draft`), e
`render_template` em `get_case` e `list_cases`. Ver
[Cliente síncrono](cliente.md#templates-de-montagem).

## Compartilhando entre tarefas concorrentes

`httpx.AsyncClient` é *task-safe*, então uma única instância pode ser
compartilhada por várias tarefas rodando em paralelo com
`asyncio.gather`. É o padrão recomendado: construir o cliente uma vez
por ciclo de vida do worker e reaproveitar.

```python
async def executar(origens: list[str]) -> None:
    async with AsyncCaseHubClient(...) as client:
        # o mesmo client, em N tarefas concorrentes
        await asyncio.gather(*[
            processar(client, origem) for origem in origens
        ])
```

!!! tip "Construir por chamada desperdiça o que o cliente oferece"
    Um cliente novo a cada publicação joga fora o pool de conexões e o
    cache do token OIDC — passando a buscar um token novo no Keycloak a
    cada lote.
