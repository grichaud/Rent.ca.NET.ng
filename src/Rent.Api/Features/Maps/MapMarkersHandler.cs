using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Search;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.Maps;

public class MapMarkersHandler
{
    private readonly AppDbContext _db;

    public MapMarkersHandler(AppDbContext db)
    {
        _db = db;
    }

    public async Task<MapMarkersResult> ExecuteAsync(SearchQuery query, CancellationToken ct = default)
    {
        var citySlug = query.CitySlug?.ToLowerInvariant() ?? string.Empty;

        var city = await _db.Cities
            .FirstOrDefaultAsync(c => c.Slug == citySlug, ct);

        if (city is null)
        {
            return new MapMarkersResult { CityFound = false };
        }

        var q = _db.Properties
            .AsNoTracking()
            .Where(p =>
                p.Status == ListingStatus.Active &&
                p.City == city.Name &&
                p.Latitude != null &&
                p.Longitude != null);

        if (query.MinPrice.HasValue)
            q = q.Where(p => p.Units.Any(u => u.Price >= query.MinPrice));
        if (query.MaxPrice.HasValue)
            q = q.Where(p => p.Units.Any(u => u.Price <= query.MaxPrice));
        if (query.Bedrooms.HasValue)
            q = q.Where(p => p.Units.Any(u => u.Bedrooms >= query.Bedrooms));
        if (query.Bathrooms.HasValue)
            q = q.Where(p => p.Units.Any(u => u.Bathrooms >= query.Bathrooms));

        var types = query.EffectiveTypes();
        if (types.Length > 0)
            q = q.Where(p => types.Contains(p.PropertyType));

        if (query.PetsAllowed) q = q.Where(p => p.PetsAllowed);
        if (query.Furnished)   q = q.Where(p => p.Furnished);
        if (query.HasParking)  q = q.Where(p => p.ParkingType != null);

        // Pull the projection without decimal aggregates so SQLite (test fixture) can translate it,
        // then compute FromPrice in memory. Same gotcha previously documented for the Home/search path.
        var rows = await q
            .Select(p => new
            {
                p.Id,
                p.Title,
                p.Slug,
                p.Latitude,
                p.Longitude,
                p.PropertyType,
                p.Tier,
                p.TierExpiresAt,
                PrimaryImageUrl = p.Images
                    .OrderByDescending(i => i.IsPrimary)
                    .ThenBy(i => i.DisplayOrder)
                    .Select(i => i.Url)
                    .FirstOrDefault(),
                Units = p.Units
                    .Select(u => new { u.Price, u.Bedrooms })
                    .ToList()
            })
            .ToListAsync(ct);

        var markers = rows
            .Select(p => new MapMarker
            {
                Id = p.Id,
                Title = p.Title,
                Slug = p.Slug,
                CitySlug = city.Slug,
                Lat = p.Latitude!.Value,
                Lng = p.Longitude!.Value,
                PropertyType = p.PropertyType,
                Tier = p.Tier,
                TierExpiresAt = p.TierExpiresAt,
                PrimaryImageUrl = p.PrimaryImageUrl,
                FromPrice = p.Units.Count == 0 ? null : p.Units.Min(u => (decimal?)u.Price),
                MinBedrooms = p.Units.Count == 0 ? 0 : p.Units.Min(u => u.Bedrooms)
            })
            .ToList();

        return new MapMarkersResult
        {
            CityFound = true,
            CityLat = city.Latitude,
            CityLng = city.Longitude,
            Markers = markers
        };
    }
}

public class MapMarkersResult
{
    public bool CityFound { get; set; }
    public double? CityLat { get; set; }
    public double? CityLng { get; set; }
    public IReadOnlyList<MapMarker> Markers { get; set; } = [];
}
