using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.Seo;

public sealed record SitemapCityDto(string Slug, DateTimeOffset? LastModified);

public sealed record SitemapListingDto(string CitySlug, string Slug, DateTimeOffset? LastModified);

public sealed record SitemapResponse(
    IReadOnlyList<SitemapCityDto> Cities,
    IReadOnlyList<SitemapListingDto> Listings);

/// <summary>
/// Inventario de URLs publicas para el sitemap.xml, que construye y sirve el servidor de SSR.
///
/// El XML no se genera aqui a proposito: el sitemap tiene que vivir en el mismo host que las
/// paginas que enumera, y el unico host publico es el de SSR. Un sitemap servido desde la API
/// apuntaria a URLs de otro dominio y los buscadores lo descartan. La API aporta los datos; el
/// SSR sabe cual es su propio origen.
/// </summary>
public static class SitemapEndpoints
{
    public static void MapSitemapEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/sitemap", async (AppDbContext db, CancellationToken ct) =>
        {
            // Solo columnas, no entidades: es el unico endpoint que recorre el catalogo entero
            // y traer los agregados completos seria gratuito para nadie.
            var cities = await db.Cities
                .AsNoTracking()
                .Select(c => new { c.Slug, c.Name })
                .ToListAsync(ct);

            var listings = await db.Properties
                .AsNoTracking()
                .Where(p => p.Status == ListingStatus.Active)
                .Select(p => new { p.Slug, p.City, p.UpdatedAt })
                .ToListAsync(ct);

            // El join va POR NOMBRE DE CIUDAD, que es como resuelve la ficha publica
            // (`p.City == city.Name` en ListingsEndpoints). Emitir un listing cuya ciudad no
            // existe daria una URL 404 dentro del propio sitemap.
            //
            // La comparacion es ORDINAL, la mas estricta de las dos que hay en juego: SQL
            // Server casa sin distinguir mayusculas y SQLite si las distingue. Quedandose con
            // el criterio estricto, toda URL emitida resuelve en los dos motores; al reves se
            // publicarian enlaces rotos solo en uno de ellos.
            var slugByCityName = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var city in cities)
            {
                slugByCityName.TryAdd(city.Name, city.Slug);
            }

            var listingDtos = new List<SitemapListingDto>();
            var lastModifiedByCity = new Dictionary<string, DateTimeOffset>(StringComparer.Ordinal);

            foreach (var listing in listings)
            {
                if (!slugByCityName.TryGetValue(listing.City, out var citySlug)) continue;

                listingDtos.Add(new SitemapListingDto(citySlug, listing.Slug, listing.UpdatedAt));

                // La fecha de una pagina de ciudad es la del listing mas reciente que muestra:
                // la propia fila de City no tiene UpdatedAt y su contenido son sus anuncios.
                if (!lastModifiedByCity.TryGetValue(citySlug, out var current) || listing.UpdatedAt > current)
                {
                    lastModifiedByCity[citySlug] = listing.UpdatedAt;
                }
            }

            // El orden se hace en memoria: SQLite no traduce el orden por DateTimeOffset, la
            // misma trampa que ya se pago en el panel de admin y en las promociones.
            var cityDtos = cities
                .Select(c => new SitemapCityDto(
                    c.Slug,
                    lastModifiedByCity.TryGetValue(c.Slug, out var lastModified) ? lastModified : null))
                .OrderBy(c => c.Slug, StringComparer.Ordinal)
                .ToList();

            listingDtos.Sort((a, b) =>
            {
                var byCity = string.CompareOrdinal(a.CitySlug, b.CitySlug);
                return byCity != 0 ? byCity : string.CompareOrdinal(a.Slug, b.Slug);
            });

            return Results.Ok(new SitemapResponse(cityDtos, listingDtos));
        })
        .AllowAnonymous()
        .WithName("GetSitemap");
    }
}
