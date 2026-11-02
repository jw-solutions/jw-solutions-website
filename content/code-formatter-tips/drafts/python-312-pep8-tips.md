---
title: "PEP 8 en Python 3.12: cómo escribir bloques match/case legibles"
slug: "python-312-pep8-tips"
date: "2026-11-06"
language: "python"
author: "JW Solutions Code Team"
category: "Tips de Sintaxis"
status: "ready"
---

## Tip de la semana

El `match`/`case` de Python 3.10+ es potente, pero mal indentado se vuelve ilegible. PEP 8 recomienda
indentar cada `case` un nivel dentro de `match`, mantener las líneas en 79 caracteres y usar guardas `if` cortas.

```python
match command.split():
    case ["go", direction] if direction in {"north", "south"}:
        move(direction)
    case ["quit" | "exit"]:
        shutdown()
    case _:
        print("Comando desconocido")
```

## Reglas rápidas

- Un `case` por patrón; evita guardas con más de una condición.
- Usa `|` para agrupar alternativas en lugar de repetir ramas.
- Cierra siempre con `case _:` para no ignorar entradas inesperadas.

Pega este fragmento en el formateador con el botón de arriba y comprueba la indentación al instante.
