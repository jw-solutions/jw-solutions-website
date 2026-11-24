---
title: 'Exhaustive TypeScript: Refactoring Legacy Enums with Discriminated Unions'
slug: typescript-discriminant-unions-exhaustive-type-checks-tsdoc
locale: en
category: Buenas prácticas
meta_description: >-
  Upgrade legacy TypeScript codebases by replacing fragile enums with
  discriminated unions, exhaustive never checks, and clean TSDoc standards.
summary: >-
  Modernize state modeling in enterprise TypeScript by ditching loose enums in
  favor of strict discriminated unions with compile-time exhaustive checks.
faq:
  - q: Why favor string literal unions over traditional TypeScript enums?
    a: >-
      String literal unions serialize directly to JSON without companion code,
      leave zero runtime footprint in compiled output, and prevent enum
      reverse-mapping bugs.
  - q: How does the default never assignment enforce exhaustiveness?
    a: >-
      If a developer adds a new state variant to the union but forgets to write
      a switch case for it, TypeScript flags a compilation error because that
      variant cannot be assigned to never.
status: published
published_at: '2026-11-24'
---

## Eliminating State Ambiguity in Legacy Codebases

In older TypeScript projects, business logic often relies on numeric `enum` constructs coupled with a single massive interface packed with optional properties. This anti-pattern yields objects plagued with `undefined | T` fields, forcing engineers to rely on unsafe non-null assertions (`!`) or risky type casts (`as TargetType`).

By adopting discriminated unions, each concrete state model only exposes attributes that legitimately exist under that exact condition. This pattern unleashes TypeScript's control flow analysis and makes runtime state handling completely predictable.

### Legacy Implementation (Before)

Legacy code typically defines bloated models where developers have to guess which fields are present for any given status.

```typescript
// Anti-pattern: Monolithic interface with optional conditional attributes
enum TransactionState {
  PENDING = 0,
  COMPLETED = 1,
  FAILED = 2,
}

interface LegacyTransaction {
  id: string;
  status: TransactionState;
  receiptId?: string; // Only present if COMPLETED
  errorMessage?: string; // Only present if FAILED
  errorCode?: number; // Only present if FAILED
}

function handleTransaction(tx: LegacyTransaction): string {
  if (tx.status === TransactionState.COMPLETED) {
    // Dangerous assumption requiring non-null assertion
    return `Approved receipt: ${tx.receiptId!}`;
  }
  if (tx.status === TransactionState.FAILED) {
    return `Error: ${tx.errorMessage ?? 'Unknown'}`;
  }
  return 'In progress';
}
```

### Modern TypeScript Implementation (After)

We replace the numeric enum with a discriminated union of immutable records, coupled with a compile-time exhaustive `never` assertion.

```typescript
/**
 * Represents the discrete variants of a payment gateway transaction.
 */
export type Transaction =
  | { readonly status: 'pending'; readonly id: string }
  | { readonly status: 'completed'; readonly id: string; readonly receiptId: string; readonly amountInCents: number }
  | { readonly status: 'failed'; readonly id: string; readonly errorCode: number; readonly errorMessage: string };

/**
 * Resolves transaction payloads with 100% compile-time branch coverage.
 *
 * @param tx - The discriminated transaction entity.
 * @returns Human-readable status summary.
 * @throws {TypeError} If an unrecognized status variant reaches runtime execution.
 */
export function handleTransaction(tx: Transaction): string {
  switch (tx.status) {
    case 'pending':
      return `Transaction ${tx.id} awaiting bank authorization.`;
    case 'completed':
      return `Transaction ${tx.id} completed. Receipt: ${tx.receiptId}. Amount: $${(tx.amountInCents / 100).toFixed(2)}`;
    case 'failed':
      return `Transaction ${tx.id} failed (Code ${tx.errorCode}): ${tx.errorMessage}`;
    default: {
      // Exhaustiveness check: compile error will trigger if a new variant is introduced
      const _unreachable: never = tx;
      throw new TypeError(`Unhandled state: ${JSON.stringify(_unreachable)}`);
    }
  }
}
```

## Auto-Documentation and Tooling Standards

1. **TSDoc Precision**: Annotate public APIs using `@param`, `@returns`, and `@throws` tags describing branch validation errors.
2. **Immutability via `readonly`**: Mark union members as readonly to protect incoming payloads from mutation within processors.
3. **Prettier Formatting Consistency**: Enforce leading pipe syntax (`|`) on union definitions for clean diffs and enhanced visual balance across long union definitions.
