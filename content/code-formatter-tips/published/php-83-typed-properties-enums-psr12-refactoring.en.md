---
title: 'PHP 8.3 and PSR-12: Refactoring Legacy Code with Typed Properties and Enums'
slug: php-83-typed-properties-enums-psr12-refactoring
locale: en
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Learn to modernize legacy PHP code to PHP 8.3 using typed properties, strict
  enums, and PSR-12 compliance to boost readability and maintainability.
summary: >-
  Upgrade your PHP codebase to version 8.3 by implementing typed properties,
  native enums, and the PSR-12 standard to ensure long-term maintainability.
faq:
  - q: Why is declaring strict_types mandatory in PHP 8.3?
    a: >-
      It ensures PHP does not attempt implicit data type conversions, throwing
      an exception if an incorrect type is provided.
  - q: How do Enums help improve refactoring?
    a: >-
      They eliminate magic strings and restrict possible values to a finite set
      validated at compile time.
status: published
published_at: '2026-11-15'
---

The evolution of PHP towards strict and robust typing has radically transformed how we design modern software architectures. In recent releases, especially with the arrival of PHP 8.3, the use of typed properties, promoted constructors, and native enumerations (Enums) allows developers to eliminate boilerplate code and subtle runtime bugs during development.

However, many legacy projects still carry bad practices, such as loose global variables, generic associative arrays with no defined structure, and a complete absence of compliance with official PSR-12 style guides. This affects code readability and hinders the integration of automated documentation and formatting tools.

### The Problem in Legacy Code

Older PHP code often overuses associative arrays to transfer data between application layers, hiding real data types and causing hard-to-track errors.

```php
// BEFORE: Fragile and untyped legacy code
class UserManager {
    public function processUser($data) {
        $user = [];
        $user['name'] = $data['name'];
        $user['status'] = $data['status']; // Is it 'active', 'pending', or a number?
        return $user;
    }
}
```

This approach lacks IDE autocompletion, fails to validate input data, and violates basic PSR-12 rules regarding method visibility and spacing.

### The Modern Solution with PHP 8.3 and PSR-12

Refactoring this design using `readonly class`, native Enums, and strict types (`declare(strict_types=1);`) guarantees data integrity from the moment objects are instantiated.

```php
// AFTER: Robust code using PHP 8.3, Enums, and PSR-12
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

### Integration with Auto-Doc AI

Our **Code Formatter & Auto-Doc AI** tool automatically analyzes type declarations and Enums to generate accurate PHPDoc blocks without manual intervention:

```php
/**
 * Represents an immutable user profile.
 *
 * @package JWSolutions\Formatting
 * @since 2026-11-15
 */
readonly class UserProfile
{
    /**
     * @param string $name Full name of the user.
     * @param UserStatus $status Current user status based on the Enum.
     */
    public function __construct(
        public string $name,
        public UserStatus $status
    ) {}
}
```

### Verification Checklist

- [ ] Have you included `declare(strict_types=1);` at the top of each file?
- [ ] Are all class properties strongly typed?
- [ ] Have magic constants been replaced with `Backed Enums`?
- [ ] Does the code comply with PSR-12 spacing, indentation, and line breaks?
