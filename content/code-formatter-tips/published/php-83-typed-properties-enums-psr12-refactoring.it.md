---
title: 'PHP 8.3 e PSR-12: Refactoring di Codice Legacy con Typed Properties ed Enums'
slug: php-83-typed-properties-enums-psr12-refactoring
locale: it
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Scopri come modernizzare il codice PHP legacy a PHP 8.3 utilizzando typed
  properties, enum rigorosi e conformità PSR-12 per migliorare leggibilità e
  manutenzione.
summary: >-
  Aggiorna la tua codebase PHP alla versione 8.3 implementando proprietà
  tipizzate, enum nativi e lo standard PSR-12 per una manutenzione a lungo
  termine.
faq:
  - q: Perché è obbligatorio dichiarare strict_types in PHP 8.3?
    a: >-
      Garantisce che PHP non tenti conversioni implicite di tipo, lanciando
      un'eccezione se viene passato un tipo errato.
  - q: In che modo gli Enums migliorano il refactoring?
    a: >-
      Eliminano le stringhe magiche e limitano i valori possibili a un insieme
      finito convalidato in compilazione.
status: published
published_at: '2026-11-15'
---

L'evoluzione di PHP verso una tipizzazione rigorosa e robusta ha trasformato radicalmente il design delle moderne architetture software. Nelle versioni recenti, in particolare con PHP 8.3, l'uso di proprietà tipizzate (typed properties), costruttori promossi e enumerazioni (Enums) native consente di eliminare il codice boilerplate e bug di runtime.

Tuttavia, molti progetti legacy ereditano ancora cattive pratiche, come variabili globali sparse, array associativi generici senza una struttura definita e la totale assenza di conformità con le linee guida ufficiali PSR-12. Ciò influisce sulla leggibilità del codice e ostacola l'integrazione di strumenti automatizzati.

### Il Problema nel Codice Legacy

Il vecchio codice PHP abusa spesso di array associativi per trasferire dati tra i livelli dell'applicazione, nascondendo i tipi di dati reali e generando errori difficili da tracciare.

```php
// PRIMA: Codice legacy fragile e non tipizzato
class UserManager {
    public function processUser($data) {
        $user = [];
        $user['name'] = $data['name'];
        $user['status'] = $data['status']; // È 'active', 'pending' o un numero?
        return $user;
    }
}
```

Questo approccio manca di autocompletamento nell'IDE, non valida i dati in ingresso e viola le regole di base PSR-12 sulla visibilità e spaziatura.

### La Soluzione Moderna con PHP 8.3 e PSR-12

Effettuare il refactoring di questo design utilizzando classi di sola lettura (`readonly class`), Enums nativi e tipi rigorosi (`declare(strict_types=1);`) garantisce l'integrità dei dati fin dalla loro istanziazione.

```php
// DOPO: Codice robusto con PHP 8.3, Enums e PSR-12
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

### Integrazione con Auto-Doc AI

Il nostro strumento **Code Formatter & Auto-Doc AI** analizza automaticamente le dichiarazioni di tipo e gli Enums per generare blocchi PHPDoc accurati senza intervento manuale:

```php
/**
 * Rappresenta un profilo utente immutabile.
 *
 * @package JWSolutions\Formatting
 * @since 2026-11-15
 */
readonly class UserProfile
{
    /**
     * @param string $name Nome completo dell'utente.
     * @param UserStatus $status Stato attuale dell'utente basato sull'Enum.
     */
    public function __construct(
        public string $name,
        public UserStatus $status
    ) {}
}
```

### Checklist di Verifica

- [ ] Hai incluso `declare(strict_types=1);` in cima a ogni file?
- [ ] Tutte le proprietà delle classi sono fortemente tipizzate?
- [ ] Le costanti magiche sono state sostituite con `Backed Enums`?
- [ ] Il codice rispetta la spaziatura, l'indentazione e i ritorni a capo PSR-12?
