# CLI

O pacote instala o executável `casehub`, para inspeção e operação
ad-hoc no terminal — não para automação em produção (isso é o
[SDK](cliente.md)).

## Configurando a conexão

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub configure">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub configure</span>
<span data-ty="input" data-ty-prompt="Base URL:">https://casehub.interno</span>
<span data-ty>✔ Configuração salva em ~/.casehub.toml</span>
</div>
</div>

!!! danger "O arquivo de configuração guarda segredo em texto puro"
    `~/.casehub.toml` é gravado sem restrição de permissão e pode conter
    `client_secret`. Em máquina compartilhada, prefira
    variáveis de ambiente e ajuste a permissão do arquivo à mão.

    Passar `--client-secret` direto na linha de comando também deixa o
    segredo no histórico do shell.

## Comandos

| Comando | O que faz |
|---|---|
| `configure` | Grava base URL e credenciais em `~/.casehub.toml`. |
| `health` | Consulta `/health`. |
| `readiness` | Consulta `/ready`. |
| `list-cases` | Lista casos, com filtros. |
| `get-case` | Consulta um caso pela chave. |
| `upsert-case` | Cria/atualiza um caso. |
| `upsert-cases-batch` | Publica um lote a partir de JSON. |

Todos aceitam sobrescrever a conexão por flag
(`--base-url`, `--api-key`, `--client-id`, ...) sem depender do arquivo.

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

### Publicando um lote de um arquivo

<div class="pm-terminal" data-pm-terminal data-pm-command="casehub upsert-cases-batch --cases-file casos.json --environment prod --automation minha-automacao">
<div class="termynal" data-termynal data-ty-startDelay="500" data-ty-typeDelay="45" data-ty-lineDelay="800">
<span data-ty="input">casehub upsert-cases-batch --cases-file casos.json \</span>
<span data-ty="input">  --environment prod --automation minha-automacao</span>
<span data-ty>{'upserted': 2, 'errors': []}</span>
</div>
</div>

O arquivo é uma lista JSON de itens, no mesmo formato do campo `cases`
do [endpoint de lote](../api/endpoints.md#post-upsert-em-lote).

!!! warning "A CLI não valida o conteúdo do arquivo"
    Ela envia o JSON como está. Um item malformado só é recusado pela
    API, e aparece em `errors[]` — não como erro da CLI.
