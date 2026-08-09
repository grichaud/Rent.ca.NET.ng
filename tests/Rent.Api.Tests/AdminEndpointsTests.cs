using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rent.Api.Tests;

/// <summary>
/// Panel de administracion (Fase 10). Lo que importa: que solo entra el rol Admin y que lo
/// impone el SERVIDOR (el guard de Angular es experiencia de usuario, no seguridad); que el
/// tier vendido y el efectivo son cosas distintas; que la ultima cuenta de administrador no
/// puede dejarse sin rol; y que las tres pantallas de contenido (promociones, busquedas e IA)
/// respetan las reglas del origen.
/// </summary>
public class AdminEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public AdminEndpointsTests(AuthApiFactory factory) => _factory = factory;

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false
    });

    private async Task<HttpClient> CreateAdminClientAsync()
    {
        await _factory.SeedRolesAsync();
        var email = await _factory.CreateAdminAsync();
        var client = CreateClient();
        await client.LoginAsync(email);
        return client;
    }

    // ---- Quien entra --------------------------------------------------------------

    [Fact]
    public async Task Sin_sesion_el_panel_devuelve_401_y_no_una_redireccion()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/api/admin/dashboard");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Un_renter_identificado_no_entra_al_panel()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Renter");

        var response = await client.GetAsync("/api/admin/dashboard");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Un_landlord_identificado_tampoco_entra_al_panel()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var response = await client.GetAsync("/api/admin/properties");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ---- Dashboard ----------------------------------------------------------------

    [Fact]
    public async Task El_dashboard_cuenta_lo_sembrado()
    {
        var propertyId = await _factory.SeedListingAsync();
        await _factory.SeedSpecialAsync(propertyId);
        await _factory.SeedAiConversationAsync();
        var client = await CreateAdminClientAsync();

        var response = await client.GetAsync("/api/admin/dashboard");
        response.EnsureSuccessStatusCode();
        var dashboard = await response.ReadAsync<DashboardDto>();

        Assert.NotNull(dashboard);
        Assert.True(dashboard!.TotalProperties >= 1);
        Assert.True(dashboard.TotalLandlords >= 1);
        Assert.True(dashboard.ActiveSpecials >= 1);
        Assert.True(dashboard.Conversations >= 1);
    }

    // ---- Usuarios -----------------------------------------------------------------

    [Fact]
    public async Task El_filtro_de_usuarios_devuelve_solo_la_cuenta_buscada()
    {
        await _factory.SeedRolesAsync();
        var renterClient = CreateClient();
        var renterEmail = await renterClient.SignUpAsync("Renter");
        var client = await CreateAdminClientAsync();

        var response = await client.GetAsync($"/api/admin/users?email={Uri.EscapeDataString(renterEmail)}");
        response.EnsureSuccessStatusCode();
        var rows = await response.ReadAsync<List<UserRowDto>>();

        Assert.NotNull(rows);
        var row = Assert.Single(rows!);
        Assert.Equal(renterEmail, row.Email);
        Assert.Contains("Renter", row.Roles);
        Assert.False(row.IsAdmin);
    }

    [Fact]
    public async Task El_rol_de_administrador_se_concede_y_se_revoca()
    {
        await _factory.SeedRolesAsync();
        var renterClient = CreateClient();
        var renterEmail = await renterClient.SignUpAsync("Renter");
        var client = await CreateAdminClientAsync();

        var found = await client.GetAsync($"/api/admin/users?email={Uri.EscapeDataString(renterEmail)}");
        var target = Assert.Single((await found.ReadAsync<List<UserRowDto>>())!);

        var granted = await client.PostAsJsonAsync($"/api/admin/users/{target.Id}/toggle-admin", new { });
        granted.EnsureSuccessStatusCode();
        var grantedBody = await granted.ReadAsync<ToggleAdminDto>();
        Assert.True(grantedBody!.IsAdmin);

        // Con dos administradores vivos, quitarle el rol al segundo si esta permitido.
        var revoked = await client.PostAsJsonAsync($"/api/admin/users/{target.Id}/toggle-admin", new { });
        revoked.EnsureSuccessStatusCode();
        var revokedBody = await revoked.ReadAsync<ToggleAdminDto>();
        Assert.False(revokedBody!.IsAdmin);
    }

    [Fact]
    public async Task El_ultimo_administrador_no_puede_quitarse_el_rol()
    {
        // Factory propia: la compartida acumula administradores de otros tests y entonces
        // nunca queda "el ultimo", que es justo lo que este test comprueba.
        using var factory = new AuthApiFactory();
        await factory.SeedRolesAsync();
        var email = await factory.CreateAdminAsync();
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await client.LoginAsync(email);

        var found = await client.GetAsync($"/api/admin/users?email={Uri.EscapeDataString(email)}");
        var self = Assert.Single((await found.ReadAsync<List<UserRowDto>>())!);

        var response = await client.PostAsJsonAsync($"/api/admin/users/{self.Id}/toggle-admin", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        // Y sigue siendo admin: si el rechazo llegara despues de tocar la base, el panel
        // quedaria inaccesible para todos sin forma de recuperarlo desde la propia app.
        var after = await client.GetAsync("/api/admin/dashboard");
        after.EnsureSuccessStatusCode();
    }

    // ---- Propietarios y propiedades -----------------------------------------------

    [Fact]
    public async Task El_tier_de_un_propietario_se_guarda_con_su_vigencia()
    {
        await _factory.SeedListingAsync();
        var client = await CreateAdminClientAsync();

        var listed = await client.GetAsync("/api/admin/landlords");
        listed.EnsureSuccessStatusCode();
        var page = await listed.ReadAsync<PageDto<LandlordRowDto>>();
        var landlord = page!.Rows.First();

        var expires = DateTimeOffset.UtcNow.AddDays(15);
        var set = await client.PostAsJsonAsync($"/api/admin/landlords/{landlord.Id}/tier", new
        {
            tier = "Featured",
            expiresAt = expires
        });
        set.EnsureSuccessStatusCode();

        var again = await client.GetAsync($"/api/admin/landlords?email={Uri.EscapeDataString(landlord.Email)}");
        var updated = (await again.ReadAsync<PageDto<LandlordRowDto>>())!.Rows.First();

        Assert.Equal("Featured", updated.Tier);
        Assert.Equal("Featured", updated.EffectiveTier);
        Assert.NotNull(updated.TierExpiresAt);
    }

    [Fact]
    public async Task Volver_a_Limited_borra_la_vigencia()
    {
        await _factory.SeedListingAsync();
        var client = await CreateAdminClientAsync();

        var listed = await client.GetAsync("/api/admin/landlords");
        var landlord = (await listed.ReadAsync<PageDto<LandlordRowDto>>())!.Rows.First();

        await client.PostAsJsonAsync($"/api/admin/landlords/{landlord.Id}/tier", new
        {
            tier = "Promoted",
            expiresAt = DateTimeOffset.UtcNow.AddDays(15)
        });

        // Limited no caduca: guardar una fecha ahi dejaria una vigencia sin efecto que
        // reaparece en la tabla como "expirada".
        var back = await client.PostAsJsonAsync($"/api/admin/landlords/{landlord.Id}/tier", new
        {
            tier = "Limited",
            expiresAt = DateTimeOffset.UtcNow.AddDays(15)
        });
        back.EnsureSuccessStatusCode();

        var again = await client.GetAsync($"/api/admin/landlords?email={Uri.EscapeDataString(landlord.Email)}");
        var updated = (await again.ReadAsync<PageDto<LandlordRowDto>>())!.Rows.First();

        Assert.Equal("Limited", updated.Tier);
        Assert.Null(updated.TierExpiresAt);
    }

    [Fact]
    public async Task Una_vigencia_en_el_pasado_se_rechaza()
    {
        await _factory.SeedListingAsync();
        var client = await CreateAdminClientAsync();

        var listed = await client.GetAsync("/api/admin/landlords");
        var landlord = (await listed.ReadAsync<PageDto<LandlordRowDto>>())!.Rows.First();

        var response = await client.PostAsJsonAsync($"/api/admin/landlords/{landlord.Id}/tier", new
        {
            tier = "Featured",
            expiresAt = DateTimeOffset.UtcNow.AddDays(-1)
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task El_tier_de_una_propiedad_no_arrastra_al_del_propietario()
    {
        var propertyId = await _factory.SeedListingAsync();
        var client = await CreateAdminClientAsync();

        var set = await client.PostAsJsonAsync($"/api/admin/properties/{propertyId}/tier", new
        {
            tier = "Promoted",
            expiresAt = DateTimeOffset.UtcNow.AddDays(15)
        });
        set.EnsureSuccessStatusCode();

        var properties = await client.GetAsync("/api/admin/properties");
        var row = (await properties.ReadAsync<PageDto<PropertyRowDto>>())!
            .Rows.First(p => p.Id == propertyId);
        Assert.Equal("Promoted", row.Tier);

        // Son dos ventas distintas: el propietario del listing sigue en Limited.
        var landlords = await client.GetAsync($"/api/admin/landlords?email={Uri.EscapeDataString(row.LandlordEmail)}");
        var landlord = (await landlords.ReadAsync<PageDto<LandlordRowDto>>())!.Rows.First();
        Assert.Equal("Limited", landlord.Tier);
    }

    [Fact]
    public async Task El_filtro_de_ciudad_de_propiedades_descarta_las_demas()
    {
        await _factory.SeedListingAsync();
        await _factory.SeedListingAsync("Ottawa", "ottawa");
        var client = await CreateAdminClientAsync();

        var response = await client.GetAsync("/api/admin/properties?city=Ottawa");
        response.EnsureSuccessStatusCode();
        var page = await response.ReadAsync<PageDto<PropertyRowDto>>();

        Assert.NotNull(page);
        Assert.NotEmpty(page!.Rows);
        Assert.All(page.Rows, row => Assert.Equal("Ottawa", row.CityName));
    }

    // ---- Promociones ---------------------------------------------------------------

    [Fact]
    public async Task Una_promocion_se_crea_se_edita_y_se_desactiva()
    {
        var propertyId = await _factory.SeedListingAsync();
        var client = await CreateAdminClientAsync();

        var created = await client.PostAsJsonAsync("/api/admin/specials", new
        {
            propertyId,
            title = "First month free!",
            description = "Sign a 12-month lease.",
            startDate = (DateTimeOffset?)null,
            endDate = (DateTimeOffset?)null,
            isActive = true
        });
        created.EnsureSuccessStatusCode();
        var createdBody = await created.ReadAsync<CreatedSpecialDto>();
        Assert.NotEqual(Guid.Empty, createdBody!.Id);

        var updated = await client.PutAsJsonAsync($"/api/admin/specials/{createdBody.Id}", new
        {
            title = "Two months free!",
            description = (string?)null,
            startDate = (DateTimeOffset?)null,
            endDate = (DateTimeOffset?)null,
            isActive = true
        });
        updated.EnsureSuccessStatusCode();

        var deleted = await client.DeleteAsync($"/api/admin/specials/{createdBody.Id}");
        deleted.EnsureSuccessStatusCode();

        var listed = await client.GetAsync("/api/admin/specials");
        var row = (await listed.ReadAsync<SpecialsDto>())!.Rows.First(s => s.Id == createdBody.Id);

        // El borrado por defecto es blando: la promocion sigue ahi, desactivada.
        Assert.Equal("Two months free!", row.Title);
        Assert.False(row.IsActive);
        Assert.Equal(propertyId, row.PropertyId);
    }

    [Fact]
    public async Task El_borrado_duro_de_una_promocion_la_quita_de_la_lista()
    {
        var propertyId = await _factory.SeedListingAsync();
        var specialId = await _factory.SeedSpecialAsync(propertyId, "Temporary");
        var client = await CreateAdminClientAsync();

        var deleted = await client.DeleteAsync($"/api/admin/specials/{specialId}?hard=true");
        deleted.EnsureSuccessStatusCode();

        var listed = await client.GetAsync("/api/admin/specials");
        var rows = (await listed.ReadAsync<SpecialsDto>())!.Rows;

        Assert.DoesNotContain(rows, s => s.Id == specialId);
    }

    [Fact]
    public async Task Una_promocion_que_termina_antes_de_empezar_se_rechaza()
    {
        var propertyId = await _factory.SeedListingAsync();
        var client = await CreateAdminClientAsync();

        var response = await client.PostAsJsonAsync("/api/admin/specials", new
        {
            propertyId,
            title = "Backwards",
            description = (string?)null,
            startDate = DateTimeOffset.UtcNow.AddDays(10),
            endDate = DateTimeOffset.UtcNow.AddDays(1),
            isActive = true
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Desmarcar_activa_desactiva_la_promocion_de_verdad()
    {
        var propertyId = await _factory.SeedListingAsync();
        var specialId = await _factory.SeedSpecialAsync(propertyId, "Toggle me");
        var client = await CreateAdminClientAsync();

        // Diferencia intencionada con el origen: alli el checkbox desmarcado no viajaba en el
        // POST y el parser caia a true, asi que esto no funcionaba. En JSON el booleano viaja.
        var updated = await client.PutAsJsonAsync($"/api/admin/specials/{specialId}", new
        {
            title = "Toggle me",
            description = (string?)null,
            startDate = (DateTimeOffset?)null,
            endDate = (DateTimeOffset?)null,
            isActive = false
        });
        updated.EnsureSuccessStatusCode();

        var listed = await client.GetAsync("/api/admin/specials");
        var row = (await listed.ReadAsync<SpecialsDto>())!.Rows.First(s => s.Id == specialId);

        Assert.False(row.IsActive);
    }

    // ---- Busquedas populares --------------------------------------------------------

    [Fact]
    public async Task Editar_una_busqueda_la_re_normaliza()
    {
        var id = await _factory.SeedSearchAsync($"lofts {Guid.NewGuid():N}", "toronto", 12);
        var client = await CreateAdminClientAsync();

        var query = $"Downtown Lofts {Guid.NewGuid():N}";
        var updated = await client.PutAsJsonAsync($"/api/admin/searches/{id}", new
        {
            normalizedQuery = $"  {query}  ",
            citySlug = "  TORONTO  "
        });
        updated.EnsureSuccessStatusCode();

        var listed = await client.GetAsync($"/api/admin/searches?q={Uri.EscapeDataString(query.ToLowerInvariant())}");
        var row = (await listed.ReadAsync<List<SearchRowDto>>())!.First(s => s.Id == id);

        // Se guarda como lo escribe el tracker (minusculas, sin espacios): si no, la fila
        // editada dejaria de casar con su upsert y se duplicaria en la siguiente busqueda.
        Assert.Equal(query.ToLowerInvariant(), row.NormalizedQuery);
        Assert.Equal("toronto", row.CitySlug);
        Assert.Equal(12, row.SearchCount);
    }

    [Fact]
    public async Task Editar_una_busqueda_hacia_otra_que_ya_existe_da_409()
    {
        var suffix = Guid.NewGuid().ToString("N");
        await _factory.SeedSearchAsync($"studios {suffix}", "ottawa", 5);
        var second = await _factory.SeedSearchAsync($"lofts {suffix}", "ottawa", 3);
        var client = await CreateAdminClientAsync();

        var response = await client.PutAsJsonAsync($"/api/admin/searches/{second}", new
        {
            normalizedQuery = $"studios {suffix}",
            citySlug = "ottawa"
        });

        // Fusionar dos filas de telemetria no es algo que el panel deba decidir por su cuenta.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Borrar_una_busqueda_la_quita_de_la_lista()
    {
        var id = await _factory.SeedSearchAsync($"gone {Guid.NewGuid():N}", "calgary", 99);
        var client = await CreateAdminClientAsync();

        var deleted = await client.DeleteAsync($"/api/admin/searches/{id}");
        deleted.EnsureSuccessStatusCode();

        var listed = await client.GetAsync("/api/admin/searches");
        var rows = (await listed.ReadAsync<List<SearchRowDto>>())!;

        Assert.DoesNotContain(rows, s => s.Id == id);
    }

    // ---- Uso de la IA ----------------------------------------------------------------

    [Fact]
    public async Task Las_metricas_de_ia_traen_siempre_siete_cubos_diarios()
    {
        await _factory.SeedAiConversationAsync();
        var client = await CreateAdminClientAsync();

        var response = await client.GetAsync("/api/admin/ai");
        response.EnsureSuccessStatusCode();
        var ai = await response.ReadAsync<AiDto>();

        Assert.NotNull(ai);
        // Un dia sin actividad tiene que salir como barra a cero, no desaparecer del grafico.
        Assert.Equal(7, ai!.Last7Days.Count);
        Assert.True(ai.TotalConversations >= 1);
        Assert.True(ai.EstimatedTokens > 0);
        Assert.Contains(ai.ToolBreakdown, t => t.Name == "search_listings");
        Assert.Contains(ai.Recent, c => c.MessageCount == 3);
    }

    [Fact]
    public async Task Una_conversacion_se_lee_de_la_mas_antigua_a_la_mas_nueva()
    {
        var conversationId = await _factory.SeedAiConversationAsync();
        var client = await CreateAdminClientAsync();

        var response = await client.GetAsync($"/api/admin/ai/{conversationId}");
        response.EnsureSuccessStatusCode();
        var conversation = await response.ReadAsync<AiConversationDto>();

        Assert.NotNull(conversation);
        Assert.Equal(3, conversation!.Messages.Count);
        Assert.Equal("User", conversation.Messages[0].Role);
        Assert.Equal("Tool", conversation.Messages[1].Role);
        Assert.Equal("Assistant", conversation.Messages[2].Role);
        Assert.Equal("search_listings", conversation.Messages[1].ToolName);
    }

    [Fact]
    public async Task Una_conversacion_inexistente_da_404()
    {
        var client = await CreateAdminClientAsync();

        var response = await client.GetAsync($"/api/admin/ai/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- Contratos de lectura --------------------------------------------------------

    private sealed record DashboardDto(
        int TotalProperties,
        int FeaturedProperties,
        int PromotedProperties,
        int TotalLandlords,
        int ActiveSpecials,
        int Conversations);

    private sealed record UserRowDto(
        Guid Id, string Email, string? FullName, List<string> Roles, bool IsAdmin);

    private sealed record ToggleAdminDto(bool IsAdmin, string Message);

    private sealed record PageDto<T>(List<T> Rows, int TotalRows, int PageIndex, int PageSize, int TotalPages);

    private sealed record LandlordRowDto(
        Guid Id, string Email, string? CompanyName, string Tier, string EffectiveTier,
        DateTimeOffset? TierExpiresAt, bool IsVerified, int ListingsCount);

    private sealed record PropertyRowDto(
        Guid Id, string Title, string CityName, string LandlordEmail, string Status,
        string Tier, string EffectiveTier, DateTimeOffset? TierExpiresAt);

    private sealed record CreatedSpecialDto(Guid Id, string Message);

    private sealed record SpecialRowDto(
        Guid Id, Guid PropertyId, string PropertyTitle, string PropertyCity, string Title,
        string? Description, bool IsActive);

    private sealed record SpecialsDto(List<SpecialRowDto> Rows, int TotalRows, List<PropertyOptionDto> PropertyOptions);

    private sealed record PropertyOptionDto(Guid Id, string Title, string City);

    private sealed record SearchRowDto(
        Guid Id, string NormalizedQuery, string CitySlug, int SearchCount, DateTimeOffset LastSearchedAt);

    private sealed record ToolUsageDto(string Name, int Count);

    private sealed record DailyBucketDto(DateOnly Date, int Count);

    private sealed record RecentConversationDto(Guid Id, string? Title, string? UserEmail, int MessageCount);

    private sealed record AiDto(
        int TotalConversations,
        int TotalMessages,
        long EstimatedTokens,
        decimal EstimatedCostUsd,
        List<ToolUsageDto> ToolBreakdown,
        List<DailyBucketDto> Last7Days,
        List<RecentConversationDto> Recent);

    private sealed record AiMessageDto(Guid Id, string Role, string Content, string? ToolName);

    private sealed record AiConversationDto(
        Guid Id, string? Title, string? UserEmail, DateTimeOffset CreatedAt, List<AiMessageDto> Messages);
}
