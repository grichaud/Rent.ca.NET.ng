using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Admin.Services;
using Rent.Api.Features.Favorites;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.Search;

public class SearchHandler
{
    private readonly AppDbContext _db;
    private readonly IFavoriteService _favorites;
    private readonly IPopularSearchTracker _searchTracker;

    public SearchHandler(AppDbContext db, IFavoriteService favorites, IPopularSearchTracker searchTracker)
    {
        _db = db;
        _favorites = favorites;
        _searchTracker = searchTracker;
    }

    public async Task<SearchResult> ExecuteAsync(SearchQuery query, CancellationToken ct = default)
        => await ExecuteAsync(query, currentUserId: null, ct);

    public async Task<SearchResult> ExecuteAsync(SearchQuery query, Guid? currentUserId, CancellationToken ct = default)
    {
        var citySlug = query.CitySlug?.ToLowerInvariant() ?? string.Empty;

        // Paridad Next.js `ROUTES.city('canada')`: agregado nacional. Cuando el slug es "canada",
        // saltamos el filtro de ciudad y mostramos todas las propiedades activas con una "ciudad"
        // sintÃ©tica centrada en CanadÃ¡. Se usa desde el "View All" del carousel del Home.
        var isCanadaAggregate = citySlug == "canada";

        City? city = isCanadaAggregate
            ? new City
            {
                Slug = "canada",
                Name = "Canada",
                Province = "CA",
                Latitude = 56.1304,   // Centro geogrÃ¡fico aproximado
                Longitude = -106.3468,
                ImageUrl = null,
                ListingCount = 0,
                IsFeatured = false,
            }
            : await _db.Cities.FirstOrDefaultAsync(c => c.Slug == citySlug, ct);

        if (city is null)
        {
            return new SearchResult { City = null };
        }

        var q = _db.Properties
            .AsNoTracking()
            .Where(p => p.Status == ListingStatus.Active);

        if (!isCanadaAggregate)
        {
            q = q.Where(p => p.City == city.Name);
        }

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

        var total = await q.CountAsync(ct);

        // Pull a window of candidates ordered by SQLite-friendly columns,
        // then sort by price/recency in memory because SQLite cannot ORDER BY decimal aggregates
        // or DateTimeOffset (test fixture gotcha documented in slices 1.5/4/5).
        var raw = await q
            .Select(p => new
            {
                p.Id,
                p.Title,
                p.Slug,
                p.City,
                p.Province,
                p.Neighbourhood,
                p.PropertyType,
                p.Tier,
                p.TierExpiresAt,
                p.IsVerified,
                p.PetsAllowed,
                p.Furnished,
                p.CreatedAt,
                PrimaryImageUrl = p.Images
                    .OrderByDescending(i => i.IsPrimary)
                    .ThenBy(i => i.DisplayOrder)
                    .Select(i => i.Url)
                    .FirstOrDefault(),
                Units = p.Units.Select(u => new { u.Price, u.Bedrooms, u.Bathrooms }).ToList(),
                ActiveSpecials = p.RentSpecials
                    .Where(s => s.IsActive)
                    .Select(s => new { s.Title, s.StartDate, s.EndDate })
                    .ToList()
            })
            .ToListAsync(ct);

        var now = DateTimeOffset.UtcNow;
        var projected = raw.Select(p => new PropertyCard
        {
            Id = p.Id,
            Title = p.Title,
            Slug = p.Slug,
            City = p.City,
            CitySlug = city.Slug,
            Province = p.Province,
            Neighbourhood = p.Neighbourhood,
            PrimaryImageUrl = p.PrimaryImageUrl,
            FromPrice = p.Units.Count == 0 ? null : p.Units.Min(u => (decimal?)u.Price),
            ToPrice   = p.Units.Count == 0 ? null : p.Units.Max(u => (decimal?)u.Price),
            MinBedrooms = p.Units.Count == 0 ? 0 : p.Units.Min(u => u.Bedrooms),
            MaxBedrooms = p.Units.Count == 0 ? null : p.Units.Max(u => (int?)u.Bedrooms),
            MinBathrooms = p.Units.Count == 0 ? 0m : p.Units.Min(u => u.Bathrooms),
            PropertyType = p.PropertyType,
            Tier = p.Tier,
            TierExpiresAt = p.TierExpiresAt,
            IsVerified = p.IsVerified,
            PetsAllowed = p.PetsAllowed,
            Furnished = p.Furnished,
            CreatedAt = p.CreatedAt,
            SpecialTitle = p.ActiveSpecials
                .Where(s =>
                    (!s.StartDate.HasValue || s.StartDate.Value <= now) &&
                    (!s.EndDate.HasValue || s.EndDate.Value >= now))
                .Select(s => s.Title)
                .FirstOrDefault()
        }).ToList();

        IEnumerable<PropertyCard> ordered = query.Sort switch
        {
            SearchSort.PriceAsc  => projected.OrderBy(p => p.FromPrice ?? decimal.MaxValue),
            SearchSort.PriceDesc => projected.OrderByDescending(p => p.FromPrice ?? decimal.MinValue),
            SearchSort.Popular   => projected
                                    .OrderByDescending(p => p.EffectiveTier)
                                    .ThenByDescending(p => p.IsVerified)
                                    .ThenBy(p => p.Title),
            _ /* Newest */       => projected
                                    .OrderByDescending(p => p.EffectiveTier)
                                    .ThenByDescending(p => p.CreatedAt)
                                    .ThenBy(p => p.Title)
        };

        var items = ordered
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToList();

        if (currentUserId is Guid uid)
        {
            var favIds = await _favorites.GetFavoritedIdsAsync(uid, items.Select(i => i.Id), ct);
            foreach (var card in items)
                card.IsFavorited = favIds.Contains(card.Id);
        }

        // Fire-and-forget: increment popular searches counter so the admin dashboard
        // can rank the most-used filter combinations. Never blocks the user response.
        await _searchTracker.TrackAsync(BuildNormalizedQuery(query), city.Slug, ct);

        return new SearchResult
        {
            City = city,
            Properties = items,
            TotalCount = total,
            Page = query.Page,
            PageSize = query.PageSize
        };
    }

    private static string BuildNormalizedQuery(SearchQuery q)
    {
        var parts = new List<string>();
        if (q.MinPrice.HasValue) parts.Add($"minprice={q.MinPrice.Value:0}");
        if (q.MaxPrice.HasValue) parts.Add($"maxprice={q.MaxPrice.Value:0}");
        if (q.Bedrooms.HasValue) parts.Add($"bedrooms={q.Bedrooms.Value}");
        if (q.Bathrooms.HasValue) parts.Add($"bathrooms={q.Bathrooms.Value:0.#}");
        var types = q.EffectiveTypes();
        if (types.Length > 0)
        {
            var typeList = string.Join(",", types.Select(t => t.ToString().ToLowerInvariant()).OrderBy(s => s));
            parts.Add($"types={typeList}");
        }
        if (q.PetsAllowed) parts.Add("pets=true");
        if (q.Furnished) parts.Add("furnished=true");
        if (q.HasParking) parts.Add("parking=true");
        if (q.Sort != SearchSort.Newest) parts.Add($"sort={q.Sort.ToString().ToLowerInvariant()}");
        return parts.Count == 0 ? string.Empty : string.Join("&", parts);
    }
}
