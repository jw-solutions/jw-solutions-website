---
title: 'C# 12 Moderno: Refatoração com Primary Constructors e XML Docs'
slug: csharp-12-primary-constructors-xml-doc-refactoring
locale: pt-PT
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Aprenda a refatorar construtores legados no C# 12 usando Primary Constructors
  e documentação XML padronizada através dos .NET Analyzers.
summary: >-
  Descubra como simplificar a injeção de dependências no C# 12 utilizando
  Primary Constructors com documentação XML estruturada.
status: published
published_at: '2026-11-14'
---

## Simplificando a Injeção de Dependências com Primary Constructors no C# 12

O desenvolvimento em C# evoluiu significativamente com o surgimento do .NET 8 e C# 12. Historicamente, a injeção de dependências exigia a declaração de campos privados de leitura exclusiva (`private readonly`), a definição de um construtor explícito e a atribuição manual de cada parâmetro. Essa abordagem gerava código redundante, dificultando a leitura de serviços e classes de domínio.

Com os **Primary Constructors** no C# 12, é possível declarar parâmetros diretamente no cabeçalho da classe, reduzindo a quantidade de código mantendo total segurança de tipos.

## Código Legado: A Abordagem Tradicional (Antes)

Em versões anteriores ao C# 12, uma classe de serviço típica apresentava o seguinte aspeto:

```csharp
namespace JWDocs.Services;

/// <summary>
/// Serviço responsável pelo processamento de pagamentos.
/// </summary>
public class PaymentProcessor
{
    private readonly IPaymentGateway _gateway;
    private readonly ILogger _logger;

    /// <summary>
    /// Inicializa uma nova instância de <see cref="PaymentProcessor"/>.
    /// </summary>
    /// <param name="gateway">O fornecedor de pagamentos principal.</param>
    /// <param name="logger">O serviço de registo de auditoria.</param>
    public PaymentProcessor(IPaymentGateway gateway, ILogger logger)
    {
        _gateway = gateway ?? throw new ArgumentNullException(nameof(gateway));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task ProcessAsync(decimal amount)
    {
        _logger.LogInfo("A iniciar pagamento...");
        await _gateway.ChargeAsync(amount);
    }
}
```

## Refatoração Moderna no C# 12 (Depois)

Com a adoção de construtores primários e comentários XML ajustados no C# 12, a classe fica substancialmente mais concisa:

```csharp
namespace JWDocs.Services;

/// <summary>
/// Serviço responsável pelo processamento de pagamentos.
/// </summary>
/// <param name="gateway">O fornecedor de pagamentos principal.</param>
/// <param name="logger">O serviço de registo de auditoria.</param>
public class PaymentProcessor(IPaymentGateway gateway, ILogger logger)
{
    public async Task ProcessAsync(decimal amount)
    {
        ArgumentNullException.ThrowIfNull(gateway);
        ArgumentNullException.ThrowIfNull(logger);

        logger.LogInfo("A iniciar pagamento...");
        await gateway.ChargeAsync(amount);
    }
}
```

## Integração com .NET Analyzers e EditorConfig

Para garantir padrões homogéneos em equipas de software, configure as regras de análise estática no ficheiro `.editorconfig`:

```ini
[*.cs]
dotnet_style_prefer_primary_constructors = true:suggestion
```

### Documentação Automática com Auto-Doc AI

Ao usar Primary Constructors, as marcas `<param>` pertencem agora ao bloco XML da classe. A ferramenta **Code Formatter & Auto-Doc AI** analisa automaticamente os parâmetros do construtor primário e gera as anotações XML apropriadas, cumprindo as regras do StyleCop e os padrões da Microsoft sem esforço manual.

## Conclusão e Boas Práticas

A utilização de Primary Constructors no C# 12 minimiza o código repetitivo e simplifica a manutenção da aplicação. Unir esta funcionalidade com as configurações do EditorConfig e a automação do Auto-Doc AI garante um projeto limpo e devidamente documentado.
