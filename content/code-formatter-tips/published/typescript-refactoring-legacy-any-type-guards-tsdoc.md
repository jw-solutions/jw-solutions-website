---
title: Refactorización de tipos any en TypeScript con Type Guards y TSDoc
slug: typescript-refactoring-legacy-any-type-guards-tsdoc
date: '2026-11-14'
language: typescript
author: JW Solutions
category: Buenas prácticas
meta_description: >-
  Refactoriza código legado en TypeScript eliminando tipos any mediante Type
  Guards y TSDoc estructurado para pipelines de Auto-Doc AI y Prettier.
summary: >-
  Aprende a eliminar el uso de any en repositorios heredados utilizando
  predicados de tipo estricto en TypeScript y formateo estandarizado TSDoc para
  Auto-Doc AI.
related_fix_slug: ts-unterminated-string-literal
interactive_snippet: |-
  export interface UserProfile {
    id: string;
    role: 'admin' | 'user';
  }

  export function isUserProfile(payload: unknown): payload is UserProfile {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'id' in payload &&
      typeof (payload as Record<string, unknown>).id === 'string' &&
      'role' in payload &&
      ['admin', 'user'].includes((payload as Record<string, unknown>).role as string)
    );
  }
status: published
published_at: '2026-11-14'
---

## El problema del tipo `any` en código legado

Durante migraciones apresuradas de JavaScript a TypeScript, es común encontrar funciones sobrecargadas con el tipo `any`. Aunque este enfoque permite compilar rápidamente, anula las principales ventajas del sistema de tipos estático de TypeScript, ocultando errores de tiempo de ejecución y bloqueando las capacidades de análisis automático de herramientas como Auto-Doc AI.

El uso indiscriminado de `any` no solo propaga la falta de seguridad de tipos a lo largo de toda la aplicación, sino que degrada la DX (Developer Experience) y dificulta el mantenimiento del código por parte de ingenieros junior o modelos de documentación automatizada.

## Código legado sin seguridad de tipos (Antes)

En el siguiente fragmento, la función procesa la respuesta de un servicio externo aceptando un parámetro implícito o explícito de tipo `any`. No existe validación estructural ni bloques de documentación TSDoc normalizados.

```typescript
// ❌ Código legado desestructurado y sin seguridad de tipos
function processUserData(data: any) {
  console.log("User ID:", data.id);
  if (data.role === "admin") {
    return data.permissions.includes("write");
  }
  return false;
}
```

## Refactorización estricta con Type Guards y TSDoc (Después)

Para cumplir con las normas del modo `strict` de TypeScript y permitir que **Auto-Doc AI** genere especificaciones OpenAPI o documentación técnica precisa, debemos utilizar el tipo `unknown` junto con un predicado de tipo personalizado (*Type Guard*) y comentarios TSDoc formalizados.

```typescript
/**
 * Estructura de permisos de usuario validada en runtime.
 */
export interface UserPayload {
  id: string;
  role: 'admin' | 'user';
  permissions: string[];
}

/**
 * Predicado de tipo para verificar si una entidad es un UserPayload válido.
 *
 * @param data - Datos sin estructurar provenientes de una API externa.
 * @returns `true` si la estructura coincide con {@link UserPayload}.
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
 * Evalúa los permisos de escritura de un usuario con validación estricta.
 *
 * @param data - Objeto de datos sin validar.
 * @returns Estado de los permisos de escritura del usuario.
 * @throws {TypeError} Si la estructura del payload no es válida.
 */
export function processUserDataStrict(data: unknown): boolean {
  if (!isUserPayload(data)) {
    throw new TypeError('El payload proporcionado no satisface el tipo UserPayload');
  }
  if (data.role === 'admin') {
    return data.permissions.includes('write');
  }
  return false;
}
```

## Estándares Prettier y documentación para Auto-Doc AI

Para mantener la consistencia dentro de equipos enterprise, asegúrate de configurar Prettier con el plugin `@prettier/plugin-php` o `prettier-plugin-jsdoc` en tu archivo `.prettierrc`:

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tsdoc": true
}
```

### Reglas clave de refactorización:

- **Reemplaza `any` por `unknown`**: Obliga a realizar narrowing antes de acceder a las propiedades.
- **Usa predicados `data is Type`**: Permite al compilador inferir automáticamente el tipo dentro de bloques condicionales `if`.
- **Documenta con TSDoc**: Utiliza etiquetas `@param`, `@returns` y `@throws` para garantizar que **Auto-Doc AI** interprete correctamente el flujo de excepciones y esquemas de datos.
- **Aplica Prettier en CI/CD**: Garantiza que el código refactorizado cumpla estrictamente con la guía de estilo institucional.
