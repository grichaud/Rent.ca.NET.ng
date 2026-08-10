using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;

namespace Rent.Api.Infrastructure.Identity;

/// <summary>
/// Opciones de la propia aplicacion.
///
/// <see cref="ClientBaseUrl"/> es la URL del cliente Angular, NO la de esta API: se usa para
/// los unicos dos casos donde el backend manda a un humano a una pagina (el retorno de Google
/// y el enlace de restablecer contrasena). Confundirla con la URL de la API deja al usuario
/// aterrizando en un JSON.
/// </summary>
public sealed class AppOptions
{
    public const string SectionName = "App";

    public string ClientBaseUrl { get; set; } = "http://localhost:4200";
}

public static class AuthSetup
{
    /// <summary>
    /// Autenticacion por cookie adaptada a una SPA, con la diferencia clave respecto al
    /// proyecto origen: bajo <c>/api</c> los eventos de la cookie devuelven 401/403 en vez de
    /// redirigir a <c>/login</c>. Redirigir devolveria un 200 con HTML donde Angular espera
    /// JSON, y el cliente interpretaria un fallo de permisos como una respuesta valida.
    /// </summary>
    public static IServiceCollection AddSpaAuthentication(
        this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AppOptions>(configuration.GetSection(AppOptions.SectionName));

        var clientBaseUrl = (configuration[$"{AppOptions.SectionName}:ClientBaseUrl"]
            ?? "http://localhost:4200").TrimEnd('/');

        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
            options.ExpireTimeSpan = TimeSpan.FromDays(14);
            options.SlidingExpiration = true;

            options.Events.OnRedirectToLogin = context =>
                StatusOrRedirect(context, StatusCodes.Status401Unauthorized, clientBaseUrl);
            options.Events.OnRedirectToAccessDenied = context =>
                StatusOrRedirect(context, StatusCodes.Status403Forbidden, clientBaseUrl);
        });

        // La cookie Identity.External caduca a los 5 minutos por defecto, muy poco para alguien
        // leyendo el selector de rol de /external-login-confirm. Mismo ajuste que el origen.
        services.ConfigureExternalCookie(options =>
        {
            options.ExpireTimeSpan = TimeSpan.FromMinutes(30);
        });

        var googleClientId = configuration["Authentication:Google:ClientId"];
        var googleClientSecret = configuration["Authentication:Google:ClientSecret"];

        if (!string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret))
        {
            services.AddAuthentication()
                .AddGoogle(options =>
                {
                    options.ClientId = googleClientId;
                    options.ClientSecret = googleClientSecret;

                    // Sin esto, CUALQUIER fallo del proveedor sale como 500 con la pantalla de
                    // error de ASP.NET: el handler remoto relanza la excepcion por defecto. Le
                    // pasa a quien cancela en la pantalla de Google, a quien tarda tanto que su
                    // cookie de correlacion caduca y a quien vuelve con un enlace ya usado —
                    // casos normales, no averias. El callback propio ya sabe degradar con
                    // `?authError=`; esto lleva alli tambien los fallos que ocurren ANTES.
                    options.Events.OnRemoteFailure = context =>
                    {
                        var logger = context.HttpContext.RequestServices
                            .GetRequiredService<ILoggerFactory>()
                            .CreateLogger("Auth.ExternalRemoteFailure");
                        logger.LogWarning(
                            context.Failure,
                            "El login externo fallo antes de llegar al callback propio.");

                        context.Response.Redirect($"{clientBaseUrl}/en/login?authError=google-failed");
                        context.HandleResponse();
                        return Task.CompletedTask;
                    };
                });
        }

        // Angular manda el token en X-XSRF-TOKEN si se configura withXsrfConfiguration; el
        // nombre tiene que coincidir aqui o la validacion rechaza todos los POST.
        services.AddAntiforgery(options =>
        {
            options.HeaderName = AntiforgeryTokens.HeaderName;
            options.Cookie.Name = AntiforgeryTokens.SecretCookieName;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        });

        return services;
    }

    /// <summary>
    /// Hace que los dos saltos del login de Google se calculen con el host PUBLICO del sitio y
    /// no con el de esta API.
    ///
    /// El problema que resuelve: el servidor SSR es la unica puerta publica y reenvia con
    /// <c>changeOrigin</c>, asi que esta API se ve a si misma como <c>...-api...</c>. Con eso
    /// construia un <c>redirect_uri</c> apuntando a su propio host, y Google devolvia al usuario
    /// a un DOMINIO DISTINTO del que emitio la cookie de correlacion. El navegador no la manda
    /// —son dominios distintos— y el login moria en 500. Y aunque validara, la cookie de sesion
    /// del callback se guardaria en el host de la API, invisible para el sitio: este flujo no
    /// podia funcionar de ninguna manera.
    ///
    /// Se fuerza el host en las DOS patas y no solo en la primera porque el intercambio del
    /// codigo vuelve a enviar el <c>redirect_uri</c> y Google exige que sea identico al del
    /// primer salto; cambiar solo uno mueve el fallo, no lo arregla.
    ///
    /// El valor sale de configuracion y NO de <c>X-Forwarded-Host</c>: esta API es alcanzable
    /// directamente, asi que fiarse de una cabecera dejaria que un tercero decidiera a donde
    /// vuelve el usuario tras identificarse. Y se limita a las rutas del flujo externo, para no
    /// cambiar como se ve el host en el resto de la API.
    /// </summary>
    public static IApplicationBuilder UsePublicOriginForExternalAuth(
        this IApplicationBuilder app, IConfiguration configuration)
    {
        if (!configuration.IsGoogleConfigured()) return app;

        var publicBase = configuration[$"{AppOptions.SectionName}:ClientBaseUrl"];
        if (!Uri.TryCreate(publicBase, UriKind.Absolute, out var publicUri)) return app;

        return app.Use((context, next) =>
        {
            var path = context.Request.Path;
            if (path.StartsWithSegments("/signin-google")
                || path.StartsWithSegments("/api/auth/external/challenge"))
            {
                context.Request.Scheme = publicUri.Scheme;
                context.Request.Host = new HostString(publicUri.Authority);
            }

            return next();
        });
    }

    public static bool IsGoogleConfigured(this IConfiguration configuration)
        => !string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientId"])
           && !string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientSecret"]);

    private static Task StatusOrRedirect(
        RedirectContext<CookieAuthenticationOptions> context, int statusCode, string clientBaseUrl)
    {
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            context.Response.StatusCode = statusCode;
            return Task.CompletedTask;
        }

        // Fuera de /api solo quedan los saltos del flujo externo, que si los recorre un humano
        // con el navegador: ahi si tiene sentido mandarlo a la pantalla de login del cliente.
        context.Response.Redirect($"{clientBaseUrl}/en/login");
        return Task.CompletedTask;
    }
}
