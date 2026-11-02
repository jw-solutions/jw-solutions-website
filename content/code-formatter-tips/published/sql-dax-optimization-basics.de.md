---
title: 'SQL und DAX: drei Gewohnheiten für schnelle, lesbare Abfragen'
slug: sql-dax-optimization-basics
locale: de
category: Best Practices
status: published
published_at: '2026-11-02'
---

## Tipp der Woche

Wähle in SQL nur die benötigten Spalten aus und filtere früh. Speichere in DAX Zwischenergebnisse in Variablen (`VAR`), damit sie nur einmal ausgewertet werden.

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

## Kurzregeln

- Vermeide `SELECT *` in der Produktion.
- Nutze in DAX `DIVIDE`, um Fehler bei Division durch null zu vermeiden.
- Ein Measure, eine Verantwortung: Setze Measures zusammen, statt Logik zu duplizieren.
