using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Features.Shared;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Http;

namespace Rent.Api.Features.Search;

public sealed record SearchResponse(
    CityDto? City,
    IReadOnlyList<PropertyCardDto> Properties,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages);

public static class SearchEndpoints
{
    public static void MapSearchEndpoints(this IEndpointRouteBuilder app)
    {
        // El citySlug va en la ruta (no en el query string) porque la URL publica del
        // origen es /{culture}/{citySlug}: mantener la misma forma evita traducir rutas.
        app.MapGet("/api/search/{citySlug}", async (
            string citySlug,
            HttpRequest request,
            SearchHandler handler,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var query = SearchQueryBinding.FromQuery(request, citySlug);
            var result = await handler.ExecuteAsync(query, CurrentUser.GetId(principal), ct);

            if (result.City is null)
            {
                return Results.NotFound(new { error = "city_not_found", citySlug });
            }

            return Results.Ok(new SearchResponse(
                result.City.ToDto(),
                result.Properties.Select(p => p.ToDto()).ToList(),
                result.TotalCount,
                result.Page,
                result.PageSize,
                result.TotalPages));
        })
        .AllowAnonymous()
        .WithPublicCache()
        .WithName("SearchByCity");

        app.MapGet("/api/cities", async (AppDbContext db, bool? featured, CancellationToken ct) =>
        {
            var q = db.Cities.AsNoTracking().AsQueryable();
            if (featured == true) q = q.Where(c => c.IsFeatured);

            var cities = await q.OrderBy(c => c.Name).ToListAsync(ct);
            return Results.Ok(cities.Select(c => c.ToDto()).ToList());
        })
        .AllowAnonymous()
        .WithPublicCache()
        .WithName("GetCities");
    }
}
