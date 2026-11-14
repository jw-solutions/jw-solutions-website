---
title: 'Modernes C# 12: Refactoring mit Primary Constructors und XML Docs'
slug: csharp-12-primary-constructors-xml-doc-refactoring
locale: de
category: Tips de Sintaxis | Buenas prácticas | Auto-Doc AI
meta_description: >-
  Erfahren Sie, wie Sie Legacy-C#-Konstruktoren mit C# 12 Primary Constructors
  und XML-Dokumentation mittels .NET-Analyzern optimieren.
summary: >-
  Vereinfachen Sie die Dependency Injection in C# 12 mithilfe von Primary
  Constructors bei vollständiger XML-Dokumentation.
status: published
published_at: '2026-11-14'
---

## Vereinfachung der Dependency Injection mit Primary Constructors in C# 12

Die C#-Entwicklung hat mit .NET 8 und C# 12 einen bedeutenden Schritt gemacht. In älteren C#-Versionen erforderte die Dependency Injection das Deklarieren privater schreibgeschützter Felder (`private readonly`), die Definition eines expliziten Konstruktors und das manuelle Zuweisen der Parameter. Dies führte zu erheblichem Boilerplate-Code, der die Lesbarkeit und Wartbarkeit erschwerte.

Mit den in C# 12 eingeführten **Primary Constructors** können Parameter direkt in der Klassendeklaration definiert werden. Das reduziert den Codeaufwand drastisch, ohne Einbußen bei Typsicherheit oder Transparenz.

## Legacy-Code: Der traditionelle Ansatz (Vorher)

Vor C# 12 sah eine typische Service-Klasse mit mehreren Abhängigkeiten wie folgt aus:

```csharp
namespace JWDocs.Services;

/// <summary>
/// Dienst zur Verarbeitung von Kundenzahlungen.
/// </summary>
public class PaymentProcessor
{
    private readonly IPaymentGateway _gateway;
    private readonly ILogger _logger;

    /// <summary>
    /// Initialisiert eine neue Instanz von <see cref="PaymentProcessor"/>.
    /// </summary>
    /// <param name="gateway">Der primäre Zahlungsanbieter.</param>
    /// <param name="logger">Der Audit-Protokolldienst.</param>
    public PaymentProcessor(IPaymentGateway gateway, ILogger logger)
    {
        _gateway = gateway ?? throw new ArgumentNullException(nameof(gateway));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task ProcessAsync(decimal amount)
    {
        _logger.LogInfo("Zahlung wird gestartet...");
        await _gateway.ChargeAsync(amount);
    }
}
```

## Modernes Refactoring in C# 12 (Nachher)

Durch den Einsatz von Primary Constructors und angepasster XML-Dokumentation in C# 12 wird der Code wesentlich eleganter:

```csharp
namespace JWDocs.Services;

/// <summary>
/// Dienst zur Verarbeitung von Kundenzahlungen.
/// </summary>
/// <param name="gateway">Der primäre Zahlungsanbieter.</param>
/// <param name="logger">Der Audit-Protokolldienst.</param>
public class PaymentProcessor(IPaymentGateway gateway, ILogger logger)
{
    public async Task ProcessAsync(decimal amount)
    {
        ArgumentNullException.ThrowIfNull(gateway);
        ArgumentNullException.ThrowIfNull(logger);

        logger.LogInfo("Zahlung wird gestartet...");
        await gateway.ChargeAsync(amount);
    }
}
```

## Integration mit .NET-Analyzern und EditorConfig

Um konsistente Standards in Entwicklungsteams durchzusetzen, empfiehlt sich die Konfiguration der statischen Analyse in der `.editorconfig`-Datei:

```ini
[*.cs]
dotnet_style_prefer_primary_constructors = true:suggestion
```

### Automatische Dokumentation mit Auto-Doc AI

Bei Primary Constructors verschiebt sich der Ort der XML-Dokumentation: `<param>`-Tags gehören nun direkt zur Dokumentation der Klasse. Unser Tool **Code Formatter & Auto-Doc AI** analysiert die Parameter des Primary Constructors automatisch und generiert entsprechende XML-Kommentare gemäß StyleCop-Regeln (`SA1600`) und Microsoft-Standards.

## Fazit und Best Practices

Die Nutzung von Primary Constructors in C# 12 entfernt überflüssigen Code und steigert die Lesbarkeit des Gesamtsystems. Zusammen mit EditorConfig-Regeln und automatisierter Dokumentation durch Auto-Doc AI bleibt Ihre Codebasis sauber, modern und leicht pflegbar.
