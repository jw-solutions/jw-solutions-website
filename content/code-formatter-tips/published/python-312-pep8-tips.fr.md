---
title: 'PEP 8 en Python 3.12 : écrire des blocs match/case lisibles'
slug: python-312-pep8-tips
locale: fr
category: Astuces de syntaxe
status: published
published_at: '2026-11-02'
---

## Astuce de la semaine

Le `match`/`case` de Python 3.10+ est puissant, mais mal indenté il devient illisible. La PEP 8 recommande d'indenter chaque `case` d'un niveau dans `match`, de limiter les lignes à 79 caractères et d'utiliser des gardes `if` courtes.

```python
match command.split():
    case ["go", direction] if direction in {"north", "south"}:
        move(direction)
    case ["quit" | "exit"]:
        shutdown()
    case _:
        print("Comando desconocido")
```

## Règles rapides

- Un `case` par motif ; évitez les gardes à plusieurs conditions.
- Utilisez `|` pour regrouper des alternatives au lieu de répéter les branches.
- Terminez toujours par `case _:` pour ne pas ignorer les entrées inattendues.

Collez cet extrait dans le formateur avec le bouton ci-dessus et vérifiez l'indentation instantanément.
