---
title: >-
  TypeScript Exhaustivo: Refactorización de Enums y Switch con Uniones
  Discriminadas
slug: typescript-discriminant-unions-exhaustive-type-checks-tsdoc
date: '2026-11-24'
language: typescript
author: JW Solutions
category: Buenas prácticas
meta_description: >-
  Aprende a eliminar enums frágiles en TypeScript usando uniones discriminadas y
  comprobación exhaustiva never con estándares TSDoc y Prettier.
summary: >-
  Moderniza el manejo de estados en TypeScript migrando de enums numéricos a
  uniones discriminadas estrictas con comprobación exhaustiva en tiempo de
  compilación.
related_fix_slug: ts-unterminated-string-literal
interactive_snippet: |-
  type ApiResponse =
    | { status: 'success'; data: { id: string; amount: number } }
    | { status: 'error'; code: number; message: string };

  function handleResponse(res: ApiResponse): string {
    switch (res.status) {
      case 'success':
        return `Pago procesado: ${res.data.id} por $${res.data.amount}`;
      case 'error':
        return `Fallo [${res.code}]: ${res.message}`;
      default: {
        const _exhaustive: never = res;
        return _exhaustive;
      }
    }
  }
faq:
  - q: >-
      ¿Por qué usar un literal string en el discriminante en lugar de enums
      numéricos?
    a: >-
      Los literales string son serializables directamente en JSON sin
      transformaciones auxiliares, son más legibles en registros de auditoría y
      no generan código de objeto inverso en JavaScript transpilado.
  - q: ¿Qué ventaja aporta asignar el default case a una variable de tipo never?
    a: >-
      Si en el futuro se añade una nueva variante a la unión (por ejemplo,
      'reembolsada'), el compilador generará un error sintáctico inmediato si no
      se ha implementado el case correspondiente.
status: published
published_at: '2026-11-24'
---

## El Riesgo de los Estados Ambiguos en Código Legado

En proyectos TypeScript heredados, es común encontrar estructuras de control de flujo basadas en `enum` numéricos o cadenas sueltas combinadas con tipos opcionales gigantescos. Este antipatrón convierte objetos complejos en entidades con propiedades ambiguas (`undefined | T`), obligando a usar aserciones de tipo no seguras (`as Type` o `!`).

Al aplicar uniones discriminadas (*discriminated unions*), cada estado posible del dominio encapsula únicamente los campos que realmente existen bajo esa condición. Esto elimina la necesidad de comprobaciones defensivas innecesarias y habilita el estrechamiento (*type narrowing*) nativo del compilador.

### Código Legado (Antes)

El código antiguo suele depender de interfaces sobrecargadas donde los campos se vuelven opcionales y el compilador no puede verificar qué propiedades pertenecen a cada escenario.

```typescript
// Antipatrón: interfaz monolítica con campos condicionales opcionales
enum EstadoTransaccion {
  PENDIENTE = 0,
  COMPLETADA = 1,
  FALLIDA = 2,
}

interface TransaccionLegacy {
  id: string;
  tipo: EstadoTransaccion;
  reciboId?: string; // Solo presente si COMPLETADA
  motivoError?: string; // Solo presente si FALLIDA
  codigoError?: number; // Solo presente si FALLIDA
}

function procesarTransaccion(tx: TransaccionLegacy): string {
  if (tx.tipo === EstadoTransaccion.COMPLETADA) {
    // Requiere aserción peligrosa o chequeo extra
    return `Aprobado con folio ${tx.reciboId!}`;
  }
  if (tx.tipo === EstadoTransaccion.FALLIDA) {
    return `Error: ${tx.motivoError ?? 'Desconocido'}`;
  }
  return 'En proceso';
}
```

### Refactorización Moderna con TypeScript Estricto (Después)

Reemplazamos el enum y la interfaz flexible por uniones discriminadas literales con un guardián exhaustivo fundamentado en el tipo primitivo `never`.

```typescript
/**
 * Representa las variantes atómicas de una transacción en pasarela de pagos.
 */
export type Transaccion =
  | { readonly estado: 'pendiente'; readonly id: string }
  | { readonly estado: 'completada'; readonly id: string; readonly reciboId: string; readonly totalCentavos: number }
  | { readonly estado: 'fallida'; readonly id: string; readonly codigoError: number; readonly motivoError: string };

/**
 * Maneja la resolución de transacciones garantizando cobertura del 100% en compilación.
 *
 * @param tx - Estructura discriminada de la transacción recibida.
 * @returns Mensaje descriptivo para el cliente o registro de auditoría.
 * @throws {TypeError} Si se omite una variante en tiempo de compilación o ejecución anómala.
 */
export function procesarTransaccion(tx: Transaccion): string {
  switch (tx.estado) {
    case 'pendiente':
      return `Transacción ${tx.id} en espera de validación bancaria.`;
    case 'completada':
      return `Transacción ${tx.id} completada exitosamente. Folio: ${tx.reciboId}. Total: $${(tx.totalCentavos / 100).toFixed(2)}`;
    case 'fallida':
      return `Transacción ${tx.id} rechazada (Código ${tx.codigoError}): ${tx.motivoError}`;
    default: {
      // Type assertion exhaustiva: si se añade un nuevo estado a Transaccion, TS arroja error aquí
      const _unreachable: never = tx;
      throw new TypeError(`Estado no soportado: ${JSON.stringify(_unreachable)}`);
    }
  }
}
```

## Auto-Documentación y Estándares de Formato

1. **TSDoc Estructurado**: Los bloques de comentarios deben detallar `@param`, `@returns` y cualquier `@throws` provocado por la cláusula exhaustiva.
2. **Inmutabilidad con `readonly`**: Garantiza que las propiedades de cada variante no muten durante el procesamiento del flujo.
3. **Formateo con Prettier**: Configura saltos de línea consistentes en uniones multilínea colocando la barra vertical (`|`) alineada al inicio de cada variante para legibilidad superior.
