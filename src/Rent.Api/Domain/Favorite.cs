namespace Rent.Api.Domain;

public class Favorite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid PropertyId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ApplicationUser User { get; set; } = default!;
    public Property Property { get; set; } = default!;
}
