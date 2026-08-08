using Rent.Api.Domain;

namespace Rent.Api.Features.Maps;

public class MapMarker
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string CitySlug { get; set; } = string.Empty;
    public double Lat { get; set; }
    public double Lng { get; set; }
    public decimal? FromPrice { get; set; }
    public int MinBedrooms { get; set; }
    public PropertyType PropertyType { get; set; }
    public ListingTier Tier { get; set; }
    public DateTimeOffset? TierExpiresAt { get; set; }
    public ListingTier EffectiveTier => ListingTierExtensions.Resolve(Tier, TierExpiresAt);
    public string? PrimaryImageUrl { get; set; }
}
