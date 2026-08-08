namespace Rent.Api.Infrastructure.Storage;

public interface IImageStorage
{
    Task<string> SaveAsync(Guid propertyId, IFormFile file, CancellationToken ct = default);
    Task DeleteAsync(string url, CancellationToken ct = default);
}

public class StorageOptions
{
    public string Provider { get; set; } = "Local";
    public string LocalPath { get; set; } = "uploads";
    public string ContainerName { get; set; } = "property-images";
}
