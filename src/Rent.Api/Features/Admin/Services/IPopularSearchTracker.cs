namespace Rent.Api.Features.Admin.Services;

public interface IPopularSearchTracker
{
    Task TrackAsync(string? rawQuery, string? citySlug, CancellationToken ct = default);
    Task TrackInlineAsync(string? rawQuery, string? citySlug, CancellationToken ct = default);
}
