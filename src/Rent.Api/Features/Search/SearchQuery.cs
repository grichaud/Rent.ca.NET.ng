using Rent.Api.Domain;

namespace Rent.Api.Features.Search;

public enum SearchSort
{
    Newest,
    PriceAsc,
    PriceDesc,
    Popular
}

public enum SearchView
{
    Grid,
    List,
    Map
}

public class SearchQuery
{
    public string CitySlug { get; set; } = string.Empty;
    public decimal? MinPrice { get; set; }
    public decimal? MaxPrice { get; set; }
    public int? Bedrooms { get; set; }
    public int? Bathrooms { get; set; }

    /// Multi-select property types (form posts as `Types=Apartment&Types=Condo`).
    public PropertyType[]? Types { get; set; }

    /// Legacy single-select param. If set and Types is empty, treated as a single Types entry.
    public PropertyType? Type { get; set; }

    public bool PetsAllowed { get; set; }
    public bool Furnished { get; set; }
    public bool HasParking { get; set; }

    public SearchSort Sort { get; set; } = SearchSort.Newest;
    public SearchView View { get; set; } = SearchView.Grid;

    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 24;

    public PropertyType[] EffectiveTypes()
    {
        if (Types is { Length: > 0 }) return Types;
        if (Type.HasValue) return new[] { Type.Value };
        return Array.Empty<PropertyType>();
    }
}

public class PropertyCard
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string CitySlug { get; set; } = string.Empty;
    public string Province { get; set; } = string.Empty;
    public string? Neighbourhood { get; set; }
    public string? PrimaryImageUrl { get; set; }
    public decimal? FromPrice { get; set; }
    public decimal? ToPrice { get; set; }
    public int MinBedrooms { get; set; }
    public int? MaxBedrooms { get; set; }
    public decimal MinBathrooms { get; set; }
    public PropertyType PropertyType { get; set; }
    public ListingTier Tier { get; set; }
    public DateTimeOffset? TierExpiresAt { get; set; }
    public ListingTier EffectiveTier => ListingTierExtensions.Resolve(Tier, TierExpiresAt);
    public bool IsVerified { get; set; }
    public bool PetsAllowed { get; set; }
    public bool Furnished { get; set; }
    public bool IsFavorited { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string? SpecialTitle { get; set; }
}

public class SearchResult
{
    public City? City { get; set; }
    public IReadOnlyList<PropertyCard> Properties { get; set; } = [];
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling((double)TotalCount / PageSize);
}
