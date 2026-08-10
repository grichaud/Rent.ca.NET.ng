using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Rent.Api.Features.Config;

namespace Rent.Api.Tests;

/// <summary>
/// La configuracion que el navegador necesita.
///
/// Lo que se fija aqui es el CONTRATO de ausencia: sin clave configurada el endpoint devuelve
/// nulo en vez de una cadena vacia, porque el cliente distingue "no hay mapa" de "hay mapa con
/// clave rota". Si esto se rompiera, el navegador cargaria el script de Google con una clave
/// vacia y el error lo daria Google, no nosotros.
/// </summary>
public class ConfigEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public ConfigEndpointsTests(AuthApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Sin_clave_configurada_devuelve_nulo()
    {
        var response = await _factory.CreateClient().GetAsync("/api/config");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var config = await response.ReadAsync<PublicConfigDto>();
        Assert.Null(config!.MapsApiKey);
    }

    [Fact]
    public async Task Con_clave_configurada_la_devuelve()
    {
        using var withKey = _factory.WithWebHostBuilder(builder =>
            builder.ConfigureAppConfiguration((_, config) =>
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Maps:GoogleApiKey"] = "clave-de-prueba",
                })));

        var config = await (await withKey.CreateClient().GetAsync("/api/config"))
            .ReadAsync<PublicConfigDto>();

        Assert.Equal("clave-de-prueba", config!.MapsApiKey);
    }

    [Fact]
    public async Task Es_publico_y_cacheable()
    {
        // Cambia con un reinicio, no con cada peticion: sin cache seria una llamada extra por
        // cada visitante que abra el mapa, y en el plan F1 eso se paga en cuota.
        var response = await _factory.CreateClient().GetAsync("/api/config");

        Assert.True(response.Headers.CacheControl!.Public);
        Assert.Equal(TimeSpan.FromSeconds(3600), response.Headers.CacheControl.MaxAge);
    }
}
