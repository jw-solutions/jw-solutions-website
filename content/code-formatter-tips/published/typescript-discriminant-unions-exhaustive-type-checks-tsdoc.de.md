---
title: 'Exhaustives TypeScript: Refactoring von Enums zu Diskriminierten Unions'
slug: typescript-discriminant-unions-exhaustive-type-checks-tsdoc
locale: de
category: Buenas prácticas
meta_description: >-
  Refaktorisieren Sie TypeScript-Code mit diskriminierten Unions und exhaustiver
  never-Prüfung nach modernen TSDoc- und Prettier-Standards.
summary: >-
  Ersetzen Sie fehleranfällige Enums und optionale Felder in TypeScript durch
  diskriminierte Unions mit lückenloser Typprüfung zur Build-Zeit.
faq:
  - q: Welche Schwachstelle haben klassische numerische TypeScript-Enums?
    a: >-
      Numerische Enums bieten keine echte Typsisolation gegenüber beliebigen
      Zahlen und generieren unnötigen JavaScript-Code im Build-Ergebnis.
  - q: Wie verhindert der Typ never Fehler beim Hinzufügen neuer Statuswerte?
    a: >-
      Wird die Union um einen neuen Zustand erweitert, schlägt die Zuweisung an
      never im default-Zweig fehl, bis das neue case-Statement ergänzt ist.
status: published
published_at: '2026-11-24'
---

## Beseitigung von Status-Mehrdeutigkeiten in Altsystemen

In gewachsenen TypeScript-Codebasen basiert die Geschäftslogik häufig auf numerischen `enum`-Konstrukten in Verbindung mit überladenen Schnittstellen voller optionaler Felder. Dieses Anti-Pattern führt zu Objekten mit unklarem Zustand (`undefined | T`), was Entwickler zur Nutzung unsicherer Assertions (`!`) oder riskanter `as`-Casts zwingt.

Durch den Umstieg auf diskriminierte Unions (*discriminated unions*) deklariert jede Statusvariante exakt jene Datenfelder, die in diesem spezifischen Fall gültig sind. Das Kontrollfluss-Narrowing von TypeScript erkennt das diskriminierende Feld automatisch und garantiert absolute Typsicherheit.

### Veralteter Legacy-Code (Vorher)

Im alten Stil muss der Entwickler manuell erraten, welche Attribute bei einem bestimmten Status tatsächlich existieren.

```typescript
// Anti-Pattern: Monolithisches Interface mit unsicheren optionalen Feldern
enum TransaktionsStatus {
  OFFEN = 0,
  ERFOLGREICH = 1,
  FEHLGESCHLAGEN = 2,
}

interface LegacyTransaktion {
  id: string;
  status: TransaktionsStatus;
  belegId?: string; // Nur vorhanden bei ERFOLGREICH
  fehlermeldung?: string; // Nur vorhanden bei FEHLGESCHLAGEN
  fehlerCode?: number; // Nur vorhanden bei FEHLGESCHLAGEN
}

function verarbeiteTransaktion(tx: LegacyTransaktion): string {
  if (tx.status === TransaktionsStatus.ERFOLGREICH) {
    return `Beleg: ${tx.belegId!}`;
  }
  if (tx.status === TransaktionsStatus.FEHLGESCHLAGEN) {
    return `Fehler: ${tx.fehlermeldung ?? 'Unbekannt'}`;
  }
  return 'Warten';
}
```

### Moderne Implementierung mit striktem TypeScript (Nachher)

Wir ersetzen das Enum durch eine unveränderliche diskriminierte Union samt exhaustiver `never`-Absicherung im Default-Zweig.

```typescript
/**
 * Definiert die diskreten Zustände einer Zahlungstransaktion.
 */
export type Transaktion =
  | { readonly status: 'offen'; readonly id: string }
  | { readonly status: 'erfolgreich'; readonly id: string; readonly belegId: string; readonly centBetrag: number }
  | { readonly status: 'fehlgeschlagen'; readonly id: string; readonly fehlerCode: number; readonly fehlermeldung: string };

/**
 * Verarbeitet den Transaktionsstatus mit 100%iger Vollständigkeitsprüfung.
 *
 * @param tx - Die typisierte diskriminierte Transaktionsstruktur.
 * @returns Formatierte Rückmeldung für das Reporting.
 * @throws {TypeError} Falls zur Laufzeit eine unerwartete Variante eintrifft.
 */
export function verarbeiteTransaktion(tx: Transaktion): string {
  switch (tx.status) {
    case 'offen':
      return `Transaktion ${tx.id} wartet auf Autorisierung.`;
    case 'erfolgreich':
      return `Transaktion ${tx.id} verbucht. Beleg: ${tx.belegId}. Betrag: ${(tx.centBetrag / 100).toFixed(2)} €`;
    case 'fehlgeschlagen':
      return `Transaktion ${tx.id} abgelehnt (Code ${tx.fehlerCode}): ${tx.fehlermeldung}`;
    default: {
      // Exhaustive Prüfung: Meldet Compiler-Fehler bei fehlenden Fällen
      const _unerreichbar: never = tx;
      throw new TypeError(`Unbekannter Zustand: ${JSON.stringify(_unerreichbar)}`);
    }
  }
}
```

## Auto-Dokumentation und Formatierungsrichtlinien

1. **TSDoc-Standard**: Dokumentieren Sie Schnittstellen explizit mit `@param`, `@returns` und `@throws`.
2. **Unveränderlichkeit mit `readonly`**: Verhindern Sie unerwünschte Nebeneffekte durch Mutation der Union-Felder.
3. **Prettier-Regeln**: Führen Sie die Pipe (`|`) an den Anfang jeder Zeile bei mehrzeiligen Unions, um Code-Reviews zu vereinfachen.
