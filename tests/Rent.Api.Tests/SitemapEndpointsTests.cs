using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Rent.Api.Domain;
using Rent.Api.Features.Seo;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Tests;

/// <summary>
/// El inventario que alimenta al sitemap.xml.
///
/// Lo unico que importa aqui es que no salga NINGUNA URL que luego devuelva 404: un sitemap con
/// enlaces muertos es peor que no tener sitemap, porque el buscador lo interpreta como un sitio
/// descuidado. De ahi que las pruebas ataquen los dos caminos por los que se cuela una URL
/// invalida — el estado del anuncio y la ciudad que no existe como fila.
///
/// La factory se comparte entre los tests del fichero, asi que se comprueba la PRESENCIA o
/// AUSENCIA de slugs concretos, nunca cantidades: los demas tests siembran su propio catalogo.
/// </summary>
public class SitemapEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public SitemapEndpointsTests(AuthApiFactory factory) => _factory = factory;

    private async Task<SitemapResponse> GetSitemapAsync()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/sitemap");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.ReadAsync<SitemapResponse>())!;
    }

    /// <summary>Inserta un anuncio a medida sobre el propietario que siembra la factory.</summary>
    private async Task<string> SeedPropertyAsync(string city, ListingStatus status, DateTimeOffset? updatedAt = null)
    {
        await _factory.SeedListingAsync();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var landlordId = await db.LandlordProfiles.Select(l => l.Id).FirstAsync();

        var id = Guid.NewGuid();
        var slug = $"probe-{id:N}";

        db.Properties.Add(new Property
        {
            Id = id,
            LandlordProfileId = landlordId,
            Title = "Probe Listing",
            Slug = slug,
            City = city,
            Province = "ON",
            StreetAddress = "2 Probe Street",
            PostalCode = "M5V 1A1",
            PropertyType = PropertyType.Apartment,
            Status = status,
            UpdatedAt = updatedAt ?? DateTimeOffset.UtcNow,
        });

        await db.SaveChangesAsync();
        return slug;
    }

    [Fact]
    public async Task El_sitemap_es_publico_y_devuelve_ciudades_y_anuncios()
    {
        await _factory.SeedListingAsync();

        var sitemap = await GetSitemapAsync();

        Assert.Contains(sitemap.Cities, c => c.Slug == "toronto");
        Assert.Contains(sitemap.Listings, l => l.CitySlug == "toronto");
    }

    [Fact]
    public async Task Un_anuncio_que_no_esta_activo_se_queda_fuera()
    {
        // La ficha publica exige Status == Active. Publicar un borrador en el sitemap seria
        // mandar al buscador directo a un 404.
        var draftSlug = await SeedPropertyAsync("Toronto", ListingStatus.Draft);
        var inactiveSlug = await SeedPropertyAsync("Toronto", ListingStatus.Inactive);

        var sitemap = await GetSitemapAsync();

        Assert.DoesNotContain(sitemap.Listings, l => l.Slug == draftSlug);
        Assert.DoesNotContain(sitemap.Listings, l => l.Slug == inactiveSlug);
    }

    [Fact]
    public async Task Un_anuncio_de_una_ciudad_sin_ficha_se_queda_fuera()
    {
        // El catalogo une propiedad y ciudad POR NOMBRE, no por clave ajena: un anuncio cuya
        // ciudad no existe como fila no tiene URL publica alcanzable.
        var slug = await SeedPropertyAsync("Ciudad Fantasma", ListingStatus.Active);

        var sitemap = await GetSitemapAsync();

        Assert.DoesNotContain(sitemap.Listings, l => l.Slug == slug);
        Assert.DoesNotContain(sitemap.Cities, c => c.Slug == "ciudad-fantasma");
    }

    [Fact]
    public async Task La_fecha_de_una_ciudad_es_la_de_su_anuncio_mas_reciente()
    {
        // La fila City no tiene UpdatedAt; el contenido de la pagina son sus anuncios, asi que
        // su fecha es la del mas nuevo.
        var reciente = DateTimeOffset.UtcNow.AddDays(30);
        await SeedPropertyAsync("Toronto", ListingStatus.Active, DateTimeOffset.UtcNow.AddYears(-2));
        await SeedPropertyAsync("Toronto", ListingStatus.Active, reciente);

        var sitemap = await GetSitemapAsync();

        var toronto = Assert.Single(sitemap.Cities, c => c.Slug == "toronto");
        Assert.NotNull(toronto.LastModified);
        Assert.Equal(reciente, toronto.LastModified!.Value, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task Cada_anuncio_trae_la_fecha_con_la_que_se_declara_su_lastmod()
    {
        var actualizado = DateTimeOffset.UtcNow.AddDays(-3);
        var slug = await SeedPropertyAsync("Toronto", ListingStatus.Active, actualizado);

        var sitemap = await GetSitemapAsync();

        var entry = Assert.Single(sitemap.Listings, l => l.Slug == slug);
        Assert.NotNull(entry.LastModified);
        Assert.Equal(actualizado, entry.LastModified!.Value, TimeSpan.FromSeconds(1));
    }
}
