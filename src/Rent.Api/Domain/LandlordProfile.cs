namespace Rent.Api.Domain;

public class LandlordProfile
{
    public Guid Id { get; set; }

    public string? CompanyName { get; set; }
    public string? LogoUrl { get; set; }
    public string? Website { get; set; }
    public string? Description { get; set; }

    public bool IsVerified { get; set; }
    public ListingTier Tier { get; set; } = ListingTier.Limited;
    public DateTimeOffset? TierExpiresAt { get; set; }
    public int TotalListings { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ApplicationUser User { get; set; } = default!;
    public ICollection<Property> Properties { get; set; } = new List<Property>();
}
