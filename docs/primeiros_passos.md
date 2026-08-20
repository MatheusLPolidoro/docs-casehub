# Primeiros passos

O caminho mais curto entre não ter nada e ter um caso gravado.

```mermaid
flowchart LR
    A["1. Instalar<br/>o SDK"] --> B["2. Subir uma API<br/>local"] --> C["3. Publicar<br/>um caso"] --> D["4. Consultar"]
```

## 1. Instale o SDK

<div style="position: relative;">
  <button class="copy-btn" onclick="copyText('pip install casehub', this)">📋 Copiar</button>
  <div class="termynal" data-termynal data-termynal-startDelay="600" style="min-height: 150px;" data-command="pip install casehub">
    <span data-ty="input">pip install casehub</span>
    <span data-ty="progress"></span>
  </div>
</div>

## 2. Suba uma API local

Para experimentar sem depender de nenhum ambiente, o mock in-memory
serve — ele implementa o mesmo contrato:

<div style="position: relative;">
  <button class="copy-btn" onclick="copyText('python -m casehub_api --storage memory', this)">📋 Copiar</button>
  <div class="termynal" data-termynal data-termynal-startDelay="600" style="min-height: 170px;" data-command="python -m casehub_api --storage memory">
    <span data-ty="input">python -m casehub_api --storage memory</span>
    <span data-ty>INFO:     Uvicorn running on http://127.0.0.1:8080</span>
  </div>
</div>

!!! tip "Para experimentar, use `apikey`"
    O default é `oidc`, que exige um Keycloak configurado. Para um teste
    local rápido, suba com `CASEHUB_AUTH_MODE=apikey` — mas leia o aviso
    em [Autenticação](api/autenticacao.md) antes de levar isso para
    qualquer ambiente compartilhado.

## 3. Publique um caso

```python
from casehub import CaseHubClient

with CaseHubClient(
    base_url='http://127.0.0.1:8080',
    api_key='chave-de-teste',
) as client:
    resposta = client.upsert_case(
        environment='dev',
        automation='MINHA_AUTOMACAO',
        case_id='caso-1',
        status='aberto',
        started_at='2026-08-20T09:00:00-03:00',
        source_record={'CONTA': '12345', 'ARQUIVO': 'X.TXT'},
    )

print(resposta)   # {'created': True}
```

!!! warning "`started_at` precisa de timezone"
    `'2026-08-20T09:00:00'` é recusado com 400. O contrato exige um
    datetime *aware* — sem isso, não há como saber a que momento real o
    caso se refere.

## 4. Consulte

```python
caso = client.get_case(
    environment='dev',
    automation='MINHA_AUTOMACAO',
    case_id='caso-1',
)
print(caso['status'], caso['source_record'])
```

## 5. Republique e veja a idempotência

Rode o mesmo `upsert_case` do passo 3 outra vez. A resposta muda para
`{'created': False}` — e o caso continua sendo **um só**.

Agora republique alterando só o `status`, sem enviar `source_record`:

```python
client.upsert_case(
    environment='dev',
    automation='MINHA_AUTOMACAO',
    case_id='caso-1',
    status='concluido',
    started_at='2026-08-20T09:00:00-03:00',
)
```

Consulte de novo: `status` mudou e **`source_record` continua lá**.
Omitir um campo mantém o valor atual — é o que permite atualizar o
ciclo de vida de um caso sem carregar o payload inteiro a cada vez.

## Próximos passos

- [Tutorial](tutorial.md) — um fluxo completo de importação em lote.
- [Autenticação](api/autenticacao.md) — sair do `apikey` e usar OIDC.
- [Endpoints](api/endpoints.md) — o contrato campo a campo.
