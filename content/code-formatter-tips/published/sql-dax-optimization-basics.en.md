---
title: 'SQL and DAX: three habits for fast, readable queries'
slug: sql-dax-optimization-basics
locale: en
category: Best Practices
status: published
published_at: '2026-11-02'
---

## Tip of the week

In SQL, select only the columns you need and filter early. In DAX, store intermediate results in variables (`VAR`) so they are evaluated once.

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

## Quick rules

- Avoid `SELECT *` in production.
- Use `DIVIDE` in DAX to avoid division-by-zero errors.
- One measure, one responsibility: compose measures instead of duplicating logic.
