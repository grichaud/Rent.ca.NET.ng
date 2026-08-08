using Microsoft.AspNetCore.Antiforgery;

namespace Rent.Api.Infrastructure.Identity;

/// <summary>
/// Puente entre el antiforgery de ASP.NET y la convencion que Angular espera.
///
/// Angular (<c>withXsrfConfiguration</c>) lee una cookie <c>XSRF-TOKEN</c> con JavaScript y
/// reenvia su valor en la cabecera <c>X-XSRF-TOKEN</c>. Esa cookie NO puede ser HttpOnly o el
/// cliente no la vera; la que si lo es y guarda el secreto real es la de ASP.NET
/// (<see cref="SecretCookieName"/>). La validacion compara ambas, asi que un sitio de terceros
/// —que puede provocar el envio de la cookie pero no leerla— no consigue formar la pareja.
/// </summary>
public static class AntiforgeryTokens
{
    public const string HeaderName = "X-XSRF-TOKEN";
    public const string RequestCookieName = "XSRF-TOKEN";
    public const string SecretCookieName = ".rentca.antiforgery";

    public static void Issue(HttpContext context, IAntiforgery antiforgery)
    {
        var tokens = antiforgery.GetAndStoreTokens(context);
        if (tokens.RequestToken is null) return;

        context.Response.Cookies.Append(RequestCookieName, tokens.RequestToken, new CookieOptions
        {
            HttpOnly = false,
            SameSite = SameSiteMode.Lax,
            Secure = context.Request.IsHttps,
            Path = "/",
        });
    }

    /// <summary>
    /// Filtro para los endpoints que mutan estado. Se aplica al grupo entero en vez de endpoint
    /// por endpoint: olvidarlo en uno solo bastaria para abrir el agujero.
    /// </summary>
    public static async ValueTask<object?> ValidateAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;

        if (HttpMethods.IsGet(http.Request.Method)
            || HttpMethods.IsHead(http.Request.Method)
            || HttpMethods.IsOptions(http.Request.Method))
        {
            return await next(context);
        }

        var antiforgery = http.RequestServices.GetRequiredService<IAntiforgery>();
        try
        {
            await antiforgery.ValidateRequestAsync(http);
        }
        catch (AntiforgeryValidationException)
        {
            return Results.Problem(
                title: "Invalid antiforgery token.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        return await next(context);
    }
}
