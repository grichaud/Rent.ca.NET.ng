namespace Rent.Api.Domain;

public class Property
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid LandlordProfileId { get; set; }

    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? DescriptionFr { get; set; }

    public PropertyType PropertyType { get; set; }
    public ListingStatus Status { get; set; } = ListingStatus.Draft;
    public ListingTier Tier { get; set; } = ListingTier.Limited;
    public DateTimeOffset? TierExpiresAt { get; set; }

    public string StreetAddress { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Province { get; set; } = string.Empty;
    public string PostalCode { get; set; } = string.Empty;
    public string? Neighbourhood { get; set; }

    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public int? YearBuilt { get; set; }
    public int? TotalFloors { get; set; }
    public int? TotalUnits { get; set; }

    public string? ParkingType { get; set; }
    public bool PetsAllowed { get; set; }
    public bool Furnished { get; set; }

    public LeaseTerm? LeaseTerm { get; set; }

    public string Slug { get; set; } = string.Empty;
    public bool IsVerified { get; set; }
    public int ViewCount { get; set; }
    public int LeadCount { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public LandlordProfile LandlordProfile { get; set; } = default!;
    public ICollection<Unit> Units { get; set; } = new List<Unit>();
    public ICollection<PropertyImage> Images { get; set; } = new List<PropertyImage>();
    public ICollection<Amenity> Amenities { get; set; } = new List<Amenity>();
    public ICollection<ContactInquiry> Inquiries { get; set; } = new List<ContactInquiry>();
    public ICollection<RentSpecial> RentSpecials { get; set; } = new List<RentSpecial>();
}
