using Rent.Api.Features.AiChat.Services;

namespace Rent.Api.Features.AiChat.Tools;

public interface IAiTool
{
    string Name { get; }
    string Description { get; }

    /// <summary>Esquema JSON de los argumentos, tal y como lo espera OpenRouter.</summary>
    object Parameters { get; }

    Task<ToolExecutionResult> ExecuteAsync(
        string argumentsJson,
        ToolExecutionContext context,
        CancellationToken ct = default);
}

/// <summary>
/// Quien llama a la herramienta.
///
/// <paramref name="Locale"/> NO existe en el origen, que lo resolvia de la cultura ambiente
/// del hilo (<c>LocalizationConfig.CurrentOrDefault()</c>). Aqui la API no tiene cultura
/// ambiente —el idioma lo lleva el cliente en la peticion—, asi que viaja explicito: sin el,
/// una alerta creada por el chat en frances mandaria su digest en ingles.
/// </summary>
public sealed record ToolExecutionContext(Guid? UserId, Guid SessionId, string Locale);

public sealed record ToolExecutionResult(object Data, bool Success = true)
{
    public static ToolExecutionResult Ok(object data) => new(data, true);
    public static ToolExecutionResult Fail(object data) => new(data, false);
}

/// <summary>Catalogo de herramientas; se resuelve por nombre al despachar una tool call.</summary>
public sealed class ToolRegistry
{
    private readonly Dictionary<string, IAiTool> _tools;

    public ToolRegistry(IEnumerable<IAiTool> tools)
        => _tools = tools.ToDictionary(t => t.Name, t => t, StringComparer.Ordinal);

    public IReadOnlyCollection<IAiTool> All => _tools.Values;

    public IAiTool? Resolve(string name) => _tools.GetValueOrDefault(name);

    public List<ToolDefinition> ToOpenAISchema() =>
        _tools.Values.Select(t => new ToolDefinition
        {
            Type = "function",
            Function = new FunctionDefinition
            {
                Name = t.Name,
                Description = t.Description,
                Parameters = t.Parameters
            }
        }).ToList();
}

/// <summary>
/// Construccion de las URLs que el asistente entrega al usuario.
///
/// **Divergencia intencionada con el origen.** Alli las herramientas devuelven
/// <c>/toronto/mi-piso</c> y <c>/renter/alerts</c>, sin prefijo de idioma, mientras que sus
/// rutas reales son <c>/{culture}/{citySlug}/{slug}</c> y <c>/{culture}/renter/alerts</c>:
/// todos los enlaces que da el chat son 404. Como el valor del asistente es justamente llevar
/// al usuario a la ficha, aqui se antepone el idioma.
/// </summary>
internal static class AiLinks
{
    public static string Listing(string locale, string citySlug, string propertySlug)
        => $"/{Normalize(locale)}/{citySlug}/{propertySlug}";

    public static string City(string locale, string citySlug)
        => $"/{Normalize(locale)}/{citySlug}";

    public static string RenterAlerts(string locale)
        => $"/{Normalize(locale)}/renter/alerts";

    private static string Normalize(string? locale)
        => string.Equals(locale, "fr", StringComparison.OrdinalIgnoreCase) ? "fr" : "en";
}
