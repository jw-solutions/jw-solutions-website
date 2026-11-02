---
title: 'Modernes TypeScript: ?., ?? und satisfies ohne Formatierungsfehler'
slug: typescript-modern-operators
locale: de
category: Syntax-Tipps
status: published
published_at: '2026-11-02'
---

## Tipp der Woche

Drei Operatoren reduzieren defensiven Code: Optional Chaining `?.`, Nullish Coalescing `??` und der `satisfies`-Operator ab TypeScript 4.9, der den Typ prüft, ohne den Wert zu verbreitern.

```typescript
const config = {
  retries: 3,
  endpoint: "https://api.example.com",
} satisfies Record<string, string | number>;

const timeout = options?.timeout ?? 5000;
const city = user?.address?.city ?? "Sin ciudad";
```

## Kurzregeln

- Verwende `??` (nicht `||`), wenn `0` oder `""` gültige Werte sind.
- Vermeide `?.`-Ketten mit mehr als drei Ebenen: ein Zeichen für ein schlecht entworfenes Modell.
- Bevorzuge `satisfies` gegenüber `as`, damit Typfehler nicht unterdrückt werden.
