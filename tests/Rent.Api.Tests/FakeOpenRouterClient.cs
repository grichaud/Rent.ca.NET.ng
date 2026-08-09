using System.Collections.Concurrent;
using Rent.Api.Features.AiChat.Services;

namespace Rent.Api.Tests;

/// <summary>
/// Cliente de OpenRouter guionizado.
///
/// Sin el no hay forma de probar lo unico que de verdad tiene logica en esta feature: el bucle
/// de herramientas. <c>NoOpOpenRouterClient</c> siempre contesta texto plano y nunca pide una
/// herramienta, asi que con el solo se ejercita el camino trivial. Aqui se encolan respuestas
/// y se comprueba que el servicio ejecuta la herramienta, le devuelve el resultado al modelo y
/// da por buena la segunda respuesta.
/// </summary>
public sealed class FakeOpenRouterClient : IOpenRouterClient
{
    private readonly ConcurrentQueue<ChatCompletionResponse> _scripted = new();

    public bool IsConfigured => true;

    /// <summary>Peticiones recibidas, para poder mirar que mensajes vio el modelo.</summary>
    public List<ChatCompletionRequest> Requests { get; } = [];

    public void EnqueueText(string content) =>
        _scripted.Enqueue(new ChatCompletionResponse
        {
            Choices =
            [
                new ChatCompletionChoice
                {
                    Message = new ChatCompletionMessage { Role = "assistant", Content = content },
                    FinishReason = "stop"
                }
            ]
        });

    public void EnqueueToolCall(string toolName, string argumentsJson, string? content = null) =>
        _scripted.Enqueue(new ChatCompletionResponse
        {
            Choices =
            [
                new ChatCompletionChoice
                {
                    Message = new ChatCompletionMessage
                    {
                        Role = "assistant",
                        Content = content,
                        ToolCalls =
                        [
                            new ToolCall
                            {
                                Id = $"call-{Guid.NewGuid():N}",
                                Function = new ToolCallFunction { Name = toolName, Arguments = argumentsJson }
                            }
                        ]
                    },
                    FinishReason = "tool_calls"
                }
            ]
        });

    public Task<ChatCompletionResponse> ChatCompletionAsync(
        ChatCompletionRequest request, CancellationToken ct = default)
    {
        Requests.Add(request);

        if (_scripted.TryDequeue(out var scripted)) return Task.FromResult(scripted);

        // Guion agotado: se contesta texto para que el bucle termine en vez de colgarse.
        return Task.FromResult(new ChatCompletionResponse
        {
            Choices =
            [
                new ChatCompletionChoice
                {
                    Message = new ChatCompletionMessage { Role = "assistant", Content = "(end of script)" },
                    FinishReason = "stop"
                }
            ]
        });
    }
}
