# Arquitetura

## O caminho de um caso, da fonte ao banco

```mermaid
sequenceDiagram
    autonumber
    participant W as Automação / Worker
    participant S as SDK casehub
    participant K as Keycloak
    participant A as fast-casehub
    participant P as Postgres

    W->>S: upsert_cases_batch(environment, automation, cases)
    Note over S: Só na primeira chamada,<br/>ou quando o token expira
    S->>K: POST /token (client_credentials)
    K-->>S: access_token (JWT)
    S->>A: POST /v1/cases/batch<br/>Authorization: Bearer ...
    A->>K: busca chave pública (JWKS, em cache)
    A->>A: valida assinatura, iss, exp
    A->>A: enforce_automation(azp == automation)
    loop por item do lote
        A->>A: valida item + source_record
        A->>P: INSERT ... ON CONFLICT DO UPDATE
    end
    A-->>S: 200 {upserted, errors[]}
    S-->>W: dict com o resultado
```

!!! note "Erro por item não derruba o lote"
    Um item inválido entra em `errors[]` com o motivo, e os demais são
    gravados normalmente. O status continua 200 — o chamador precisa
    **ler `errors[]`**, não só o código HTTP.

## Autenticação e autorização

São dois passos distintos, e confundi-los é a origem da maioria das
dúvidas.

```mermaid
flowchart TD
    R["Requisição chega"] --> B{"Tem Bearer?"}

    B -->|não| E401["401 unauthorized"]
    B -->|sim| V{"Token válido?<br/><small>assinatura, iss, exp</small>"}

    V -->|não| E401
    V -->|sim| Z{"claim azp ==<br/>automation da chamada?"}

    Z -->|não| E403["403 forbidden"]
    Z -->|sim| OK["Segue para a rota"]
```

!!! info "Não existe segunda porta"
    Não há credencial alternativa: sem um Bearer válido, a resposta é
    `401`, e nenhum caminho de autenticação pula a verificação de
    automação.

Detalhes em [Autenticação](api/autenticacao.md).

## Idempotência: o que acontece ao republicar

```mermaid
flowchart TD
    P["Publicação chega com<br/>(environment, automation, case_id)"] --> Q{"Já existe<br/>essa chave?"}
    Q -->|não| I["INSERT<br/><small>created: true</small>"]
    Q -->|sim| U["UPDATE dos campos enviados<br/><small>created: false</small>"]
    U --> O{"Campo foi<br/>omitido?"}
    O -->|sim| M["Mantém o valor atual"]
    O -->|"não, veio null/vazio"| C["Sobrescreve"]
```

Esta é a regra que mais confunde na integração: **omitir um campo não é
o mesmo que enviá-lo vazio.** Omitir preserva o que já estava gravado;
enviar `source_record: {}` limpa o objeto.

É o que permite uma automação republicar um caso apenas para atualizar
`status`, sem precisar reenviar o `source_record` inteiro — e é o que
faz uma recaptura preservar o `started_at` original.

## Retenção

```mermaid
flowchart LR
    T["Scheduler in-process<br/><small>a cada N horas</small>"] --> L["Lista pares<br/>(automation, environment)"]
    L --> R["Resolve o prazo<br/>no ParamManager"]
    R --> D["DELETE onde<br/>started_at < corte"]
    R -.->|"sem parâmetro,<br/>ou ParamManager fora"| DF["Default: 90 dias"]
    DF --> D
```

O prazo é resolvido nesta ordem, e a primeira que existir vence:

1. `RETENTION_DAYS_<AUTOMATION>_<ENVIRONMENT>`
2. `RETENTION_DAYS_<AUTOMATION>`
3. Default de 90 dias

!!! warning "O expurgo é sempre escopado por ambiente"
    Mesmo quando só o prazo genérico está cadastrado. Sem esse escopo,
    um prazo curto configurado para limpar `dev` apagaria o histórico
    de `prod` da mesma automação, silenciosamente, no ciclo seguinte.

Detalhes em [Retenção](api/retencao.md).

## Camadas do serviço

```mermaid
flowchart TB
    RT["routes.py<br/><small>endpoints, autorização por rota</small>"]
    MD["models.py<br/><small>contrato Pydantic, validação de source_record</small>"]
    ST["storage.py<br/><small>Protocol Storage</small>"]
    IM["InMemoryStorage<br/><small>mock fiel, usado em teste</small>"]
    PG["PostgresStorage<br/><small>produção</small>"]
    TB["tables.py<br/><small>fonte de verdade do DDL</small>"]

    RT --> MD
    RT --> ST
    ST --> IM
    ST --> PG
    PG --> TB
```

`InMemoryStorage` não é um stub permissivo: ele implementa o mesmo
`Protocol` e é tratado como *contrato executável*. A suíte roda contra
os dois backends, então uma divergência de comportamento entre mock e
Postgres aparece como teste vermelho.
