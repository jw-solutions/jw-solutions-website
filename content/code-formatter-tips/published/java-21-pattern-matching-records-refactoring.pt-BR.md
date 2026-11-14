---
title: 'Refatoração em Java 21+: Records e Pattern Matching para Código Legível'
slug: java-21-pattern-matching-records-refactoring
locale: pt-BR
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Aprenda a refatorar código legado em Java 21 usando Records e Pattern Matching
  em switch para eliminar código repetitivo e melhorar a legibilidade.
summary: >-
  Descubra como transformar hierarquias de classes extensas em Records elegantes
  e Pattern Matching no Java 21, reduzindo drasticamente o código boilerplate.
status: published
published_at: '2026-11-14'
---

## Introdução ao Código Legado em Java

Por anos, os desenvolvedores Java dependeram de hierarquias de classes extensas, múltiplas verificações de tipo usando o operador `instanceof` e conversões explícitas (*casting*) para modelar dados e lidar com estruturas condicionais complexas. Essa abordagem tradicional não apenas aumenta o volume de código-fonte, mas também introduz riscos latentes de erros em tempo de execução, como `ClassCastException`, e dificulta profundamente a manutenção de longo prazo do software.

Com o lançamento do **Java 21**, a linguagem amadureceu significativamente graças a recursos estáveis de alto impacto, como **Records** e **Pattern Matching para `switch`**. Essas ferramentas modernas permitem que arquitetos e desenvolvedores escrevam códigos altamente expressivos, seguros e alinhados com os padrões do Google Java Style. A seguir, analisaremos um caso real de refatoração de um design clássico para um design moderno e auto-documentável.

## O Problema: Código Legado com Verificações Verbose

Considere uma aplicação corporativa típica que processa respostas de operações de rede ou banco de dados usando classes abstratas e múltiplas subclasses, juntamente com blocos `if-else` encadeados para determinar o tipo de resposta recebida:

```java
// ANTES: Código legado verboso e sujeito a erros
public abstract class Response {
}

public class SuccessResponse extends Response {
    private final String data;
    public SuccessResponse(String data) { this.data = data; }
    public String getData() { return data; }
}

public class ErrorResponse extends Response {
    private final String errorCode;
    public ErrorResponse(String errorCode) { this.errorCode = errorCode; }
    public String getErrorCode() { return errorCode; }
}

public class ResponseProcessor {
    public static String process(Response response) {
        if (response instanceof SuccessResponse) {
            SuccessResponse success = (SuccessResponse) response;
            return "OK: " + success.getData();
        } else if (response instanceof ErrorResponse) {
            ErrorResponse error = (ErrorResponse) response;
            return "FAIL: " + error.getErrorCode();
        } else {
            throw new IllegalArgumentException("Unknown response type");
        }
    }
}
```

Este padrão tradicional apresenta várias desvantagens: exige a escrita manual de construtores, getters, métodos `equals`, `hashCode` e `toString`, além de duplicar lógica de *casting* desnecessária dentro das estruturas condicionais.

## A Solução: Records e Pattern Matching no Java 21

Podemos refatorar radicalmente este design utilizando interfaces seladas (*sealed interfaces*), **Records** para modelar dados imutáveis de forma concisa, e **Pattern Matching** aplicado à instrução `switch`. Essa combinação elimina completamente o *casting* explícito e garante a exaustividade dos casos analisados.

```java
// DEPOIS: Código limpo, moderno e seguro no Java 21
public sealed interface Response permits Response.Success, Response.Error {
    record Success(String data) implements Response {}
    record Error(String errorCode) implements Response {}

    /**
     * Processa a resposta com segurança usando pattern matching.
     *
     * @param response a resposta recebida do servidor
     * @return uma string formatada com o resultado do processamento
     */
    static String process(Response response) {
        return switch (response) {
            case Success(var data) -> "OK: " + data;
            case Error(var code) -> "FAIL: " + code;
        };
    }
}
```

## Vantagens Arquiteturais e Manutenibilidade

1. **Redução de Boilerplate:** Os *records* geram automaticamente o construtor canônico, métodos de acesso, representações em string e contratos de igualdade.
2. **Segurança de Tipos (Exaustividade):** O compilador Java valida se todos os subtipos de uma interface selada são cobertos no `switch`, evitando erros em tempo de execução por ramificações esquecidas.
3. **Legibilidade Extrema:** Os padrões de desestruturação (*deconstruction patterns*) permitem acesso direto aos componentes internos do *record* dentro do próprio padrão.

## Auto-Documentação com Inteligência Artificial (Auto-Doc AI)

O uso de padrões modernos como o Java 21 facilita drasticamente a tarefa de ferramentas de **Auto-Doc AI**. Graças à semântica clara das interfaces seladas e dos *records*, os geradores automáticos de documentação podem inferir contratos precisos sem exigir anotações redundantes. Ao integrar formatadores automáticos sob o padrão Google Java Style, garantimos que a estrutura do código permaneça uniforme em toda a equipe de desenvolvimento, reduzindo o atrito nas revisões de código e elevando a qualidade geral do repositório corporativo.
