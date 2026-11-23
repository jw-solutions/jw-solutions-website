---
title: 'DAX Moderno: Formato con VAR/RETURN y Auto-Documentación Asistida por IA'
slug: dax-var-return-calculate-auto-doc-formatting
date: '2026-11-19'
language: dax
author: JW Solutions
category: Auto-Doc AI
meta_description: >-
  Aprende a estructurar medidas DAX con variables VAR/RETURN, CALCULATE legible
  y metadatos listos para motores de Auto-Documentación por IA.
summary: >-
  Mejora drásticamente el rendimiento y la legibilidad de tu modelo semántico
  estructurando medidas DAX con VAR/RETURN y esquemas de comentarios parseables
  por IA.
related_fix_slug: dax-unbalanced-parentheses
interactive_snippet: |-
  Total Margin % :=
  VAR CurrentSales =
      [Total Sales]
  VAR CurrentCost =
      [Total Product Cost]
  VAR MarginAmount =
      CurrentSales - CurrentCost
  RETURN
      DIVIDE (
          MarginAmount,
          CurrentSales,
          BLANK ()
      )
faq:
  - q: ¿Por qué las variables VAR retienen el contexto de evaluación en DAX?
    a: >-
      En DAX, las variables son constantes evaluadas perezosamente en el momento
      de su definición. No conservan una fórmula dinámica, sino el valor escalar
      o tabular exacto resultante dentro del contexto de filtro vigente al
      declararlas.
  - q: >-
      ¿Cómo ayuda el formato con saltos de línea a los motores de
      Auto-Documentación?
    a: >-
      Los analizadores sintácticos de IA mapean tokens individuales por línea.
      La sangría estándar de 4 espacios permite distinguir argumentos de filtros
      en CALCULATE frente a expresiones agregadas, generando diagramas de linaje
      de datos automáticos y precisos.
status: published
published_at: '2026-11-19'
---

## La crisis de legibilidad en modelos semánticos complejos

En Power BI y Analysis Services, las medidas complejas tienden a transformarse rápidamente en laberintos inmanejables cuando se concatenan funciones `CALCULATE` anidadas sin almacenamiento intermedio. Este antipatrón degrada la velocidad de evaluación del motor VertiPaq al forzar recalculaciones idénticas dentro de la misma iteración y causa fallos críticos de sintaxis como los temidos paréntesis desbalanceados.

La adopción del patrón canónico `VAR`/`RETURN`, alineado con las directrices del DAX Formatter y complementado con metadatos estructurados para **Auto-Doc AI**, transforma expresiones densas en código autodescriptivo y altamente eficiente.

## Antipatrón: Medida monolítica no estructurada

Observa el siguiente cálculo tradicional: repite llamadas a medidas base, carece de sangrado jerárquico y complica la trazabilidad del contexto de filtro.

```dax
-- Antes: Sin variables, dependencias duplicadas y difícil de documentar
Sales YTD Growth % := 
IF([Total Sales] > 0, (TOTALYTD([Total Sales], 'Date'[Date]) - CALCULATE(TOTALYTD([Total Sales], 'Date'[Date]), SAMEPERIODLASTYEAR('Date'[Date]))) / CALCULATE(TOTALYTD([Total Sales], 'Date'[Date]), SAMEPERIODLASTYEAR('Date'[Date])), BLANK())
```

Las desventajas son evidentes:
1. `TOTALYTD([Total Sales], ...)` se evalúa tres veces bajo distintos contextos de transición.
2. La división directa con operador `/` no gestiona errores ante divisores nulos o cero.
3. Los analizadores de documentación automática no pueden inferir la intención analítica ni las dependencias de negocio.

## Solución refactorizada: Patrón VAR/RETURN optimizado para Auto-Doc AI

Al introducir variables locales, el resultado se calcula una sola vez en el contexto de evaluación inicial. Además, prefijamos la medida con anotaciones compatibles con procesadores de documentación automática.

```dax
-- /// @measure Sales YTD Growth %
-- /// @description Calcula la tasa de crecimiento año a la fecha contra el ejercicio anterior.
-- /// @grain Fecha a nivel de calendario fiscal
-- /// @safety Maneja denominadores nulos con DIVIDE
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

## Integración con pipelines de Auto-Documentación con IA

Para que los agentes de IA generen diccionarios de datos precisos sin intervención humana, tu código DAX debe seguir tres reglas de estandarización:

- **Contratos tipados en comentarios:** Utiliza etiquetas semánticas (`@measure`, `@description`, `@grain`) que los parsers AST puedan extraer directamente a esquemas JSON.
- **Aislamiento de granularidad:** Descompón transformaciones booleanas complejas en variables separadas (`VAR IsValidContext = ...`).
- **Consistencia de salto de línea:** Cada argumento de `CALCULATE` y `DIVIDE` debe residir en su propia línea indentada a 4 espacios para evitar errores de parseo léxico.

## Checklist de verificación para producción

- [ ] ¿Se eliminaron cálculos duplicados mediante variables `VAR`?
- [ ] ¿Se reemplazó cualquier división `/` por la función nativa segura `DIVIDE`?
- [ ] ¿Los paréntesis de cierre de `CALCULATE` coinciden visualmente con la columna de apertura?
- [ ] ¿Existen anotaciones estructuradas para el extractor de metadatos de Auto-Doc AI?
