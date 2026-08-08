namespace Rent.Api.Domain;

public class PopularSearch
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string NormalizedQuery { get; set; } = string.Empty;

    public string CitySlug { get; set; } = string.Empty;

    public int SearchCount { get; set; }

    public DateTimeOffset LastSearchedAt { get; set; } = DateTimeOffset.UtcNow;
}
