---
title: >-
  PHP 8.3 et PSR-12 : Refactorisation de code hérité avec Typed Properties et
  Enums
slug: php-83-typed-properties-enums-psr12-refactoring
locale: fr
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Apprenez à moderniser du code PHP hérité vers PHP 8.3 en utilisant des
  propriétés typées, des enums stricts et les normes PSR-12 pour une
  maintenabilité accrue.
summary: >-
  Mettez à niveau votre code PHP vers la version 8.3 en adoptant des propriétés
  typées, des enums natifs et le standard PSR-12.
faq:
  - q: Pourquoi déclarer strict_types est-il obligatoire en PHP 8.3 ?
    a: >-
      Cela garantit que PHP n'effectue pas de conversions de types implicites et
      lève une exception en cas de type incorrect.
  - q: Comment les Enums facilitent-ils la refactorisation ?
    a: >-
      Ils éliminent les chaînes magiques et limitent les valeurs possibles à un
      ensemble fini validé à la compilation.
status: published
published_at: '2026-11-15'
---

L'évolution de PHP vers un typage strict et robuste a profondément transformé la conception des architectures logicielles modernes. Avec PHP 8.3, l'utilisation de propriétés typées (typed properties), de constructeurs promus et d'énumérations (Enums) natives permet d'éliminer le code boilerplate et les erreurs d'exécution subtiles.

Cependant, de nombreux projets hérités traînent encore de mauvaises pratiques, telles que l'utilisation excessive de tableaux associatifs sans structure définie et une non-conformité totale avec les guides de style PSR-12. Cela nuit à la lisibilité et complique l'intégration d'outils de documentation automatisée.

### Le Problème dans le Code Hérité

Le vieux code PHP abuse souvent de tableaux associatifs pour transférer des données, masquant les types de données réels et provoquant des bugs difficiles à tracer.

```php
// AVANT : Code hérité fragile et non typé
class UserManager {
    public function processUser($data) {
        $user = [];
        $user['name'] = $data['name'];
        $user['status'] = $data['status']; // Est-ce 'active', 'pending' ou un chiffre ?
        return $user;
    }
}
```

Cette approche manque d'autocomplétion dans l'IDE et viole les règles de base de PSR-12 concernant la visibilité et l'espacement.

### La Solution Moderne avec PHP 8.3 et PSR-12

Refactoriser cette conception à l'aide de classes en lecture seule (`readonly class`), d'Enums natifs et de types stricts (`declare(strict_types=1);`) garantit l'intégrité des données.

```php
// APRÈS : Code robuste avec PHP 8.3, Enums et PSR-12
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

### Intégration avec Auto-Doc AI

Notre outil **Code Formatter & Auto-Doc AI** analyse automatiquement les déclarations de types et les Enums pour générer des blocs PHPDoc précis sans intervention manuelle :

```php
/**
 * Représente un profil utilisateur immuable.
 *
 * @package JWSolutions\Formatting
 * @since 2026-11-15
 */
readonly class UserProfile
{
    /**
     * @param string $name Nom complet de l'utilisateur.
     * @param UserStatus $status Statut actuel de l'utilisateur basé sur l'Enum.
     */
    public function __construct(
        public string $name,
        public UserStatus $status
    ) {}
}
```

### Liste de Contrôle

- [ ] Avez-vous inclus `declare(strict_types=1);` au sommet de chaque fichier ?
- [ ] Toutes les propriétés des classes sont-elles fortement typées ?
- [ ] Les constantes magiques ont-elles été remplacées par des `Backed Enums` ?
- [ ] Le code respecte-t-il l'espacement, l'indentation et les sauts de ligne PSR-12 ?
