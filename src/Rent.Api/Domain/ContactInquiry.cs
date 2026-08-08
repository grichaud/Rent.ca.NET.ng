namespace Rent.Api.Domain;

public class ContactInquiry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PropertyId { get; set; }
    public Guid? SenderUserId { get; set; }

    public string SenderName { get; set; } = string.Empty;
    public string SenderEmail { get; set; } = string.Empty;
    public string? SenderPhone { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateOnly? MoveInDate { get; set; }

    public bool IsRead { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Property Property { get; set; } = default!;
    public ApplicationUser? SenderUser { get; set; }
}
