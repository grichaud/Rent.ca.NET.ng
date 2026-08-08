namespace Rent.Api.Domain;

public class City
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;
    public string Province { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;

    public string? ImageUrl { get; set; }
    public int ListingCount { get; set; }
    public bool IsFeatured { get; set; }

    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
