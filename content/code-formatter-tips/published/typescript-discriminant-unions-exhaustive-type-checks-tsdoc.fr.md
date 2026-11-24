---
title: 'TypeScript Exhaustif : Refactoring des Enums vers les Unions Discriminées'
slug: typescript-discriminant-unions-exhaustive-type-checks-tsdoc
locale: fr
category: Buenas prácticas
meta_description: >-
  Modernisez vos bases TypeScript en remplaçant les enums fragiles par des
  unions discriminées, le contrôle exhaustif never et les normes TSDoc.
summary: >-
  Passez des enums numériques et interfaces ambiguës aux unions discriminées
  strictes en TypeScript avec vérification d'exhaustivité au build.
faq:
  - q: >-
      Pourquoi préférer les chaînes littérales aux enums numériques
      traditionnels ?
    a: >-
      Les chaînes littérales s'intègrent nativement au JSON sans logique de
      conversion et ne génèrent aucun code JavaScript superflu lors de la
      compilation.
  - q: >-
      Comment le type never assure-t-il la sécurité lors des évolutions du code
      ?
    a: >-
      Si un développeur ajoute un nouvel état dans l'union sans implémenter son
      cas dans le switch, TypeScript refuse la compilation grâce au garde never.
status: published
published_at: '2026-11-24'
---

## Supprimer l'Ambiguïté d'État dans le Code Hérité

Dans les projets TypeScript existants, la modélisation s'appuie fréquemment sur des `enum` numériques couplés à des interfaces volumineuses contenant de nombreuses propriétés optionnelles. Cet anti-pattern produit des variables de type `undefined | T`, contraignant les équipes à employer des assertions de non-nullité risquées (`!`) ou des conversions `as` douteuses.

En refactorisant vers des unions discriminées (*discriminated unions*), chaque état métier n'expose que les champs valides pour ce contexte spécifique. Le mécanisme de réduction de type (*narrowing*) de TypeScript s'active automatiquement dès que la propriété discriminante est évaluée.

### Approche Héritée (Avant)

Le code historique oblige à deviner quelles propriétés existent pour un statut donné sans garantie du compilateur.

```typescript
// Anti-pattern : interface monolithique avec champs conditionnels optionnels
enum StatutPaiement {
  EN_ATTENTE = 0,
  VALIDE = 1,
  ECHEC = 2,
}

interface PaiementLegacy {
  id: string;
  statut: StatutPaiement;
  recuId?: string; // Présent uniquement si VALIDE
  messageErreur?: string; // Présent uniquement si ECHEC
  codeErreur?: number; // Présent uniquement si ECHEC
}

function traiterPaiement(p: PaiementLegacy): string {
  if (p.statut === StatutPaiement.VALIDE) {
    return `Validé avec le reçu ${p.recuId!}`;
  }
  if (p.statut === StatutPaiement.ECHEC) {
    return `Échec : ${p.messageErreur ?? 'Inconnu'}`;
  }
  return 'Traitement en cours';
}
```

### Refactoring Moderne en TypeScript Strict (Après)

Nous remplaçons l'enum par une union discriminée immuable accompagnée d'un contrôle exhaustif reposant sur le type `never`.

```typescript
/**
 * Modélise les différentes issues d'une opération financière.
 */
export type Paiement =
  | { readonly statut: 'en_attente'; readonly id: string }
  | { readonly statut: 'valide'; readonly id: string; readonly recuId: string; readonly montantCentimes: number }
  | { readonly statut: 'echec'; readonly id: string; readonly codeErreur: number; readonly messageErreur: string };

/**
 * Traite le paiement avec une vérification exhaustive lors de la compilation.
 *
 * @param p - Objet transactionnel typé par union discriminée.
 * @returns Synthèse textuelle de la transaction.
 * @throws {TypeError} Si une variante inattendue survenait à l'exécution.
 */
export function traiterPaiement(p: Paiement): string {
  switch (p.statut) {
    case 'en_attente':
      return `Transaction ${p.id} en cours d'autorisation bancaire.`;
    case 'valide':
      return `Transaction ${p.id} confirmée. Reçu : ${p.recuId}. Total : ${(p.montantCentimes / 100).toFixed(2)} €`;
    case 'echec':
      return `Transaction ${p.id} refusée (Code ${p.codeErreur}) : ${p.messageErreur}`;
    default: {
      // Contrôle d'exhaustivité : TypeScript signale une erreur si une variante est omise
      const _inatteignable: never = p;
      throw new TypeError(`État non géré : ${JSON.stringify(_inatteignable)}`);
    }
  }
}
```

## Auto-Documentation et Bonnes Pratiques

1. **Standard TSDoc** : Renseignez rigoureusement `@param`, `@returns` et `@throws` pour éclairer les consommateurs d'API.
2. **Immuabilité avec `readonly`** : Empêchez toute mutation accidentelle des données de l'union au fil des traitements.
3. **Formatage Prettier** : Alignez le séparateur vertical (`|`) en tête de chaque ligne pour fluidifier les revues de pull requests.
