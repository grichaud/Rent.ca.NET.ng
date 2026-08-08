namespace Rent.Api.Domain;

public class Unit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PropertyId { get; set; }

    public string? Name { get; set; }
    public int Bedrooms { get; set; }
    public decimal Bathrooms { get; set; }
    public int? SqFt { get; set; }
    public decimal Price { get; set; }
    public decimal? PriceMax { get; set; }
    public int AvailableUnits { get; set; } = 1;
    public DateOnly? AvailableDate { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Property Property { get; set; } = default!;
}
