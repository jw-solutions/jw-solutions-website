---
title: 'C# 12 Moderno: Refatoração com Primary Constructors e XML Docs'
slug: csharp-12-primary-constructors-xml-doc-refactoring
locale: pt-BR
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

## Simplificando Injeção de Dependências com Primary Constructors no C# 12

O desenvolvimento em C# evoluiu significativamente com o .NET 8 e C# 12. Historicamente, a injeção de dependências exigia a declaração de campos privados somente leitura (`private readonly`), a criação de um construtor explícito e a atribuição manual de cada parâmetro. Essa abordagem gerava bastante código repetitivo (boilerplate), dificultando a leitura e a manutenção de serviços e classes de domínio.

Com a introdução dos **Primary Constructors** no C# 12, podemos definir parâmetros diretamente na declaração da classe, reduzindo bastante a quantidade de código sem comprometer a clareza nem a segurança de tipos.

## Código Legado: A Abordagem Tradicional (Antes)

Nas versões anteriores ao C# 12, uma classe de serviço padrão com dependências era escrita assim:

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
    /// <param name="gateway">O provedor de pagamentos principal.</param>
    /// <param name="logger">O serviço de log de auditoria.</param>
    public PaymentProcessor(IPaymentGateway gateway, ILogger logger)
    {
        _gateway = gateway ?? throw new ArgumentNullException(nameof(gateway));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task ProcessAsync(decimal amount)
    {
        _logger.LogInfo("Iniciando pagamento...");
        await _gateway.ChargeAsync(amount);
    }
}
```

## Refatoração Moderna no C# 12 (Depois)

Ao utilizar construtores primários e ajustar a documentação XML no C# 12, a classe se torna consideravelmente mais limpa:

```csharp
namespace JWDocs.Services;

/// <summary>
/// Serviço responsável pelo processamento de pagamentos.
/// </summary>
/// <param name="gateway">O provedor de pagamentos principal.</param>
/// <param name="logger">O serviço de log de auditoria.</param>
public class PaymentProcessor(IPaymentGateway gateway, ILogger logger)
{
    public async Task ProcessAsync(decimal amount)
    {
        ArgumentNullException.ThrowIfNull(gateway);
        ArgumentNullException.ThrowIfNull(logger);

        logger.LogInfo("Iniciando pagamento...");
        await gateway.ChargeAsync(amount);
    }
}
```

## Integração com .NET Analyzers e EditorConfig

Para garantir consistência em equipes de grande porte, configure regras de análise estática no seu arquivo `.editorconfig`:

```ini
[*.cs]
dotnet_style_prefer_primary_constructors = true:suggestion
```

### Documentação Automática com Auto-Doc AI

Ao utilizar Primary Constructors, as tags `<param>` de documentação passam a integrar o bloco XML da classe. Nossa ferramenta **Code Formatter & Auto-Doc AI** identifica os parâmetros do construtor primário e gera automaticamente as tags `<param>` correspondentes, garantindo conformidade total com as regras do StyleCop e padrões oficiais da Microsoft.

## Conclusão e Boas Práticas

Adoção de Primary Constructors no C# 12 reduz o código redundante e eleva o nível de legibilidade do projeto. Combinar este recurso com o EditorConfig e a automação do Auto-Doc AI mantém sua base de código limpa, moderna e documentada.
