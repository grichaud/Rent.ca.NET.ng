using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Rent.Api.Infrastructure.Data.Seed;

namespace Rent.Api.Features.Maintenance;

/// <summary>
/// Disparador maquina-a-maquina de migraciones y siembra.
///
/// **Por que existe.** Migrar al arrancar es un antipatron conocido —si la migracion falla la
/// app no levanta, y hace falta permiso de esquema en tiempo de ejecucion— pero aqui ademas
/// costaba dinero: la base es serverless con auto-pausa y despertarla cuesta una hora de cuota
/// por corta que sea la consulta. Cada reinicio del App Service era una hora, y en F1 los hay a
/// diario. Ahora el arranque no toca la base y esto lo dispara el despliegue.
///
/// **Por que un endpoint y no un paso del pipeline.** Lo natural seria `dotnet ef database
/// update` desde el runner, pero el firewall del servidor SQL solo admite servicios de Azure, y
/// el principal del despliegue tiene `Website Contributor` acotado a las dos apps: no puede
/// tocar reglas de firewall. Habilitarlo exigiria darle permisos sobre el servidor SQL — bajar
/// la seguridad para arreglar un problema de coste. La API, en cambio, ya tiene acceso legitimo
/// a la base. Se aprovecha eso.
///
/// Se autentica con un secreto compartido, igual que <c>/api/alerts/dispatch</c>, y por lo mismo
/// queda fuera del filtro de antiforgery: no hay sesion de navegador que proteger y un POST
/// forjado desde otro sitio no puede aportar la cabecera.
/// </summary>
public static class MigrateEndpoint
{
    public const string TokenHeader = "X-Maintenance-Token";

    /// <summary>
    /// Dos migraciones a la vez sobre la misma base es una forma barata de corromperla. El
    /// despliegue publica API y SSR en secuencia y podria reintentar, asi que la puerta no sobra.
    /// </summary>
    private static readonly SemaphoreSlim RunGate = new(1, 1);

    public static void MapMaintenanceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/maintenance/migrate", async (
            HttpContext http,
            IServiceProvider services,
            IOptions<DatabaseOptions> options,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Maintenance.Migrate");
            var token = options.Value.MaintenanceToken;

            // Falla cerrado: sin secreto configurado la ruta niega existir en vez de dejar que
            // cualquiera toque el esquema.
            if (string.IsNullOrWhiteSpace(token))
            {
                logger.LogWarning(
                    "Maintenance migrate called but {Section}:{Key} is not configured; refusing.",
                    DatabaseOptions.SectionName, nameof(DatabaseOptions.MaintenanceToken));
                return Results.NotFound();
            }

            if (!IsAuthorized(http, token))
            {
                logger.LogWarning("Maintenance migrate rejected: missing or invalid {Header}.", TokenHeader);
                return Results.Unauthorized();
            }

            if (!await RunGate.WaitAsync(0, ct))
            {
                logger.LogInformation("Maintenance migrate skipped: a run is already in progress.");
                return Results.Conflict(new { message = "A migration run is already in progress." });
            }

            try
            {
                var startedAt = DateTimeOffset.UtcNow;
                await DatabaseSeeder.RunAsync(services, ct);
                var elapsed = DateTimeOffset.UtcNow - startedAt;

                logger.LogInformation(
                    "Maintenance migrate completed in {Seconds:N1}s.", elapsed.TotalSeconds);

                return Results.Ok(new
                {
                    status = "ok",
                    elapsedSeconds = Math.Round(elapsed.TotalSeconds, 1),
                });
            }
            catch (Exception ex)
            {
                // A diferencia del arranque, aqui el fallo SI se propaga: quien llama es el
                // despliegue y tiene que enterarse de que la base quedo sin migrar.
                logger.LogError(ex, "Maintenance migrate failed.");
                return Results.Problem(
                    title: "Database migration failed",
                    detail: ex.Message,
                    statusCode: StatusCodes.Status500InternalServerError);
            }
            finally
            {
                RunGate.Release();
            }
        })
        .AllowAnonymous()
        .WithName("RunDatabaseMigrations")
        .WithTags("Maintenance");
    }

    private static bool IsAuthorized(HttpContext http, string expectedToken)
    {
        if (!http.Request.Headers.TryGetValue(TokenHeader, out var provided)) return false;

        var supplied = Encoding.UTF8.GetBytes(provided.ToString());
        var expected = Encoding.UTF8.GetBytes(expectedToken);

        // Comparacion de tiempo constante, por el mismo motivo que en el disparo de alertas.
        return CryptographicOperations.FixedTimeEquals(supplied, expected);
    }
}
