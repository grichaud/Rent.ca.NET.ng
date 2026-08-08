using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.Favorites;

public interface IFavoriteService
{
    Task<bool> ToggleAsync(Guid userId, Guid propertyId, CancellationToken ct = default);
    Task<HashSet<Guid>> GetFavoritedIdsAsync(Guid userId, IEnumerable<Guid> propertyIds, CancellationToken ct = default);
    Task<bool> IsFavoritedAsync(Guid userId, Guid propertyId, CancellationToken ct = default);
    Task<List<FavoriteCard>> ListAsync(Guid userId, CancellationToken ct = default);
    Task<bool> RemoveAsync(Guid userId, Guid propertyId, CancellationToken ct = default);
}

public class FavoriteService : IFavoriteService
{
    private readonly AppDbContext _db;

    public FavoriteService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<bool> ToggleAsync(Guid userId, Guid propertyId, CancellationToken ct = default)
    {
        var existing = await _db.Favorites
            .FirstOrDefaultAsync(f => f.UserId == userId && f.PropertyId == propertyId, ct);

        if (existing is not null)
        {
            _db.Favorites.Remove(existing);
            await _db.SaveChangesAsync(ct);
            return false;
        }

        var propertyExists = await _db.Properties.AnyAsync(p => p.Id == propertyId, ct);
        if (!propertyExists) return false;

        _db.Favorites.Add(new Favorite
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            PropertyId = propertyId,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<HashSet<Guid>> GetFavoritedIdsAsync(
        Guid userId, IEnumerable<Guid> propertyIds, CancellationToken ct = default)
    {
        var ids = propertyIds.Distinct().ToList();
        if (ids.Count == 0) return new HashSet<Guid>();

        var favorited = await _db.Favorites
            .Where(f => f.UserId == userId && ids.Contains(f.PropertyId))
            .Select(f => f.PropertyId)
            .ToListAsync(ct);
        return favorited.ToHashSet();
    }

    public Task<bool> IsFavoritedAsync(Guid userId, Guid propertyId, CancellationToken ct = default)
        => _db.Favorites.AnyAsync(f => f.UserId == userId && f.PropertyId == propertyId, ct);

    public async Task<List<FavoriteCard>> ListAsync(Guid userId, CancellationToken ct = default)
    {
        // Pull favorites + minimal property fields. SQLite cannot ORDER BY DateTimeOffset
        // and Min(decimal) reliably, so we over-fetch and aggregate in memory.
        var rows = await _db.Favorites
            .AsNoTracking()
            .Where(f => f.UserId == userId)
            .Select(f => new
            {
                f.Id,
                f.CreatedAt,
                f.PropertyId,
                Title = f.Property.Title,
                Slug = f.Property.Slug,
                City = f.Property.City,
                Province = f.Property.Province,
                Neighbourhood = f.Property.Neighbourhood,
                PropertyType = f.Property.PropertyType,
                IsVerified = f.Property.IsVerified,
                Tier = f.Property.Tier,
                TierExpiresAt = f.Property.TierExpiresAt,
                PetsAllowed = f.Property.PetsAllowed,
                Furnished = f.Property.Furnished,
                CitySlug = _db.Cities
                    .Where(c => c.Name == f.Property.City)
                    .Select(c => c.Slug)
                    .FirstOrDefault() ?? string.Empty,
                PrimaryImageUrl = f.Property.Images
                    .OrderByDescending(i => i.IsPrimary)
                    .ThenBy(i => i.DisplayOrder)
                    .Select(i => i.Url)
                    .FirstOrDefault(),
                Units = f.Property.Units.Select(u => new { u.Price, u.Bedrooms, u.Bathrooms }).ToList()
            })
            .ToListAsync(ct);

        return rows
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new FavoriteCard
            {
                FavoriteId = r.Id,
                PropertyId = r.PropertyId,
                Title = r.Title,
                Slug = r.Slug,
                City = r.City,
                Province = r.Province,
                Neighbourhood = r.Neighbourhood,
                CitySlug = r.CitySlug,
                PrimaryImageUrl = r.PrimaryImageUrl,
                FromPrice = r.Units.Count == 0 ? null : r.Units.Min(u => (decimal?)u.Price),
                MinBedrooms = r.Units.Count == 0 ? 0 : r.Units.Min(u => u.Bedrooms),
                MinBathrooms = r.Units.Count == 0 ? 0m : r.Units.Min(u => u.Bathrooms),
                PropertyType = r.PropertyType,
                Tier = r.Tier,
                TierExpiresAt = r.TierExpiresAt,
                IsVerified = r.IsVerified,
                PetsAllowed = r.PetsAllowed,
                Furnished = r.Furnished,
                CreatedAt = r.CreatedAt
            })
            .ToList();
    }

    public async Task<bool> RemoveAsync(Guid userId, Guid propertyId, CancellationToken ct = default)
    {
        var existing = await _db.Favorites
            .FirstOrDefaultAsync(f => f.UserId == userId && f.PropertyId == propertyId, ct);
        if (existing is null) return false;

        _db.Favorites.Remove(existing);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}

public class FavoriteCard
{
    public Guid FavoriteId { get; set; }
    public Guid PropertyId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Province { get; set; } = string.Empty;
    public string? Neighbourhood { get; set; }
    public string CitySlug { get; set; } = string.Empty;
    public string? PrimaryImageUrl { get; set; }
    public decimal? FromPrice { get; set; }
    public int MinBedrooms { get; set; }
    public decimal MinBathrooms { get; set; }
    public PropertyType PropertyType { get; set; }
    public ListingTier Tier { get; set; }
    public DateTimeOffset? TierExpiresAt { get; set; }
    public ListingTier EffectiveTier => ListingTierExtensions.Resolve(Tier, TierExpiresAt);
    public bool IsVerified { get; set; }
    public bool PetsAllowed { get; set; }
    public bool Furnished { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
