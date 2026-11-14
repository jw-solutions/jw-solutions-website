---
title: Refatorando Tipos any Legados em TypeScript com Type Guards e TSDoc
slug: typescript-refactoring-legacy-any-type-guards-tsdoc
locale: pt-BR
category: Buenas prácticas
meta_description: >-
  Refatore código legado em TypeScript eliminando o tipo any com Type Guards e
  TSDoc estruturado para automação via Auto-Doc AI e Prettier.
summary: >-
  Aprenda a remover tipos any de repositórios legados utilizando predicados de
  tipo estritos em TypeScript e documentação TSDoc para Auto-Doc AI.
status: published
published_at: '2026-11-14'
---

## O Perigo do Tipo `any` em Sistemas Legados

Em processos de migração de JavaScript para TypeScript, é muito comum o uso excessivo do tipo `any` para acelerar a entrega. Embora o código compile, essa prática anula a checagem estática de tipos, oculta bugs de tempo de execução e impede a geração automática de documentação precisa por ferramentas como o Auto-Doc AI.

Substituir o `any` por abstrações mais seguras é fundamental para garantir a manutenibilidade do código em longo prazo e melhorar a experiência de desenvolvimento (DX).

## Código Legado Sem Segurança de Tipos (Antes)

O exemplo abaixo demonstra uma função legado sem validação estrutural nem anotações TSDoc, totalmente exposta a falhas em tempo de execução.

```typescript
// ❌ Código legado inseguro usando tipo any
function processUserData(data: any) {
  console.log("User ID:", data.id);
  if (data.role === "admin") {
    return data.permissions.includes("write");
  }
  return false;
}
```

## Refatoração Estrita com Type Guards e TSDoc (Depois)

Para atender aos requisitos do modo `strict` do TypeScript e permitir que o **Auto-Doc AI** analise e documente a função perfeitamente, usamos `unknown`, Type Guards e tags TSDoc completas.

```typescript
/**
 * Interface que representa a estrutura validada do usuário.
 */
export interface UserPayload {
  id: string;
  role: 'admin' | 'user';
  permissions: string[];
}

/**
 * Predicado de tipo para validação em runtime de UserPayload.
 *
 * @param data - Dados não estruturados vindos de uma API.
 * @returns `true` se o objeto for compatível com {@link UserPayload}.
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
 * Processa as permissões de escrita do usuário de forma estrita.
 *
 * @param data - Dados de entrada não validados.
 * @returns `true` se o usuário tiver permissão de escrita.
 * @throws {TypeError} Se os dados fornecidos não forem um UserPayload válido.
 */
export function processUserDataStrict(data: unknown): boolean {
  if (!isUserPayload(data)) {
    throw new TypeError('Estrutura de dados inválida para UserPayload');
  }
  if (data.role === 'admin') {
    return data.permissions.includes('write');
  }
  return false;
}
```

## Padrões de Formatação com Prettier e Auto-Doc AI

Adicione regras claras de formatação no arquivo `.prettierrc` para garantir uniformidade em todo o projeto:

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tsdoc": true
}
```

### Principais Diretrizes:

- **Substitua `any` por `unknown`**: Exige refinamento do tipo antes do acesso às propriedades.
- **Use Type Guards (`data is Type`)**: Permite inferência segura dentro do fluxo condicional do compilador.
- **Adote TSDoc Estandardizado**: As tags `@param`, `@returns` e `@throws` alimentam a inteligência do **Auto-Doc AI**.
- **Automação no CI**: Garanta que o Prettier e a compilação TypeScript rodem a cada Commit/Pull Request.
