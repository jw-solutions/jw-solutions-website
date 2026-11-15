---
title: 'PHP 8.3 und PSR-12: Refactoring von Alcode mit Typed Properties und Enums'
slug: php-83-typed-properties-enums-psr12-refactoring
locale: de
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Erfahren Sie, wie Sie alten PHP-Code auf PHP 8.3 mit Typed Properties,
  strikten Enums und PSR-12-Konformität modernisieren, um die Lesbarkeit zu
  verbessern.
summary: >-
  Aktualisieren Sie Ihre PHP-Codebasis auf Version 8.3, indem Sie typisierte
  Eigenschaften, native Enums und den PSR-12-Standard implementieren.
faq:
  - q: Warum ist strict_types in PHP 8.3 obligatorisch?
    a: >-
      Es stellt sicher, dass PHP keine impliziten Typumwandlungen vornimmt und
      bei falschem Typ eine Ausnahme auslöst.
  - q: Wie helfen Enums beim Refactoring?
    a: >-
      Sie beseitigen magische Strings und beschränken gültige Werte auf ein zur
      Kompilierzeit validiertes Set.
status: published
published_at: '2026-11-15'
---

Die Evolution von PHP hin zu strenger und robuster Typisierung hat das Design moderner Softwarearchitekturen grundlegend verändert. In neueren Versionen, insbesondere mit PHP 8.3, ermöglicht die Verwendung von typisierten Eigenschaften (typed properties), beförderten Konstruktoren und nativen Enumerationen (Enums) die Eliminierung von Boilerplate-Code und subtilen Laufzeitfehlern.

Viele Altsysteme (Legacy-Projekte) leiden jedoch weiterhin unter schlechten Praktiken, wie losen globalen Variablen, generischen assoziativen Arrays ohne definierte Struktur und der Missachtung der offiziellen PSR-12-Richtlinien. Dies erschwert die Lesbarkeit und die Integration automatisierter Dokumentationswerkzeuge.

### Das Problem im Legacy-Code

Älterer PHP-Code verwendet häufig assoziative Arrays zur Datenübertragung zwischen Schichten, wodurch Datentypen verschleiert und schwer auffindbare Fehler verursacht werden.

```php
// VORHER: Fragiler und untypisierter Legacy-Code
class UserManager {
    public function processUser($data) {
        $user = [];
        $user['name'] = $data['name'];
        $user['status'] = $data['status']; // Ist es 'active', 'pending' oder eine Zahl?
        return $user;
    }
}
```

Dieser Ansatz bietet keine IDE-Autovervollständigung, validiert Eingabedaten nicht und verstößt gegen grundlegende PSR-12-Regeln für Sichtbarkeit und Formatierung.

### Die moderne Lösung mit PHP 8.3 und PSR-12

Ein Refactoring dieses Entwurfs mit Readonly-Klassen (`readonly class`), nativen Enums und strengen Typen (`declare(strict_types=1);`) sichert die Datenintegrität ab dem Zeitpunkt der Instanziierung.

```php
// NACHHER: Robustes Code mit PHP 8.3, Enums und PSR-12
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

### Integration mit Auto-Doc AI

Unser Tool **Code Formatter & Auto-Doc AI** analysiert Typdeklarationen und Enums automatisch, um präzise PHPDoc-Blöcke ohne manuelle Eingriffe zu erstellen:

```php
/**
 * Repräsentiert ein unveränderliches Benutzerprofil.
 *
 * @package JWSolutions\Formatting
 * @since 2026-11-15
 */
readonly class UserProfile
{
    /**
     * @param string $name Vollständiger Name des Benutzers.
     * @param UserStatus $status Aktueller Status des Benutzers basierend auf dem Enum.
     */
    public function __construct(
        public string$name,
        public UserStatus $status
    ) {}
}
```

### Checkliste zur Verifizierung

- [ ] Haben Sie `declare(strict_types=1);` am Anfang jeder Datei eingefügt?
- [ ] Sind alle Klasseneigenschaften streng typisiert?
- [ ] Wurden magische Konstanten durch `Backed Enums` ersetzt?
- [ ] Entspricht der Code den PSR-12-Regeln für Abstände und Zeilenumbrüche?
