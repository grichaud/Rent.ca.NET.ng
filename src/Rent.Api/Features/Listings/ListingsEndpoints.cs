using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Favorites;
using Rent.Api.Features.Search;
using Rent.Api.Features.Shared;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.Listings;

public sealed record UnitDto(
    Guid Id, string? Name, int Bedrooms, decimal Bathrooms, int? SqFt,
    decimal Price, decimal? PriceMax, int AvailableUnits, DateOnly? AvailableDate);

public sealed record ListingImageDto(
    Guid Id, string Url, string? AltText, bool IsPrimary, int DisplayOrder, string? Category);

public sealed record AmenityDto(Guid Id, string Name, string? Category, string? Icon);

public sealed record LandlordDto(
    Guid Id, string? CompanyName, string? LogoUrl, string? Website, string? Description,
    bool IsVerified, ListingTier Tier, int TotalListings);

public sealed record RentSpecialDto(
    string Title, string? Description, DateTimeOffset? StartDate, DateTimeOffset? EndDate);

public sealed record ListingDetailDto(
    Guid Id,
    string Title,
    string Slug,
    string? Description,
    string? DescriptionFr,
    PropertyType PropertyType,
    ListingTier Tier,
    string StreetAddress,
    string City,
    string CitySlug,
    string Province,
    string PostalCode,
    string? Neighbourhood,
    double? Latitude,
    double? Longitude,
    int? YearBuilt,
    int? TotalFloors,
    int? TotalUnits,
    string? ParkingType,
    bool PetsAllowed,
    bool Furnished,
    LeaseTerm? LeaseTerm,
    bool IsVerified,
    int ViewCount,
    DateTimeOffset CreatedAt,
    bool IsFavorited,
    IReadOnlyList<UnitDto> Units,
    IReadOnlyList<ListingImageDto> Images,
    IReadOnlyList<AmenityDto> Amenities,
    LandlordDto? Landlord,
    RentSpecialDto? ActiveSpecial,
    IReadOnlyList<PropertyCardDto> SimilarListings);

public static class ListingsEndpoints
{
    public static void MapListingsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/listings/{citySlug}/{propertySlug}", async (
            string citySlug,
            string propertySlug,
            AppDbContext db,
            IFavoriteService favorites,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var city = await db.Cities.AsNoTracking().FirstOrDefaultAsync(c => c.Slug == citySlug, ct);
            if (city is null) return Results.NotFound(new { error = "city_not_found", citySlug });

            var property = await db.Properties
                .AsNoTracking()
                .Include(p => p.Images)
                .Include(p => p.Units)
                .Include(p => p.Amenities)
                .Include(p => p.RentSpecials)
                .Include(p => p.LandlordProfile)
                .FirstOrDefaultAsync(p =>
                    p.Slug == propertySlug &&
                    p.City == city.Name &&
                    p.Status == ListingStatus.Active, ct);

            if (property is null) return Results.NotFound(new { error = "listing_not_found", propertySlug });

            // Igual que el origen. Ojo: en SSR esto se cuenta una sola vez porque el
            // HttpClient de Angular transfiere la respuesta al cliente (transfer cache)
            // en vez de repetir la peticion durante la hidratacion.
            await db.Properties
                .Where(p => p.Id == property.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(pp => pp.ViewCount, pp => pp.ViewCount + 1), ct);

            var isFavorited = false;
            if (CurrentUser.GetId(principal) is Guid uid)
                isFavorited = await favorites.IsFavoritedAsync(uid, property.Id, ct);

            var now = DateTimeOffset.UtcNow;

            var similarRaw = await db.Properties
                .AsNoTracking()
                .Include(p => p.Units)
                .Include(p => p.Images)
                .Include(p => p.RentSpecials)
                .Where(p => p.Id != property.Id
                    && p.Status == ListingStatus.Active
                    && (p.City == property.City || p.PropertyType == property.PropertyType))
                .OrderByDescending(p => p.City == property.City && p.PropertyType == property.PropertyType)
                .Take(12)
                .ToListAsync(ct);

            var citySlugByName = await db.Cities.AsNoTracking()
                .ToDictionaryAsync(c => c.Name, c => c.Slug, ct);

            var similar = similarRaw
                .Select(p => new PropertyCard
                {
                    Id = p.Id,
                    Title = p.Title,
                    Slug = p.Slug,
                    City = p.City,
                    CitySlug = citySlugByName.TryGetValue(p.City, out var cs) ? cs : p.City.ToLowerInvariant(),
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
                .Take(6)
                .Select(c => c.ToDto())
                .ToList();

            var special = property.ActiveSpecial(now);

            var dto = new ListingDetailDto(
                property.Id,
                property.Title,
                property.Slug,
                property.Description,
                property.DescriptionFr,
                property.PropertyType,
                ListingTierExtensions.Resolve(property.Tier, property.TierExpiresAt),
                property.StreetAddress,
                property.City,
                city.Slug,
                property.Province,
                property.PostalCode,
                property.Neighbourhood,
                property.Latitude,
                property.Longitude,
                property.YearBuilt,
                property.TotalFloors,
                property.TotalUnits,
                property.ParkingType,
                property.PetsAllowed,
                property.Furnished,
                property.LeaseTerm,
                property.IsVerified,
                property.ViewCount,
                property.CreatedAt,
                isFavorited,
                property.Units
                    .OrderBy(u => u.Bedrooms).ThenBy(u => u.Price)
                    .Select(u => new UnitDto(u.Id, u.Name, u.Bedrooms, u.Bathrooms, u.SqFt,
                        u.Price, u.PriceMax, u.AvailableUnits, u.AvailableDate))
                    .ToList(),
                property.Images
                    .OrderByDescending(i => i.IsPrimary).ThenBy(i => i.DisplayOrder)
                    .Select(i => new ListingImageDto(i.Id, i.Url, i.AltText, i.IsPrimary, i.DisplayOrder, i.Category))
                    .ToList(),
                property.Amenities
                    .OrderBy(a => a.Category).ThenBy(a => a.Name)
                    .Select(a => new AmenityDto(a.Id, a.Name, a.Category, a.Icon))
                    .ToList(),
                property.LandlordProfile is null ? null : new LandlordDto(
                    property.LandlordProfile.Id,
                    property.LandlordProfile.CompanyName,
                    property.LandlordProfile.LogoUrl,
                    property.LandlordProfile.Website,
                    property.LandlordProfile.Description,
                    property.LandlordProfile.IsVerified,
                    ListingTierExtensions.Resolve(property.LandlordProfile.Tier, property.LandlordProfile.TierExpiresAt),
                    property.LandlordProfile.TotalListings),
                special is null ? null : new RentSpecialDto(
                    special.Title, special.Description, special.StartDate, special.EndDate),
                similar);

            return Results.Ok(dto);
        })
        .AllowAnonymous()
        .WithName("GetListingDetail");
    }
}
