---
title: >-
  Refactorização em JavaScript ES2024+: Campos Privados, Blocos Estáticos e
  JSDoc Estruturado
slug: javascript-es2024-legacy-class-refactoring-jsdoc
locale: pt-PT
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Refactorize código legado em JavaScript ES2024+ com campos privados, blocos
  estáticos e JSDoc estruturado alinhado ao ESLint e Prettier.
summary: >-
  Aprenda a transformar funções construtoras legadas em classes modernas ES2024+
  com privacidade real através de `#` e documentação padronizada em JSDoc.
faq:
  - q: Os campos privados `#` são suportados por todos os motores modernos?
    a: >-
      Sim, os campos privados `#` são suportados nativamente nos principais
      navegadores e no Node.js a partir da versão 14.6.0.
  - q: É possível obter validação de tipos sem compilar para TypeScript?
    a: >-
      Sim, o uso de JSDoc em conjunto com o VS Code oferece verificação de tipos
      e sugestões em tempo de desenvolvimento.
status: published
published_at: '2026-11-15'
---

## Modernização de Código Legado em JavaScript ES2024+

O desenvolvimento em JavaScript evoluiu substancialmente desde os tempos das funções construtoras e da simulação de privacidade através de prefixos com sublinhado (`_privateProperty`). Com o padrão ES2024+, a combinação de campos privados reais (prefixados por `#`), blocos de inicialização estática (`static {}`) e documentação estrita via JSDoc permite manter bases de código limpas e seguras em JavaScript puro.

### O Problema: Padrões Antigos e Encapsulamento Frágil

Em aplicações mais antigas desenvolvidas em ES5 ou no início do ES6, a proteção de propriedades baseava-se meramente em convenções. Esta abordagem resultava em acoplamentos indesejados e prejudicava a análise estática executada por ferramentas como o ESLint.

```javascript
// Código Legado (Antes)
function UserManager(initialUsers) {
  this._users = initialUsers || [];
  this._accessCount = 0;
}

UserManager.prototype.addUser = function(user) {
  if (user && user.id) {
    this._users.push(user);
    this._accessCount++;
    return true;
  }
  return false;
};
```

Este padrão deixa o atributo `_users` exposto a alterações externas não autorizadas e carece de anotações explicativas sobre os tipos aceites.

### A Solução Modernizada: ES2024+ e JSDoc Avançado

A sintaxe moderna do ES2024 garante o encapsulamento dos dados no motor de execução através de `#`. Além disso, os blocos estáticos isolam a inicialização de constantes ou recursos globais da classe.

```javascript
/**
 * @typedef {Object} User
 * @property {string} id - Identificador único.
 * @property {string} name - Nome completo.
 */

/**
 * Gestor centralizado de utilizadores.
 * @template {User} T
 */
class UserManager {
  #users = new Map();
  #accessCount = 0;
  static #MAX_CAPACITY;

  static {
    // Inicialização estática imutável
    UserManager.#MAX_CAPACITY = 1000;
  }

  /**
   * @param {T[]} [initialUsers=[]] - Lista inicial de utilizadores.
   */
  constructor(initialUsers = []) {
    for (const user of initialUsers) {
      this.addUser(user);
    }
  }

  /**
   * Adiciona um utilizador se a capacidade permitir.
   * @param {T} user - Objeto do utilizador.
   * @returns {boolean} Resultado da operação.
   */
  addUser(user) {
    if (!user?.id || this.#users.size >= UserManager.#MAX_CAPACITY) {
      return false;
    }
    this.#users.set(user.id, Object.freeze({ ...user }));
    this.#accessCount++;
    return true;
  }
}
```

### Normas de Formatação e Integração com ESLint/Prettier

Manter o código padronizado requer a configuração conjunta do **Prettier** e do **ESLint**. Utilize o plugin `prettier-plugin-jsdoc` para alinhar os comentários automaticamente e ative as regras do `eslint-plugin-jsdoc` para validar a cobertura da documentação.

### Checklist de Refactorização para ES2024

- Substitua propriedades `_` por campos verdadeiramente privados `#`.
- Mova lógicas de configuração estática para blocos `static {}`.
- Adicione anotações JSDoc detalhadas com `@param`, `@returns` e `@typedef`.
- Corra o Prettier e o ESLint no fluxo de integração contínua (CI).
