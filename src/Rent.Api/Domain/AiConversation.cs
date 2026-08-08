namespace Rent.Api.Domain;

public class AiConversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? UserId { get; set; }
    public Guid? SessionId { get; set; }
    public string? Title { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ApplicationUser? User { get; set; }
    public ICollection<AiMessage> Messages { get; set; } = new List<AiMessage>();
}
