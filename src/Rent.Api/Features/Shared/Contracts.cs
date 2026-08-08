using Rent.Api.Domain;
using Rent.Api.Features.Search;

namespace Rent.Api.Features.Shared;

/// <summary>
/// Contratos publicos de la API. Se serializan estos DTOs y NUNCA las entidades de EF:
/// Property.Amenities <-> Amenity.Properties es una referencia circular, y las entidades
/// arrastran campos que no deben salir a la red.
///
/// `Tier` ya viaja resuelto (EffectiveTier): el cliente no deberia tener que reimplementar
/// la regla de expiracion que vive en ListingTierExtensions.
/// </summary>
public sealed record PropertyCardDto(
    Guid Id,
    string Title,
    string Slug,
    string City,
    string CitySlug,
    string Province,
    string? Neighbourhood,
    string? PrimaryImageUrl,
    decimal? FromPrice,
    decimal? ToPrice,
    int MinBedrooms,
    int? MaxBedrooms,
    decimal MinBathrooms,
    PropertyType PropertyType,
    ListingTier Tier,
    bool IsVerified,
    bool PetsAllowed,
    bool Furnished,
    bool IsFavorited,
    DateTimeOffset CreatedAt,
    string? SpecialTitle);

public sealed record CityDto(
    string Slug,
    string Name,
    string Province,
    string? ImageUrl,
    int ListingCount,
    bool IsFeatured,
    double? Latitude,
    double? Longitude);

public static class ContractMappings
{
    public static PropertyCardDto ToDto(this PropertyCard c) => new(
        c.Id,
        c.Title,
        c.Slug,
        c.City,
        c.CitySlug,
        c.Province,
        c.Neighbourhood,
        c.PrimaryImageUrl,
        c.FromPrice,
        c.ToPrice,
        c.MinBedrooms,
        c.MaxBedrooms,
        c.MinBathrooms,
        c.PropertyType,
        c.EffectiveTier,
        c.IsVerified,
        c.PetsAllowed,
        c.Furnished,
        c.IsFavorited,
        c.CreatedAt,
        c.SpecialTitle);

    public static CityDto ToDto(this City c) => new(
        c.Slug,
        c.Name,
        c.Province,
        c.ImageUrl,
        c.ListingCount,
        c.IsFeatured,
        c.Latitude,
        c.Longitude);
}
