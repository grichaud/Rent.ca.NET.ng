namespace Rent.Api.Domain;

public class Amenity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? Category { get; set; }
    public string? Icon { get; set; }

    public ICollection<Property> Properties { get; set; } = new List<Property>();
}
