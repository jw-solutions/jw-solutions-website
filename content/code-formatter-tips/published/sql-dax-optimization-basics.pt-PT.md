---
title: 'SQL e DAX: três hábitos para consultas rápidas e legíveis'
slug: sql-dax-optimization-basics
locale: pt-PT
category: Boas práticas
status: published
published_at: '2026-11-02'
---

## Dica da semana

Em SQL, selecione apenas as colunas necessárias e filtre cedo. Em DAX, guarde resultados intermédios em variáveis (`VAR`) para os avaliar uma única vez.

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

## Regras rápidas

- Evite `SELECT *` em produção.
- Use `DIVIDE` em DAX para evitar erros de divisão por zero.
- Uma medida, uma responsabilidade: componha medidas em vez de duplicar lógica.
