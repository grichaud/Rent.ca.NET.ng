namespace Rent.Api.Features.Alerts.Engine;

/// <summary>
/// Ajustes del motor de digest. Se enlazan de la seccion "Alerts" de configuracion.
/// </summary>
public class AlertEngineOptions
{
    public const string SectionName = "Alerts";

    /// <summary>
    /// Secreto compartido que exige la ruta de disparo. Vacio significa que la ruta NO se
    /// mapea: un despliegue mal configurado queda inerte en vez de abierto.
    /// </summary>
    public string DispatchToken { get; set; } = string.Empty;

    /// <summary>Tope de alertas procesadas en una ejecucion.</summary>
    public int MaxAlertsPerRun { get; set; } = 200;

    /// <summary>Listings mostrados en un digest antes de enlazar a la busqueda completa.</summary>
    public int MaxItemsPerEmail { get; set; } = 10;

    /// <summary>Pausa entre envios. El plan gratuito de Resend limita a ~2 por segundo.</summary>
    public int SendDelayMs { get; set; } = 600;
}

/// <summary>Un listing que satisfizo una alerta, ya aplanado para la plantilla del correo.</summary>
public record AlertMatch(
    Guid PropertyId,
    string Title,
    string Slug,
    string City,
    string Province,
    string? Neighbourhood,
    string? ImageUrl,
    decimal? MinPrice,
    decimal? MaxPrice,
    int MinBedrooms,
    int? MaxBedrooms,
    decimal MinBathrooms,
    DateTimeOffset CreatedAt);

/// <summary>Resultado de una ejecucion, que la ruta de disparo devuelve como JSON.</summary>
public record DigestRunResult
{
    /// <summary>Alertas activas examinadas.</summary>
    public int Considered { get; init; }

    /// <summary>De esas, cuantas tenian la cadencia cumplida.</summary>
    public int Due { get; init; }

    /// <summary>Digests entregados.</summary>
    public int Sent { get; init; }

    /// <summary>Alertas en plazo sin listings nuevos; se dejan sin marcar a proposito.</summary>
    public int NoMatches { get; init; }

    /// <summary>Envios que fallaron. Conservan su LastSentAt y se reintentan en la siguiente.</summary>
    public int Failed { get; init; }

    /// <summary>Total de listings incluidos en todos los digests entregados.</summary>
    public int PropertiesIncluded { get; init; }

    public long ElapsedMs { get; init; }
}
