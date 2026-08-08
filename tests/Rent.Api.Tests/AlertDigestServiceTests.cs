using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Rent.Api.Domain;
using Rent.Api.Features.Alerts.Engine;
using Rent.Api.Features.Email;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Tests;

/// <summary>
/// El motor de digest completo contra una base real (SQLite en memoria) y un remitente espia.
///
/// Se monta a mano en vez de a traves de la API porque lo que hay que fabricar es el ORDEN
/// TEMPORAL: una alerta creada antes que el listing. Por HTTP no se puede — todo nace con la
/// hora actual—, y es justo la condicion que decide si el digest sale o no.
/// </summary>
public class AlertDigestServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _db;
    private readonly SpyEmailSender _email = new();

    public AlertDigestServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options;
        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();
    }

    [Fact]
    public async Task Un_listing_publicado_tras_crear_la_alerta_genera_el_digest()
    {
        var user = SeedRenter();
        SeedCity();
        SeedListing("Luxury Loft", createdAt: DateTimeOffset.UtcNow.AddHours(-1));
        var alert = SeedAlert(user.Id, createdAt: DateTimeOffset.UtcNow.AddDays(-2));
        await _db.SaveChangesAsync();

        var result = await CreateService().RunAsync();

        Assert.Equal(1, result.Sent);
        Assert.Equal(1, result.PropertiesIncluded);

        var mail = Assert.Single(_email.Sent);
        Assert.Equal(user.Email, mail.ToEmail);
        Assert.Equal("Toronto barato", mail.AlertName);
        Assert.Equal("Luxury Loft", Assert.Single(mail.Items).Title);
        // El idioma sale de la fila de la alerta: el motor corre sin peticion y no tiene
        // ninguna cultura ambiente que leer.
        Assert.Equal("fr", mail.Locale);

        // Solo se marca despues de un envio correcto.
        await _db.Entry(alert).ReloadAsync();
        Assert.NotNull(alert.LastSentAt);
    }

    [Fact]
    public async Task Los_listings_anteriores_a_la_alerta_quedan_fuera()
    {
        var user = SeedRenter();
        SeedCity();
        SeedListing("Piso Viejo", createdAt: DateTimeOffset.UtcNow.AddDays(-10));
        var alert = SeedAlert(user.Id, createdAt: DateTimeOffset.UtcNow.AddDays(-1));
        await _db.SaveChangesAsync();

        var result = await CreateService().RunAsync();

        // Sin esto, la primera ejecucion de una alerta recien creada mandaria el catalogo entero.
        Assert.Equal(0, result.Sent);
        Assert.Equal(1, result.NoMatches);
        Assert.Empty(_email.Sent);

        // Y la alerta NO se marca: la ventana tiene que seguir creciendo para que un listing
        // publicado hoy siga siendo elegible en la siguiente pasada.
        await _db.Entry(alert).ReloadAsync();
        Assert.Null(alert.LastSentAt);
    }

    [Fact]
    public async Task Una_alerta_en_pausa_no_se_considera()
    {
        var user = SeedRenter();
        SeedCity();
        SeedListing("Luxury Loft", createdAt: DateTimeOffset.UtcNow.AddHours(-1));
        var alert = SeedAlert(user.Id, createdAt: DateTimeOffset.UtcNow.AddDays(-2));
        alert.IsActive = false;
        await _db.SaveChangesAsync();

        var result = await CreateService().RunAsync();

        Assert.Equal(0, result.Considered);
        Assert.Empty(_email.Sent);
    }

    [Fact]
    public async Task Un_listing_de_una_ciudad_sin_slug_no_se_incluye()
    {
        var user = SeedRenter();
        // A proposito SIN sembrar la fila de Cities: el listing existe pero su ciudad no tiene
        // slug, asi que no se puede construir una URL de detalle que funcione.
        SeedListing("Huerfano", createdAt: DateTimeOffset.UtcNow.AddHours(-1));
        SeedAlert(user.Id, createdAt: DateTimeOffset.UtcNow.AddDays(-2));
        await _db.SaveChangesAsync();

        var result = await CreateService().RunAsync();

        Assert.Equal(0, result.Sent);
        Assert.Equal(1, result.NoMatches);
        Assert.Empty(_email.Sent);
    }

    [Fact]
    public async Task Los_enlaces_del_digest_apuntan_al_cliente_y_no_a_la_api()
    {
        var user = SeedRenter();
        SeedCity();
        SeedListing("Luxury Loft", createdAt: DateTimeOffset.UtcNow.AddHours(-1));
        SeedAlert(user.Id, createdAt: DateTimeOffset.UtcNow.AddDays(-2));
        await _db.SaveChangesAsync();

        await CreateService().RunAsync();

        var mail = Assert.Single(_email.Sent);
        // Quien abre el correo es una persona: tiene que aterrizar en la pagina, no en un JSON.
        Assert.StartsWith("https://cliente.example.com/fr/toronto/", Assert.Single(mail.Items).Url);
        Assert.Equal("https://cliente.example.com/fr/toronto", mail.SearchUrl);
        Assert.Equal("https://cliente.example.com/fr/renter/alerts", mail.ManageAlertsUrl);
    }

    private AlertDigestService CreateService() => new(
        _db,
        new AlertMatcher(_db),
        _email,
        Options.Create(new AlertEngineOptions { SendDelayMs = 0, MaxItemsPerEmail = 10 }),
        Options.Create(new EmailOptions()),
        Options.Create(new AppOptions { ClientBaseUrl = "https://cliente.example.com" }),
        NullLogger<AlertDigestService>.Instance);

    private ApplicationUser SeedRenter()
    {
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = "renter@example.com",
            UserName = "renter@example.com",
            FullName = "Renter de Prueba"
        };
        _db.Users.Add(user);
        return user;
    }

    private void SeedCity()
    {
        _db.Cities.Add(new City
        {
            Id = Guid.NewGuid(),
            Name = "Toronto",
            Slug = "toronto",
            Province = "ON"
        });
    }

    private void SeedListing(string title, DateTimeOffset createdAt)
    {
        var landlord = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = $"landlord-{Guid.NewGuid():N}@example.com",
            UserName = $"landlord-{Guid.NewGuid():N}@example.com"
        };
        _db.Users.Add(landlord);
        _db.LandlordProfiles.Add(new LandlordProfile { Id = landlord.Id, Tier = ListingTier.Limited });

        _db.Properties.Add(new Property
        {
            Id = Guid.NewGuid(),
            LandlordProfileId = landlord.Id,
            Title = title,
            Slug = title.ToLowerInvariant().Replace(' ', '-'),
            City = "Toronto",
            Province = "ON",
            StreetAddress = "1 Test Street",
            PostalCode = "M5V 1A1",
            PropertyType = PropertyType.Apartment,
            Status = ListingStatus.Active,
            Tier = ListingTier.Limited,
            CreatedAt = createdAt,
            Units = [new Unit { Id = Guid.NewGuid(), Name = "1BR", Price = 2000m, Bedrooms = 1, Bathrooms = 1m }]
        });
    }

    private Alert SeedAlert(Guid userId, DateTimeOffset createdAt)
    {
        var alert = new Alert
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Name = "Toronto barato",
            City = "Toronto",
            Locale = "fr",
            Frequency = AlertFrequency.Daily,
            IsActive = true,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
        _db.Alerts.Add(alert);
        return alert;
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }

    private sealed class SpyEmailSender : IEmailSender
    {
        public List<AlertDigestEmail> Sent { get; } = [];

        public Task SendAlertDigestAsync(AlertDigestEmail data, CancellationToken ct = default)
        {
            Sent.Add(data);
            return Task.CompletedTask;
        }

        public Task SendWelcomeAsync(WelcomeEmail data, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendPasswordResetAsync(PasswordResetEmail data, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendInquiryToLandlordAsync(InquiryEmail data, CancellationToken ct = default) => Task.CompletedTask;
    }
}
