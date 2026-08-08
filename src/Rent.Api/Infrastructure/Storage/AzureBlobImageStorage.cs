using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Options;

namespace Rent.Api.Infrastructure.Storage;

public class AzureBlobImageStorage : IImageStorage
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".gif"
    };

    private readonly BlobContainerClient _container;
    private readonly ILogger<AzureBlobImageStorage> _logger;

    public AzureBlobImageStorage(
        IConfiguration configuration,
        IOptions<StorageOptions> options,
        ILogger<AzureBlobImageStorage> logger)
    {
        _logger = logger;

        var connectionString = configuration.GetConnectionString("AzureStorage")
            ?? throw new InvalidOperationException("ConnectionStrings:AzureStorage is not configured.");

        var serviceClient = new BlobServiceClient(connectionString);
        _container = serviceClient.GetBlobContainerClient(options.Value.ContainerName);
        _container.CreateIfNotExists(PublicAccessType.Blob);
    }

    public async Task<string> SaveAsync(Guid propertyId, IFormFile file, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(file.FileName);
        if (!AllowedExtensions.Contains(ext))
            throw new InvalidOperationException($"Unsupported file extension: {ext}");

        var blobName = $"{propertyId:N}/{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
        var blob = _container.GetBlobClient(blobName);

        var contentType = GuessContentType(ext);
        await using var stream = file.OpenReadStream();
        await blob.UploadAsync(
            stream,
            new BlobHttpHeaders { ContentType = contentType },
            cancellationToken: ct);

        _logger.LogInformation("Uploaded blob {BlobName} for property {PropertyId}", blobName, propertyId);
        return blob.Uri.ToString();
    }

    public async Task DeleteAsync(string url, CancellationToken ct = default)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return;

        var containerPrefix = _container.Uri.AbsolutePath.TrimEnd('/') + "/";
        var idx = uri.AbsolutePath.IndexOf(containerPrefix, StringComparison.OrdinalIgnoreCase);
        if (idx < 0)
            return;

        var blobName = uri.AbsolutePath[(idx + containerPrefix.Length)..];
        try
        {
            await _container.DeleteBlobIfExistsAsync(blobName, cancellationToken: ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete blob {BlobName}", blobName);
        }
    }

    private static string GuessContentType(string ext) => ext.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".gif" => "image/gif",
        _ => "application/octet-stream"
    };
}
