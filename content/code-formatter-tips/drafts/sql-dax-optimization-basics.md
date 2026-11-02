---
title: "SQL y DAX: tres hábitos para consultas rápidas y legibles"
slug: "sql-dax-optimization-basics"
date: "2026-11-20"
language: "sql"
author: "JW Solutions Code Team"
category: "Buenas prácticas"
status: "ready"
---

## Tip de la semana

En SQL, selecciona solo las columnas necesarias y filtra temprano. En DAX, guarda subresultados en
variables (`VAR`) para evaluarlos una sola vez.

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

## Reglas rápidas

- Evita `SELECT *` en producción.
- Usa `DIVIDE` en DAX para evitar errores de división por cero.
- Una medida, una responsabilidad: compón medidas en lugar de duplicar lógica.
