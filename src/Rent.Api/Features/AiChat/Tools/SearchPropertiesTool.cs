using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.AiChat.Tools;

/// <summary>
/// Busqueda de listings para el asistente. Devuelve como mucho 5: el chat presenta una lista
/// escaneable, no una pagina de resultados.
/// </summary>
public sealed class SearchPropertiesTool : IAiTool
{
    private const int OverFetch = 20;
    private const int MaxResults = 5;

    private readonly AppDbContext _db;

    public SearchPropertiesTool(AppDbContext db) => _db = db;

    public string Name => "search_properties";

    public string Description =>
        "Search rental properties by city, type, price, bedrooms, and pet policy. Returns up to 5 matching active listings.";

    public object Parameters => new
    {
        type = "object",
        properties = new
        {
            city = new { type = "string", description = "City name (e.g. 'Toronto', 'Vancouver'). Optional." },
            property_type = new
            {
                type = "string",
                description = "Property type. Optional.",
                @enum = new[] { "apartment", "condo", "house", "townhouse", "basement", "studio", "loft", "duplex", "other" }
            },
            price_min = new { type = "number", description = "Minimum monthly rent in CAD. Optional." },
            price_max = new { type = "number", description = "Maximum monthly rent in CAD. Optional." },
            bedrooms = new { type = "integer", description = "Minimum bedrooms (0=studio). Optional." },
            pets_allowed = new { type = "boolean", description = "Pets allowed. Optional." }
        },
        required = Array.Empty<string>()
    };

    public async Task<ToolExecutionResult> ExecuteAsync(
        string argumentsJson, ToolExecutionContext context, CancellationToken ct = default)
    {
        var args = ParseArgs(argumentsJson);

        var query = _db.Properties.AsNoTracking().Where(p => p.Status == ListingStatus.Active);

        if (!string.IsNullOrWhiteSpace(args.City))
        {
            var city = args.City.Trim();
            query = query.Where(p => p.City == city);
        }
        if (args.PropertyType is { } type) query = query.Where(p => p.PropertyType == type);
        if (args.PriceMin is { } min) query = query.Where(p => p.Units.Any(u => u.Price >= min));
        if (args.PriceMax is { } max) query = query.Where(p => p.Units.Any(u => u.Price <= max));
        if (args.Bedrooms is { } beds) query = query.Where(p => p.Units.Any(u => u.Bedrooms >= beds));
        if (args.PetsAllowed == true) query = query.Where(p => p.PetsAllowed);

        // Se piden 20 ordenando por el tier ALMACENADO (que SQL si sabe ordenar) y despues se
        // reordena en memoria por el EFECTIVO: asi un listing con la vigencia caducada no se
        // cuela arriba en las recomendaciones del asistente.
        var candidates = await query
            .OrderByDescending(p => p.Tier)
            .Take(OverFetch)
            .Select(p => new
            {
                p.Id,
                p.Title,
                p.Slug,
                p.City,
                p.PropertyType,
                p.Tier,
                p.TierExpiresAt,
                p.IsVerified,
                Units = p.Units.Select(u => new { u.Bedrooms, u.Price }).ToList()
            })
            .ToListAsync(ct);

        var top = candidates
            .OrderByDescending(p => ListingTierExtensions.Resolve(p.Tier, p.TierExpiresAt))
            .ThenByDescending(p => p.IsVerified)
            .ThenBy(p => p.Title)
            .Take(MaxResults)
            .ToList();

        var cityNames = top.Select(p => p.City).Distinct().ToList();
        var citySlugs = await _db.Cities.AsNoTracking()
            .Where(c => cityNames.Contains(c.Name))
            .ToDictionaryAsync(c => c.Name, c => c.Slug, ct);

        var results = top.Select(p =>
        {
            var slug = citySlugs.TryGetValue(p.City, out var s) ? s : p.City.ToLowerInvariant();
            return new
            {
                id = p.Id,
                title = p.Title,
                city = p.City,
                propertyType = p.PropertyType.ToString(),
                fromPrice = p.Units.Count > 0 ? p.Units.Min(u => (decimal?)u.Price) : null,
                minBedrooms = p.Units.Count > 0 ? p.Units.Min(u => (int?)u.Bedrooms) : null,
                url = AiLinks.Listing(context.Locale, slug, p.Slug)
            };
        }).ToList();

        return ToolExecutionResult.Ok(new { count = results.Count, properties = results });
    }

    /// <summary>
    /// Los argumentos llegan como texto generado por el modelo, asi que cualquier campo puede
    /// faltar o venir con el tipo cambiado. Se leen uno a uno y un JSON roto degrada a "sin
    /// filtros" en vez de tumbar la conversacion.
    /// </summary>
    private static SearchArgs ParseArgs(string argumentsJson)
    {
        if (string.IsNullOrWhiteSpace(argumentsJson)) return new SearchArgs();

        try
        {
            using var doc = JsonDocument.Parse(argumentsJson);
            var root = doc.RootElement;

            var args = new SearchArgs
            {
                City = ToolArgs.String(root, "city"),
                PriceMin = ToolArgs.Decimal(root, "price_min"),
                PriceMax = ToolArgs.Decimal(root, "price_max"),
                Bedrooms = ToolArgs.Int(root, "bedrooms"),
                PetsAllowed = ToolArgs.Bool(root, "pets_allowed")
            };

            var typeText = ToolArgs.String(root, "property_type");
            if (!string.IsNullOrWhiteSpace(typeText) &&
                Enum.TryParse<PropertyType>(typeText, ignoreCase: true, out var type))
            {
                args.PropertyType = type;
            }

            return args;
        }
        catch (JsonException)
        {
            return new SearchArgs();
        }
    }

    private sealed class SearchArgs
    {
        public string? City { get; set; }
        public PropertyType? PropertyType { get; set; }
        public decimal? PriceMin { get; set; }
        public decimal? PriceMax { get; set; }
        public int? Bedrooms { get; set; }
        public bool? PetsAllowed { get; set; }
    }
}

/// <summary>Lectura defensiva de los argumentos que genera el modelo.</summary>
internal static class ToolArgs
{
    public static string? String(JsonElement root, string name) =>
        root.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    public static decimal? Decimal(JsonElement root, string name) =>
        root.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number ? p.GetDecimal() : null;

    public static int? Int(JsonElement root, string name) =>
        root.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number ? p.GetInt32() : null;

    public static bool? Bool(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var p)) return null;
        return p.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => null
        };
    }
}
