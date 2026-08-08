using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rent.Api.Tests;

/// <summary>
/// Consultas, favoritos y alertas: los tres caminos de la Fase 7. Interesa sobre todo quien
/// PUEDE hacer cada cosa — la consulta es anonima a proposito, los favoritos y las alertas son
/// solo de Renter — y que los datos de una persona no se vean desde la cuenta de otra.
/// </summary>
public class FeatureEndpointsTests : IClassFixture<AuthApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly AuthApiFactory _factory;

    public FeatureEndpointsTests(AuthApiFactory factory) => _factory = factory;

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false
    });

    // ---- Consultas -------------------------------------------------------------------

    [Fact]
    public async Task Una_consulta_anonima_se_acepta()
    {
        var propertyId = await _factory.SeedListingAsync();
        var client = CreateClient();
        await client.ArmAntiforgeryAsync();

        var response = await client.PostAsJsonAsync("/api/inquiries", new
        {
            propertyId,
            senderName = "Curioso Anonimo",
            senderEmail = "curioso@example.com",
            senderPhone = (string?)null,
            message = "Me interesa este piso, sigue disponible?",
            moveInDate = (string?)null,
            culture = "en"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Una_consulta_con_mensaje_demasiado_corto_se_rechaza_por_campo()
    {
        var propertyId = await _factory.SeedListingAsync();
        var client = CreateClient();
        await client.ArmAntiforgeryAsync();

        var response = await client.PostAsJsonAsync("/api/inquiries", new
        {
            propertyId,
            senderName = "Curioso",
            senderEmail = "curioso@example.com",
            senderPhone = (string?)null,
            message = "hola",
            moveInDate = (string?)null,
            culture = "en"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadAsync<ValidationProblemResponse>();
        Assert.True(problem!.Errors.ContainsKey("message"));
    }

    [Fact]
    public async Task Una_consulta_sobre_un_listing_inexistente_devuelve_404()
    {
        var client = CreateClient();
        await client.ArmAntiforgeryAsync();

        var response = await client.PostAsJsonAsync("/api/inquiries", new
        {
            propertyId = Guid.NewGuid(),
            senderName = "Curioso",
            senderEmail = "curioso@example.com",
            senderPhone = (string?)null,
            message = "Sigue disponible este piso?",
            moveInDate = (string?)null,
            culture = "en"
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- Favoritos -------------------------------------------------------------------

    [Fact]
    public async Task Sin_sesion_los_favoritos_devuelven_401_y_no_una_redireccion()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/api/favorites");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task Un_landlord_no_puede_guardar_favoritos()
    {
        await _factory.SeedRolesAsync();
        var propertyId = await _factory.SeedListingAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var response = await client.PostAsync($"/api/favorites/{propertyId}/toggle", content: null);

        // 403 y no 401: la sesion es valida, lo que falta es el rol.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Un_renter_alterna_el_favorito_y_persiste()
    {
        await _factory.SeedRolesAsync();
        var propertyId = await _factory.SeedListingAsync();
        var client = CreateClient();
        await client.SignUpAsync("Renter");

        var added = await client.PostAsync($"/api/favorites/{propertyId}/toggle", content: null);
        Assert.Equal(HttpStatusCode.OK, added.StatusCode);
        Assert.True((await added.ReadAsync<ToggleResponse>())!.Favorited);

        // La persistencia se comprueba en una peticion NUEVA: es lo que ve el usuario al
        // recargar, y lo unico que demuestra que se guardo de verdad.
        var list = await client.GetFromJsonAsync<List<PropertyCardResponse>>("/api/favorites", Json);
        Assert.Contains(list!, c => c.Id == propertyId && c.IsFavorited);

        var removed = await client.PostAsync($"/api/favorites/{propertyId}/toggle", content: null);
        Assert.False((await removed.ReadAsync<ToggleResponse>())!.Favorited);

        var empty = await client.GetFromJsonAsync<List<PropertyCardResponse>>("/api/favorites", Json);
        Assert.DoesNotContain(empty!, c => c.Id == propertyId);
    }

    // ---- Alertas ---------------------------------------------------------------------

    [Fact]
    public async Task Un_renter_crea_pausa_y_borra_una_alerta()
    {
        await _factory.SeedRolesAsync();
        await _factory.SeedListingAsync();
        var client = CreateClient();
        await client.SignUpAsync("Renter");

        var created = await client.PostAsJsonAsync("/api/alerts", new
        {
            name = "Centro barato",
            city = "Toronto",
            propertyType = (string?)null,
            priceMin = (decimal?)null,
            priceMax = 2500m,
            bedroomsMin = 1,
            bathroomsMin = (decimal?)null,
            petsAllowed = (bool?)null,
            frequency = "Daily",
            culture = "fr"
        });

        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var alert = await created.ReadAsync<AlertResponse>();
        Assert.True(alert!.IsActive);
        Assert.Equal("Daily", alert.Frequency);

        var paused = await client.PostAsync($"/api/alerts/{alert.Id}/toggle", content: null);
        Assert.False((await paused.ReadAsync<AlertResponse>())!.IsActive);

        var deleted = await client.DeleteAsync($"/api/alerts/{alert.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        var remaining = await client.GetFromJsonAsync<List<AlertResponse>>("/api/alerts", Json);
        Assert.DoesNotContain(remaining!, a => a.Id == alert.Id);
    }

    [Fact]
    public async Task Una_alerta_sin_ciudad_se_rechaza()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Renter");

        var response = await client.PostAsJsonAsync("/api/alerts", new
        {
            name = "Sin ciudad",
            city = "",
            frequency = "Daily",
            culture = "en"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadAsync<ValidationProblemResponse>();
        Assert.True(problem!.Errors.ContainsKey("city"));
    }

    [Fact]
    public async Task La_alerta_de_otra_persona_no_se_puede_borrar()
    {
        await _factory.SeedRolesAsync();

        var owner = CreateClient();
        await owner.SignUpAsync("Renter");
        var created = await owner.PostAsJsonAsync("/api/alerts", new
        {
            city = "Toronto",
            frequency = "Daily",
            culture = "en"
        });
        var alert = await created.ReadAsync<AlertResponse>();

        var intruder = CreateClient();
        await intruder.SignUpAsync("Renter");

        var response = await intruder.DeleteAsync($"/api/alerts/{alert!.Id}");

        // 404 y no 403: responder "prohibido" confirmaria que esa alerta existe.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- Disparo del motor -----------------------------------------------------------

    [Fact]
    public async Task El_disparo_del_motor_sin_token_configurado_no_existe()
    {
        var client = CreateClient();

        var response = await client.PostAsync("/api/alerts/dispatch", content: null);

        // Falla cerrado: sin Alerts:DispatchToken la ruta niega existir en vez de ejecutarse
        // sin autenticar.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private sealed record ToggleResponse(bool Favorited);

    private sealed record PropertyCardResponse(Guid Id, string Title, bool IsFavorited);

    private sealed record AlertResponse(Guid Id, string? Name, string? City, string Frequency, bool IsActive);

    private sealed record ValidationProblemResponse(Dictionary<string, string[]> Errors);
}
