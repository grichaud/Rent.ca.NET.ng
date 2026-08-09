using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.AiChat.Tools;

/// <summary>
/// Ficha completa de un listing. Es la herramienta que responde "¿admite perros?" cuando el
/// usuario ya esta mirando un piso: el prompt recibe su id en el contexto de la sesion.
/// </summary>
public sealed class GetPropertyDetailsTool : IAiTool
{
    private readonly AppDbContext _db;

    public GetPropertyDetailsTool(AppDbContext db) => _db = db;

    public string Name => "get_property_details";

    public string Description =>
        "Get full details for a specific rental property by ID: address, units, amenities, parking, pets, furnished status.";

    public object Parameters => new
    {
        type = "object",
        properties = new
        {
            property_id = new { type = "string", description = "GUID of the property." }
        },
        required = new[] { "property_id" }
    };

    public async Task<ToolExecutionResult> ExecuteAsync(
        string argumentsJson, ToolExecutionContext context, CancellationToken ct = default)
    {
        Guid propertyId;
        try
        {
            using var doc = JsonDocument.Parse(argumentsJson);
            var raw = ToolArgs.String(doc.RootElement, "property_id");
            if (!Guid.TryParse(raw, out propertyId))
                return ToolExecutionResult.Fail(new { message = "property_id must be a valid GUID." });
        }
        catch (JsonException)
        {
            return ToolExecutionResult.Fail(new { message = "Invalid arguments." });
        }

        var property = await _db.Properties.AsNoTracking()
            .Where(x => x.Id == propertyId)
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.Slug,
                x.StreetAddress,
                x.City,
                x.Province,
                x.PostalCode,
                x.Neighbourhood,
                x.PropertyType,
                x.PetsAllowed,
                x.Furnished,
                x.ParkingType,
                x.YearBuilt,
                x.LeaseTerm,
                Units = x.Units.Select(u => new { u.Bedrooms, u.Bathrooms, u.SqFt, u.Price, u.AvailableUnits }).ToList(),
                Amenities = x.Amenities.Select(a => a.Name).ToList()
            })
            .FirstOrDefaultAsync(ct);

        if (property is null)
            return ToolExecutionResult.Fail(new { found = false, message = "Property not found." });

        var citySlug = await _db.Cities.AsNoTracking()
            .Where(c => c.Name == property.City)
            .Select(c => c.Slug)
            .FirstOrDefaultAsync(ct) ?? property.City.ToLowerInvariant();

        return ToolExecutionResult.Ok(new
        {
            found = true,
            id = property.Id,
            title = property.Title,
            propertyType = property.PropertyType.ToString(),
            address = property.StreetAddress,
            city = property.City,
            province = property.Province,
            postalCode = property.PostalCode,
            neighbourhood = property.Neighbourhood,
            petsAllowed = property.PetsAllowed,
            furnished = property.Furnished,
            parkingType = property.ParkingType?.ToString(),
            yearBuilt = property.YearBuilt,
            leaseTerm = property.LeaseTerm?.ToString(),
            units = property.Units,
            amenities = property.Amenities,
            url = AiLinks.Listing(context.Locale, citySlug, property.Slug)
        });
    }
}
