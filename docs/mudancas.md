# O que mudou

Registro das mudanças de comportamento que afetam quem integra. Não
substitui o `CHANGELOG.md` de cada repositório — aqui ficam apenas as
que mudam o **contrato** ou exigem ação de quem consome.

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

## Auditoria de segurança — agosto de 2026

Uma revisão dos três repositórios do ecossistema produziu 11 correções,
todas já em `main` no `fast-casehub`.

### :material-alert: Exigem atenção de quem integra

=== "Autenticação é exclusivamente OIDC"

    **O que mudou.** `Authorization: Bearer <JWT>` passou a ser a única
    credencial aceita, e `CASEHUB_AUTH_MODE` aceita um único valor,
    `oidc`. Qualquer outro valor derruba a subida do serviço.

    **Por quê.** Um caminho de autenticação que não confere a
    credencial contra segredo nenhum, e que não passa pela autorização
    por automação, não é autenticação — é acesso irrestrito com
    aparência de controle.

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
