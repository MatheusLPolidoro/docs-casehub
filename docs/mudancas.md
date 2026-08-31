# O que mudou

Registro das mudanças de comportamento que afetam quem integra. Não
substitui o `CHANGELOG.md` de cada repositório — aqui ficam apenas as
que mudam o **contrato** ou exigem ação de quem consome.

## Lote sabe pular o que já existe — API 0.2.0 e SDK 0.5.0

Nada a fazer para continuar como está: o default não mudou e as chaves
novas na resposta são aditivas. É opt-in.

=== "`on_conflict` no lote"

    **O que mudou.** `POST /v1/cases/batch` aceita `on_conflict`, com
    `update` (default, idêntico ao de antes) ou `skip`. No SDK,
    `upsert_cases_batch` ganhou o parâmetro homônimo nos dois clientes,
    síncrono e assíncrono; omitido, nada é enviado e quem decide é o
    servidor.

    **Por quê.** O upsert substitui os campos enviados, **sem merge**.
    Quem republica a mesma fonte a cada ciclo regrava o caso inteiro
    toda vez e apaga o que outro processo tenha acrescentado depois —
    sem erro e sem log. `skip` não escreve nada no caso que já existe.

    **O que fazer.** Se a sua fonte é relida periodicamente, passe
    `on_conflict='skip'` e fixe `casehub>=0.5.0`. Espere `upserted` cair
    a `0` em regime estacionário — isso é sucesso, e é o `skipped` ao
    lado que diz por quê. Ver [Endpoints](api/endpoints.md).

=== "`created` e `skipped` na resposta"

    **O que mudou.** A resposta do lote traz `created` (os `case_id`
    criados naquela chamada) e `skipped` (quantos já existiam e foram
    deixados como estavam), além do `upserted` de sempre.

    **Por quê.** A informação já existia do lado do servidor e era
    descartada. Sem ela, quem publica não tem como agir só sobre o que é
    novo — disparar um enriquecimento, por exemplo — sem uma consulta a
    mais.

    **O que fazer.** Nada é obrigatório. `upserted` mantém o sentido de
    "linhas gravadas", então o que foi pulado não entra nele. O SDK
    repassa o corpo como veio.

## Contrato v1 — os tratamentos saíram

Duas quebras do mesmo ciclo, uma de cada lado. Quem integra a partir de
uma versão anterior precisa agir nas duas.

=== "Tratamentos removidos do contrato"

    **O que mudou.** Os endpoints de tratamento saíram do v1, junto com
    `sub_id`, `processing_round`, o header `Idempotency-Key` e o campo
    `is_latest`. No SDK saíram `create_treatment` e `patch_treatment`, e
    com eles a exceção `MissingIdempotencyKeyError`.

    **Por quê.** A tabela `case_treatment` duplicava controle de execução
    e de tentativas que o Temporal já resolve nativamente — `run_id`,
    `RetryPolicy`, deduplicação por `WorkflowID`. Não havia consumidor
    real em produção.

    **O que fazer.** Correlacione pelo Temporal: o caso ganhou
    `temporal_workflow_id` e `temporal_run_id`, ambos opcionais e sem
    chave estrangeira — servem para investigação, não para integridade
    referencial. Ver [Endpoints](api/endpoints.md).

=== "`worker_id` virou `case_id`"

    **O que mudou.** O campo foi renomeado em todo o client e em toda a
    CLI — `get_case`, `upsert_case`, `upsert_cases_batch` e `list-cases`.

    **Por quê.** Alinhar o SDK ao nome que o contrato do servidor usa. O
    identificador sempre foi a chave natural do caso, não de um worker.

    **O que fazer.** Renomeie nas chamadas e fixe uma versão a partir da
    0.2.0 — hoje, `casehub==0.3.0`. É a
    mudança que torna o SDK anterior incompatível com a API atual — e o
    sintoma é um 400 de campo desconhecido, porque o contrato é estrito
    (`extra='forbid'`), não um campo silenciosamente ignorado. Ver
    [Instalação](instalacao.md).

**Novidade do mesmo release, sem ação necessária.** O SDK 0.2.0 trouxe o
`AsyncCaseHubClient`, com a mesma API pública e o mesmo comportamento de
autenticação do cliente síncrono. Quem usa o síncrono não precisa mudar
nada. Ver [Cliente assíncrono](sdk/assincrono.md).

## Token pela própria API — API 0.2.0 e SDK 0.4.0

Quem integra deixa de precisar conhecer o endereço do provedor de
identidade: o token se pede à própria API do CaseHub.

=== "Peça o token em `/v1/auth/token`"

    **O que mudou.** A API expõe `POST /v1/auth/token` e
    `POST /v1/auth/refresh`. As duas aceitam o formato OAuth2
    (`application/x-www-form-urlencoded`) e também JSON, e nenhuma
    exige credencial — são o caminho para obtê-la.

    **Por quê.** O endereço do realm passa a ser configuração do
    serviço, e não algo que cada automação carregue em cada ambiente.

    **O que fazer.** Aponte o `token_url` do SDK para
    `<base_url>/v1/auth/token`. Nada mais muda: a API repassa ao
    provedor de identidade, que continua sendo quem assina o token.

    ```python
    client = CaseHubClient(
        base_url='https://casehub.interno',
        client_id='minha-automacao',
        client_secret='...',
        token_url='https://casehub.interno/v1/auth/token',
    )
    ```

    Pedir direto ao provedor continua funcionando — é o caminho para
    depurar com a API fora do ar.

    Ver [Autenticação](api/autenticacao.md).

