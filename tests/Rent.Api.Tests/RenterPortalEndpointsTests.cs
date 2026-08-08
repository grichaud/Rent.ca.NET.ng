using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rent.Api.Tests;

/// <summary>
/// Portal del renter (Fase 8): dashboard, cuenta y consultas enviadas. Lo que importa es quien
/// entra (solo Renter, y sin redirecciones bajo /api), que los contadores y las listas son del
/// usuario de la sesion y de nadie mas, y que el cambio de contrasena distingue el unico error
/// accionable (la actual incorrecta) sin cerrar la sesion de quien lo hace bien.
/// </summary>
public class RenterPortalEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public RenterPortalEndpointsTests(AuthApiFactory factory) => _factory = factory;

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false
    });

    [Fact]
    public async Task Sin_sesion_el_portal_devuelve_401_y_no_una_redireccion()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/api/renter/dashboard");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Un_landlord_no_entra_al_portal_del_renter()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var response = await client.GetAsync("/api/renter/dashboard");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task El_dashboard_cuenta_favoritos_alertas_activas_y_consultas_propias()
    {
        await _factory.SeedRolesAsync();
        var propertyId = await _factory.SeedListingAsync();
        var client = CreateClient();
        await client.SignUpAsync("Renter");

        var favorite = await client.PostAsJsonAsync($"/api/favorites/{propertyId}/toggle", new { });
        favorite.EnsureSuccessStatusCode();

        var alert = await client.PostAsJsonAsync("/api/alerts", new
        {
            name = (string?)null,
            city = "Toronto",
            propertyType = (string?)null,
            priceMin = (decimal?)null,
            priceMax = (decimal?)null,
            bedroomsMin = (int?)null,
            bathroomsMin = (decimal?)null,
            petsAllowed = (bool?)null,
            frequency = "Daily",
            culture = "en"
        });
        alert.EnsureSuccessStatusCode();

        var inquiry = await client.PostAsJsonAsync("/api/inquiries", new
        {
            propertyId,
            senderName = "Test Renter",
            senderEmail = "renter@example.com",
            senderPhone = (string?)null,
            message = "Sigue disponible este piso?",
            moveInDate = (string?)null,
            culture = "en"
        });
        inquiry.EnsureSuccessStatusCode();

        var dashboard = await client.GetFromJsonAsync<DashboardResponse>(
            "/api/renter/dashboard", JsonOptions);

        Assert.Equal("Test", dashboard!.FirstName);
        Assert.Equal(1, dashboard.SavedProperties);
        Assert.Equal(1, dashboard.ActiveAlerts);
        Assert.Equal(1, dashboard.InquiriesSent);
    }

    [Fact]
    public async Task El_perfil_se_actualiza_y_la_lectura_lo_refleja()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Renter");

        var update = await client.PutAsJsonAsync("/api/renter/profile", new
        {
            fullName = "Nombre Nuevo",
            phone = "416-555-0100"
        });

        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        var profile = await client.GetFromJsonAsync<ProfileResponse>(
            "/api/renter/profile", JsonOptions);

        Assert.Equal("Nombre Nuevo", profile!.FullName);
        Assert.Equal("416-555-0100", profile.Phone);
        Assert.True(profile.HasPassword);
    }

    [Fact]
    public async Task El_perfil_sin_nombre_se_rechaza_por_campo()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Renter");

        var update = await client.PutAsJsonAsync("/api/renter/profile", new
        {
            fullName = "",
            phone = (string?)null
        });

        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);
        var problem = await update.ReadAsync<ValidationProblemResponse>();
        Assert.True(problem!.Errors.ContainsKey("fullName"));
    }

    [Fact]
    public async Task La_contrasena_actual_incorrecta_devuelve_la_clave_accionable()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Renter");

        var change = await client.PostAsJsonAsync("/api/renter/password", new
        {
            currentPassword = "Equivocada123",
            newPassword = "NuevaClave123",
            confirmPassword = "NuevaClave123"
        });

        Assert.Equal(HttpStatusCode.BadRequest, change.StatusCode);
        var problem = await change.ReadAsync<ValidationProblemResponse>();
        Assert.Equal("renter.accountIncorrectCurrent", problem!.Errors["currentPassword"].Single());
    }

    [Fact]
    public async Task El_cambio_de_contrasena_mantiene_la_sesion_y_la_nueva_sirve_para_entrar()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        var email = await client.SignUpAsync("Renter");

        var change = await client.PostAsJsonAsync("/api/renter/password", new
        {
            currentPassword = "Password123",
            newPassword = "NuevaClave123",
            confirmPassword = "NuevaClave123"
        });

        Assert.Equal(HttpStatusCode.OK, change.StatusCode);

        // La sesion sigue viva: cambiar la contrasena rota el security stamp y sin el
        // RefreshSignIn del endpoint esta peticion moriria con 401.
        var dashboard = await client.GetAsync("/api/renter/dashboard");
        Assert.Equal(HttpStatusCode.OK, dashboard.StatusCode);

        // Y la contrasena nueva abre sesion en un cliente limpio.
        var fresh = CreateClient();
        await fresh.ArmAntiforgeryAsync();
        var login = await fresh.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "NuevaClave123",
            rememberMe = false
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Las_consultas_del_portal_son_solo_las_del_usuario_de_la_sesion()
    {
        await _factory.SeedRolesAsync();
        var propertyId = await _factory.SeedListingAsync();

        var other = CreateClient();
        await other.SignUpAsync("Renter");
        var otherInquiry = await other.PostAsJsonAsync("/api/inquiries", new
        {
            propertyId,
            senderName = "Otro Renter",
            senderEmail = "otro@example.com",
            senderPhone = (string?)null,
            message = "Consulta de otra persona.",
            moveInDate = (string?)null,
            culture = "en"
        });
        otherInquiry.EnsureSuccessStatusCode();

        var client = CreateClient();
        await client.SignUpAsync("Renter");
        var ownInquiry = await client.PostAsJsonAsync("/api/inquiries", new
        {
            propertyId,
            senderName = "Renter Propio",
            senderEmail = "propio@example.com",
            senderPhone = (string?)null,
            message = "Mi propia consulta de prueba.",
            moveInDate = (string?)null,
            culture = "en"
        });
        ownInquiry.EnsureSuccessStatusCode();

        var inquiries = await client.GetFromJsonAsync<List<InquiryRow>>(
            "/api/renter/inquiries", JsonOptions);

        var row = Assert.Single(inquiries!);
        Assert.Equal("Mi propia consulta de prueba.", row.Message);
        Assert.Equal("Seeded Loft", row.PropertyTitle);
        Assert.Equal("toronto", row.CitySlug);
        Assert.False(row.IsRead);
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private sealed record DashboardResponse(
        string? FirstName, int SavedProperties, int ActiveAlerts, int InquiriesSent);

    private sealed record ProfileResponse(
        string Email, string FullName, string? Phone, bool HasPassword);

    private sealed record InquiryRow(
        Guid Id, string PropertyTitle, string PropertySlug, string PropertyCity,
        string CitySlug, string Message, string? MoveInDate, bool IsRead, DateTimeOffset CreatedAt);

    private sealed record ValidationProblemResponse(Dictionary<string, string[]> Errors);
}
