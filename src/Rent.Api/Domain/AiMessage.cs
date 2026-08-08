namespace Rent.Api.Domain;

public class AiMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public AiMessageRole Role { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? ToolName { get; set; }
    public string? ToolArgsJson { get; set; }
    public string? ToolResultJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public AiConversation Conversation { get; set; } = default!;
}
