using Microsoft.AspNetCore.Identity;

namespace Rent.Api.Domain;

public class ApplicationUser : IdentityUser<Guid>
{
    public string? FullName { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public LandlordProfile? LandlordProfile { get; set; }
}
