using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rent.Api.Tests;

/// <summary>
/// Portal del landlord (Fase 9): dashboard, inbox, cuenta y CRUD de listings con fotos. Lo
/// critico es la propiedad: cada consulta lleva el filtro de dueno dentro del Where, asi que
/// el listing o la consulta de otro landlord devuelven 404 sin revelar que existen. El borrado
/// es soft (Status=Inactive) y el slug no cambia al editar el titulo.
/// </summary>
public class LandlordPortalEndpointsTests : IClassFixture<AuthApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly AuthApiFactory _factory;

    public LandlordPortalEndpointsTests(AuthApiFactory factory) => _factory = factory;

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false
    });

    private static object ListingForm(string title, params object[] units) => new
    {
        title,
        description = "Una descripcion de prueba.",
        propertyType = "Apartment",
        status = "Active",
        streetAddress = "1 Test Street",
        cityName = "Toronto",
        province = "ON",
        postalCode = "M5V 1A1",
        neighbourhood = (string?)null,
        petsAllowed = true,
        furnished = false,
        leaseTerm = "OneYear",
        parkingType = (string?)null,
        yearBuilt = (int?)null,
        totalFloors = (int?)null,
        amenityIds = Array.Empty<Guid>(),
        units = units.Length > 0 ? units : [new { id = (Guid?)null, bedrooms = 2, bathrooms = 1.5, sqFt = (int?)null, price = 2400, availableDate = (string?)null, availableUnits = 1 }]
    };

    [Fact]
    public async Task Sin_sesion_el_portal_devuelve_401_y_un_renter_403()
    {
        await _factory.SeedRolesAsync();

        var anonymous = CreateClient();
        var response = await anonymous.GetAsync("/api/landlord/dashboard");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        var renter = CreateClient();
        await renter.SignUpAsync("Renter");
        var forbidden = await renter.GetAsync("/api/landlord/dashboard");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public async Task Crear_un_listing_lo_deja_visible_en_la_lista_con_su_slug()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var create = await client.PostAsJsonAsync("/api/landlord/listings",
            ListingForm("Loft Piloto De La Fase Nueve"));
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var created = await create.ReadAsync<CreatedResponse>();
        Assert.Equal("landlord.listingCreated", created!.Message);

        var rows = await client.GetFromJsonAsync<List<ListingRow>>("/api/landlord/listings", Json);
        var row = Assert.Single(rows!);
        Assert.Equal("Loft Piloto De La Fase Nueve", row.Title);
        Assert.Equal("loft-piloto-de-la-fase-nueve", row.Slug);
        Assert.Equal(2, row.Bedrooms);
        Assert.Equal(2400m, row.Price);
        Assert.Equal(1, row.UnitCount);
        Assert.Equal("Active", row.Status);
    }

    [Fact]
    public async Task Editar_actualiza_las_unidades_por_merge_y_no_toca_el_slug()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var create = await client.PostAsJsonAsync("/api/landlord/listings",
            ListingForm("Titulo Original Para Editar"));
        var id = (await create.ReadAsync<CreatedResponse>())!.Id;

        var detail = await client.GetFromJsonAsync<ListingDetail>($"/api/landlord/listings/{id}", Json);
        var existingUnit = Assert.Single(detail!.Units);

        // Se conserva la unidad existente (mismo Id, precio nuevo) y se anade una segunda.
        var update = await client.PutAsJsonAsync($"/api/landlord/listings/{id}", ListingForm(
            "Titulo Cambiado Del Todo",
            new { id = (Guid?)existingUnit.Id, bedrooms = 2, bathrooms = 1.5, sqFt = (int?)null, price = 2600, availableDate = (string?)null, availableUnits = 1 },
            new { id = (Guid?)null, bedrooms = 3, bathrooms = 2.0, sqFt = (int?)900, price = 3200, availableDate = (string?)null, availableUnits = 2 }));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        var after = await client.GetFromJsonAsync<ListingDetail>($"/api/landlord/listings/{id}", Json);
        Assert.Equal("Titulo Cambiado Del Todo", after!.Title);
        Assert.Equal(2, after.Units.Count);
        Assert.Contains(after.Units, u => u.Id == existingUnit.Id && u.Price == 2600m);

        var rows = await client.GetFromJsonAsync<List<ListingRow>>("/api/landlord/listings", Json);
        Assert.Equal("titulo-original-para-editar", Assert.Single(rows!).Slug);
    }

    [Fact]
    public async Task El_listing_de_otro_landlord_devuelve_404_al_leer_editar_o_desactivar()
    {
        await _factory.SeedRolesAsync();

        var owner = CreateClient();
        await owner.SignUpAsync("Landlord");
        var create = await owner.PostAsJsonAsync("/api/landlord/listings",
            ListingForm("Listing Ajeno Protegido"));
        var id = (await create.ReadAsync<CreatedResponse>())!.Id;

        var intruder = CreateClient();
        await intruder.SignUpAsync("Landlord");

        Assert.Equal(HttpStatusCode.NotFound,
            (await intruder.GetAsync($"/api/landlord/listings/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await intruder.PutAsJsonAsync($"/api/landlord/listings/{id}",
                ListingForm("Intento De Pisar El Titulo"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await intruder.PostAsJsonAsync($"/api/landlord/listings/{id}/deactivate", new { })).StatusCode);
    }

    [Fact]
    public async Task Desactivar_es_soft_delete_y_el_listing_sigue_en_la_lista_como_inactivo()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var create = await client.PostAsJsonAsync("/api/landlord/listings",
            ListingForm("Listing Que Se Desactiva"));
        var id = (await create.ReadAsync<CreatedResponse>())!.Id;

        var deactivate = await client.PostAsJsonAsync($"/api/landlord/listings/{id}/deactivate", new { });
        Assert.Equal(HttpStatusCode.OK, deactivate.StatusCode);

        var rows = await client.GetFromJsonAsync<List<ListingRow>>("/api/landlord/listings", Json);
        Assert.Equal("Inactive", Assert.Single(rows!).Status);
    }

    [Fact]
    public async Task Un_listing_sin_unidades_se_rechaza_por_validacion()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var response = await client.PostAsJsonAsync("/api/landlord/listings", new
        {
            title = "Sin Unidades",
            description = (string?)null,
            propertyType = "Apartment",
            status = "Active",
            streetAddress = "1 Test Street",
            cityName = "Toronto",
            province = "ON",
            postalCode = "M5V 1A1",
            neighbourhood = (string?)null,
            petsAllowed = false,
            furnished = false,
            leaseTerm = (string?)null,
            parkingType = (string?)null,
            yearBuilt = (int?)null,
            totalFloors = (int?)null,
            amenityIds = Array.Empty<Guid>(),
            units = Array.Empty<object>()
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ReadAsync<ValidationProblemResponse>();
        Assert.True(problem!.Errors.ContainsKey("units"));
    }

    [Fact]
    public async Task Las_fotos_se_suben_la_primera_es_portada_y_borrarla_promueve_la_siguiente()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var create = await client.PostAsJsonAsync("/api/landlord/listings",
            ListingForm("Listing Con Galeria"));
        var id = (await create.ReadAsync<CreatedResponse>())!.Id;

        using var form = new MultipartFormDataContent();
        form.Add(PngContent(), "files", "una.png");
        form.Add(PngContent(), "files", "dos.png");

        var upload = await client.PostAsync($"/api/landlord/listings/{id}/photos", form);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var photos = await upload.ReadAsync<PhotosResponse>();
        Assert.Equal(2, photos!.Images.Count);
        Assert.Null(photos.Warning);
        Assert.True(photos.Images[0].IsPrimary);

        var primary = photos.Images[0];
        var delete = await client.DeleteAsync($"/api/landlord/listings/{id}/photos/{primary.Id}");
        Assert.Equal(HttpStatusCode.OK, delete.StatusCode);
        var after = await delete.ReadAsync<PhotosResponse>();
        var remaining = Assert.Single(after!.Images);
        Assert.True(remaining.IsPrimary);
    }

    [Fact]
    public async Task Un_archivo_con_extension_prohibida_no_tumba_el_lote_y_avisa()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var create = await client.PostAsJsonAsync("/api/landlord/listings",
            ListingForm("Listing Con Archivo Malo"));
        var id = (await create.ReadAsync<CreatedResponse>())!.Id;

        using var form = new MultipartFormDataContent();
        form.Add(PngContent(), "files", "buena.png");
        form.Add(new ByteArrayContent([1, 2, 3]), "files", "malware.exe");

        var upload = await client.PostAsync($"/api/landlord/listings/{id}/photos", form);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
        var photos = await upload.ReadAsync<PhotosResponse>();
        Assert.Single(photos!.Images);
        Assert.Equal("landlord.imageRejected", photos.Warning);
    }

    [Fact]
    public async Task El_inbox_filtra_no_leidas_marca_leido_con_toggle_y_no_expone_consultas_ajenas()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var create = await client.PostAsJsonAsync("/api/landlord/listings",
            ListingForm("Listing Con Consultas"));
        var id = (await create.ReadAsync<CreatedResponse>())!.Id;

        var inquiry = await client.PostAsJsonAsync("/api/inquiries", new
        {
            propertyId = id,
            senderName = "Interesada Uno",
            senderEmail = "interesada@example.com",
            senderPhone = (string?)null,
            message = "Hola, sigue disponible el loft?",
            moveInDate = (string?)null,
            culture = "en"
        });
        inquiry.EnsureSuccessStatusCode();

        var inbox = await client.GetFromJsonAsync<InboxResponse>("/api/landlord/inbox", Json);
        Assert.Equal(1, inbox!.TotalCount);
        Assert.Equal(1, inbox.UnreadCount);
        var row = Assert.Single(inbox.Inquiries);
        Assert.False(row.IsRead);

        // Toggle a leida: el filtro de no leidas queda vacio, los contadores no cambian de base.
        var toggle = await client.PostAsJsonAsync($"/api/landlord/inbox/{row.Id}/toggle", new { });
        Assert.Equal(HttpStatusCode.OK, toggle.StatusCode);

        var unread = await client.GetFromJsonAsync<InboxResponse>("/api/landlord/inbox?filter=unread", Json);
        Assert.Equal(1, unread!.TotalCount);
        Assert.Equal(0, unread.UnreadCount);
        Assert.Empty(unread.Inquiries);

        // Otro landlord no ve ni puede tocar la consulta.
        var intruder = CreateClient();
        await intruder.SignUpAsync("Landlord");
        var foreign = await intruder.GetFromJsonAsync<InboxResponse>("/api/landlord/inbox", Json);
        Assert.Equal(0, foreign!.TotalCount);
        Assert.Equal(HttpStatusCode.NotFound,
            (await intruder.PostAsJsonAsync($"/api/landlord/inbox/{row.Id}/toggle", new { })).StatusCode);
    }

    [Fact]
    public async Task El_dashboard_cuenta_listings_y_consultas_del_landlord()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var create = await client.PostAsJsonAsync("/api/landlord/listings",
            ListingForm("Listing Del Dashboard"));
        var id = (await create.ReadAsync<CreatedResponse>())!.Id;

        var inquiry = await client.PostAsJsonAsync("/api/inquiries", new
        {
            propertyId = id,
            senderName = "Curioso Dashboard",
            senderEmail = "dash@example.com",
            senderPhone = (string?)null,
            message = "Me interesa, hay visitas esta semana?",
            moveInDate = (string?)null,
            culture = "en"
        });
        inquiry.EnsureSuccessStatusCode();

        var dashboard = await client.GetFromJsonAsync<DashboardResponse>("/api/landlord/dashboard", Json);
        Assert.Equal("Test", dashboard!.FirstName);
        Assert.Equal(1, dashboard.TotalListings);
        Assert.Equal(1, dashboard.TotalInquiries);
        Assert.Equal(1, dashboard.UnreadInquiries);
        Assert.Equal("Curioso Dashboard", Assert.Single(dashboard.Recent).SenderName);
    }

    [Fact]
    public async Task El_perfil_guarda_marca_y_preserva_el_centinela_del_seeder_en_la_bio()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        var email = await client.SignUpAsync("Landlord");

        // Simula el centinela que el seeder deja en la bio del landlord demo.
        await _factory.TagLandlordDescriptionAsync(email, "Bio original. [seed:v42]");

        var profile = await client.GetFromJsonAsync<ProfileResponse>("/api/landlord/profile", Json);
        Assert.Equal("Bio original.", profile!.Description);

        var update = await client.PutAsJsonAsync("/api/landlord/profile", new
        {
            fullName = "Landlord Renovado",
            phone = "416-555-0101",
            companyName = "Fase Nueve Rentals",
            website = "https://fase9.example.com",
            description = "Bio editada por el usuario."
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        var after = await client.GetFromJsonAsync<ProfileResponse>("/api/landlord/profile", Json);
        Assert.Equal("Fase Nueve Rentals", after!.CompanyName);
        Assert.Equal("Bio editada por el usuario.", after.Description);

        // El centinela sigue en la base aunque la API nunca lo muestre.
        var stored = await _factory.GetLandlordDescriptionAsync(email);
        Assert.EndsWith("[seed:v42]", stored);
        Assert.StartsWith("Bio editada por el usuario.", stored);
    }

    [Fact]
    public async Task Un_website_sin_esquema_http_se_rechaza_por_campo()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Landlord");

        var update = await client.PutAsJsonAsync("/api/landlord/profile", new
        {
            fullName = "Landlord Web",
            phone = (string?)null,
            companyName = (string?)null,
            website = "www.sin-esquema.com",
            description = (string?)null
        });

        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);
        var problem = await update.ReadAsync<ValidationProblemResponse>();
        Assert.True(problem!.Errors.ContainsKey("website"));
    }

    /// <summary>PNG minimo de 1x1 para el multipart; el storage solo mira la extension.</summary>
    private static ByteArrayContent PngContent()
    {
        var content = new ByteArrayContent([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
        content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
        return content;
    }

    private sealed record CreatedResponse(Guid Id, string Message);

    private sealed record ListingRow(
        Guid Id, string Title, string Slug, string CityName, string CitySlug, string Province,
        string Status, int? Bedrooms, decimal? Price, int UnitCount, int ViewCount, int LeadCount,
        string? PrimaryImageUrl);

    private sealed record UnitRow(
        Guid? Id, int Bedrooms, decimal Bathrooms, int? SqFt, decimal Price,
        string? AvailableDate, int AvailableUnits);

    private sealed record ImageRow(
        Guid Id, string Url, string? AltText, bool IsPrimary, int DisplayOrder, string? Category);

    private sealed record ListingDetail(
        Guid Id, string Title, string? Description, string PropertyType, string Status,
        string StreetAddress, string CityName, string Province, string PostalCode,
        string? Neighbourhood, bool PetsAllowed, bool Furnished, string? LeaseTerm,
        string? ParkingType, int? YearBuilt, int? TotalFloors,
        List<Guid> AmenityIds, List<UnitRow> Units, List<ImageRow> Images);

    private sealed record PhotosResponse(List<ImageRow> Images, string? Warning);

    private sealed record InquiryRow(
        Guid Id, string PropertyTitle, string PropertySlug, string CitySlug, string SenderName,
        string SenderEmail, string? SenderPhone, string Message, string? MoveInDate, bool IsRead,
        DateTimeOffset CreatedAt);

    private sealed record InboxResponse(int TotalCount, int UnreadCount, List<InquiryRow> Inquiries);

    private sealed record RecentRow(
        Guid Id, string SenderName, string PropertyTitle, bool IsRead, DateTimeOffset CreatedAt);

    private sealed record DashboardResponse(
        string? FirstName, int TotalListings, int TotalViews, int TotalInquiries,
        int UnreadInquiries, List<RecentRow> Recent);

    private sealed record ProfileResponse(
        string Email, string FullName, string? Phone, string? CompanyName, string? Website,
        string? Description, bool IsVerified, bool HasPassword);

    private sealed record ValidationProblemResponse(Dictionary<string, string[]> Errors);
}
