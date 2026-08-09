using Rent.Api.Domain;
using Rent.Api.Features.Search;
using Rent.Api.Infrastructure.Http;

namespace Rent.Api.Features.Maps;

public sealed record MapMarkerDto(
    Guid Id, string Title, string Slug, string CitySlug,
    double Lat, double Lng,
    PropertyType PropertyType, ListingTier Tier,
    string? PrimaryImageUrl, decimal? FromPrice, int MinBedrooms);

public sealed record MapMarkersResponse(
    double? CityLat, double? CityLng, IReadOnlyList<MapMarkerDto> Markers);

public static class MapEndpoints
{
    public static void MapMapEndpoints(this IEndpointRouteBuilder app)
    {
        // Acepta los mismos filtros que /api/search: el mapa y el grid muestran el mismo
        // conjunto de resultados, solo cambia la representacion.
        app.MapGet("/api/maps/{citySlug}", async (
            string citySlug,
            HttpRequest request,
            MapMarkersHandler handler,
            CancellationToken ct) =>
        {
            var query = SearchQueryBinding.FromQuery(request, citySlug);
            var result = await handler.ExecuteAsync(query, ct);

            if (!result.CityFound)
            {
                return Results.NotFound(new { error = "city_not_found", citySlug });
            }

            return Results.Ok(new MapMarkersResponse(
                result.CityLat,
                result.CityLng,
                result.Markers.Select(m => new MapMarkerDto(
                    m.Id, m.Title, m.Slug, m.CitySlug,
                    m.Lat, m.Lng,
                    m.PropertyType,
                    ListingTierExtensions.Resolve(m.Tier, m.TierExpiresAt),
                    m.PrimaryImageUrl, m.FromPrice, m.MinBedrooms)).ToList()));
        })
        .AllowAnonymous()
        .WithPublicCache()
        .WithName("GetMapMarkers");
    }
}
