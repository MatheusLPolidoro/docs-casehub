# CaseHub — Controle na menor unidade

<div class="pm-marca" data-pm-logo markdown>
<div class="pm-marca__cartaz" markdown>
<!-- Sintaxe Markdown, e não <img>: o mkdocs reescreve o caminho relativo
     de imagem em Markdown por página, e um `src` fixo em HTML quebraria se
     esta página mudasse de nível.

     Este é o cartaz: um quadro da animação, parado. É o que aparece
     enquanto os 6 MB do desenho não chegam — sem ele a área nasce vazia e
     o texto salta de lugar quando eles chegam — e é o que fica para sempre
     para quem pediu menos movimento ao sistema. -->
![Marca do CaseHub](assets/marca-animada.svg)
</div>
<svg id="LogoAnimation" class="pm-marca__tela" viewBox="138 227 1645 620" aria-hidden="true" hidden></svg>
</div>

<div class="pm-selos" markdown>
<!-- Selos servidos pelo img.shields.io. São a única coisa neste site que
     depende de rede externa para *aparecer*: sem internet o navegador mostra
     o texto alternativo de cada um, que diz a mesma coisa em palavras.

     Todos estáticos, e cada um pelo seu motivo. Não há selo de versão no
     PyPI porque o SDK é publicado num registry interno. Não há selo de
     cobertura porque **nenhum número de cobertura é declarado** nos dois
     repositórios — inventar um seria pior do que não ter o selo. As versões
     vêm do `pyproject.toml` de cada projeto e o piso de Python do
     `requires-python` dos dois; mexeu lá, mexa aqui. -->
![SDK casehub](https://img.shields.io/badge/SDK%20casehub-0.4.0-1565c0)
![API fast-casehub](https://img.shields.io/badge/API%20fast--casehub-0.2.0-1565c0)
![Python](https://img.shields.io/badge/python-3.11%2B-34D058?logo=python&logoColor=white)
![Contrato](https://img.shields.io/badge/contrato-v1-6a1b9a)
</div>

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

## [O que mudou](mudancas.md)
As mudanças de comportamento que afetam quem integra — e o que fazer
sobre cada uma.

!!! info "Esta documentação descreve o estado atual da `main`"
    O lote de correções da auditoria de agosto de 2026 foi promovido
    para `main` no `fast-casehub`. Se você opera uma versão anterior,
    veja [O que mudou](mudancas.md) para saber o que difere.
