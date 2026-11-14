---
title: Refactorização de Tipos any Legados em TypeScript com Type Guards e TSDoc
slug: typescript-refactoring-legacy-any-type-guards-tsdoc
locale: pt-PT
category: Buenas prácticas
meta_description: >-
  Refactorize código legado em TypeScript eliminando o tipo any com Type Guards
  e TSDoc estruturado para automatização com Auto-Doc AI e Prettier.
summary: >-
  Aprenda a remover tipos any de repositórios legados utilizando predicados de
  tipo estritos em TypeScript e documentação TSDoc para o Auto-Doc AI.
status: published
published_at: '2026-11-14'
---

## O Problema dos Tipos `any` em Sistemas Legados

Durante processos de migração rápida de JavaScript para TypeScript, é comum encontrar funções inteiras tipadas com `any`. Embora o projeto compilar sem erros imediatos, este procedimento desativa o verificador de tipos estático, oculta excepções de runtime e impede que ferramentas de documentação automática como o Auto-Doc AI processem o código.

Eliminar o uso de `any` garante código robusto, diminui o débito técnico e otimiza os fluxos de trabalho das equipas de engenharia.

## Código Legado Não Tipado (Antes)

O exemplo seguinte mostra uma função que consome dados genéricos sem qualquer verificação estrutural ou bloco de documentação TSDoc.

```typescript
// ❌ Código legado vulnerável a erros em tempo de execução
function processUserData(data: any) {
  console.log("User ID:", data.id);
  if (data.role === "admin") {
    return data.permissions.includes("write");
  }
  return false;
}
```

## Refactorização Estrita com Type Guards e TSDoc (Depois)

Para cumprir as diretrizes do modo estrito do TypeScript e garantir integração total com o **Auto-Doc AI**, convertemos o argumento para `unknown` e implementamos um Type Guard com documentação formal.

```typescript
/**
 * Interface que especifica a estrutura de payload de utilizador.
 */
export interface UserPayload {
  id: string;
  role: 'admin' | 'user';
  permissions: string[];
}

/**
 * Predicado de tipo para validação em runtime de UserPayload.
 *
 * @param data - Dados sem estrutura provenientes da API.
 * @returns `true` se o objeto respeitar a interface {@link UserPayload}.
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
 * Processa as permissões de escrita do utilizador com validação estrita.
 *
 * @param data - Dados de entrada não validados.
 * @returns `true` se o utilizador possuir permissão de escrita.
 * @throws {TypeError} Se o objeto não for um UserPayload válido.
 */
export function processUserDataStrict(data: unknown): boolean {
  if (!isUserPayload(data)) {
    throw new TypeError('A estrutura fornecida não corresponde a UserPayload');
  }
  if (data.role === 'admin') {
    return data.permissions.includes('write');
  }
  return false;
}
```

## Estreita Integração com Prettier e Auto-Doc AI

Mantenha padrões estéticos consistentes no repositório configurando o Prettier no ficheiro `.prettierrc`:

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tsdoc": true
}
```

### Regras Fundamentais de Refactorização:

- **Substituir `any` por `unknown`**: Força o programador a fazer narrow de tipos antes de aceder a campos do objeto.
- **Implementar Type Predicates**: Permite ao compilador de TypeScript inferir o tipo dentro de blocos condicionais.
- **Estruturar Comentários TSDoc**: Utilize `@param`, `@returns` e `@throws` para otimizar o processamento pelo **Auto-Doc AI**.
- **Executar Validações no CI/CD**: Garanta a conformidade com as regras de formatação e verificação de tipos em todas as integrações.
