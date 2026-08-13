using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Rent.Api.Features.Maintenance;

namespace Rent.Api.Tests;

/// <summary>
/// La ruta que migra y siembra la base.
///
/// Se prueba solo el control de acceso, no la migracion en si: el camino feliz aplica
/// migraciones de SQL Server y aqui la base es SQLite. Lo que estas pruebas protegen es que la
/// puerta este cerrada — una ruta anonima que toca el ESQUEMA no se puede quedar abierta por un
/// refactor.
/// </summary>
public class MaintenanceEndpointTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public MaintenanceEndpointTests(AuthApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Sin_token_configurado_la_ruta_no_existe()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsync("/api/maintenance/migrate", content: null);

        // Falla cerrado, igual que el disparo de alertas: un despliegue al que se le olvido el
        // secreto queda inerte, no con el esquema al alcance de cualquiera.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Con_token_configurado_pero_sin_cabecera_rechaza()
    {
        var client = CreateClientWithToken("un-secreto-de-prueba");

        var response = await client.PostAsync("/api/maintenance/migrate", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Con_token_equivocado_rechaza()
    {
        var client = CreateClientWithToken("un-secreto-de-prueba");
        client.DefaultRequestHeaders.Add(MigrateEndpoint.TokenHeader, "el-que-no-es");

        var response = await client.PostAsync("/api/maintenance/migrate", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Un_token_que_es_prefijo_del_bueno_no_cuela()
    {
        var client = CreateClientWithToken("un-secreto-de-prueba");
        client.DefaultRequestHeaders.Add(MigrateEndpoint.TokenHeader, "un-secreto");

        // La comparacion es de tiempo constante sobre los bytes completos: un prefijo correcto
        // no vale, aunque una comparacion ingenua "empieza por" lo habria aceptado.
        var response = await client.PostAsync("/api/maintenance/migrate", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private HttpClient CreateClientWithToken(string token) =>
        _factory
            .WithWebHostBuilder(builder => builder.UseSetting("Database:MaintenanceToken", token))
            .CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
}
