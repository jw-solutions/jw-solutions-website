---
title: 'SQL et DAX : trois habitudes pour des requêtes rapides et lisibles'
slug: sql-dax-optimization-basics
locale: fr
category: Bonnes pratiques
status: published
published_at: '2026-11-02'
---

## Astuce de la semaine

En SQL, sélectionnez uniquement les colonnes nécessaires et filtrez tôt. En DAX, stockez les résultats intermédiaires dans des variables (`VAR`) pour ne les évaluer qu'une fois.

```sql
SELECT o.id, o.total, c.name
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
WHERE o.created_at >= DATE '2026-01-01'
ORDER BY o.total DESC;
```

```dax
Ventas YTD Margen =
VAR Ventas = [Ventas Totales]
VAR Costo = [Costo Total]
RETURN DIVIDE(Ventas - Costo, Ventas)
```

## Règles rapides

- Évitez `SELECT *` en production.
- Utilisez `DIVIDE` en DAX pour éviter les erreurs de division par zéro.
- Une mesure, une responsabilité : composez les mesures au lieu de dupliquer la logique.
