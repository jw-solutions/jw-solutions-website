---
title: 'Modern C# 12: Refactoring with Primary Constructors and XML Docs'
slug: csharp-12-primary-constructors-xml-doc-refactoring
locale: en
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Learn how to refactor legacy C# constructors using C# 12 Primary Constructors
  and XML comments paired with .NET analyzers for cleaner code.
summary: >-
  Discover how to simplify dependency injection in C# 12 using Primary
  Constructors while preserving structured XML documentation.
status: published
published_at: '2026-11-14'
---

## Simplifying Dependency Injection with C# 12 Primary Constructors

C# development has evolved significantly with .NET 8 and C# 12. Historically, dependency injection required declaring private read-only fields (`private readonly`), defining an explicit constructor, and manually assigning each parameter to those fields. This pattern produced considerable boilerplate code, making domain and service classes harder to read and maintain.

With the introduction of **Primary Constructors** in C# 12, parameters can be declared directly on the class definition, substantially reducing lines of code while retaining clarity and type safety.

## Legacy Code: The Traditional Approach (Before)

In versions prior to C# 12, a standard service class with multiple dependencies was written as follows:

```csharp
namespace JWDocs.Services;

/// <summary>
/// Service responsible for processing payments and customer receipts.
/// </summary>
public class PaymentProcessor
{
    private readonly IPaymentGateway _gateway;
    private readonly ILogger _logger;

    /// <summary>
    /// Initializes a new instance of <see cref="PaymentProcessor"/>.
    /// </summary>
    /// <param name="gateway">The primary payment provider.</param>
    /// <param name="logger">The audit logging service.</param>
    public PaymentProcessor(IPaymentGateway gateway, ILogger logger)
    {
        _gateway = gateway ?? throw new ArgumentNullException(nameof(gateway));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task ProcessAsync(decimal amount)
    {
        _logger.LogInfo("Starting payment...");
        await _gateway.ChargeAsync(amount);
    }
}
```

## Modern Refactoring in C# 12 (After)

By leveraging primary constructors and adapted XML documentation in C# 12, the class becomes significantly cleaner:

```csharp
namespace JWDocs.Services;

/// <summary>
/// Service responsible for processing payments and customer receipts.
/// </summary>
/// <param name="gateway">The primary payment provider.</param>
/// <param name="logger">The audit logging service.</param>
public class PaymentProcessor(IPaymentGateway gateway, ILogger logger)
{
    public async Task ProcessAsync(decimal amount)
    {
        ArgumentNullException.ThrowIfNull(gateway);
        ArgumentNullException.ThrowIfNull(logger);

        logger.LogInfo("Starting payment...");
        await gateway.ChargeAsync(amount);
    }
}
```

## Integration with .NET Analyzers and EditorConfig

To ensure consistency across enterprise teams, configure static analysis rules in your `.editorconfig` file. This forces the compiler and IDE to suggest refactoring toward primary constructors:

```ini
[*.cs]
dotnet_style_prefer_primary_constructors = true:suggestion
```

### Automatic Documentation with Auto-Doc AI

When using primary constructors, the placement of XML documentation shifts: `<param>` tags are now attached directly to the class summary block instead of a separate constructor. Our **Code Formatter & Auto-Doc AI** tool automatically parses primary constructor parameters and builds missing `<param>` documentation, ensuring compliance with StyleCop rules (`SA1600`) and official Microsoft standards without manual overhead.

## Conclusion and Best Practices

Adopting primary constructors in C# 12 reduces boilerplate and drastically improves code readability. Combining this modern language feature with EditorConfig settings and Auto-Doc AI automation yields a clean, maintainable, and thoroughly documented codebase.
