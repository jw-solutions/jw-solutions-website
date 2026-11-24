---
title: 'TypeScript Exaustivo: Refatorando Enums Legados com Uniões Discriminadas'
slug: typescript-discriminant-unions-exhaustive-type-checks-tsdoc
locale: pt-BR
category: Buenas prácticas
meta_description: >-
  Modernize código legado em TypeScript substituindo enums frágeis por uniões
  discriminadas e verificação exaustiva com never e TSDoc.
summary: >-
  Substitua interfaces ambíguas e enums legados por uniões discriminadas no
  TypeScript estrito, garantindo verificação total em tempo de compilação.
faq:
  - q: Qual o perigo prático de utilizar enums numéricos tradicionais?
    a: >-
      Enums numéricos permitem atribuições acidentais de números arbitrários e
      geram funções autoexecutáveis desnecessárias no JavaScript gerado.
  - q: >-
      O que ocorre no build quando uma nova variante é criada sem atualizar o
      switch?
    a: >-
      O compilador TypeScript acusa erro imediato na linha do const _invalido:
      never, pois a nova variante não atinge a tipagem never.
status: published
published_at: '2026-11-24'
---

## Eliminando Estados Ambíguos em Bases de Código Legadas

Em aplicações TypeScript legadas, é frequente encontrar lógicas de negócio estruturadas em `enum` numéricos e interfaces monolíticas com múltiplos campos opcionais. Esse padrão frágil gera objetos preenchidos com `undefined | T`, obrigando o uso de asserções não seguras como o operador de exclamação (`!`) ou coerções forçadas com `as`.

Ao refatorar para uniões discriminadas (*discriminated unions*), cada estado do domínio passa a expor única e exclusivamente os atributos pertinentes àquele contexto. O fluxo de controle do TypeScript reconhece a propriedade discriminante e restringe os tipos de forma segura e elegante.

### Abordagem Legada (Antes)

No código legado, o compilador não consegue assegurar a coerência dos dados entre o enum de estado e os campos presentes.

```typescript
// Antipadronização: interface genérica com campos opcionais e enum
enum StatusTransacao {
  PENDENTE = 0,
  CONCLUIDA = 1,
  FALHA = 2,
}

interface TransacaoLegada {
  id: string;
  status: StatusTransacao;
  comprovanteId?: string; // Presente apenas se CONCLUIDA
  motivoErro?: string; // Presente apenas se FALHA
  codigoErro?: number; // Presente apenas se FALHA
}

function processarTransacao(tx: TransacaoLegada): string {
  if (tx.status === StatusTransacao.CONCLUIDA) {
    // Requer asserção arriscada '!'
    return `Sucesso: recibo ${tx.comprovanteId!}`;
  }
  if (tx.status === StatusTransacao.FALHA) {
    return `Erro: ${tx.motivoErro ?? 'Desconhecido'}`;
  }
  return 'Pendente';
}
```

### Implementação Moderna em TypeScript Estrito (Depois)

Utilizamos tipos literais imutáveis e verificação exaustiva através do tipo `never` no branch padrão do `switch`.

```typescript
/**
 * Variantes atômicas de uma transação financeira.
 */
export type Transacao =
  | { readonly status: 'pendente'; readonly id: string }
  | { readonly status: 'concluida'; readonly id: string; readonly comprovanteId: string; readonly valorCentavos: number }
  | { readonly status: 'falha'; readonly id: string; readonly codigoErro: number; readonly motivoErro: string };

/**
 * Processa o estado da transação garantindo cobertura exaustiva de tipos.
 *
 * @param tx - Objeto da transação tipado com união discriminada.
 * @returns Mensagem formatada de retorno para apresentação.
 * @throws {TypeError} Disparado caso uma variante não mapeada atinja a execução.
 */
export function processarTransacao(tx: Transacao): string {
  switch (tx.status) {
    case 'pendente':
      return `Transação ${tx.id} em processamento pela rede bancária.`;
    case 'concluida':
      return `Transação ${tx.id} liquidada. Recibo: ${tx.comprovanteId}. Total: R$ ${(tx.valorCentavos / 100).toFixed(2)}`;
    case 'falha':
      return `Transação ${tx.id} rejeitada (Erro ${tx.codigoErro}): ${tx.motivoErro}`;
    default: {
      // Checagem exaustiva de compilação
      const _invalido: never = tx;
      throw new TypeError(`Status não gerenciado: ${JSON.stringify(_invalido)}`);
    }
  }
}
```

## Auto-Documentação e Padrões de Código

1. **TSDoc Conforme**: Use marcações claras como `@param`, `@returns` e `@throws` para documentar o comportamento estrito de cada função.
2. **Propriedades `readonly`**: Evita mutabilidade colateral nos nós da união enquanto o objeto trafega por pipelines de serviço.
3. **Estilo Prettier**: Formate uniões complexas com a barra vertical alinhada no início de cada linha para manter diffs de Git limpos e organizados.
