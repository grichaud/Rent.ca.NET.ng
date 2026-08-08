using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Tests;

/// <summary>
/// El comportamiento que separa esta API del proyecto origen: bajo <c>/api</c> la cookie
/// contesta con un codigo de estado, nunca con una redireccion al login. Una redireccion
/// devolveria 200 con HTML y el cliente lo interpretaria como respuesta valida.
/// </summary>
public class CookieEventsTests
{
    private const string ClientBaseUrl = "https://cliente.example.com";

    [Theory]
    [InlineData("/api/auth/me")]
    [InlineData("/api/favorites")]
    public async Task Bajo_api_la_falta_de_sesion_devuelve_401(string path)
    {
        var options = BuildCookieOptions();
        var context = ContextFor(path);

        await options.Events.OnRedirectToLogin(RedirectContext(context, options));

        Assert.Equal(StatusCodes.Status401Unauthorized, context.Response.StatusCode);
        Assert.False(context.Response.Headers.ContainsKey("Location"));
    }

    [Theory]
    [InlineData("/api/admin/users")]
    public async Task Bajo_api_la_falta_de_permisos_devuelve_403(string path)
    {
        var options = BuildCookieOptions();
        var context = ContextFor(path);

        await options.Events.OnRedirectToAccessDenied(RedirectContext(context, options));

        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
    }

    [Fact]
    public async Task Fuera_de_api_se_redirige_al_login_del_cliente()
    {
        var options = BuildCookieOptions();
        var context = ContextFor("/algo-que-no-es-api");

        await options.Events.OnRedirectToLogin(RedirectContext(context, options));

        Assert.Equal(StatusCodes.Status302Found, context.Response.StatusCode);
        Assert.StartsWith(ClientBaseUrl, context.Response.Headers.Location.ToString());
    }

    private static CookieAuthenticationOptions BuildCookieOptions()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["App:ClientBaseUrl"] = ClientBaseUrl
            })
            .Build();

        var services = new ServiceCollection();
        services.AddOptions();
        services.AddSpaAuthentication(configuration);

        return services.BuildServiceProvider()
            .GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(IdentityConstants.ApplicationScheme);
    }

    private static DefaultHttpContext ContextFor(string path)
        => new() { Request = { Path = path } };

    private static RedirectContext<CookieAuthenticationOptions> RedirectContext(
        HttpContext context, CookieAuthenticationOptions options)
        => new(
            context,
            new AuthenticationScheme(IdentityConstants.ApplicationScheme, null, typeof(CookieAuthenticationHandler)),
            options,
            new AuthenticationProperties(),
            "/login");
}
