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
