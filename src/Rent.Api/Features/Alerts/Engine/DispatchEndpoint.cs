using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace Rent.Api.Features.Alerts.Engine;

/// <summary>
/// Disparador maquina-a-maquina del motor de digest.
///
/// El App Service corre en plan F1, que no admite Always On: el proceso se descarga tras un
/// rato sin trafico y un temporizador dentro del proceso dispararia de forma erratica o no
/// dispararia. En su lugar, un planificador externo (cron de GitHub Actions) hace POST aqui.
///
/// Se autentica con un secreto compartido y no con cookie, por eso queda FUERA del filtro de
/// antiforgery: no hay sesion de navegador que proteger, un POST forjado desde otro sitio no
/// puede aportar la cabecera, y la ruta no muta nada en nombre de la identidad de quien llama.
/// </summary>
public static class DispatchEndpoint
{
    public const string TokenHeader = "X-Alerts-Token";

    /// <summary>
    /// Evita ejecuciones solapadas (una lenta mas el siguiente tic del cron, o un disparo
    /// manual encima de uno programado). Estatico porque un proceso solo deberia tener una
    /// pasada del motor en vuelo.
    /// </summary>
    private static readonly SemaphoreSlim RunGate = new(1, 1);

    public static void MapAlertDispatchEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/alerts/dispatch", async (
            HttpContext http,
            IAlertDigestService engine,
            IOptions<AlertEngineOptions> options,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Alerts.Dispatch");
            var token = options.Value.DispatchToken;

            // Falla cerrado: sin secreto configurado la ruta niega existir en vez de correr sin
            // autenticar. Un despliegue mal configurado queda inerte, no abierto de par en par.
            if (string.IsNullOrWhiteSpace(token))
            {
                logger.LogWarning(
                    "Alert dispatch called but {Section}:{Key} is not configured; refusing.",
                    AlertEngineOptions.SectionName, nameof(AlertEngineOptions.DispatchToken));
                return Results.NotFound();
            }

            if (!IsAuthorized(http, token))
            {
                logger.LogWarning("Alert dispatch rejected: missing or invalid {Header}.", TokenHeader);
                return Results.Unauthorized();
            }

            if (!await RunGate.WaitAsync(0, ct))
            {
                logger.LogInformation("Alert dispatch skipped: a run is already in progress.");
                return Results.Conflict(new { message = "An alert digest run is already in progress." });
            }

            try
            {
                return Results.Ok(await engine.RunAsync(ct));
            }
            finally
            {
                RunGate.Release();
            }
        })
        .AllowAnonymous()
        .WithName("DispatchAlertDigests")
        .WithTags("Alerts");
    }

    private static bool IsAuthorized(HttpContext http, string expectedToken)
    {
        if (!http.Request.Headers.TryGetValue(TokenHeader, out var provided)) return false;

        var supplied = Encoding.UTF8.GetBytes(provided.ToString());
        var expected = Encoding.UTF8.GetBytes(expectedToken);

        // Comparacion de tiempo constante para que nadie pueda reconstruir el token byte a byte
        // midiendo cuanto tarda la respuesta. Si las longitudes difieren, FixedTimeEquals corta
        // antes y solo filtra la longitud, algo asumible para un secreto aleatorio.
        return CryptographicOperations.FixedTimeEquals(supplied, expected);
    }
}
