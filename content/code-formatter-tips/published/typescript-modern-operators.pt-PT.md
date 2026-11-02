---
title: 'TypeScript moderno: ?., ?? e satisfies sem erros de formatação'
slug: typescript-modern-operators
locale: pt-PT
category: Dicas de Sintaxe
status: published
published_at: '2026-11-02'
---

## Dica da semana

Três operadores reduzem o código defensivo: encadeamento opcional `?.`, coalescência nula `??` e o operador `satisfies` do TypeScript 4.9+, que valida o tipo sem alargar o valor.

```typescript
const config = {
  retries: 3,
  endpoint: "https://api.example.com",
} satisfies Record<string, string | number>;

const timeout = options?.timeout ?? 5000;
const city = user?.address?.city ?? "Sin ciudad";
```

## Regras rápidas

- Use `??` (e não `||`) quando `0` ou `""` são valores válidos.
- Evite cadeias `?.` com mais de três níveis: sinal de um modelo mal concebido.
- Prefira `satisfies` a `as` para não silenciar erros de tipo.
