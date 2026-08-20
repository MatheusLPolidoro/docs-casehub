# CaseHub — Controle na menor unidade

<svg id="LogoAnimation" width="650px" viewBox="0 0 1920 1080"></svg>
<script src="assets/js/LogoAnimation.js"></script>

Documentação central do ecossistema **CaseHub**: a API que é dona do
ciclo de vida dos casos importados e o SDK Python que as automações
usam para falar com ela.

Duas peças, um contrato:

| Peça | Repositório | Papel |
|---|---|---|
| **fast-casehub** | `fast-casehub` | API REST + Postgres. Dona exclusiva do schema `casehub` e do contrato v1. |
| **casehub** | `casehub-connect` | SDK Python (síncrono e assíncrono) + CLI. Único caminho suportado para consumir a API. |

!!! tip "Por que a documentação vive fora dos dois repositórios"
    A API e o SDK são versionados e publicados de forma independente,
    mas o que importa para quem integra é o **contrato entre eles**.
    Documentar isso dentro de um dos dois faria a outra metade ficar
    sempre desatualizada. Aqui as duas são descritas lado a lado.

## [O que é o CaseHub?](sobre.md)
O problema que o serviço resolve, o que ele deliberadamente **não**
faz, e por que o contrato é agnóstico de domínio.

## [Arquitetura](arquitetura.md)
Diagramas de fluxo: da ingestão à consulta, o caminho de um caso,
autenticação e autorização, e o ciclo de retenção.

## [Primeiros passos](primeiros_passos.md)
O caminho mais curto entre não ter nada instalado e ter um caso
gravado.

## [Instalação](instalacao.md)
SDK, API local, Docker e as variáveis que cada um exige.

## [API (fast-casehub)](api/endpoints.md)
Os quatro endpoints do contrato v1, campo a campo, com os modos de
autenticação, o formato único de erro e o job de retenção.

## [SDK (casehub)](sdk/cliente.md)
Cliente síncrono, cliente assíncrono e a CLI — quando usar cada um.

## [Operação](operacao/deploy.md)
Deploy, variáveis de ambiente e o que observar em produção.
