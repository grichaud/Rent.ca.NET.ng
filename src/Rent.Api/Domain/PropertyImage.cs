namespace Rent.Api.Domain;

public class PropertyImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PropertyId { get; set; }

    public string Url { get; set; } = string.Empty;
    public string? AltText { get; set; }
    public bool IsPrimary { get; set; }
    public int DisplayOrder { get; set; }
    public string? Category { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Property Property { get; set; } = default!;
}
