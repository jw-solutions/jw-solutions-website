---
title: 'Modern TypeScript: ?., ?? and satisfies without formatting errors'
slug: typescript-modern-operators
locale: en
category: Syntax Tips
status: published
published_at: '2026-11-02'
---

## Tip of the week

Three operators cut defensive code: optional chaining `?.`, nullish coalescing `??` and TypeScript 4.9+'s `satisfies` operator, which checks the type without widening the value.

```typescript
const config = {
  retries: 3,
  endpoint: "https://api.example.com",
} satisfies Record<string, string | number>;

const timeout = options?.timeout ?? 5000;
const city = user?.address?.city ?? "Sin ciudad";
```

## Quick rules

- Use `??` (not `||`) when `0` or `""` are valid values.
- Avoid `?.` chains longer than three levels: a sign of a poorly designed model.
- Prefer `satisfies` over `as` so type errors are not silenced.
