---
title: 'TypeScript moderno: ?., ?? e satisfies senza errori di formattazione'
slug: typescript-modern-operators
locale: it
category: Consigli di sintassi
status: published
published_at: '2026-11-02'
---

## Consiglio della settimana

Tre operatori riducono il codice difensivo: l'optional chaining `?.`, il nullish coalescing `??` e l'operatore `satisfies` di TypeScript 4.9+, che verifica il tipo senza allargare il valore.

```typescript
const config = {
  retries: 3,
  endpoint: "https://api.example.com",
} satisfies Record<string, string | number>;

const timeout = options?.timeout ?? 5000;
const city = user?.address?.city ?? "Sin ciudad";
```

## Regole rapide

- Usa `??` (non `||`) quando `0` o `""` sono valori validi.
- Evita catene `?.` di più di tre livelli: segnale di un modello progettato male.
- Preferisci `satisfies` a `as` per non nascondere gli errori di tipo.
