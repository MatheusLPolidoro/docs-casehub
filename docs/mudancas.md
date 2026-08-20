# O que mudou

Registro das mudanças de comportamento que afetam quem integra. Não
substitui o `CHANGELOG.md` de cada repositório — aqui ficam apenas as
que mudam o **contrato** ou exigem ação de quem consome.

## Auditoria de segurança — agosto de 2026

Uma revisão dos três repositórios do ecossistema produziu 11 correções,
todas já em `main` no `fast-casehub`.

### :material-alert: Exigem atenção de quem integra

=== "Autenticação padrão passou a ser OIDC"

    **O que mudou.** O default de `CASEHUB_AUTH_MODE` era `apikey` e
    passou a ser `oidc`.

    **Por quê.** O modo `apikey` aceita qualquer string não vazia como
    credencial, sem comparar com segredo nenhum, e a autorização por
    automação não se aplica a ele — uma chave qualquer alcançava
    qualquer automação e qualquer ambiente.

    **O que fazer.** Nada, se você já usa OIDC. Um ambiente que ainda
    dependa de `X-API-Key` precisa declarar `CASEHUB_AUTH_MODE=apikey`
    explicitamente — e sair dessa configuração assim que possível.

    Ver [Autenticação](api/autenticacao.md).

=== "Modo dual não cai mais para X-API-Key"

    **O que mudou.** No modo `dual`, um `Bearer` inválido ou expirado
    enviado **junto** com uma `X-API-Key` responde 401. Antes, caía
    para a chave.

    **Por quê.** O fallback não era só de autenticação: o contexto
    virava `apikey`, a autorização por automação deixava de se aplicar,
    e o cliente **perdia o escopo junto com o token**. A condição que
    disparava isso — as duas credenciais na mesma requisição — é
    exatamente o cenário para o qual o modo `dual` existe.

    **O que fazer.** Garanta que o token seja renovado antes de expirar.
    Um cliente que dependia de "expirou, mas a chave me salva" agora
    recebe 401. Quem envia **apenas** `X-API-Key` não é afetado.

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

### :material-progress-clock: Pendente, e não é código

!!! warning "A validação de `aud` ainda depende do Keycloak"
    O serviço valida o claim `aud` assim que `CASEHUB_OIDC_AUDIENCE`
    estiver preenchida — não falta nada no código. Mas preencher exige
    antes provisionar um audience dedicado nos clients do Keycloak de
    cada ambiente.

    Enquanto isso não acontecer, **qualquer token válido do mesmo
    emissor é aceito como autenticação**. A autorização por automação
    continua valendo, então a exposição é estreita: seria preciso um
    client cujo `client_id` coincidisse com o nome de uma automação.

    O roteiro está em
    [Autenticação](api/autenticacao.md#validacao-de-aud) — e a ordem
    importa: inverter derruba os consumidores com 401.
