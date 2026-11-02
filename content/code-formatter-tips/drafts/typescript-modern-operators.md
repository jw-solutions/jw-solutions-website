---
title: "TypeScript moderno: ?., ?? y satisfies sin errores de formato"
slug: "typescript-modern-operators"
date: "2026-11-13"
language: "javascript"
author: "JW Solutions Code Team"
category: "Tips de Sintaxis"
status: "ready"
---

## Tip de la semana

Tres operadores reducen código defensivo: encadenamiento opcional `?.`, coalescencia nula `??` y el
operador `satisfies` de TypeScript 4.9+, que valida el tipo sin ensanchar el valor.

```typescript
const config = {
  retries: 3,
  endpoint: "https://api.example.com",
} satisfies Record<string, string | number>;

const timeout = options?.timeout ?? 5000;
const city = user?.address?.city ?? "Sin ciudad";
```

## Reglas rápidas

- Usa `??` (no `||`) cuando `0` o `""` son valores válidos.
- Evita cadenas `?.` de más de tres niveles: señal de un modelo mal diseñado.
- Prefiere `satisfies` a `as` para no silenciar errores de tipo.
