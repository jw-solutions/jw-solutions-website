---
title: "Optimización de PEP 8 en Python 3.12: Nuevos patrones de coincidencia"
slug: "python-312-pep8-tips"
date: "2026-11-06"
language: "python"
author: "JW Solutions Code Team"
category: "Tips de Sintaxis"
status: "draft"
---

## Tip de la semana

Borrador inicial. Desarrollar aquí el contenido: cómo aplicar PEP 8 al escribir
bloques `match`/`case` en Python 3.12 (indentación de `case`, líneas máximas de
79 caracteres, guardas `if` legibles).

```python
match command.split():
    case ["go", direction] if direction in {"north", "south"}:
        move(direction)
    case _:
        print("Comando desconocido")
```
