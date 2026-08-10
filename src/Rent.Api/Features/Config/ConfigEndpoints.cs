using Microsoft.Extensions.Options;
using Rent.Api.Features.Maps;
using Rent.Api.Infrastructure.Http;

namespace Rent.Api.Features.Config;

/// <summary>
/// Ajustes que el NAVEGADOR necesita conocer. Nada mas: aqui no entra ningun secreto.
/// </summary>
public sealed record PublicConfigDto(string? MapsApiKey);

/// <summary>
/// Configuracion publica del cliente.
///
/// Existe porque en esta arquitectura el navegador no puede leer la configuracion del
/// servidor: el origen inyectaba la clave de Google Maps en un &lt;meta&gt; del layout Razor, y
/// aqui no hay layout que la lleve.
///
/// **La clave de Maps es publica por naturaleza.** El API de JavaScript de Google se carga
/// desde el navegador, asi que la clave viaja al cliente en cualquier diseño posible —
/// esconderla no es una opcion tecnica, solo una ilusion. Lo que la protege es la
/// **restriccion por dominio** en la consola de Google Cloud: sin ella, cualquiera puede
/// copiarla y gastar la cuota de la cuenta. Es el mismo modelo que ya usaba el origen.
///
/// Si no esta configurada se devuelve nulo y el cliente se limita a no pintar el mapa, que es
/// mejor que cargar el script de Google para que falle con un error suyo.
/// </summary>
public static class ConfigEndpoints
{
    public static void MapConfigEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/config", (IOptions<MapsOptions> maps) =>
        {
            var key = maps.Value.GoogleApiKey;
            return Results.Ok(new PublicConfigDto(string.IsNullOrWhiteSpace(key) ? null : key));
        })
        .AllowAnonymous()
        // Cambia con un reinicio, no con cada peticion: una hora de cache ahorra una llamada
        // por visitante que abra el mapa.
        .WithPublicCache(3600)
        .WithName("GetPublicConfig");
    }
}
