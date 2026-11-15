---
title: 'PHP 8.3 e PSR-12: Refatorizar Código Legado com Typed Properties e Enums'
slug: php-83-typed-properties-enums-psr12-refactoring
locale: pt-PT
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Aprenda a modernizar código PHP legado para PHP 8.3 usando typed properties,
  enums estritos e conformidade com PSR-12 para legibilidade e manutenção.
summary: >-
  Atualize a sua base de código PHP para a versão 8.3 implementando propriedades
  tipadas, enums nativos e o standard PSR-12.
faq:
  - q: Porque é importante declarar strict_types em PHP 8.3?
    a: >-
      Garante que o PHP não faça conversões implícitas, lançando exceções se o
      tipo estiver incorreto.
  - q: Como é que os Enums ajudam na refatoração?
    a: >-
      Eliminam strings mágicas e restringem valores a conjuntos finitos
      validados.
status: published
published_at: '2026-11-15'
---

A evolução do PHP em direção a uma tipagem estrita e robusta transformou radicalmente o design de arquiteturas de software modernas. Nas versões recentes, especialmente com a chegada do PHP 8.3, o uso de propriedades tipadas (typed properties), construtores promovidos e enumerações (Enums) nativas permite eliminar código boilerplate e erros subtis em tempo de desenvolvimento.

No entanto, muitos projetos legados ainda arrastam más práticas, como variáveis globais soltas, arrays associativos genéricos sem estrutura definida e ausência total de conformidade com as diretrizes oficiais PSR-12. Isto afeta a legibilidade e dificulta a integração de ferramentas automatizadas.

### O Problema no Código Legado

Código PHP antigo frequentemente abusa de arrays associativos para transferir dados entre camadas, ocultando os tipos reais de dados e gerando erros difíceis de rastrear.

```php
// ANTES: Código legado frágil e sem tipagem
class UserManager {
    public function processUser($data) {
        $user = [];
        $user['name'] = $data['name'];
        $user['status'] = $data['status']; // É 'active', 'pending' ou um número?
        return $user;
    }
}
```

Esta abordagem carece de autocompletar no IDE, não valida dados de entrada e viola regras básicas do PSR-12.

### A Solução Moderna com PHP 8.3 e PSR-12

Refatorizar este design utilizando classes de leitura exclusiva (`readonly class`), Enums nativos e tipos estritos (`declare(strict_types=1);`) garante a integridade dos dados.

```php
// DEPOIS: Código robusto com PHP 8.3, Enums e PSR-12
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

### Integração com Auto-Doc AI

A nossa ferramenta **Code Formatter & Auto-Doc AI** analisa automaticamente declarações de tipos e Enums para gerar blocos PHPDoc precisos:

```php
/**
 * Representa um perfil de utilizador imutável.
 *
 * @package JWSolutions\Formatting
 * @since 2026-11-15
 */
readonly class UserProfile
{
    /**
     * @param string $name Nome completo do utilizador.
     * @param UserStatus $status Estado atual do utilizador baseado no Enum.
     */
    public function __construct(
        public string $name,
        public UserStatus $status
    ) {}
}
```

### Checklist de Verificação

- [ ] Incluiu `declare(strict_types=1);` no topo de cada ficheiro?
- [ ] Todas as propriedades de classe são fortemente tipadas?
- [ ] As constantes mágicas foram substituídas por `Backed Enums`?
- [ ] O código cumpre o espaçamento, indentação e quebras de linha da PSR-12?
