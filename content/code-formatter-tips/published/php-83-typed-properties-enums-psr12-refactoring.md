---
title: >-
  PHP 8.3 y PSR-12: Refactorización de código legado con Typed Properties y
  Enums
slug: php-83-typed-properties-enums-psr12-refactoring
date: '2026-11-15'
language: php
author: JW Solutions
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Aprende a modernizar código PHP legado a PHP 8.3 utilizando typed properties,
  enums estrictos y cumpliendo con PSR-12 para mejorar legibilidad y
  mantenibilidad.
summary: >-
  Actualiza tu código base en PHP a la versión 8.3 implementando propiedades
  tipadas, enums nativos y el estándar PSR-12 para garantizar mantenibilidad a
  largo plazo.
related_fix_slug: php-parse-error-unclosed-brace
interactive_snippet: |-
  <?php

  declare(strict_types=1);

  namespace JW\Solutions\Formatting;

  enum Status: string
  {
      case Active = 'active';
      case Pending = 'pending';
  }

  readonly class UserProfile
  {
      public function __construct(
          public readonly string $username,
          public readonly Status $status
      ) {}
  }
faq:
  - q: ¿Por qué es obligatorio declarar strict_types en PHP 8.3?
    a: >-
      Garantiza que PHP no intente realizar conversiones implícitas de tipos de
      datos, lanzando una excepción si se pasa un tipo incorrecto.
  - q: ¿Cómo ayudan los Enums a mejorar la refactorización?
    a: >-
      Eliminan los 'magic strings' y restringen los valores posibles a un
      conjunto finito y validado en tiempo de compilación.
status: published
published_at: '2026-11-15'
---

La evolución de PHP hacia un tipado estricto y robusto ha transformado radicalmente cómo diseñamos arquitecturas de software modernas. En las versiones recientes, especialmente con la llegada de PHP 8.3, el uso de propiedades tipadas (typed properties), constructores promocionados y enumeraciones (Enums) nativas permite eliminar una gran cantidad de código boilerplate y errores sutiles de ejecución en tiempo de desarrollo.

Sin embargo, muchos proyectos heredados (legados) aún arrastran malas prácticas, como variables globales sueltas, arreglos asociativos genéricos sin estructura definida y una total ausencia de conformidad con las guías de estilo oficiales PSR-12. Esto no solo afecta la legibilidad del código, sino que dificulta la integración de herramientas automatizadas de documentación y formateo.

### El Problema en el Código Legado

El código antiguo en PHP a menudo abusa de arreglos asociativos para transferir datos entre capas de la aplicación, lo que oculta los tipos de datos reales y provoca errores difíciles de rastrear.

```php
// ANTES: Código legado frágil y sin tipado
class UserManager {
    public function processUser($data) {
        $user = [];
        $user['name'] = $data['name'];
        $user['status'] = $data['status']; // ¿Es 'active', 'pending' o un número?
        return $user;
    }
}
```

Este enfoque carece de autocompletado en el IDE, no valida los datos de entrada y viola las normas básicas de PSR-12 relativas a la visibilidad y espaciado de métodos.

### La Solución Moderna con PHP 8.3 y PSR-12

Refactorizar este diseño utilizando clases de solo lectura (`readonly class`), Enums nativos y tipos estrictos (`declare(strict_types=1);`) garantiza la integridad de los datos desde el momento en que se instancian.

```php
// DESPUÉS: Código robusto con PHP 8.3, Enums y PSR-12
declare(strict_types=1);

namespace JWSolutions\Formatting;

enum UserStatus: string {
    case ACTIVE = 'active';
    case PENDING = 'pending';
}

readonly class UserProfile
{
    public function __construct(
        public string $name,
        public UserStatus $status
    ) {}
}
```

### Integración con Auto-Doc AI

Nuestra herramienta **Code Formatter & Auto-Doc AI** analiza automáticamente las declaraciones de tipos y los Enums para generar bloques PHPDoc precisos sin intervención manual:

```php
/**
 * Representa un perfil de usuario inmutable.
 *
 * @package JWSolutions\Formatting
 * @since 2026-11-15
 */
readonly class UserProfile
{
    /**
     * @param string $name Nombre completo del usuario.
     * @param UserStatus $status Estado actual del usuario basado en el Enum.
     */
    public function __construct(
        public string $name,
        public UserStatus $status
    ) {}
}
```

### Checklist de Verificación

- [ ] ¿Has incluido `declare(strict_types=1);` al inicio de cada archivo?
- [ ] ¿Están todas las propiedades de las clases fuertemente tipadas?
- [ ] ¿Se han sustituido las constantes mágicas por `Backed Enums`?
- [ ] ¿Cumple el código con los espacios, indentación y saltos de línea de PSR-12?
