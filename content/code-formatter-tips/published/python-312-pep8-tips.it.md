---
title: 'PEP 8 in Python 3.12: scrivere blocchi match/case leggibili'
slug: python-312-pep8-tips
locale: it
category: Consigli di sintassi
status: published
published_at: '2026-11-02'
---

## Consiglio della settimana

Il `match`/`case` di Python 3.10+ è potente, ma se indentato male diventa illeggibile. La PEP 8 raccomanda di indentare ogni `case` di un livello dentro `match`, di mantenere le righe entro 79 caratteri e di usare guardie `if` brevi.

```python
match command.split():
    case ["go", direction] if direction in {"north", "south"}:
        move(direction)
    case ["quit" | "exit"]:
        shutdown()
    case _:
        print("Comando desconocido")
```

## Regole rapide

- Un `case` per pattern; evita guardie con più di una condizione.
- Usa `|` per raggruppare le alternative invece di ripetere i rami.
- Chiudi sempre con `case _:` per non ignorare input inattesi.

Incolla questo frammento nel formattatore con il pulsante qui sopra e controlla subito l'indentazione.
