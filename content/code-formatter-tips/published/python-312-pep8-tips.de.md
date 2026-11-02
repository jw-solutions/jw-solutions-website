---
title: 'PEP 8 in Python 3.12: lesbare match/case-Blöcke schreiben'
slug: python-312-pep8-tips
locale: de
category: Syntax-Tipps
status: published
published_at: '2026-11-02'
---

## Tipp der Woche

Pythons `match`/`case` (ab 3.10) ist mächtig, wird aber bei schlechter Einrückung schwer lesbar. PEP 8 empfiehlt, jedes `case` eine Ebene innerhalb von `match` einzurücken, Zeilen auf 79 Zeichen zu begrenzen und kurze `if`-Guards zu verwenden.

```python
match command.split():
    case ["go", direction] if direction in {"north", "south"}:
        move(direction)
    case ["quit" | "exit"]:
        shutdown()
    case _:
        print("Comando desconocido")
```

## Kurzregeln

- Ein `case` pro Muster; vermeide Guards mit mehr als einer Bedingung.
- Nutze `|`, um Alternativen zusammenzufassen, statt Zweige zu wiederholen.
- Schließe immer mit `case _:` ab, damit unerwartete Eingaben nicht ignoriert werden.

Füge dieses Snippet mit der Schaltfläche oben in den Formatierer ein und prüfe die Einrückung sofort.
