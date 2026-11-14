---
title: 'Refatoração em Java 21+: Records e Pattern Matching para Código Legível'
slug: java-21-pattern-matching-records-refactoring
locale: pt-PT
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

Durante anos, os programadores Java dependeram de hierarquias de classes extensas, múltiplas verificações de tipo utilizando o operador `instanceof` e conversões explícitas (*casting*) para modelar dados e gerir estruturas condicionais complexas. Esta abordagem tradicional não só aumenta o volume de código-fonte, como também introduz riscos latentes de erros em tempo de execução, tais como `ClassCastException`, e dificulta profundamente a manutenção de longo prazo do software.

Com o lançamento do **Java 21**, a linguagem amadureceu significativamente graças a funcionalidades estáveis de alto impacto como os **Records** e o **Pattern Matching para `switch`**. Estas ferramentas modernas permitem aos arquitetos e programadores escrever código altamente expressivo, seguro e alinhado com os padrões do Google Java Style. De seguida, analisaremos um caso real de refatoração de um design clássico para um design moderno e auto-documentável.

## O Problema: Código Legado com Verificações Verbose

Considere uma aplicação empresarial típica que processa respostas de operações de rede ou base de dados utilizando classes abstratas e múltiplas subclasses, juntamente com blocos `if-else` encadeados para determinar o tipo de resposta recebida:

```java
// ANTES: Código legado verboso e propenso a erros
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

Podemos refatorar radicalmente este design utilizando interfaces seladas (*sealed interfaces*), **Records** para modelar dados imutáveis de forma concisa, e **Pattern Matching** aplicado à instrução `switch`. Esta combinação elimina por completo o *casting* explícito e assegura a exaustividade dos casos analisados.

```java
// DEPOIS: Código limpo, moderno e seguro no Java 21
public sealed interface Response permits Response.Success, Response.Error {
    record Success(String data) implements Response {}
    record Error(String errorCode) implements Response {}

    /**
     * Processa a resposta com segurança utilizando pattern matching.
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

1. **Redução de Boilerplate:** Os *records* geram automaticamente o construtor canónico, métodos de acesso, representações em string e contratos de igualdade.
2. **Segurança de Tipos (Exaustividade):** O compilador Java valida se todos os subtipos de uma interface selada são cobertos no `switch`, prevenindo erros em tempo de execução devido a ramos esquecidos.
3. **Legibilidade Extrema:** Os padrões de desestruturação (*deconstruction patterns*) permitem aceder diretamente aos componentes internos do *record* dentro do próprio padrão.

## Auto-Documentação com Inteligência Artificial (Auto-Doc AI)

O uso de padrões modernos como o Java 21 facilita drasticamente a tarefa das ferramentas de **Auto-Doc AI**. Graças à semântica clara das interfaces seladas e dos *records*, os geradores automáticos de documentação podem inferir contratos precisos sem exigir anotações redundantes. Ao integrar formatadores automáticos sob o padrão Google Java Style, garantimos que a estrutura do código permanece uniforme em toda a equipa de desenvolvimento, reduzindo a fricção nas revisões de código e elevando a qualidade geral do repositório corporativo.
