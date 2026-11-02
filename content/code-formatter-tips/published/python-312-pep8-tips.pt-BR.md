---
title: 'PEP 8 no Python 3.12: como escrever blocos match/case legíveis'
slug: python-312-pep8-tips
locale: pt-BR
category: Dicas de Sintaxe
status: published
published_at: '2026-11-02'
---

## Dica da semana

O `match`/`case` do Python 3.10+ é poderoso, mas mal indentado fica ilegível. A PEP 8 recomenda indentar cada `case` um nível dentro de `match`, manter as linhas em até 79 caracteres e usar guardas `if` curtas.

```python
match command.split():
    case ["go", direction] if direction in {"north", "south"}:
        move(direction)
    case ["quit" | "exit"]:
        shutdown()
    case _:
        print("Comando desconocido")
```

## Regras rápidas

- Um `case` por padrão; evite guardas com mais de uma condição.
- Use `|` para agrupar alternativas em vez de repetir ramos.
- Termine sempre com `case _:` para não ignorar entradas inesperadas.

Cole este trecho no formatador com o botão acima e confira a indentação na hora.
