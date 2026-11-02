---
title: 'PEP 8 in Python 3.12: writing readable match/case blocks'
slug: python-312-pep8-tips
locale: en
category: Syntax Tips
status: published
published_at: '2026-11-02'
---

## Tip of the week

Python's `match`/`case` (3.10+) is powerful, but poorly indented it becomes hard to read. PEP 8 recommends indenting each `case` one level inside `match`, keeping lines within 79 characters and using short `if` guards.

```python
match command.split():
    case ["go", direction] if direction in {"north", "south"}:
        move(direction)
    case ["quit" | "exit"]:
        shutdown()
    case _:
        print("Comando desconocido")
```

## Quick rules

- One `case` per pattern; avoid guards with more than one condition.
- Use `|` to group alternatives instead of repeating branches.
- Always end with `case _:` so unexpected input is not silently ignored.

Paste this snippet into the formatter with the button above and check the indentation instantly.
