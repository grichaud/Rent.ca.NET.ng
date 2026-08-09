using FluentValidation;

namespace Rent.Api.Features.AiChat;

/// <summary>
/// Configuracion del asistente. Sin <see cref="OpenRouterApiKey"/> el contenedor registra
/// <c>NoOpOpenRouterClient</c> y el chat responde un aviso en vez de fallar, igual que el
/// origen: un entorno sin credenciales tiene que seguir arrancando y sirviendo el resto.
/// </summary>
public sealed class AiOptions
{
    public const string SectionName = "Ai";

    public string OpenRouterApiKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = "https://openrouter.ai/api/v1/";
    public string Model { get; set; } = "anthropic/claude-haiku-4-5";
    public int MaxTokens { get; set; } = 2000;

    /// <summary>Vueltas maximas del bucle de herramientas antes de rendirse y resumir.</summary>
    public int MaxIterations { get; set; } = 5;

    public int RequestTimeoutSeconds { get; set; } = 60;
    public int RateLimitPerHour { get; set; } = 20;

    /// <summary>Mensajes de historial que se reenvian al modelo en cada vuelta.</summary>
    public int HistoryWindow { get; set; } = 20;

    public string AppName { get; set; } = "Rent.ca.NET.ng";
    public string SiteUrl { get; set; } = "https://rent-ca-net-ng.azurewebsites.net";
}

public sealed class ChatRequest
{
    public Guid? ConversationId { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? Locale { get; set; }
    public ChatRequestContext? Context { get; set; }
}

public sealed class ChatRequestContext
{
    public string? CurrentPage { get; set; }
    public string? CurrentCity { get; set; }
    public Guid? CurrentPropertyId { get; set; }
}

public sealed record ChatContext(
    string? CurrentPage,
    string? CurrentCity,
    Guid? CurrentPropertyId,
    string? Locale = null);

public sealed record AiChatResult(Guid ConversationId, string AssistantText, int ToolStepsExecuted);

public sealed record ActiveConversation(
    Guid ConversationId,
    string? Title,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<ActiveMessage> Messages);

public sealed record ActiveMessage(
    Guid Id,
    string Role,
    string Content,
    string? ToolName,
    DateTimeOffset CreatedAt);

public sealed class ChatRequestValidator : AbstractValidator<ChatRequest>
{
    public ChatRequestValidator()
    {
        RuleFor(x => x.Message)
            .NotEmpty().WithMessage("Message is required.")
            .MaximumLength(2000).WithMessage("Message is too long (max 2000 characters).");
    }
}
