using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Rent.Api.Features.AiChat.Services;

public interface IOpenRouterClient
{
    /// <summary>Falso cuando no hay clave: el chat sigue respondiendo, pero con un aviso.</summary>
    bool IsConfigured { get; }

    Task<ChatCompletionResponse> ChatCompletionAsync(
        ChatCompletionRequest request,
        CancellationToken ct = default);
}

/// <summary>Cliente real de OpenRouter. Solo se registra si hay <c>Ai:OpenRouterApiKey</c>.</summary>
public sealed class OpenRouterClient : IOpenRouterClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _http;
    private readonly AiOptions _options;
    private readonly ILogger<OpenRouterClient> _logger;

    public OpenRouterClient(HttpClient http, IOptions<AiOptions> options, ILogger<OpenRouterClient> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;

        if (!string.IsNullOrWhiteSpace(_options.OpenRouterApiKey))
        {
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _options.OpenRouterApiKey);
        }

        // Cabeceras de atribucion de OpenRouter: identifican la app en su panel de uso.
        if (!string.IsNullOrWhiteSpace(_options.SiteUrl))
            _http.DefaultRequestHeaders.TryAddWithoutValidation("HTTP-Referer", _options.SiteUrl);
        if (!string.IsNullOrWhiteSpace(_options.AppName))
            _http.DefaultRequestHeaders.TryAddWithoutValidation("X-Title", _options.AppName);
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.OpenRouterApiKey);

    public async Task<ChatCompletionResponse> ChatCompletionAsync(
        ChatCompletionRequest request,
        CancellationToken ct = default)
    {
        request.Stream = false;

        using var response = await _http.PostAsJsonAsync("chat/completions", request, JsonOptions, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            // El cuerpo se registra porque los errores de OpenRouter (modelo retirado, credito
            // agotado, argumento invalido) solo se distinguen ahi; el status es siempre 4xx.
            _logger.LogWarning(
                "OpenRouter returned {Status} for model {Model}: {Body}",
                (int)response.StatusCode, request.Model, body);
            response.EnsureSuccessStatusCode();
        }

        return JsonSerializer.Deserialize<ChatCompletionResponse>(body, JsonOptions)
            ?? throw new InvalidOperationException("OpenRouter returned an empty body.");
    }
}

/// <summary>
/// Sustituto sin credenciales: responde un aviso en lugar de fallar. Es lo que permite que el
/// chat se pueda construir y validar de extremo a extremo sin gastar una clave de API.
/// </summary>
public sealed class NoOpOpenRouterClient : IOpenRouterClient
{
    public const string Placeholder = "(AI assistant is not configured. Set Ai:OpenRouterApiKey to enable.)";

    private readonly ILogger<NoOpOpenRouterClient> _logger;

    public NoOpOpenRouterClient(ILogger<NoOpOpenRouterClient> logger) => _logger = logger;

    public bool IsConfigured => false;

    public Task<ChatCompletionResponse> ChatCompletionAsync(
        ChatCompletionRequest request,
        CancellationToken ct = default)
    {
        _logger.LogInformation("[NoOp] ChatCompletionAsync skipped (no API key). Model={Model}", request.Model);

        return Task.FromResult(new ChatCompletionResponse
        {
            Choices =
            [
                new ChatCompletionChoice
                {
                    Index = 0,
                    Message = new ChatCompletionMessage { Role = "assistant", Content = Placeholder },
                    FinishReason = "stop"
                }
            ]
        });
    }
}
