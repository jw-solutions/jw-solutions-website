---
title: Refactoring del Tipo any in TypeScript con Type Guard e TSDoc
slug: typescript-refactoring-legacy-any-type-guards-tsdoc
locale: it
category: Buenas prácticas
meta_description: >-
  Refactoring del codice legacy TypeScript: elimina il tipo any usando Type
  Guard e TSDoc strutturati per Auto-Doc AI e Prettier.
summary: >-
  Impara a rimuovere i tipi any dal codice legacy TypeScript usando Type Guard e
  commenti TSDoc ottimizzati per i sistemi Auto-Doc AI.
status: published
published_at: '2026-11-14'
---

## Il Problema del Tipo `any` nei Sistemi Legacy

Durante la migrazione di codebase da JavaScript a TypeScript, viene spesso utilizzato il tipo `any` per aggirare i controlli del compilatore. Sebbene questo permetta di compilare il progetto immediatamente, disabilita il type checker statico, nasconde possibili eccezioni a runtime e impedisce a strumenti come Auto-Doc AI di analizzare correttamente la struttura del codice.

Sostituire `any` con costrutti sicuri è essenziale per ridurre il debito tecnico e garantire la manutenibilità del progetto nel tempo.

## Codice Legacy Non Sicuro (Prima)

L'esempio seguente mostra una funzione che elabora dati generici priva di validazione runtime o documentazione TSDoc.

```typescript
// ❌ Codice legacy privo di controllo dei tipi e di TSDoc
function processUserData(data: any) {
  console.log("User ID:", data.id);
  if (data.role === "admin") {
    return data.permissions.includes("write");
  }
  return false;
}
```

## Refactoring Stretto con Type Guard e TSDoc (Dopo)

Per conformarsi alle regole della modalità strict di TypeScript e consentire ad **Auto-Doc AI** di documentare le API in modo automatizzato, sostituiamo `any` con `unknown` e creiamo un Type Guard dedicato.

```typescript
/**
 * Struttura dei dati utente verificata.
 */
export interface UserPayload {
  id: string;
  role: 'admin' | 'user';
  permissions: string[];
}

/**
 * Predicato di tipo per la verifica della struttura a runtime.
 *
 * @param data - Dati non strutturati provenienti da una API.
 * @returns `true` se l'oggetto è conforme all'interfaccia {@link UserPayload}.
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
 * Valuta i permessi di scrittura dell'utente con controllo rigoroso.
 *
 * @param data - Input non validato.
 * @returns `true` se l'utente possiede i permessi di scrittura.
 * @throws {TypeError} Se la struttura dei dati non è valida.
 */
export function processUserDataStrict(data: unknown): boolean {
  if (!isUserPayload(data)) {
    throw new TypeError('Payload non valido: non soddisfa l interfaccia UserPayload');
  }
  if (data.role === 'admin') {
    return data.permissions.includes('write');
  }
  return false;
}
```

## Configurazione Prettier e Standard Auto-Doc AI

Aggiungi le configurazioni di formattazione al file `.prettierrc` del progetto enterprise:

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tsdoc": true
}
```

### Regole Fondamentali per il Refactoring:

- **Sostituisci `any` con `unknown`**: Impone l'esecuzione del narrowing prima di accedere alle proprietà.
- **Usa i Type Predicate (`data is Type`)**: Consente al compilatore di dedurre i tipi nei blocchi condizionali.
- **Formatta con TSDoc**: I tag `@param`, `@returns` e `@throws` consentono ad **Auto-Doc AI** di generare report accurati.
- **Valida nel CI/CD**: Esegui Prettier e il controllo dei tipi ad ogni Pull Request.
