---
title: 'DAX Moderno: Formattazione VAR/RETURN e Auto-Documentazione con IA'
slug: dax-var-return-calculate-auto-doc-formatting
locale: it
category: Auto-Doc AI
meta_description: >-
  Ottimizza le misure DAX con variabili VAR/RETURN, CALCULATE strutturato e
  metadati pronti per i motori di Auto-Documentazione basati su IA.
summary: >-
  Migliora prestazioni e chiarezza nei modelli semantici DAX adottando la
  struttura VAR/RETURN e commenti semantici per l'Auto-Doc AI.
faq:
  - q: Le variabili VAR in DAX possono causare ricalcoli non necessari?
    a: >-
      No. In DAX, le variabili vengono valutate una sola volta al momento della
      dichiarazione e mantengono un valore costante. Non comportano alcun
      ricalcolo dinamico all'interno dell'istruzione RETURN.
  - q: Per quale motivo l'indentazione DAX semplifica l'analisi dell'IA?
    a: >-
      Un'indentazione standardizzata a 4 spazi definisce confini chiari tra
      espressioni numeriche e tabelle filtro, permettendo ai parser IA di
      estrarre la corretta genealogia dei dati senza ambiguità sintattiche.
status: published
published_at: '2026-11-19'
---

## La sfida della manutenibilità nei modelli semantici DAX

All'interno di Power BI e Analysis Services, le misure analitiche tendono a trasformarsi in formule illeggibili quando si concatenano blocchi `CALCULATE` complessi senza variabili intermedie. Questo approccio non solo degrada le prestazioni del motore VertiPaq imponendo scansioni ridondanti, ma causa frequenti errori di sintassi, in particolare parentesi non bilanciate.

L'adozione dello schema strutturato `VAR`/`RETURN`, conforme alle convenzioni del DAX Formatter e arricchito da metadati interpretabili da **Auto-Doc AI**, trasforma espressioni oscure in codice manutenibile e ad alte prestazioni.

## Antipattern comune: Misura monolitica non strutturata

Consideriamo questo calcolo di crescita YTD: le formule native vengono reiterate più volte senza indentazione, ostacolando l'analisi del contesto di filtro:

```dax
-- Prima: Nessuna variabile, calcoli ripetuti e scarsa leggibilità per i tool IA
Sales YTD Growth % := 
IF([Total Sales] > 0, (TOTALYTD([Total Sales], 'Date'[Date]) - CALCULATE(TOTALYTD([Total Sales], 'Date'[Date]), SAMEPERIODLASTYEAR('Date'[Date]))) / CALCULATE(TOTALYTD([Total Sales], 'Date'[Date]), SAMEPERIODLASTYEAR('Date'[Date])), BLANK())
```

I problemi principali sono evidenti:
1. `TOTALYTD([Total Sales], ...)` viene computato tre volte nella stessa valutazione.
2. L'operatore `/` genera errori fatali in presenza di divisori pari a zero o nulli.
3. Gli scanner di documentazione automatica non riescono a dedurre la logica funzionale.

## Soluzione ottimizzata: Pattern VAR/RETURN per Auto-Doc AI

Isolando i passaggi intermedi in variabili dedicate, la misura esegue il calcolo una sola volta. Inoltre, le intestazioni semantiche guidano i motori di documentazione automatica:

```dax
-- /// @measure Sales YTD Growth %
-- /// @description Calcola il tasso di crescita YTD rispetto all'esercizio precedente.
-- /// @grain Calendario fiscale giornaliero
-- /// @safety Gestione sicura dei denominatori nulli con funzione DIVIDE
Sales YTD Growth % :=
VAR CurrentSales =
    [Total Sales]
VAR SalesYTD =
    TOTALYTD ( CurrentSales, 'Date'[Date] )
VAR PreviousSalesYTD =
    CALCULATE (
        SalesYTD,
        SAMEPERIODLASTYEAR ( 'Date'[Date] )
    )
VAR GrowthAmount =
    SalesYTD - PreviousSalesYTD
RETURN
    IF (
        CurrentSales > 0,
        DIVIDE ( GrowthAmount, PreviousSalesYTD, BLANK () ),
        BLANK ()
    )
```

## Preparare le misure DAX per i flussi di documentazione automatica con IA

Per garantire che agenti intelligenti e pipeline CI/CD generino cataloghi dati aggiornati e affidabili, osserva queste tre linee guida:

- **Intestazioni standardizzate nei commenti:** Usa tag dichiarativi (`@measure`, `@description`, `@grain`, `@safety`) per consentire ai parser di compilare dizionari dati in formato JSON o Markdown.
- **Disaccoppiamento dei contesti di filtro:** Isola espressioni tabulari o filtri complessi in variabili prima di fornirli a `CALCULATE`.
- **Indentazione rigorosa a 4 spazi:** Posiziona ciascun parametro su una nuova riga con chiusura della parentesi allineata al punto d'apertura per agevolare l'analisi sintattica.

## Checklist di controllo per la produzione

- [ ] Le sotto-espressioni duplicate sono state estratte in variabili `VAR`?
- [ ] L'operatore di divisione `/` è stato sostituito con la funzione nativa `DIVIDE`?
- [ ] La chiusura delle parentesi di `CALCULATE` riflette la corretta colonna di indentazione?
- [ ] Sono presenti i metadati semantici in formato leggibile per Auto-Doc AI?
