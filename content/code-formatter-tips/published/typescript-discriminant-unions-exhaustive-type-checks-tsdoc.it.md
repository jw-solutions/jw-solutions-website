---
title: 'TypeScript Esaustivo: Refactoring da Enum a Unioni Discriminate'
slug: typescript-discriminant-unions-exhaustive-type-checks-tsdoc
locale: it
category: Buenas prácticas
meta_description: >-
  Riscrivi il codice TypeScript legacy rimpiazzando enum instabili con unioni
  discriminate, controllo esaustivo never e standard TSDoc.
summary: >-
  Elimina interfacce opzionali e vecchi enum numerici adottando le unioni
  discriminate in TypeScript con controllo esaustivo in fase di build.
faq:
  - q: >-
      Quale vantaggio offrono i letterali stringa rispetto agli enum TypeScript
      standard?
    a: >-
      Non generano funzioni IIFE accessorie nel file compilato e si integrano
      perfettamente nelle API REST serializzate in formato JSON.
  - q: >-
      In che modo il controllo default con never previene i bug nelle release
      future?
    a: >-
      Se viene aggiunto un nuovo valore all'unione senza aggiornare tutti i
      blocchi switch correlati, il compilatore genera un errore di compilazione
      immediato.
status: published
published_at: '2026-11-24'
---

## Eliminare l'Ambiguità di Stato nel Codice Legacy

Nei progetti TypeScript non aggiornati, la gestione dei flussi applicativi ricorre spesso a `enum` numerici combinati con interfacce sature di attributi opzionali. Tale convenzione introduce proprietà di tipo `undefined | T`, costringendo gli sviluppatori a utilizzare asserzioni di non-nullità pericolose (`!`) o conversioni forzate (`as`).

Adottando le unioni discriminate (*discriminated unions*), ogni stato esprime unicamente i campi validi per quello specifico scenario. Il compilatore di TypeScript applica il restringimento dei tipi (*type narrowing*) in maniera automatica e sicura.

### Codice Legacy (Prima)

Il modello precedente impone al programmatore di presumere quali campi siano effettivamente popolati in base al valore dell'enum.

```typescript
// Anti-pattern: interfaccia monolitica con troppi campi opzionali
enum StatoPagamento {
  IN_ATTESA = 0,
  COMPLETATO = 1,
  FALLITO = 2,
}

interface TransazioneLegacy {
  id: string;
  stato: StatoPagamento;
  ricevutaId?: string; // Presente solo se COMPLETATO
  motivoErrore?: string; // Presente solo se FALLITO
  codiceErrore?: number; // Presente solo se FALLITO
}

function gestisciTransazione(tx: TransazioneLegacy): string {
  if (tx.stato === StatoPagamento.COMPLETATO) {
    return `Approvato: ricevuta ${tx.ricevutaId!}`;
  }
  if (tx.stato === StatoPagamento.FALLITO) {
    return `Errore: ${tx.motivoErrore ?? 'Sconosciuto'}`;
  }
  return 'In attesa';
}
```

### Implementazione Moderna in TypeScript Rigoroso (Dopo)

Sostituiamo l'enum con un'unione discriminata immutabile associata a un controllo esaustivo affidato al tipo `never`.

```typescript
/**
 * Rappresenta i diversi stati atomici di una transazione finanziaria.
 */
export type Transazione =
  | { readonly stato: 'in_attesa'; readonly id: string }
  | { readonly stato: 'completato'; readonly id: string; readonly ricevutaId: string; readonly importoCentesimi: number }
  | { readonly stato: 'fallito'; readonly id: string; readonly codiceErrore: number; readonly motivoErrore: string };

/**
 * Gestisce la transazione assicurando copertura esaustiva al 100% in compilazione.
 *
 * @param tx - Istanza della transazione tipizzata con unione discriminata.
 * @returns Stringa descrittiva per log o visualizzazione.
 * @throws {TypeError} Qualora uno stato non gestito pervenga a runtime.
 */
export function gestisciTransazione(tx: Transazione): string {
  switch (tx.stato) {
    case 'in_attesa':
      return `Transazione ${tx.id} in attesa di risposta bancaria.`;
    case 'completato':
      return `Transazione ${tx.id} completata. Ricevuta: ${tx.ricevutaId}. Totale: € ${(tx.importoCentesimi / 100).toFixed(2)}`;
    case 'fallito':
      return `Transazione ${tx.id} rifiutata (Codice ${tx.codiceErrore}): ${tx.motivoErrore}`;
    default: {
      // Controllo di esaustività: fallisce la compilazione se viene omesso un ramo
      const _irraggiungibile: never = tx;
      throw new TypeError(`Stato non gestito: ${JSON.stringify(_irraggiungibile)}`);
    }
  }
}
```

## Auto-Documentazione e Standard di Qualità

1. **TSDoc Dettagliato**: Specifica con precisione `@param`, `@returns` e `@throws` per descrivere i limiti operativi delle funzioni.
2. **Immutabilità con `readonly`**: Difende l'integrità del payload da modifiche non volute durante il flusso di lavoro.
3. **Formattazione Prettier**: Imposta il carattere pipe (`|`) a inizio riga per unire pulizia visiva e facilità di lettura nei diff dei commit.
