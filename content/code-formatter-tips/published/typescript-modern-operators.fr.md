---
title: 'TypeScript moderne : ?., ?? et satisfies sans erreurs de formatage'
slug: typescript-modern-operators
locale: fr
category: Astuces de syntaxe
status: published
published_at: '2026-11-02'
---

## Astuce de la semaine

Trois opérateurs réduisent le code défensif : le chaînage optionnel `?.`, la coalescence des nuls `??` et l'opérateur `satisfies` de TypeScript 4.9+, qui valide le type sans élargir la valeur.

```typescript
const config = {
  retries: 3,
  endpoint: "https://api.example.com",
} satisfies Record<string, string | number>;

const timeout = options?.timeout ?? 5000;
const city = user?.address?.city ?? "Sin ciudad";
```

## Règles rapides

- Utilisez `??` (et non `||`) lorsque `0` ou `""` sont des valeurs valides.
- Évitez les chaînes `?.` de plus de trois niveaux : signe d'un modèle mal conçu.
- Préférez `satisfies` à `as` pour ne pas masquer les erreurs de type.