=== "SDK 0.4.0: `api_key` saiu"

    **O que mudou.** O parâmetro `api_key` foi removido de
    `CaseHubClient`/`AsyncCaseHubClient`, junto da flag `--api-key` da
    CLI. Passá-lo levanta `TypeError` na construção.

    A CLI **parou de pedir credencial interativamente**: antes, sete
    comandos perguntavam por uma chave antes de qualquer outra coisa.
    `casehub health` agora responde direto.

    **Por quê.** A API aceita `Authorization: Bearer <JWT>` e nada
    mais, então o parâmetro só levava a `401` — e, por ser
    configurável, dava a impressão de uma alternativa que não existe.

    **O que fazer.** Configure `client_id`, `client_secret` e
    `token_url` (os três juntos; parcial falha na construção). Um
    cliente que só tinha `api_key` precisa de um client
    `client_credentials` provisionado no provedor de identidade.

## Auditoria de segurança — agosto de 2026

Uma revisão dos três repositórios do ecossistema produziu 11 correções,
todas já em `main` no `fast-casehub`.

### :material-alert: Exigem atenção de quem integra

=== "Autenticação é exclusivamente OIDC"

    **O que mudou.** `Authorization: Bearer <JWT>` passou a ser a única
    credencial aceita, e `CASEHUB_AUTH_MODE` aceita um único valor,
    `oidc`. Qualquer outro valor derruba a subida do serviço.

    **Por quê.** Autenticação e autorização por automação passam a
    valer para todo acesso, sem exceção — não há mais um segundo
    caminho com garantias diferentes.

    **O que fazer.** Nada, se você já usa OIDC. Caso contrário,
    provisione um client `client_credentials` por automação, com
    `client_id` igual ao nome dela, e peça o token em
    `POST /v1/auth/token`.

    Ver [Autenticação](api/autenticacao.md).

=== "Lote passou a ter teto"

    **O que mudou.** `POST /v1/cases/batch` recusa lote vazio ou acima
    de `CASEHUB_MAX_BATCH_ITEMS` (default 1000), com 400.

    **Por quê.** Sem teto, um único request podia carregar dezenas de
    gigabytes e derrubar o serviço por memória.

    **O que fazer.** Publique em blocos. O default tem 10x de folga
    sobre o tamanho usado hoje pelos consumidores — a mensagem do 400
    informa o limite efetivo do ambiente, que é configurável.

    Ver [Endpoints](api/endpoints.md#post-upsert-em-lote).

### :material-wrench: Correções sem ação necessária

**Erro inesperado passou a respeitar o contrato.** Uma falha interna
respondia no formato padrão do framework (`{"detail": ...}`), quebrando
o tratamento de erro de quem lê `error.code` — justamente quando o
serviço já estava com problema. Agora responde 500 no envelope único.
Ver [Erros](api/erros.md#erro-interno).

**Retenção deixou de cruzar ambientes.** O expurgo passou a ser sempre
escopado por `environment`, e aceita prazo por ambiente
(`RETENTION_DAYS_<AUTOMATION>_<ENVIRONMENT>`). Antes, um prazo curto
configurado para limpar `dev` apagava também o histórico de `prod` da
mesma automação, silenciosamente. Ver [Retenção](api/retencao.md).

**Limites passaram a valer do ambiente.** Os tetos de tamanho eram
lidos uma única vez na importação do serviço — configurados no `.env`,
eram silenciosamente ignorados e o processo subia com o default. Quem
roda via Docker nunca foi afetado, porque o compose injeta as variáveis
antes do processo nascer.

**Aviso quando o `aud` não é validado.** Com `CASEHUB_OIDC_AUDIENCE`
vazio, o serviço agora avisa na subida que aceita qualquer token do
mesmo emissor. Também existe `CASEHUB_OIDC_REQUIRE_AUDIENCE` para
travar a configuração depois que o Keycloak estiver provisionado.

**Build reproduzível e varredura de segredos.** A imagem passou a ser
construída a partir de um lockfile versionado, e o pipeline varre o
histórico completo com gitleaks.

### :material-progress-clock: O que depende de provisionamento

!!! warning "Validar `aud` não é mudança de código"
    O serviço valida o claim `aud` assim que `CASEHUB_OIDC_AUDIENCE`
    estiver preenchida — não falta nada no código. O que ela exige antes
    é provisionar um audience dedicado nos clients do Keycloak de cada
    ambiente, trabalho de quem administra o realm.

    Com a variável vazia, o serviço aceita como autenticação qualquer
    token válido do mesmo emissor, e **avisa isso no log de subida**. O
    aviso é a verificação: se ele está lá, a configuração ainda não está
    completa naquele ambiente.

    O roteiro está em
    [Autenticação](api/autenticacao.md#validacao-de-aud) — e a ordem
    importa: inverter derruba os consumidores com 401.
