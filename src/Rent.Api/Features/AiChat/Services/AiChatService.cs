using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Rent.Api.Domain;
using Rent.Api.Features.AiChat.Tools;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.AiChat.Services;

public interface IAiChatService
{
    Task<AiChatResult> ProcessAsync(
        ChatRequest request,
        Guid? userId,
        Guid sessionId,
        Func<string, CancellationToken, Task> emitChunkAsync,
        CancellationToken ct = default);

    Task<ActiveConversation?> GetActiveConversationAsync(
        Guid? userId,
        Guid sessionId,
        CancellationToken ct = default);
}

/// <summary>
/// Bucle de conversacion con herramientas: se pregunta al modelo, si pide herramientas se
/// ejecutan y se le devuelve el resultado, y se repite hasta que conteste texto o se agoten
/// las vueltas. Cada paso queda registrado en <c>AiMessages</c>, que es lo que despues lee el
/// panel de administracion.
/// </summary>
public sealed class AiChatService : IAiChatService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    /// <summary>Una conversacion se considera viva 24 h desde su ultimo mensaje.</summary>
    private static readonly TimeSpan ActiveWindow = TimeSpan.FromHours(24);

    private readonly AppDbContext _db;
    private readonly IOpenRouterClient _openRouter;
    private readonly ToolRegistry _tools;
    private readonly AiOptions _options;
    private readonly ILogger<AiChatService> _logger;

    public AiChatService(
        AppDbContext db,
        IOpenRouterClient openRouter,
        ToolRegistry tools,
        IOptions<AiOptions> options,
        ILogger<AiChatService> logger)
    {
        _db = db;
        _openRouter = openRouter;
        _tools = tools;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<ActiveConversation?> GetActiveConversationAsync(
        Guid? userId, Guid sessionId, CancellationToken ct = default)
    {
        var cutoff = DateTimeOffset.UtcNow - ActiveWindow;

        var query = _db.AiConversations.AsNoTracking();
        query = userId is { } uid
            ? query.Where(c => c.UserId == uid)
            : query.Where(c => c.SessionId == sessionId);

        // Filtro y orden en memoria: UpdatedAt es DateTimeOffset y SQLite (el banco de pruebas)
        // no lo ordena. Es el mismo motivo que en el resto de features.
        var candidates = await query.ToListAsync(ct);
        var conversation = candidates
            .Where(c => c.UpdatedAt >= cutoff)
            .OrderByDescending(c => c.UpdatedAt)
            .FirstOrDefault();

        if (conversation is null) return null;

        // Ni System ni Tool: al reabrir el chat se ve la conversacion como la vivio el usuario,
        // sin el prompt de sistema ni el JSON interno de las herramientas.
        var raw = await _db.AiMessages.AsNoTracking()
            .Where(m => m.ConversationId == conversation.Id
                && m.Role != AiMessageRole.System
                && m.Role != AiMessageRole.Tool)
            .ToListAsync(ct);

        var messages = raw
            .OrderBy(m => m.CreatedAt)
            .Take(_options.HistoryWindow * 2)
            .Select(m => new ActiveMessage(m.Id, m.Role.ToString(), m.Content, m.ToolName, m.CreatedAt))
            .ToList();

        return new ActiveConversation(conversation.Id, conversation.Title, conversation.UpdatedAt, messages);
    }

    public async Task<AiChatResult> ProcessAsync(
        ChatRequest request,
        Guid? userId,
        Guid sessionId,
        Func<string, CancellationToken, Task> emitChunkAsync,
        CancellationToken ct = default)
    {
        var locale = string.Equals(request.Locale, "fr", StringComparison.OrdinalIgnoreCase) ? "fr" : "en";
        var conversation = await ResolveConversationAsync(request.ConversationId, userId, sessionId, request.Message, ct);

        var userMessage = new AiMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            Role = AiMessageRole.User,
            Content = request.Message
        };
        _db.AiMessages.Add(userMessage);
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);

        var messages = new List<ChatCompletionMessage>
        {
            new()
            {
                Role = "system",
                Content = AiSystemPrompt.Build(new ChatContext(
                    request.Context?.CurrentPage,
                    request.Context?.CurrentCity,
                    request.Context?.CurrentPropertyId,
                    locale))
            }
        };

        // Historial: los N mas RECIENTES, devueltos al orden cronologico. Tomar los primeros
        // dejaria al modelo leyendo el principio de una conversacion larga y nada de lo ultimo.
        var historyAll = await _db.AiMessages.AsNoTracking()
            .Where(m => m.ConversationId == conversation.Id && m.Id != userMessage.Id)
            .ToListAsync(ct);
        var history = historyAll
            .OrderByDescending(m => m.CreatedAt)
            .Take(_options.HistoryWindow)
            .OrderBy(m => m.CreatedAt)
            .ToList();

        foreach (var message in history)
            messages.Add(MaterializeHistoryMessage(message));

        messages.Add(new ChatCompletionMessage { Role = "user", Content = request.Message });

        var toolDefinitions = _tools.ToOpenAISchema();
        var toolStepsExecuted = 0;
        var finalText = string.Empty;

        for (var step = 1; step <= _options.MaxIterations; step++)
        {
            var response = await _openRouter.ChatCompletionAsync(new ChatCompletionRequest
            {
                Model = _options.Model,
                Messages = messages,
                Tools = toolDefinitions,
                ToolChoice = "auto",
                MaxTokens = _options.MaxTokens
            }, ct);

            var choice = response.Choices.FirstOrDefault()
                ?? throw new InvalidOperationException("OpenRouter returned no choices.");
            var assistant = choice.Message;

            if (assistant.ToolCalls is not { Count: > 0 } toolCalls)
            {
                finalText = assistant.Content ?? string.Empty;
                break;
            }

            toolStepsExecuted++;

            // La peticion de herramientas se reinyecta tal cual: el protocolo exige que cada
            // mensaje "tool" venga precedido del "assistant" que lo pidio, con el mismo id.
            messages.Add(new ChatCompletionMessage
            {
                Role = "assistant",
                Content = assistant.Content,
                ToolCalls = toolCalls
            });

            if (!string.IsNullOrWhiteSpace(assistant.Content))
            {
                _db.AiMessages.Add(new AiMessage
                {
                    Id = Guid.NewGuid(),
                    ConversationId = conversation.Id,
                    Role = AiMessageRole.Assistant,
                    Content = assistant.Content
                });
            }

            foreach (var call in toolCalls)
            {
                var resultJson = await DispatchToolAsync(call, conversation.Id, userId, sessionId, locale, ct);
                messages.Add(new ChatCompletionMessage
                {
                    Role = "tool",
                    ToolCallId = call.Id,
                    Name = call.Function.Name,
                    Content = resultJson
                });
            }

            await _db.SaveChangesAsync(ct);

            if (step >= _options.MaxIterations)
            {
                finalText = assistant.Content
                    ?? "I've gathered some information but reached the tool-call limit. Please ask me to summarize what we have so far.";
                _logger.LogWarning(
                    "Conversation {Id} hit MaxIterations={Max} with tool calls still pending",
                    conversation.Id, _options.MaxIterations);
                break;
            }
        }

        if (string.IsNullOrEmpty(finalText))
            finalText = "I'm sorry, I couldn't generate a response. Please try again.";

        await StreamTextAsync(finalText, emitChunkAsync, ct);

        _db.AiMessages.Add(new AiMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversation.Id,
            Role = AiMessageRole.Assistant,
            Content = finalText
        });
        conversation.UpdatedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);

        return new AiChatResult(conversation.Id, finalText, toolStepsExecuted);
    }

    /// <summary>
    /// Recupera la conversacion indicada solo si es de quien pregunta; si no, abre una nueva.
    /// Sin esa comprobacion, mandar el id de otro dejaria leer —y continuar— su hilo.
    /// </summary>
    private async Task<AiConversation> ResolveConversationAsync(
        Guid? conversationId, Guid? userId, Guid sessionId, string firstMessage, CancellationToken ct)
    {
        if (conversationId is { } id)
        {
            var existing = await _db.AiConversations.FirstOrDefaultAsync(c => c.Id == id, ct);
            if (existing is not null && BelongsToCaller(existing, userId, sessionId))
                return existing;
        }

        var conversation = new AiConversation
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SessionId = userId is null ? sessionId : null,
            Title = TruncateTitle(firstMessage)
        };
        _db.AiConversations.Add(conversation);
        return conversation;
    }

    private static bool BelongsToCaller(AiConversation conversation, Guid? userId, Guid sessionId) =>
        (userId is { } uid && conversation.UserId == uid) ||
        (userId is null && conversation.SessionId == sessionId);

    /// <summary>El primer mensaje da titulo al hilo, recortado a 80 para la lista del panel.</summary>
    private static string? TruncateTitle(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var trimmed = raw.Trim();
        return trimmed.Length <= 80 ? trimmed : trimmed[..77] + "...";
    }

    private async Task<string> DispatchToolAsync(
        ToolCall call, Guid conversationId, Guid? userId, Guid sessionId, string locale, CancellationToken ct)
    {
        var tool = _tools.Resolve(call.Function.Name);
        if (tool is null)
        {
            var errorJson = JsonSerializer.Serialize(new { error = $"Unknown tool: {call.Function.Name}" });
            RecordToolCall(conversationId, call, errorJson);
            return errorJson;
        }

        ToolExecutionResult result;
        try
        {
            result = await tool.ExecuteAsync(
                call.Function.Arguments,
                new ToolExecutionContext(userId, sessionId, locale),
                ct);
        }
        catch (Exception ex)
        {
            // Una herramienta rota no puede tumbar la conversacion: se le devuelve el fallo al
            // modelo, que sabe disculparse o probar otra via.
            _logger.LogError(ex, "Tool {Tool} failed for conversation {Id}", call.Function.Name, conversationId);
            result = ToolExecutionResult.Fail(new { error = "Tool execution failed." });
        }

        var resultJson = JsonSerializer.Serialize(result.Data, JsonOptions);
        RecordToolCall(conversationId, call, resultJson);
        return resultJson;
    }

    private void RecordToolCall(Guid conversationId, ToolCall call, string resultJson)
    {
        _db.AiMessages.Add(new AiMessage
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            Role = AiMessageRole.Tool,
            ToolName = call.Function.Name,
            ToolArgsJson = call.Function.Arguments,
            ToolResultJson = resultJson,
            Content = resultJson
        });
    }

    private static ChatCompletionMessage MaterializeHistoryMessage(AiMessage message)
    {
        if (message.Role == AiMessageRole.Tool)
        {
            return new ChatCompletionMessage
            {
                Role = "tool",
                Content = message.Content,
                Name = message.ToolName,
                ToolCallId = message.Id.ToString()
            };
        }

        var role = message.Role switch
        {
            AiMessageRole.User => "user",
            AiMessageRole.Assistant => "assistant",
            AiMessageRole.System => "system",
            _ => "user"
        };
        return new ChatCompletionMessage { Role = role, Content = message.Content };
    }

    /// <summary>
    /// Streaming fingido: el texto ya esta completo y se emite a trozos con una pausa breve.
    /// Es lo que hace el origen y da la sensacion de escritura sin depender del SSE del
    /// proveedor, que complica el bucle de herramientas.
    /// </summary>
    private static async Task StreamTextAsync(
        string text, Func<string, CancellationToken, Task> emitChunkAsync, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(text)) return;

        const int chunkSize = 24;
        var index = 0;
        while (index < text.Length)
        {
            ct.ThrowIfCancellationRequested();
            var length = Math.Min(chunkSize, text.Length - index);
            await emitChunkAsync(text.Substring(index, length), ct);
            index += length;
            if (index < text.Length) await Task.Delay(20, ct);
        }
    }
}
