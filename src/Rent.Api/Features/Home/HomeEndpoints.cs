using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Favorites;
using Rent.Api.Features.Search;
using Rent.Api.Features.Shared;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Http;

namespace Rent.Api.Features.Home;

public sealed record HomeResponse(
    IReadOnlyList<CityDto> FeaturedCities,
    IReadOnlyList<PropertyCardDto> LatestListings);

public static class HomeEndpoints
{
    // Orden explicito del carousel del home, igual que en el origen: la home no muestra
    // las destacadas alfabeticamente sino en este orden curado.
    private static readonly string[] FeaturedOrder =
    [
        "toronto", "vancouver", "montreal", "calgary", "edmonton", "ottawa",
        "winnipeg", "quebec-city", "hamilton", "saskatoon", "london", "halifax"
    ];

    public static void MapHomeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/home", async (
            AppDbContext db,
            IFavoriteService favorites,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var allCities = await db.Cities.AsNoTracking().OrderBy(c => c.Name).ToListAsync(ct);

            var featuredBySlug = allCities.Where(c => c.IsFeatured).ToDictionary(c => c.Slug);
            var featured = FeaturedOrder
                .Where(featuredBySlug.ContainsKey)
                .Select(slug => featuredBySlug[slug])
                .ToList();

            var citySlugByName = allCities.ToDictionary(c => c.Name, c => c.Slug);

            var raw = await db.Properties
                .AsNoTracking()
                .Include(p => p.Units)
                .Include(p => p.Images)
                .Include(p => p.RentSpecials)
                .Where(p => p.Status == ListingStatus.Active)
                .OrderByDescending(p => p.Tier)
                .Take(20)
                .ToListAsync(ct);

            var now = DateTimeOffset.UtcNow;

            var latest = raw
                .Select(p => new PropertyCard
                {
                    Id = p.Id,
                    Title = p.Title,
                    Slug = p.Slug,
                    City = p.City,
                    CitySlug = citySlugByName.TryGetValue(p.City, out var slug) ? slug : p.City.ToLowerInvariant(),
                    Province = p.Province,
                    Neighbourhood = p.Neighbourhood,
                    PrimaryImageUrl = p.Images
                        .OrderByDescending(i => i.IsPrimary)
                        .ThenBy(i => i.DisplayOrder)
                        .Select(i => i.Url)
                        .FirstOrDefault(),
                    FromPrice = p.Units.Count == 0 ? null : p.Units.Min(u => (decimal?)u.Price),
                    MinBedrooms = p.Units.Count == 0 ? 0 : p.Units.Min(u => u.Bedrooms),
                    MinBathrooms = p.Units.Count == 0 ? 0m : p.Units.Min(u => u.Bathrooms),
                    PropertyType = p.PropertyType,
                    Tier = p.Tier,
                    TierExpiresAt = p.TierExpiresAt,
                    IsVerified = p.IsVerified,
                    PetsAllowed = p.PetsAllowed,
                    Furnished = p.Furnished,
                    CreatedAt = p.CreatedAt,
                    SpecialTitle = p.ActiveSpecial(now)?.Title
                })
                .OrderByDescending(c => c.EffectiveTier)
                .ThenByDescending(c => c.CreatedAt)
                .Take(6)
                .ToList();

            if (CurrentUser.GetId(principal) is Guid uid)
            {
                var favIds = await favorites.GetFavoritedIdsAsync(uid, latest.Select(c => c.Id), ct);
                foreach (var card in latest) card.IsFavorited = favIds.Contains(card.Id);
            }

            return Results.Ok(new HomeResponse(
                featured.Select(c => c.ToDto()).ToList(),
                latest.Select(c => c.ToDto()).ToList()));
        })
        .AllowAnonymous()
        .WithPublicCache()
        .WithName("GetHome");
    }
}
