using Rent.Api.Domain;

namespace Rent.Api.Features.Search;

/// <summary>
/// Construye un <see cref="SearchQuery"/> desde el query string.
///
/// Se hace a mano en vez de con [AsParameters] porque el filtro de tipos es multi-valor y
/// debe aceptar las dos formas que ya existen en el origen: repetida
/// (`types=Apartment&amp;types=Condo`) y separada por comas (`types=Apartment,Condo`).
/// Tambien se conserva el parametro `type` en singular, que el origen documenta como legacy.
/// </summary>
public static class SearchQueryBinding
{
    public const int MaxPageSize = 100;

    public static SearchQuery FromQuery(HttpRequest request, string citySlug)
    {
        var q = request.Query;

        var query = new SearchQuery
        {
            CitySlug = citySlug,
            MinPrice = ParseDecimal(q["minPrice"]),
            MaxPrice = ParseDecimal(q["maxPrice"]),
            Bedrooms = ParseInt(q["bedrooms"]),
            Bathrooms = ParseInt(q["bathrooms"]),
            PetsAllowed = ParseBool(q["petsAllowed"]),
            Furnished = ParseBool(q["furnished"]),
            HasParking = ParseBool(q["hasParking"]),
            Types = ParseTypes(q["types"]),
            Type = ParseEnum<PropertyType>(q["type"]),
            Sort = ParseEnum<SearchSort>(q["sort"]) ?? SearchSort.Newest,
            View = ParseEnum<SearchView>(q["view"]) ?? SearchView.Grid,
            Page = ParseInt(q["page"]) ?? 1,
            PageSize = ParseInt(q["pageSize"]) ?? 24
        };

        // Un pageSize sin tope permitiria pedir la tabla entera en una sola llamada.
        if (query.Page < 1) query.Page = 1;
        if (query.PageSize < 1) query.PageSize = 24;
        if (query.PageSize > MaxPageSize) query.PageSize = MaxPageSize;

        return query;
    }

    private static PropertyType[]? ParseTypes(IEnumerable<string?> values)
    {
        var parsed = values
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .SelectMany(v => v!.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Select(ParseEnum<PropertyType>)
            .Where(t => t.HasValue)
            .Select(t => t!.Value)
            .Distinct()
            .ToArray();

        return parsed.Length == 0 ? null : parsed;
    }

    private static T? ParseEnum<T>(string? value) where T : struct, Enum
        => Enum.TryParse<T>(value, ignoreCase: true, out var parsed) ? parsed : null;

    private static decimal? ParseDecimal(string? value)
        => decimal.TryParse(value, System.Globalization.NumberStyles.Number,
            System.Globalization.CultureInfo.InvariantCulture, out var parsed) ? parsed : null;

    private static int? ParseInt(string? value)
        => int.TryParse(value, System.Globalization.NumberStyles.Integer,
            System.Globalization.CultureInfo.InvariantCulture, out var parsed) ? parsed : null;

    private static bool ParseBool(string? value)
        => bool.TryParse(value, out var parsed) ? parsed : value == "1";
}
