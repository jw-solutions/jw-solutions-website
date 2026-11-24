---
title: 'TypeScript Exaustivo: Refatoração de Enums com Uniões Discriminadas'
slug: typescript-discriminant-unions-exhaustive-type-checks-tsdoc
locale: pt-PT
category: Buenas prácticas
meta_description: >-
  Elimine enums numéricos frágeis no TypeScript moderno com uniões
  discriminadas, verificação exaustiva com never e anotações TSDoc.
summary: >-
  Substitua interfaces difusas e enums legados por uniões discriminadas robustas
  no TypeScript, com validação estrita em tempo de compilação.
faq:
  - q: >-
      Por que razão os tipos literais são preferíveis aos enums no TypeScript
      atual?
    a: >-
      Os literais de string não requerem emissão de código JavaScript
      suplementar e são serializados diretamente em JSON sem mapeamentos
      invertidos.
  - q: De que forma o default com tipo never previne erros em produção?
    a: >-
      Se um colega de equipa adicionar um novo estado ao modelo e esquecer-se do
      respetivo branch no switch, o TypeScript recusa compilar o projeto.
status: published
published_at: '2026-11-24'
---

## Eliminar a Ambiguidade de Estados em Código Legado

Em arquiteturas TypeScript legadas, é habitual encontrar fluxos controlados por `enum` numéricos acoplados a interfaces sobrecarregadas com múltiplas propriedades opcionais. Este padrão introduz um elevado grau de incerteza quanto à existência dos dados em tempo de execução, obrigando a asserções como `!` ou conversões com `as`.

Com uniões discriminadas (*discriminated unions*), cada estado do domínio define com rigor apenas os campos que lhe pertencem. Deste modo, o analisador de fluxo do TypeScript aplica o estreitamento (*narrowing*) automático sem necessidade de validações manuais redundantes.

### Código Legado (Antes)

O modelo antigo força o programador a presumir quais os campos disponíveis consoante o valor numérico do enum.

```typescript
// Antipadronização: enum numérico associado a atributos facultativos
enum EstadoOperacao {
  PENDENTE = 0,
  SUCESSO = 1,
  ERRO = 2,
}

interface OperacaoLegada {
  id: string;
  estado: EstadoOperacao;
  guiaId?: string; // Apenas disponível quando SUCESSO
  descricaoErro?: string; // Apenas disponível quando ERRO
  codigoErro?: number; // Apenas disponível quando ERRO
}

function avaliarOperacao(op: OperacaoLegada): string {
  if (op.estado === EstadoOperacao.SUCESSO) {
    return `Concluído: guia ${op.guiaId!}`;
  }
  if (op.estado === EstadoOperacao.ERRO) {
    return `Falha: ${op.descricaoErro ?? 'Sem detalhe'}`;
  }
  return 'Pendente';
}
```

### Implementação Refatorada em TypeScript Estrito (Depois)

Adotamos uniões literais com propriedades de leitura estrita (`readonly`) e uma barreira exaustiva ancorada no tipo `never`.

```typescript
/**
 * Representa as variantes atómicas de uma operação de pagamento.
 */
export type Operacao =
  | { readonly estado: 'pendente'; readonly id: string }
  | { readonly estado: 'sucesso'; readonly id: string; readonly guiaId: string; readonly montanteCentimos: number }
  | { readonly estado: 'erro'; readonly id: string; readonly codigoErro: number; readonly descricaoErro: string };

/**
 * Trata o fluxo da operação assegurando cobertura exaustiva na compilação.
 *
 * @param op - Instância tipada da união discriminada.
 * @returns Mensagem informativa estruturada.
 * @throws {TypeError} Se surgir uma variante não tratada em execução anómala.
 */
export function avaliarOperacao(op: Operacao): string {
  switch (op.estado) {
    case 'pendente':
      return `Operação ${op.id} a aguardar confirmação bancária.`;
    case 'sucesso':
      return `Operação ${op.id} liquidada com guia ${op.guiaId}. Total: € ${(op.montanteCentimos / 100).toFixed(2)}`;
    case 'erro':
      return `Operação ${op.id} rejeitada (Erro ${op.codigoErro}): ${op.descricaoErro}`;
    default: {
      // Verificação exaustiva: assinala erro no compilador se faltar um caso
      const _inatingivel: never = op;
      throw new TypeError(`Estado desconhecido: ${JSON.stringify(_inatingivel)}`);
    }
  }
}
```

## Auto-Documentação e Boas Práticas

1. **Documentação com TSDoc**: Detalhe os contratos através das etiquetas `@param`, `@returns` e `@throws`.
2. **Garantia de Imutabilidade**: O modificador `readonly` nos membros da união impede mutações acidentais nos serviços de domínio.
3. **Formatação Prettier**: Mantenha as uniões alinhadas verticalmente no início de cada linha com o caractere `|` para revisões de código mais claras.
