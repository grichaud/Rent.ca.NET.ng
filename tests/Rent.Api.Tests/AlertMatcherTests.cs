using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Rent.Api.Domain;
using Rent.Api.Features.Alerts.Engine;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Tests;

/// <summary>
/// Los criterios con los que una alerta decide si un anuncio le interesa (port de la mitad de
/// coincidencia de <c>AlertEngineTests.cs</c> del origen; la mitad de horarios ya vive en
/// <see cref="AlertScheduleTests"/>).
///
/// Importa mas de lo que parece: estas reglas deciden que llega al CORREO de una persona. Un
/// filtro que se relaja de mas convierte el digest en spam y el usuario se da de baja; uno que
/// se cierra de mas hace que la alerta no avise nunca y parezca rota.
///
/// Ojo con la semantica: precio, dormitorios y banos se evaluan contra las UNIDADES, no contra
/// la propiedad, igual que en la busqueda. Un edificio con un estudio barato y un atico caro
/// casa tanto con "hasta 1500" como con "3 dormitorios o mas".
///
/// Cada test usa su propia ciudad para no leer los anuncios que siembran los demas: la factory
/// se comparte y la base se va llenando segun avanza el fichero.
/// </summary>
public class AlertMatcherTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public AlertMatcherTests(AuthApiFactory factory) => _factory = factory;

    private static readonly DateTimeOffset Ventana = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private async Task<Guid> SeedAsync(
        string city,
        Action<Property> configure,
        params (decimal Price, int Bedrooms, decimal Bathrooms)[] units)
    {
        await _factory.SeedListingAsync();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var landlordId = await db.LandlordProfiles.Select(l => l.Id).FirstAsync();

        var id = Guid.NewGuid();
        var property = new Property
        {
            Id = id,
            LandlordProfileId = landlordId,
            Title = $"Anuncio {id:N}",
            Slug = $"anuncio-{id:N}",
            City = city,
            Province = "ON",
            StreetAddress = "1 Matcher Street",
            PostalCode = "M5V 1A1",
            PropertyType = PropertyType.Apartment,
            Status = ListingStatus.Active,
            // Por defecto, DENTRO de la ventana: los tests que quieran lo contrario lo cambian.
            CreatedAt = Ventana.AddDays(1),
            Units = units
                .Select(u => new Unit
                {
                    Id = Guid.NewGuid(),
                    Price = u.Price,
                    Bedrooms = u.Bedrooms,
                    Bathrooms = u.Bathrooms,
                })
                .ToList(),
        };

        configure(property);
        db.Properties.Add(property);
        await db.SaveChangesAsync();
        return id;
    }

    private async Task<IReadOnlyList<AlertMatch>> MatchAsync(Alert alert, int max = 10)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await new AlertMatcher(db).FindNewMatchesAsync(alert, Ventana, max);
    }

    [Fact]
    public async Task Solo_entran_los_anuncios_publicados_despues_de_la_ventana()
    {
        var city = $"Ventana-{Guid.NewGuid():N}";
        var nuevo = await SeedAsync(city, _ => { }, (2000m, 1, 1m));
        await SeedAsync(city, p => p.CreatedAt = Ventana.AddDays(-1), (2000m, 1, 1m));

        var matches = await MatchAsync(new Alert { City = city });

        Assert.Equal(nuevo, Assert.Single(matches).PropertyId);
    }

    [Fact]
    public async Task Un_anuncio_que_no_esta_activo_queda_fuera()
    {
        var city = $"Estado-{Guid.NewGuid():N}";
        await SeedAsync(city, p => p.Status = ListingStatus.Draft, (2000m, 1, 1m));
        await SeedAsync(city, p => p.Status = ListingStatus.Inactive, (2000m, 1, 1m));

        Assert.Empty(await MatchAsync(new Alert { City = city }));
    }

    [Fact]
    public async Task El_precio_maximo_se_mide_contra_las_unidades()
    {
        var city = $"Precio-{Guid.NewGuid():N}";
        // Un edificio con un estudio barato y un atico caro casa con "hasta 1500": la persona
        // podria alquilar el estudio.
        var mixto = await SeedAsync(city, _ => { }, (1200m, 0, 1m), (4800m, 3, 2m));
        await SeedAsync(city, _ => { }, (3000m, 2, 1m));

        var matches = await MatchAsync(new Alert { City = city, PriceMax = 1500m });

        Assert.Equal(mixto, Assert.Single(matches).PropertyId);
    }

    [Fact]
    public async Task Los_dormitorios_y_los_banos_son_minimos()
    {
        var city = $"Habitaciones-{Guid.NewGuid():N}";
        var grande = await SeedAsync(city, _ => { }, (3200m, 3, 2m));
        await SeedAsync(city, _ => { }, (1500m, 1, 1m));

        var matches = await MatchAsync(new Alert { City = city, BedroomsMin = 3, BathroomsMin = 2m });

        Assert.Equal(grande, Assert.Single(matches).PropertyId);
    }

    [Fact]
    public async Task El_filtro_de_mascotas_tiene_tres_estados()
    {
        var city = $"Mascotas-{Guid.NewGuid():N}";
        var conMascotas = await SeedAsync(city, p => p.PetsAllowed = true, (2000m, 1, 1m));
        var sinMascotas = await SeedAsync(city, p => p.PetsAllowed = false, (2000m, 1, 1m));

        var soloSi = await MatchAsync(new Alert { City = city, PetsAllowed = true });
        Assert.Equal(conMascotas, Assert.Single(soloSi).PropertyId);

        var soloNo = await MatchAsync(new Alert { City = city, PetsAllowed = false });
        Assert.Equal(sinMascotas, Assert.Single(soloNo).PropertyId);

        // Sin decir nada, entran los dos. Es la diferencia entre "me da igual" y "no quiero":
        // con un bool a secas, no pedir mascotas equivaldria a rechazarlas.
        var daIgual = await MatchAsync(new Alert { City = city, PetsAllowed = null });
        Assert.Equal(2, daIgual.Count);
    }

    [Fact]
    public async Task El_tipo_de_propiedad_filtra()
    {
        var city = $"Tipo-{Guid.NewGuid():N}";
        var condo = await SeedAsync(city, p => p.PropertyType = PropertyType.Condo, (2000m, 1, 1m));
        await SeedAsync(city, p => p.PropertyType = PropertyType.House, (2000m, 1, 1m));

        var matches = await MatchAsync(new Alert { City = city, PropertyType = PropertyType.Condo });

        Assert.Equal(condo, Assert.Single(matches).PropertyId);
    }

    [Fact]
    public async Task Una_alerta_sin_ciudad_no_se_limita_a_ninguna()
    {
        var city = $"SinCiudad-{Guid.NewGuid():N}";
        await SeedAsync(city, _ => { }, (2000m, 1, 1m));

        var matches = await MatchAsync(new Alert { City = null }, max: 100);

        Assert.Contains(matches, m => m.City == city);
    }

    [Fact]
    public async Task El_resultado_se_corta_y_llega_del_mas_nuevo_al_mas_viejo()
    {
        var city = $"Tope-{Guid.NewGuid():N}";
        for (var i = 1; i <= 4; i++)
        {
            var dias = i;
            await SeedAsync(city, p => p.CreatedAt = Ventana.AddDays(dias), (2000m, 1, 1m));
        }

        var matches = await MatchAsync(new Alert { City = city }, max: 2);

        Assert.Equal(2, matches.Count);
        Assert.True(matches[0].CreatedAt > matches[1].CreatedAt);
        // El tope se aplica DESPUES de ordenar: se quedan los dos mas recientes, no dos al azar.
        Assert.Equal(Ventana.AddDays(4), matches[0].CreatedAt);
    }

    [Fact]
    public async Task Un_tope_de_cero_no_consulta_nada()
    {
        Assert.Empty(await MatchAsync(new Alert(), max: 0));
    }

    [Fact]
    public async Task El_rango_de_precio_del_resumen_abarca_todas_las_unidades()
    {
        var city = $"Rango-{Guid.NewGuid():N}";
        await SeedAsync(city, _ => { }, (1200m, 0, 1m), (2400m, 2, 1m), (4800m, 3, 2m));

        var match = Assert.Single(await MatchAsync(new Alert { City = city }));

        Assert.Equal(1200m, match.MinPrice);
        Assert.Equal(4800m, match.MaxPrice);
        Assert.Equal(0, match.MinBedrooms);
        Assert.Equal(3, match.MaxBedrooms);
    }

    [Fact]
    public async Task Un_anuncio_sin_unidades_no_rompe_el_resumen()
    {
        // Un anuncio recien creado puede no tener unidades todavia. Antes que reventar el
        // digest entero de esa persona, entra con el precio a nulo.
        var city = $"SinUnidades-{Guid.NewGuid():N}";
        await SeedAsync(city, _ => { });

        var match = Assert.Single(await MatchAsync(new Alert { City = city }));

        Assert.Null(match.MinPrice);
        Assert.Equal(0, match.MinBedrooms);
    }
}
