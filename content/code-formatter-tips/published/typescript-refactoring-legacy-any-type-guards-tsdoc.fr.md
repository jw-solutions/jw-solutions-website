---
title: Refactoring du Type any en TypeScript avec Type Guards et TSDoc
slug: typescript-refactoring-legacy-any-type-guards-tsdoc
locale: fr
category: Buenas prácticas
meta_description: >-
  Refactorez le code legacy TypeScript en éliminant any grâce aux Type Guards et
  TSDoc estructuré pour les pipelines Auto-Doc AI et Prettier.
summary: >-
  Apprenez à supprimer le type any du code legacy grâce aux prédicats de type
  stricts en TypeScript et à la documentation TSDoc pour Auto-Doc AI.
status: published
published_at: '2026-11-14'
---

## Le Risque des Types `any` dans le Code Legacy

Lors de la migration de projets JavaScript vers TypeScript, il est fréquent de recourir au type `any` pour contourner rapidement les erreurs de compilation. Bien que le projet compile, cette pratique annule les bénéfices du vérificateur de types statique, masque des exceptions à l'exécution et empêche les outils comme Auto-Doc AI de générer une documentation précise.

Eliminer les types `any` est indispensable pour maintenir des standards de qualité élevés et sécuriser le traitement des données dans les applications d'entreprise.

## Code Legacy Non Sécurisé (Avant)

Voici un exemple de fonction legacy manipulant des données non validées sans aucune annotation TSDoc.

```typescript
// ❌ Code legacy vulnérable sans vérification de type
function processUserData(data: any) {
  console.log("User ID:", data.id);
  if (data.role === "admin") {
    return data.permissions.includes("write");
  }
  return false;
}
```

## Refactoring Strict avec Type Guards et TSDoc (Après)

Pour respecter les exigences du mode strict de TypeScript et permettre à **Auto-Doc AI** d'analyser automatiquement le code, nous remplaçons `any` par `unknown` et mettons en place un Type Guard accompagné de commentaires TSDoc complets.

```typescript
/**
 * Structure de données représentant les privilèges d'un utilisateur.
 */
export interface UserPayload {
  id: string;
  role: 'admin' | 'user';
  permissions: string[];
}

/**
 * Prédicat de type vérifiant la structure de l'objet à l'exécution.
 *
 * @param data - Données non structurées issues d'une API externe.
 * @returns `true` si l'objet correspond au type {@link UserPayload}.
 */
export function isUserPayload(data: unknown): data is UserPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as Record<string, unknown>).id === 'string' &&
    'role' in data &&
    ['admin', 'user'].includes((data as Record<string, unknown>).role as string) &&
    'permissions' in data &&
    Array.isArray((data as Record<string, unknown>).permissions)
  );
}

/**
 * Évalue les droits d'écriture d'un utilisateur avec validation stricte.
 *
 * @param data - Données brutes non validées.
 * @returns Statut d'autorisation d'écriture.
 * @throws {TypeError} Si la structure ne respecte pas le type UserPayload.
 */
export function processUserDataStrict(data: unknown): boolean {
  if (!isUserPayload(data)) {
    throw new TypeError('Payload invalide: structure incompatible avec UserPayload');
  }
  if (data.role === 'admin') {
    return data.permissions.includes('write');
  }
  return false;
}
```

## Formatez avec Prettier et Standardisez pour Auto-Doc AI

Configurez Prettier dans votre fichier `.prettierrc` pour garantir que tout le code de l'équipe respecte les standards TSDoc :

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tsdoc": true
}
```

### Directives Principales de Refactoring :

- **Remplacez `any` par `unknown`** : Oblige à valider le type avant de lire ses propriétés.
- **Utilisez des Type Guards (`data is Type`)** : Permet au compilateur de restreindre le type dans les blocs conditionnels.
- **Structurez vos commentaires avec TSDoc** : Les tags `@param`, `@returns` et `@throws` fournissent au moteur **Auto-Doc AI** les métadonnées requises.
- **Intégrez le contrôle dans le CI/CD** : Automatisez le formatage et le contrôle de types à chaque déploiement.
