# O que mudou

Registro das mudanças de comportamento que afetam quem integra. Não
substitui o `CHANGELOG.md` de cada repositório — aqui ficam apenas as que
mudam o **contrato** ou exigem ação de quem consome.

Versões atuais: **API 0.5.0** e **SDK 0.7.2**.

---

## HTTPS no profile `prod` e `total_pages` — API 0.5.0

A troca para HTTPS **exige ação** de quem consome uma instalação que usa o
profile `prod`. O `total_pages` é aditivo.

=== "Só HTTPS no `prod`"

    **O que mudou.** O nginx do profile `prod` passa a atender a API só
    por HTTPS, na porta 443. A porta 80 responde `308` para o endereço
    `https://` e não atende mais a API. O profile `uat` continua em HTTP.

    **Por quê.** O token Bearer trafegava em texto claro entre o consumidor
    e o proxy.

    **O que fazer.** Troque `CASEHUB_BASE_URL` e `CASEHUB_TOKEN_URL` para
    `https://`. **O SDK não segue redirecionamento**: um cliente ainda em
    `http://` recebe o `308` como erro HTTP, em vez de ser levado ao
    HTTPS — e o token dessa tentativa já saiu em texto claro.

=== "`total_pages` nas listagens"

    **O que mudou.** `GET /v1/cases`, `GET /v1/webhooks` e
    `GET /v1/webhooks/{id}/deliveries` devolvem `total_pages` ao lado de
    `total`, `page` e `page_size`. Lista vazia devolve `0`.

    **Por quê.** Saber quantas páginas uma listagem tinha exigia calcular
    `ceil(total / page_size)` no cliente.

    **O que fazer.** Nada é obrigatório: o campo é aditivo. No SDK,
    `list_cases` devolve o corpo como veio, então o campo já aparece sem
    atualizar o `casehub`.

---

## Webhooks — API 0.4.0

Um consumidor passa a poder cadastrar uma URL própria e **receber** os
casos que lhe interessam, em vez de só puxar `GET /v1/cases` em laço.

=== "O que mudou"

    Sete rotas novas em `/v1/webhooks`: cadastro, listagem, consulta,
    alteração, remoção, o log de entregas e o reenvio de uma entrega que
    falhou.

    As regras de cada assinatura são **os mesmos filtros que a listagem
    já aceita** — nenhum vocabulário de consulta novo. A assinatura
    pertence à automação do client OIDC que a criou, como todo o resto do
    serviço.

    Cada entrega vai assinada com HMAC-SHA256 no header
    `X-Casehub-Signature`, sobre `<t>.<corpo>`. O segredo é devolvido
    **uma única vez**, na criação.

=== "O que fazer"

    Nada é obrigatório: quem consome por `GET /v1/cases` continua
    consumindo igual. O cursor incremental permanece sendo a recuperação
    de longo prazo — o log de entregas tem prazo de 30 dias.

    Se for cadastrar, leia antes a regra que decide se a assinatura vai
    funcionar: **regra que depende de conteúdo exige
    `cursor_field: updated`**. Com `created`, o caso é avaliado só no
    instante em que nasce, e o que a automação gravar depois nunca é
    reconsiderado — a assinatura fica muda, sem erro.

    Ver [Webhooks](api/webhooks.md).

!!! info "O SDK não cobre essas rotas"
    `casehub` cobre as rotas de caso. As de webhook se chamam por HTTP
    direto, com o mesmo `Bearer`. Cadastrar é operação de configuração,
    feita uma vez — não de fluxo.

### Regras mais finas de entrega, e a reavaliação — API 0.4.0 e 0.4.1

`source_conditions` (`exists`, `not_exists`, `eq`, `ne` sobre o
`source_record`) e `events` (`case.created`, `case.updated`) respondem
juntos *"só me mande depois que a automação terminar de montar o caso"*.

A regra é **reavaliada no momento da entrega**, e desde a 0.4.1 isso
cobre **todas** as regras da assinatura — `status`, `batch_ref`,
`source_schema`, `source_filters` e o tipo de evento. Apertar a regra com
um `PATCH` faz o que já estava na fila e deixou de casar terminar em
`abandoned`, com o motivo no log, sem sair para a URL do parceiro.

!!! warning "Condição booleana estava invertida antes da 0.4.1"
    `{"op": "eq", "value": true}` era guardado como `"True"` enquanto o
    banco compara `"true"`: a condição nunca casava, e a `ne` equivalente
    casava sempre — sem erro em lugar nenhum. Se você cadastrou uma
    condição com valor booleano antes da 0.4.1, **recadastre-a**.

---

## Cursor incremental e três filtros novos — API 0.4.0

