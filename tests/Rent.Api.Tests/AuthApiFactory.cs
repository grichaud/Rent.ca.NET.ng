using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Rent.Api.Domain;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Tests;

/// <summary>
/// Levanta la API real contra SQLite en memoria.
///
/// El entorno "Testing" ya evita que Program.cs registre SQL Server y ejecute el seeder, asi
/// que aqui solo hay que aportar el DbContext. Se usa SQLite y no el proveedor InMemory porque
/// este ultimo no aplica claves ni indices unicos, y precisamente el correo unico es una de las
/// reglas que el alta debe respetar.
///
/// La conexion se mantiene abierta durante toda la vida de la factory: una base SQLite en
/// memoria desaparece en cuanto se cierra su ultima conexion.
/// </summary>
public sealed class AuthApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    // Web root propio y desechable: las fotos que suben los tests del portal del landlord
    // irian a parar al wwwroot del repo si no.
    private readonly string _webRoot = Path.Combine(Path.GetTempPath(), $"rentca-tests-{Guid.NewGuid():N}");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        Directory.CreateDirectory(_webRoot);
        builder.UseWebRoot(_webRoot);

        builder.ConfigureServices(services =>
        {
            _connection.Open();

            services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection));

            using var scope = services.BuildServiceProvider().CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Database.EnsureCreated();
        });
    }

    /// <summary>
    /// Los roles los crea el seeder de produccion, que en Testing no corre. Sin ellos
    /// <c>AddToRoleAsync</c> no asigna nada y el alta terminaria sin rol.
    /// </summary>
    public async Task SeedRolesAsync()
    {
        using var scope = Services.CreateScope();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

        foreach (var role in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole<Guid>(role) { Id = Guid.NewGuid() });
        }
    }

    /// <summary>
    /// Siembra una ciudad y un listing activo de un propietario, que es el minimo para poder
    /// probar consultas y favoritos. Devuelve el id de la propiedad.
    /// </summary>
    public async Task<Guid> SeedListingAsync(string city = "Toronto", string citySlug = "toronto")
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        if (!await db.Cities.AnyAsync(c => c.Slug == citySlug))
        {
            db.Cities.Add(new City
            {
                Id = Guid.NewGuid(),
                Name = city,
                Slug = citySlug,
                Province = "ON",
                IsFeatured = true
            });
            await db.SaveChangesAsync();
        }

        var landlord = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = $"landlord-{Guid.NewGuid():N}@example.com",
            UserName = $"landlord-{Guid.NewGuid():N}@example.com",
            FullName = "Seed Landlord"
        };
        await userManager.CreateAsync(landlord, "Password123");

        db.LandlordProfiles.Add(new LandlordProfile { Id = landlord.Id, Tier = ListingTier.Limited });

        var propertyId = Guid.NewGuid();
        db.Properties.Add(new Property
        {
            Id = propertyId,
            LandlordProfileId = landlord.Id,
            Title = "Seeded Loft",
            Slug = $"seeded-loft-{propertyId:N}",
            City = city,
            Province = "ON",
            StreetAddress = "1 Test Street",
            PostalCode = "M5V 1A1",
            PropertyType = PropertyType.Apartment,
            Status = ListingStatus.Active,
            Tier = ListingTier.Limited,
            CreatedAt = DateTimeOffset.UtcNow,
            Units = [new Unit { Id = Guid.NewGuid(), Name = "1BR", Price = 2000m, Bedrooms = 1, Bathrooms = 1m }]
        });

        await db.SaveChangesAsync();
        return propertyId;
    }

    /// <summary>Escribe la bio del perfil de un landlord (p.ej. para simular el centinela del seeder).</summary>
    public async Task TagLandlordDescriptionAsync(string email, string description)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var user = await userManager.FindByEmailAsync(email)
            ?? throw new InvalidOperationException($"No existe el usuario {email}.");
        var profile = await db.LandlordProfiles.FirstAsync(p => p.Id == user.Id);
        profile.Description = description;
        await db.SaveChangesAsync();
    }

    public async Task<string?> GetLandlordDescriptionAsync(string email)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        var user = await userManager.FindByEmailAsync(email)
            ?? throw new InvalidOperationException($"No existe el usuario {email}.");
        return await db.LandlordProfiles
            .Where(p => p.Id == user.Id)
            .Select(p => p.Description)
            .FirstOrDefaultAsync();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _connection.Dispose();
            try { Directory.Delete(_webRoot, recursive: true); } catch { /* mejor huerfano que test rojo */ }
        }
    }
}
