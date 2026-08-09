using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Rent.Api.Domain;
using Rent.Api.Features.Maps;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Tests;

/// <summary>
/// El endpoint de marcadores del mapa (port de <c>MapsTests.cs</c> del origen).
///
/// Era el unico endpoint publico sin ninguna prueba. La pantalla que lo consume todavia es un
/// hueco a la espera de la clave de Google Maps, y precisamente por eso conviene cubrirlo: un
/// contrato que nadie mira es el que se rompe sin que nadie se entere hasta que se enchufa la
/// clave y ya nadie recuerda como iba.
///
/// Lo que mas importa aqui es que un anuncio SIN coordenadas no salga: un marcador en el (0,0)
/// pone pisos de Toronto en el golfo de Guinea.
/// </summary>
public class MapEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public MapEndpointsTests(AuthApiFactory factory) => _factory = factory;

    private async Task<string> SeedCityAsync(double? lat = 43.6532, double? lng = -79.3832)
    {
        var slug = $"mapcity-{Guid.NewGuid():N}";

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Cities.Add(new City
        {
            Id = Guid.NewGuid(),
            Name = slug,
            Slug = slug,
            Province = "ON",
            Latitude = lat,
            Longitude = lng,
        });
        await db.SaveChangesAsync();
        return slug;
    }

    private async Task<Guid> SeedPropertyAsync(string city, Action<Property> configure)
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
            Title = $"Mapa {id:N}",
            Slug = $"mapa-{id:N}",
            City = city,
            Province = "ON",
            StreetAddress = "1 Map Street",
            PostalCode = "M5V 1A1",
            PropertyType = PropertyType.Apartment,
            Status = ListingStatus.Active,
            Latitude = 43.65,
            Longitude = -79.38,
            Units = [new Unit { Id = Guid.NewGuid(), Price = 2000m, Bedrooms = 1, Bathrooms = 1m }],
        };

        configure(property);
        db.Properties.Add(property);
        await db.SaveChangesAsync();
        return id;
    }

    private async Task<MapMarkersResponse> GetAsync(string citySlug, string query = "")
    {
        var response = await _factory.CreateClient().GetAsync($"/api/maps/{citySlug}{query}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.ReadAsync<MapMarkersResponse>())!;
    }

    [Fact]
    public async Task Una_ciudad_desconocida_da_404()
    {
        var response = await _factory.CreateClient().GetAsync("/api/maps/no-existe");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Devuelve_el_centro_de_la_ciudad_y_sus_marcadores()
    {
        var city = await SeedCityAsync();
        var id = await SeedPropertyAsync(city, _ => { });

        var result = await GetAsync(city);

        Assert.Equal(43.6532, result.CityLat);
        Assert.Equal(-79.3832, result.CityLng);
        Assert.Contains(result.Markers, m => m.Id == id);
    }

    [Fact]
    public async Task Un_anuncio_sin_coordenadas_no_pinta_marcador()
    {
        // Sin esto acabaria en el (0,0): un piso de Toronto en mitad del Atlantico.
        var city = await SeedCityAsync();
        var sinCoordenadas = await SeedPropertyAsync(city, p =>
        {
            p.Latitude = null;
            p.Longitude = null;
        });
        var conCoordenadas = await SeedPropertyAsync(city, _ => { });

        var result = await GetAsync(city);

        Assert.DoesNotContain(result.Markers, m => m.Id == sinCoordenadas);
        Assert.Contains(result.Markers, m => m.Id == conCoordenadas);
    }

    [Fact]
    public async Task Solo_salen_los_anuncios_activos()
    {
        var city = await SeedCityAsync();
        var borrador = await SeedPropertyAsync(city, p => p.Status = ListingStatus.Draft);
        var activo = await SeedPropertyAsync(city, _ => { });

        var result = await GetAsync(city);

        Assert.DoesNotContain(result.Markers, m => m.Id == borrador);
        Assert.Contains(result.Markers, m => m.Id == activo);
    }

    [Fact]
    public async Task Acepta_los_mismos_filtros_que_la_busqueda()
    {
        // El mapa y la rejilla ensenan el MISMO conjunto: si los filtros divergieran, cambiar
        // de vista cambiaria los resultados y pareceria que faltan pisos.
        var city = await SeedCityAsync();
        var barato = await SeedPropertyAsync(city, p =>
            p.Units = [new Unit { Id = Guid.NewGuid(), Price = 1200m, Bedrooms = 1, Bathrooms = 1m }]);
        var caro = await SeedPropertyAsync(city, p =>
            p.Units = [new Unit { Id = Guid.NewGuid(), Price = 5000m, Bedrooms = 3, Bathrooms = 2m }]);

        var result = await GetAsync(city, "?maxPrice=2000");

        Assert.Contains(result.Markers, m => m.Id == barato);
        Assert.DoesNotContain(result.Markers, m => m.Id == caro);
    }

    [Fact]
    public async Task El_tier_del_marcador_respeta_la_vigencia()
    {
        // Un destacado caducado no puede seguir pintandose grande en el mapa: es exactamente
        // lo que se cobra.
        var city = await SeedCityAsync();
        var caducado = await SeedPropertyAsync(city, p =>
        {
            p.Tier = ListingTier.Featured;
            p.TierExpiresAt = DateTimeOffset.UtcNow.AddDays(-1);
        });

        var result = await GetAsync(city);

        var marker = Assert.Single(result.Markers, m => m.Id == caducado);
        Assert.Equal(ListingTier.Limited, marker.Tier);
    }
}
