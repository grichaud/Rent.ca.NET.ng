using System.Text.Json;
using FluentValidation;
using Rent.Api.Features.AiChat.Services;
using Rent.Api.Features.Auth;
using Rent.Api.Features.Shared;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.AiChat;

/// <summary>
/// Los tres endpoints del asistente (port de Features/AiChat/Pages del origen, que alli eran
/// Razor Pages usadas como API).
///
/// El grupo es anonimo pero SI valida antiforgery, igual que el de consultas: preguntar por un
/// piso sin cuenta es el caso normal, pero eso no lo convierte en un endpoint que cualquier
/// sitio pueda invocar desde el navegador de un tercero.
/// </summary>
public static class AiChatEndpoints
{
    private static readonly JsonSerializerOptions SseJson = new(JsonSerializerDefaults.Web);

    public static void MapAiChatEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/ai")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .AllowAnonymous()
            .WithTags("AiChat");

        // Respuesta por Server-Sent Events. No devuelve IResult: escribe directamente en el
        // cuerpo y lo vacia por trozos, que es justo lo que un IResult ya materializado impide.
        group.MapPost("/chat", async (
            HttpContext http,
            ChatRequest request,
            IValidator<ChatRequest> validator,
            IAiChatService chat,
            IRateLimiter rateLimiter,
            Microsoft.Extensions.Options.IOptions<AiOptions> options,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Rent.Api.Features.AiChat");

            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var sessionId = AiSessionCookie.EnsureSessionId(http);
            var userId = CurrentUser.GetId(http.User);

            // La cuota es por identidad si la hay y por sesion si no: con la clave puesta en la
            // IP, una oficina entera compartiria el cupo de 20 mensajes.
            var rateKey = userId is { } uid ? $"user:{uid}" : $"sess:{sessionId}";
            if (!rateLimiter.TryAcquire(rateKey, options.Value.RateLimitPerHour, TimeSpan.FromHours(1)))
            {
                return Results.Problem(
                    title: "Slow down — too many requests. Try again in a few minutes.",
                    statusCode: StatusCodes.Status429TooManyRequests);
            }

            http.Response.ContentType = "text/event-stream";
            http.Response.Headers.CacheControl = "no-cache, no-transform";
            // Sin esto un proxy inverso (nginx, Application Gateway) acumula la respuesta y la
            // entrega de golpe al final: el efecto de escritura progresiva se pierde.
            http.Response.Headers["X-Accel-Buffering"] = "no";

            try
            {
                var result = await chat.ProcessAsync(
                    request, userId, sessionId,
                    emitChunkAsync: (chunk, innerCt) =>
                        WriteEventAsync(http, "message", new { content = chunk }, innerCt),
                    ct);

                await WriteEventAsync(http, "done", new { conversationId = result.ConversationId }, ct);
            }
            catch (OperationCanceledException)
            {
                // El visitante cerro la pestaña a media respuesta. No es un fallo.
                logger.LogInformation("Chat stream canceled by client.");
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Chat processing failed for user {UserId}", userId);
                try
                {
                    await WriteEventAsync(http, "error", new
                    {
                        message = "Sorry, I couldn't reach the assistant. Please try again."
                    }, ct);
                }
                catch
                {
                    // La respuesta puede estar ya cerrada; no hay nada mejor que hacer aqui.
                }
            }

            return Results.Empty;
        })
        .WithName("AiChat");

        // Hilo vivo del visitante (24 h), para repintar el chat al recargar la pagina.
        group.MapGet("/conversation", async (
            HttpContext http,
            IAiChatService chat,
            CancellationToken ct) =>
        {
            var sessionId = AiSessionCookie.EnsureSessionId(http);
            var userId = CurrentUser.GetId(http.User);

            var active = await chat.GetActiveConversationAsync(userId, sessionId, ct);
            if (active is null) return Results.Ok(new { conversation = (object?)null });

            return Results.Ok(new
            {
                conversation = new
                {
                    id = active.ConversationId,
                    title = active.Title,
                    updatedAt = active.UpdatedAt,
                    messages = active.Messages.Select(m => new
                    {
                        id = m.Id,
                        role = m.Role.ToLowerInvariant(),
                        content = m.Content,
                        createdAt = m.CreatedAt
                    })
                }
            });
        })
        .WithName("AiActiveConversation");

        // "Limpiar chat": no borra nada, solo garantiza la cookie de sesion. El cliente deja de
        // mandar el conversationId y el siguiente mensaje abre un hilo nuevo — el historial
        // anterior sigue disponible para el panel de administracion.
        group.MapPost("/conversation/new", (HttpContext http) =>
        {
            AiSessionCookie.EnsureSessionId(http);
            return Results.Ok(new { ok = true });
        })
        .WithName("AiNewConversation");
    }

    private static async Task WriteEventAsync(
        HttpContext http, string eventName, object payload, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(payload, SseJson);
        await http.Response.WriteAsync($"event: {eventName}\ndata: {json}\n\n", ct);
        await http.Response.Body.FlushAsync(ct);
    }
}
