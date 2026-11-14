---
title: Refactoring Legacy any Types in TypeScript with Type Guards and TSDoc
slug: typescript-refactoring-legacy-any-type-guards-tsdoc
locale: en
category: Buenas prácticas
meta_description: >-
  Refactor legacy TypeScript code by eliminating any types with custom Type
  Guards and TSDoc annotations optimized for Prettier and Auto-Doc AI.
summary: >-
  Learn how to remove any types from legacy codebases using strict type
  predicates in TypeScript and standardized TSDoc formatting for Auto-Doc AI.
status: published
published_at: '2026-11-14'
---

## The Problem with `any` in Legacy Codebases

During rapid migrations from JavaScript to TypeScript, developers frequently annotate complex data structures with `any`. While this allows the project to compile immediately, it completely disables TypeScript's static type checker, hiding potential runtime exceptions and breaking downstream automation tools like Auto-Doc AI.

Overusing `any` introduces technical debt that trickles down to modern pipelines. It destroys IDE IntelliSense support and prevents documentation engines from inferring true domain models.

## Untyped Legacy Code (Before)

In the following snippet, an API payload is handled using an implicit or explicit `any` type. There is no runtime checking, type safety, or structured TSDoc metadata.

```typescript
// ❌ Legacy untyped code susceptible to runtime errors
function processUserData(data: any) {
  console.log("User ID:", data.id);
  if (data.role === "admin") {
    return data.permissions.includes("write");
  }
  return false;
}
```

## Strict Refactoring with Type Guards and TSDoc (After)

To align with TypeScript's strict mode requirements and enable **Auto-Doc AI** to generate automated API specifications, we replace `any` with `unknown` and implement a custom Type Guard alongside formatted TSDoc comments.

```typescript
/**
 * Validated user permissions structure.
 */
export interface UserPayload {
  id: string;
  role: 'admin' | 'user';
  permissions: string[];
}

/**
 * Custom type guard predicate verifying object structure.
 *
 * @param data - Unstructured payload from remote API.
 * @returns `true` if payload conforms to {@link UserPayload}.
 */
export function isUserPayload(data: unknown): data is UserPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as Record<string, unknown>).id === 'string' &&
    'role' in data &&
    ['admin', 'user'].includes((data as Record<string, unknown>).role as string) &&
    'permissions' in data &&
    Array.isArray((data as Record<string, unknown>).permissions)
  );
}

/**
 * Evaluates user write privileges with strict runtime validation.
 *
 * @param data - Raw unvalidated input object.
 * @returns True if user has active write permission.
 * @throws {TypeError} If payload structure validation fails.
 */
export function processUserDataStrict(data: unknown): boolean {
  if (!isUserPayload(data)) {
    throw new TypeError('Invalid payload structure: does not satisfy UserPayload');
  }
  if (data.role === 'admin') {
    return data.permissions.includes('write');
  }
  return false;
}
```

## Prettier Integration and Auto-Doc AI Standards

Ensure code consistency across large scale enterprise applications by adding JSDoc/TSDoc formatting plugins to your `.prettierrc` configuration:

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tsdoc": true
}
```

### Key Refactoring Best Practices:

- **Replace `any` with `unknown`**: Forces developers to narrow types safely prior to accessing properties.
- **Leverage Type Predicates (`data is Type`)**: Enables the TypeScript compiler to infer types inside validated conditional blocks.
- **Standardize with TSDoc**: Explicit `@param`, `@returns`, and `@throws` tags empower **Auto-Doc AI** to generate complete API documentation automatically.
- **Enforce Rules via CI/CD**: Run Prettier and strict TypeScript compilation checks on every pull request.
