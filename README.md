# docs-casehub

Documentação central do ecossistema **CaseHub** — a API `fast-casehub`
e o SDK cliente `casehub` (repositório `casehub-connect`), descritos
lado a lado.

## Por que a documentação vive fora dos dois repositórios

A API e o SDK são versionados e publicados de forma independente, mas o
que importa para quem integra é o **contrato entre eles**. Documentar
isso dentro de um dos dois faria a outra metade ficar sempre
desatualizada — e é comum a mudança de contrato ser exatamente o que
não é documentado, porque cada repositório assume que o outro explica.

Aqui não há código: só documentação.

## Rodando localmente

```bash
python -m venv .venv
.venv/Scripts/activate          # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
mkdocs serve
```

O site sobe em `http://127.0.0.1:8000`.

Para conferir o build como o CI faz (falha em link quebrado):

```bash
mkdocs build --strict
```

## A página "Estrutura"

`docs/gen_tree.py` gera a árvore dos **repositórios documentados** no
momento do build, procurando por `../fast-casehub` e
`../casehub-connect`.

Ausentes, a página diz isso em vez de sair vazia — um checkout
incompleto não deve quebrar o build da documentação. Para ver a árvore
completa, mantenha os três repositórios lado a lado:

```
produtos/
├── casehub-connect/
├── docs-casehub/      <- este
└── fast-casehub/
```

## Estrutura

| Caminho | O que é |
|---|---|
| `docs/*.md` | Páginas de visão geral, instalação e tutorial. |
| `docs/api/` | Contrato do `fast-casehub`: autenticação, endpoints, erros, retenção. |
| `docs/sdk/` | SDK `casehub`: cliente síncrono, assíncrono e CLI. |
| `docs/operacao/` | Deploy e observabilidade. |
| `docs/assets/` | Logo animado, ícones e o terminal animado (termynal). |
| `docs/gen_tree.py` | Gera a página "Estrutura" no build. |

## Convenções

- Português no texto; identificadores de código em inglês, como nos
  repositórios de origem.
- Diagramas em **mermaid**, dentro de blocos ```mermaid — renderizados
  nativamente pelo tema.
- Comandos de terminal usam o bloco `termynal` com botão de cópia; o
  texto copiado fica no `onclick`, então **precisa ser atualizado junto
  com o comando exibido**.
- Cada afirmação sobre comportamento deve corresponder ao código real.
  Ao mudar API ou SDK, esta documentação faz parte da mudança.
