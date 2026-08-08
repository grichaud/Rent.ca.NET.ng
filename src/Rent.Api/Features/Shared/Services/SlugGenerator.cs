using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.Shared.Services;

public static partial class SlugGenerator
{
    public static string From(string text)
    {
        var lowered = (text ?? string.Empty).ToLowerInvariant();
        var clean = NonAlphaNumeric().Replace(lowered, "-").Trim('-');
        return clean.Length > 150 ? clean[..150] : clean;
    }

    public static async Task<string> UniqueAsync(
        AppDbContext db,
        string baseSlug,
        Guid? excludePropertyId = null,
        CancellationToken ct = default)
    {
        var slug = baseSlug;
        var suffix = 1;
        while (await db.Properties.AnyAsync(p => p.Slug == slug && p.Id != excludePropertyId, ct))
        {
            slug = $"{baseSlug}-{suffix++}";
        }
        return slug;
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonAlphaNumeric();
}
