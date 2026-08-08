using System.Security.Claims;
using Microsoft.AspNetCore.Identity;

namespace Rent.Api.Infrastructure.Identity;

public static class ExternalLoginInfoExtensions
{
    public static string? GetEmail(this ExternalLoginInfo info)
        => info.Principal.FindFirstValue(ClaimTypes.Email);

    public static string? GetFullName(this ExternalLoginInfo info)
    {
        var name = info.Principal.FindFirstValue(ClaimTypes.Name);
        if (!string.IsNullOrWhiteSpace(name)) return name;

        var given = info.Principal.FindFirstValue(ClaimTypes.GivenName);
        var family = info.Principal.FindFirstValue(ClaimTypes.Surname);
        var combined = $"{given} {family}".Trim();
        return string.IsNullOrWhiteSpace(combined) ? null : combined;
    }
}
