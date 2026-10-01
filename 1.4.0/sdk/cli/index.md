# CLI

O pacote instala o executável `casehub`, para inspeção e operação
ad-hoc no terminal — não para automação em produção (isso é o
[SDK](cliente.md)).

## Configurando a conexão

A conexão é resolvida por **precedência**, e a primeira que existir
vence:

1. Flag da linha de comando (`--base-url`, `--client-id`, ...)
2. `~/.casehub.toml`, gravado pelo `casehub configure`
3. Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `CASEHUB_BASE_URL` | Endereço da API, **sem** `/v1`. |
| `CASEHUB_CLIENT_ID` | Client OIDC — o nome da automação. |
| `CASEHUB_CLIENT_SECRET` | Segredo do client. |
| `CASEHUB_TOKEN_URL` | `<base_url>/v1/auth/token`. |

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub configure">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub configure</span>
<span data-ty="input" data-ty-prompt="Base URL:">https://casehub.interno</span>
<span data-ty>✔ Configuração salva em ~/.casehub.toml</span>
</div>
</div>

!!! warning "Segredo não vai por flag"
    `--client-secret` na linha de comando fica no histórico do shell e
    aparece em `ps` / Gerenciador de Tarefas para qualquer processo da
    máquina. Prefira a variável de ambiente, ou o prompt do
    `casehub configure`, que não ecoa o que você digita.

!!! info "`configure` é o **único** comando que persiste credencial"
    Os demais gravam apenas `base_url`, `client_id` e `token_url` na
    primeira execução, e avisam que o segredo não foi salvo. Persistir
    credencial passou a ser uma escolha, e não algo que acontece por
    acidente no primeiro `casehub health`.

    O arquivo é criado **já** com permissão `600` — restrito antes de
    qualquer byte ser escrito, e não ajustado depois. No Windows o modo é
    ignorado e o arquivo herda a ACL do perfil do usuário, que já não é
    legível por outras contas.

!!! warning "Aviso de tráfego em claro"
    O cliente emite um `UserWarning` quando `base_url` ou `token_url`
    usam `http://` para um host que não é local: nesse caso as
    credenciais e o Bearer token trafegam em texto puro pela rede.

## Comandos

| Comando | O que faz |
|---|---|
| `configure` | Grava base URL e credenciais em `~/.casehub.toml`. |
| `health` | Consulta `/health`. |
| `readiness` | Consulta `/ready`. |
| `list-cases` | Lista casos, com filtros. |
| `get-case` | Consulta um caso pela chave. |
| `upsert-case` | Cria/atualiza um caso. |
| `patch-case-status` | Troca só o status de um caso. |
| `upsert-cases-batch` | Publica um lote a partir de JSON. |

Todos aceitam sobrescrever a conexão por flag (`--base-url`,
`--client-id`, `--token-url`, ...) sem depender do arquivo.

!!! note "A CLI não cobre webhooks nem o cursor incremental"
    `/v1/webhooks*`, `created_since`/`updated_since` e os operadores
    `exists`/`not_exists`/`ne` não têm comando nem flag. São chamadas
    HTTP diretas — ver [Webhooks](../api/webhooks.md) e
    [Endpoints](../api/endpoints.md#get-listar-e-contar).

## Exemplos

### Verificando se o serviço responde

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub readiness">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub readiness</span>
<span data-ty>{'status': 'ok'}</span>
</div>
</div>

`readiness` toca o banco; `health` não. Para saber se o serviço está
realmente utilizável, use `readiness`.

### Listando casos

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub list-cases --environment prod --status aberto">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub list-cases --environment prod --status aberto</span>
<span data-ty>total: 42  page: 1/1</span>
</div>
</div>

`--filter chave=valor` filtra por conteúdo do `source_record`, e é
repetível: `--filter uf=SP --filter origem.id=42`.

### Trocando só o status

```bash
casehub patch-case-status --environment prod --automation minha-automacao \
  --case-id a1b2c3 --status cancelado --expected-status aberto
```

`patch-case-status` troca **só** o status e, ao contrário de
`upsert-case`, **não cria** o caso: um `case_id` inexistente responde
404. Com `--expected-status`, a troca só acontece se o estado atual
bater; senão responde 409 e nada é escrito.

### Publicando um lote de um arquivo

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub upsert-cases-batch --cases-file casos.json --environment prod --automation minha-automacao">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub upsert-cases-batch --cases-file casos.json \</span>
<span data-ty="input">  --environment prod --automation minha-automacao \</span>
<span data-ty="input">  --on-conflict skip</span>
<span data-ty>{'upserted': 0, 'created': [], 'skipped': 2, 'errors': []}</span>
</div>
</div>

O arquivo é uma lista JSON de itens, no mesmo formato do campo `cases`
do [endpoint de lote](../api/endpoints.md#post-upsert-em-lote).
`--cases-json` aceita o mesmo conteúdo inline.

`--on-conflict skip` não escreve nada no caso que já existe — é o que
permite republicar a mesma fonte sem sobrescrever o que já foi tratado.
Omitido, nada é enviado e o servidor decide o default (`update`).

!!! warning "A CLI não valida o conteúdo do arquivo"
    Ela envia o JSON como está. Um item malformado só é recusado pela
    API, e aparece em `errors[]` — não como erro da CLI.
