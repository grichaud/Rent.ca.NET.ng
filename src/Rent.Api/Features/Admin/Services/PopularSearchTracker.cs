using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.Admin.Services;

public class PopularSearchTracker : IPopularSearchTracker
{
    private const string EmptySentinel = "(empty)";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PopularSearchTracker> _logger;

    public PopularSearchTracker(IServiceScopeFactory scopeFactory, ILogger<PopularSearchTracker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public Task TrackAsync(string? rawQuery, string? citySlug, CancellationToken ct = default)
    {
        // Fire-and-forget: never block the search response. Capture exceptions because the
        // request scope (and DbContext) may have been disposed by the time the task runs.
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await UpsertAsync(db, rawQuery, citySlug, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "popular search increment failed for query='{Query}' city='{City}'",
                    rawQuery, citySlug);
            }
        }, ct);
        return Task.CompletedTask;
    }

    public async Task TrackInlineAsync(string? rawQuery, string? citySlug, CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await UpsertAsync(db, rawQuery, citySlug, ct);
    }

    private static async Task UpsertAsync(AppDbContext db, string? rawQuery, string? citySlug, CancellationToken ct)
    {
        var normalized = Normalize(rawQuery);
        var slug = (citySlug ?? string.Empty).Trim().ToLowerInvariant();
        var now = DateTimeOffset.UtcNow;

        var providerName = db.Database.ProviderName ?? string.Empty;

        if (providerName.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            // SQLite UPSERT
            await db.Database.ExecuteSqlInterpolatedAsync($@"
INSERT INTO PopularSearches (Id, NormalizedQuery, CitySlug, SearchCount, LastSearchedAt)
VALUES ({Guid.NewGuid()}, {normalized}, {slug}, 1, {now})
ON CONFLICT(NormalizedQuery, CitySlug)
DO UPDATE SET
    SearchCount = SearchCount + 1,
    LastSearchedAt = {now}", ct);
            return;
        }

        // SQL Server MERGE
        await db.Database.ExecuteSqlInterpolatedAsync($@"
MERGE [dbo].[PopularSearches] AS target
USING (SELECT {normalized} AS NormalizedQuery, {slug} AS CitySlug) AS src
ON target.NormalizedQuery = src.NormalizedQuery AND target.CitySlug = src.CitySlug
WHEN MATCHED THEN
    UPDATE SET SearchCount = target.SearchCount + 1, LastSearchedAt = {now}
WHEN NOT MATCHED THEN
    INSERT (Id, NormalizedQuery, CitySlug, SearchCount, LastSearchedAt)
    VALUES (NEWID(), src.NormalizedQuery, src.CitySlug, 1, {now});", ct);
    }

    private static string Normalize(string? rawQuery)
    {
        var trimmed = (rawQuery ?? string.Empty).Trim().ToLowerInvariant();
        return string.IsNullOrEmpty(trimmed) ? EmptySentinel : trimmed;
    }
}