=== "`created_since` / `updated_since`"

    **O que mudou.** `GET /v1/cases` passou a aceitar os dois parâmetros
    de cursor. Até aqui não havia como perguntar "o que mudou desde a
    última vez que olhei": `started_from` filtra a data do registro **na
    origem**, que pode ser de anos atrás num caso criado hoje.

    Quando um dos dois é usado, a listagem ordena pelo campo do cursor;
    sem eles, segue ordenando por `started_at`.

    **O que fazer.** Se você paginava a lista inteira para descobrir
    novidades, troque pelo cursor — e **releia uma janela de alguns
    segundos para trás**. Uma linha carimbada antes pode ser gravada
    depois, e apareceria atrás de um cursor que já passou. Os filtros são
    `>=`, então repetir o instante devolve a linha do limite de novo:
    trate por `case_id` e a repetição sai de graça. A perda, não tem
    conserto.

=== "`exists`, `not_exists` e `ne`"

    **O que mudou.** Três operadores novos sobre o `source_record`,
    somando com o `filter` que já existia. Todos repetíveis, com `AND`
    entre eles.

    **O que fazer.** Nada — são aditivos. Mas saiba que **`not_exists`
    não é `ne`**: comparar valor exige que haja valor, então um caminho
    ausente não casa com `ne` nem com `filter`. E `exists` pergunta pela
    **chave**, não pelo valor: casa inclusive quando o valor é `null`,
    objeto ou lista.

    Os quatro operadores contam para o **mesmo** teto
    (`CASEHUB_MAX_SOURCE_FILTERS`), agora somados — dividir a consulta
    entre eles não dobra mais o limite.

    Ver [Endpoints](api/endpoints.md#get-listar-e-contar).

!!! note "O SDK não declara esses parâmetros"
    `ListCasesParams` não inclui o cursor nem os três operadores. Eles
    atravessam mesmo assim, mas um verificador de tipos reclama, e a CLI
    não os expõe. Ver [Cliente síncrono](sdk/cliente.md).

---

## Trocar só o status — API 0.4.0 e SDK 0.6.0

=== "`PATCH` de caso e o status `cancelado`"

    **O que mudou.** Nova rota
    `PATCH /v1/cases/{environment}/{automation}/{case_id}`, que muda
    **só o status**. E um status novo, `cancelado` — para o caso que
    deixou de existir na origem antes de ser tratado, distinto de
    `concluido` (foi tratado e acabou) e de `falhou` (tentou e não
    conseguiu).

    **Por quê.** `PUT` e lote exigem `status` **e** `started_at`, então
    corrigir só o estado obrigava a ler o caso antes para reescrever o
    resto igual — duas chamadas, e uma janela entre elas.

    **O que fazer.** Acrescentar um valor ao enum é aditivo: nada que já
    era aceito deixou de ser. Se o seu código valida `status` contra uma
    lista própria, acrescente `cancelado` a ela.

=== "SDK: `patch_case_status`"

    **O que mudou.** O método existe nos dois clientes, síncrono e
    assíncrono. `expected_status` é opcional: preenchido, a troca só
    acontece se o estado atual bater, e a API responde 409 sem escrever
    nada quando não bate.

    **O que fazer.** Fixe `casehub>=0.6.0` e a API a partir da 0.4.0.

    ```python
    client.patch_case_status(
        environment='prod',
        automation='minha-automacao',
        case_id='a1b2c3',
        status='cancelado',
        expected_status='aberto',
    )
    ```

    !!! danger "Ele **não cria** o caso — e isso é 404"
        Ao contrário do `upsert_case`. Um `case_id` que nunca foi
        importado, ou publicado sob outro `environment`/`automation`,
        levanta `APIHTTPError` com `status_code=404`, nos dois modos.
        Quem tratava só o 409 recebe essa exceção sem esperar.

=== "SDK 0.6.1: `status_code` virou atributo"

    **O que mudou.** `APIHTTPError` passa a expor `status_code` e
    `message` como atributos.

    **Por quê.** O número existia só dentro da mensagem formatada, então
    distinguir um erro esperado de um inesperado obrigava a procurar
    substring no texto da exceção — texto que muda quando alguém
    reescreve a frase. O caso concreto é o 409 do `expected_status`, que
    não é falha: é outro processo tendo escrito primeiro, com informação
    mais nova.

    **O que fazer.** Troque a busca por substring por
    `except APIHTTPError as e: if e.status_code == 409:`.

---

## Lote sabe pular o que já existe — API 0.3.0 e SDK 0.5.0

Nada a fazer para continuar como está: o default não mudou e as chaves
novas na resposta são aditivas. É opt-in.

=== "`on_conflict` no lote"

    **O que mudou.** `POST /v1/cases/batch` aceita `on_conflict`, com
    `update` (default, idêntico ao de antes) ou `skip`. No SDK,
    `upsert_cases_batch` ganhou o parâmetro homônimo nos dois clientes;
    omitido, nada é enviado e quem decide é o servidor. Desde a **0.7.0**
    a CLI também o expõe, em `--on-conflict`.

    **Por quê.** O upsert substitui os campos enviados, **sem merge**.
    Quem republica a mesma fonte a cada ciclo regrava o caso inteiro toda
    vez e apaga o que outro processo tenha acrescentado depois — sem erro
    e sem log.

    **O que fazer.** Se a sua fonte é relida periodicamente, passe
    `on_conflict='skip'` e fixe `casehub>=0.5.0`. Espere `upserted` cair
    a `0` em regime estacionário — isso é sucesso, e é o `skipped` ao
    lado que diz por quê.

    !!! tip "É também o que torna um webhook silencioso quando nada mudou"
        No modo `update` a recaptura carimba `updated_at` de tudo, e uma
        assinatura com `cursor_field: updated` receberia a base inteira a
        cada ciclo.

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

---

## Token pela própria API — API 0.2.0 e SDK 0.4.0

Quem integra deixa de precisar conhecer o endereço do provedor de
identidade: o token se pede à própria API do CaseHub.

=== "Peça o token em `/v1/auth/token`"

    **O que mudou.** A API expõe `POST /v1/auth/token` e
    `POST /v1/auth/refresh`. As duas aceitam o formato OAuth2
    (`application/x-www-form-urlencoded`) e também JSON, e nenhuma exige
    credencial — são o caminho para obtê-la.

    **Por quê.** O endereço do realm passa a ser configuração do serviço,
    e não algo que cada automação carregue em cada ambiente.

    **O que fazer.** Aponte o `token_url` do SDK para
    `<base_url>/v1/auth/token`. Nada mais muda: a API repassa ao provedor
    de identidade, que continua sendo quem assina o token.

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

=== "`api_key` saiu — e não volta"

    **O que mudou.** `Authorization: Bearer <JWT>` é a única forma de
    autenticar. No servidor, os modos `apikey` e `dual` foram removidos:
    um serviço configurado com eles **não sobe**. No SDK, o parâmetro
    `api_key` saiu de `CaseHubClient`/`AsyncCaseHubClient`, junto da flag
    `--api-key` da CLI.

    A CLI **parou de pedir credencial interativamente**: antes, sete
    comandos perguntavam por uma chave antes de qualquer outra coisa.
    `casehub health` responde direto.

    **Por quê.** O header `X-API-Key` autenticava com qualquer string não
    vazia e escapava da autorização por automação. O que restava no SDK
    era um caminho que só produzia `401` — configurável, e por isso capaz
    de enganar.

    **O que fazer.** Provisione um client `client_credentials` por
    automação, com `client_id` igual ao nome dela, e configure
    `client_id`, `client_secret` e `token_url` (os três juntos; parcial
    falha na construção).

---

## Versões do SDK a evitar

!!! danger "Não instale a 0.7.0"
    Ela saiu com `casehub.__version__` parado em `'0.6.1'` enquanto a
    distribuição já dizia `0.7.0`: qualquer consumidor que leia
    `__version__` recebe a versão errada. Use a **0.7.1** ou superior.

!!! warning "Exceções voltaram a sobreviver a `pickle` — SDK 0.7.0"
    `APIHTTPError`, `APIConnectionError` e `APITimeoutError` levantavam
    `TypeError` ao serem reconstruídas, o que **mascarava o erro HTTP
    real** justamente onde ele cruza fronteira de processo:
    `ProcessPoolExecutor`, multiprocessing, ou qualquer camada de retry
    que serialize a exceção capturada.

    Isso passou a importar mais desde a 0.6.1, que pede que o chamador
    guarde e inspecione a exceção para ler o `status_code`.

---

## Robustez do contrato — API 0.4.0

Sem ação necessária, mas mudam o que você vê quando algo dá errado.

**Caractere nulo no `source_record` vira erro do item, não 500.** Um
`U+0000` em qualquer chave ou valor é recusado com `invalid_source_record`
— no lote, sem derrubar os demais itens. Antes, a exceção do driver subia
até o handler genérico e virava `500 internal_error` sem indicar qual
item do lote falhou. É comum em dado vindo de arquivo de largura fixa de
mainframe.

**O `status` da resposta passou a declarar o enum no schema publicado**,
em vez de uma string livre. A entrada já declarava os estados possíveis e
a saída não — quem lia só o contrato de resposta no Swagger não tinha
como saber quais valores esperar.

**`created_at` e `updated_at` são carimbados pelo banco**, não pelo
relógio do processo. Sem consequência com um processo só, e pré-requisito
de qualquer consumo incremental confiável quando houver mais de um.

**A página `/docs` voltou a abrir.** As rotas de `/v1/auth/*` declaravam
o corpo por referência a um schema que nunca era registrado, e o Swagger
UI substituía a página inteira por "Could not resolve reference" — nenhuma
rota era exibida.
