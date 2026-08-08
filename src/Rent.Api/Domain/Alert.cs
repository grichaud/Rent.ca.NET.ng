namespace Rent.Api.Domain;

public class Alert
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    /// <summary>
    /// Optional user-facing label ("Downtown 2BR under $2500"). Used in the digest subject
    /// so a renter with several alerts can tell at a glance which one fired.
    /// </summary>
    public string? Name { get; set; }

    /// <summary>
    /// UI culture captured when the alert was created ("en" / "fr"). The digest engine runs
    /// without an HTTP request, so there is no ambient culture to fall back on at send time.
    /// </summary>
    public string Locale { get; set; } = "en";

    public string? City { get; set; }
    public PropertyType? PropertyType { get; set; }
    public decimal? PriceMin { get; set; }
    public decimal? PriceMax { get; set; }
    public int? BedroomsMin { get; set; }
    public decimal? BathroomsMin { get; set; }
    public bool? PetsAllowed { get; set; }

    public AlertFrequency Frequency { get; set; } = AlertFrequency.Daily;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset? LastSentAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ApplicationUser User { get; set; } = default!;
}
