---
title: 'SQL e DAX: tre abitudini per query veloci e leggibili'
slug: sql-dax-optimization-basics
locale: it
category: Buone pratiche
status: published
published_at: '2026-11-02'
---

## Consiglio della settimana

In SQL, seleziona solo le colonne necessarie e filtra presto. In DAX, salva i risultati intermedi in variabili (`VAR`) per valutarli una sola volta.

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

## Regole rapide

- Evita `SELECT *` in produzione.
- Usa `DIVIDE` in DAX per evitare errori di divisione per zero.
- Una misura, una responsabilità: componi le misure invece di duplicare la logica.
