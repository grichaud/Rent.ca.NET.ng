namespace Rent.Api.Domain;

public static class ListingTierExtensions
{
    public static ListingTier EffectiveTier(this Property property, DateTimeOffset? now = null)
    {
        ArgumentNullException.ThrowIfNull(property);
        return Resolve(property.Tier, property.TierExpiresAt, now);
    }

    public static ListingTier EffectiveTier(this LandlordProfile landlord, DateTimeOffset? now = null)
    {
        ArgumentNullException.ThrowIfNull(landlord);
        return Resolve(landlord.Tier, landlord.TierExpiresAt, now);
    }

    public static RentSpecial? ActiveSpecial(this Property property, DateTimeOffset? now = null)
    {
        ArgumentNullException.ThrowIfNull(property);
        if (property.RentSpecials.Count == 0) return null;

        var asOf = now ?? DateTimeOffset.UtcNow;
        foreach (var special in property.RentSpecials)
        {
            if (IsSpecialActive(special, asOf)) return special;
        }
        return null;
    }

    public static bool IsActiveAt(this RentSpecial special, DateTimeOffset? now = null)
    {
        ArgumentNullException.ThrowIfNull(special);
        return IsSpecialActive(special, now ?? DateTimeOffset.UtcNow);
    }

    public static ListingTier Resolve(ListingTier tier, DateTimeOffset? expiresAt, DateTimeOffset? now = null)
    {
        if (!expiresAt.HasValue) return tier;
        var asOf = now ?? DateTimeOffset.UtcNow;
        return expiresAt.Value < asOf ? ListingTier.Limited : tier;
    }

    private static bool IsSpecialActive(RentSpecial special, DateTimeOffset asOf)
    {
        if (!special.IsActive) return false;
        if (special.StartDate.HasValue && special.StartDate.Value > asOf) return false;
        if (special.EndDate.HasValue && special.EndDate.Value < asOf) return false;
        return true;
    }
}
