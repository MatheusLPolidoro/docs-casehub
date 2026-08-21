# CaseHub — control at the smallest unit

<div class="pm-marca" data-pm-logo markdown>
<div class="pm-marca__cartaz" markdown>
<!-- Markdown syntax rather than <img>: mkdocs rewrites relative image paths
     in Markdown per page, and a hard-coded HTML `src` would break if this
     page moved a level.

     This is the poster: one frame of the animation, still. It is what shows
     while the drawing's 6 MB have not arrived — without it the area sits
     empty and the text jumps when they do — and what stays for good for
     anyone who asked the system for less motion. -->
![CaseHub mark](assets/marca-animada.svg)
</div>
<svg id="LogoAnimation" class="pm-marca__tela" viewBox="138 227 1645 620" aria-hidden="true" hidden></svg>
</div>

<div class="pm-selos" markdown>
<!-- Badges served by img.shields.io. They are the only thing on this site
     that depends on the outside network to *appear*: with no internet the
     browser shows each one's alternative text, which says the same thing in
     words.

     All static, each for its own reason. There is no PyPI version badge
     because the SDK is published to an internal registry. There is no
     coverage badge because **no coverage number is declared** in either
     repository — inventing one would be worse than having no badge. The
     versions come from each project's `pyproject.toml` and the Python floor
     from the `requires-python` of both; change those, change these. -->
![SDK casehub](https://img.shields.io/badge/SDK%20casehub-0.3.0-1565c0)
![API fast-casehub](https://img.shields.io/badge/API%20fast--casehub-0.1.0-1565c0)
![Python](https://img.shields.io/badge/python-3.11%2B-34D058?logo=python&logoColor=white)
![Contract](https://img.shields.io/badge/contract-v1-6a1b9a)
</div>

Central documentation for the **CaseHub** ecosystem: the API that owns the
life cycle of imported cases, and the Python SDK automations use to talk to
it.

Two pieces, one contract:

| Piece | Repository | Role |
|---|---|---|
| **fast-casehub** | `fast-casehub` | REST API + Postgres. Sole owner of the `casehub` schema and of contract v1. |
| **casehub** | `casehub-connect` | Python SDK (synchronous and asynchronous) + CLI. The only supported way to consume the API. |

!!! tip "Why the documentation lives outside both repositories"
    The API and the SDK are versioned and released independently, but what
    matters to whoever integrates is the **contract between them**.
    Documenting that inside either one would leave the other half
    permanently out of date. Here the two are described side by side.

## [What is CaseHub?](sobre.md)
The problem the service solves, what it deliberately does **not** do, and
why the contract is domain-agnostic.

## [Architecture](arquitetura.md)
Flow diagrams: from ingestion to query, the path of a case, authentication
and authorization, and the retention cycle.

## [Getting started](primeiros_passos.md)
The shortest path between having nothing installed and having a case
stored.

## [Installation](instalacao.md)
SDK, local API, Docker, and the variables each one requires.

## [API (fast-casehub)](api/endpoints.md)
The four endpoints of contract v1, field by field, with the authentication
modes, the single error format and the retention job.

## [SDK (casehub)](sdk/cliente.md)
Synchronous client, asynchronous client and the CLI — when to use each.

## [Operations](operacao/deploy.md)
Deploy, environment variables and what to watch in production.

## [What changed](mudancas.md)
The behaviour changes that affect whoever integrates — and what to do about
each one.

!!! info "This documentation describes the current state of `main`"
    The batch of fixes from the August 2026 audit was promoted to `main` in
    `fast-casehub`. If you run an earlier version, see
    [What changed](mudancas.md) for the differences.
