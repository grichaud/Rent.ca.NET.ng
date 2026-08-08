using Microsoft.Extensions.Options;

namespace Rent.Api.Infrastructure.Storage;

public class LocalImageStorage : IImageStorage
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".gif"
    };

    private readonly IWebHostEnvironment _env;
    private readonly StorageOptions _options;
    private readonly ILogger<LocalImageStorage> _logger;

    public LocalImageStorage(IWebHostEnvironment env, IOptions<StorageOptions> options, ILogger<LocalImageStorage> logger)
    {
        _env = env;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<string> SaveAsync(Guid propertyId, IFormFile file, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(file.FileName);
        if (!AllowedExtensions.Contains(ext))
            throw new InvalidOperationException($"Unsupported file extension: {ext}");

        var filename = $"{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
        var relDir = Path.Combine(_options.LocalPath, propertyId.ToString("N"));
        var absDir = Path.Combine(_env.WebRootPath, relDir);
        Directory.CreateDirectory(absDir);

        var absPath = Path.Combine(absDir, filename);
        await using (var fs = File.Create(absPath))
        {
            await file.CopyToAsync(fs, ct);
        }

        var publicUrl = $"/{_options.LocalPath}/{propertyId:N}/{filename}".Replace('\\', '/');
        _logger.LogInformation("Saved image for property {PropertyId} at {Url}", propertyId, publicUrl);
        return publicUrl;
    }

    public Task DeleteAsync(string url, CancellationToken ct = default)
    {
        if (!url.StartsWith('/')) return Task.CompletedTask;
        var relPath = url.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        var absPath = Path.Combine(_env.WebRootPath, relPath);
        if (File.Exists(absPath))
        {
            try { File.Delete(absPath); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to delete image {Path}", absPath); }
        }
        return Task.CompletedTask;
    }
}
