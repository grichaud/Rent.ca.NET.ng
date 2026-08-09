using Microsoft.Net.Http.Headers;

namespace Rent.Api.Infrastructure.Http;

/// <summary>
/// Marca un endpoint publico como cacheable por el navegador.
///
/// Existe por la cuota del plan F1 (PRP 12.3): cada llamada que se ahorra es CPU que no se
/// gasta y, sobre todo, una consulta que no despierta la base gratuita — que al despertarse
/// cobra una hora entera de cuota porque el retardo minimo de auto-pausa es de 60 minutos.
///
/// La regla que sostiene todo esto: **solo se cachea lo ANONIMO**. Las respuestas publicas de
/// este catalogo no son iguales para todo el mundo — `PropertyCardDto.IsFavorited` depende de
/// quien pregunta—, asi que marcar `public` una respuesta con sesion dejaria el corazon de una
/// persona guardado en la cache del navegador de otra, o en cualquier proxy intermedio. Para
/// un visitante identificado se responde `no-store` y no se cachea nada.
///
/// La cabecera `Vary: Cookie` es el cinturon de seguridad: le dice a todo intermediario que
/// dos peticiones con cookies distintas son respuestas distintas, aunque la URL sea la misma.
/// </summary>
public static class PublicCacheExtensions
{
    /// <summary>
    /// Cinco minutos. El catalogo cambia en horas —un propietario publica un piso de vez en
    /// cuando—, asi que servir datos de hace un rato no le cuesta nada a nadie; y es tiempo de
    /// sobra para absorber la reca rga de una persona navegando por varias ciudades.
    /// </summary>
    public const int DefaultSeconds = 300;

    public static RouteHandlerBuilder WithPublicCache(
        this RouteHandlerBuilder builder, int seconds = DefaultSeconds)
    {
        return builder.AddEndpointFilter(async (context, next) =>
        {
            var result = await next(context);

            var http = context.HttpContext;
            var response = http.Response;

            // Vary siempre, tambien en la rama sin cache: si un intermediario guardo antes una
            // respuesta anonima, tiene que saber que no vale para quien llega con cookie.
            response.Headers[HeaderNames.Vary] = HeaderNames.Cookie;

            if (http.User.Identity?.IsAuthenticated == true)
            {
                response.Headers[HeaderNames.CacheControl] = "private, no-store";
                return result;
            }

            response.Headers[HeaderNames.CacheControl] = $"public, max-age={seconds}";
            return result;
        });
    }
}
