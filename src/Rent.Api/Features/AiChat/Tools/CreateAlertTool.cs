using System.Text.Json;
using Rent.Api.Domain;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.AiChat.Tools;

/// <summary>
/// Crea una alerta desde la conversacion. Es la unica herramienta que ESCRIBE, y la unica que
/// exige cuenta: sin usuario no hay a quien mandarle el digest.
/// </summary>
public sealed class CreateAlertTool : IAiTool
{
    private readonly AppDbContext _db;

    public CreateAlertTool(AppDbContext db) => _db = db;

    public string Name => "create_alert";

    public string Description =>
        "Create an email alert for new rental listings matching the given criteria. Requires a logged-in user.";

    public object Parameters => new
    {
        type = "object",
        properties = new
        {
            city = new { type = "string", description = "City name. Required." },
            property_type = new
            {
                type = "string",
                description = "Property type. Optional.",
                @enum = new[] { "apartment", "condo", "house", "townhouse", "basement", "studio", "loft", "duplex", "other" }
            },
            price_max = new { type = "number", description = "Maximum monthly rent in CAD. Optional." },
            bedrooms_min = new { type = "integer", description = "Minimum bedrooms. Optional." },
            pets_allowed = new { type = "boolean", description = "Require pets allowed. Optional." }
        },
        required = new[] { "city" }
    };

    public async Task<ToolExecutionResult> ExecuteAsync(
        string argumentsJson, ToolExecutionContext context, CancellationToken ct = default)
    {
        if (context.UserId is not Guid userId)
        {
            // Fallo con instrucciones, no un error seco: el modelo lo lee y sabe pedirle al
            // usuario que inicie sesion en vez de decir simplemente que no pudo.
            return ToolExecutionResult.Fail(new
            {
                requiresLogin = true,
                message = "Sign in or create an account to receive alerts. Once signed in, ask me again and I'll set it up."
            });
        }

        AlertArgs args;
        try { args = ParseArgs(argumentsJson); }
        catch (JsonException) { return ToolExecutionResult.Fail(new { message = "Invalid arguments." }); }

        if (string.IsNullOrWhiteSpace(args.City))
            return ToolExecutionResult.Fail(new { message = "City is required to create an alert." });

        var alert = new Alert
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            // El idioma se sella al crear: el motor de digest envia sin peticion HTTP, asi que
            // en ese momento ya no hay forma de saber en que idioma hablaba el usuario.
            Locale = string.Equals(context.Locale, "fr", StringComparison.OrdinalIgnoreCase) ? "fr" : "en",
            City = args.City.Trim(),
            PropertyType = args.PropertyType,
            PriceMax = args.PriceMax,
            BedroomsMin = args.BedroomsMin,
            PetsAllowed = args.PetsAllowed,
            Frequency = AlertFrequency.Daily,
            IsActive = true
        };

        _db.Alerts.Add(alert);
        await _db.SaveChangesAsync(ct);

        return ToolExecutionResult.Ok(new
        {
            alertId = alert.Id,
            summary = BuildSummary(alert),
            frequency = alert.Frequency.ToString(),
            manageUrl = AiLinks.RenterAlerts(context.Locale)
        });
    }

    /// <summary>Resumen en prosa para que el asistente confirme los criterios que guardo.</summary>
    private static string BuildSummary(Alert alert)
    {
        var parts = new List<string>
        {
            alert.PropertyType is { } type ? type.ToString().ToLowerInvariant() : "rentals",
            $"in {alert.City}"
        };

        if (alert.PriceMax is { } max) parts.Add($"under ${max:N0}");
        if (alert.BedroomsMin is { } beds) parts.Add($"{beds}+ bedrooms");
        if (alert.PetsAllowed == true) parts.Add("pet-friendly");

        return string.Join(" ", parts);
    }

    private static AlertArgs ParseArgs(string argumentsJson)
    {
        if (string.IsNullOrWhiteSpace(argumentsJson)) return new AlertArgs();

        using var doc = JsonDocument.Parse(argumentsJson);
        var root = doc.RootElement;

        var args = new AlertArgs
        {
            City = ToolArgs.String(root, "city"),
            PriceMax = ToolArgs.Decimal(root, "price_max"),
            BedroomsMin = ToolArgs.Int(root, "bedrooms_min"),
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

    private sealed class AlertArgs
    {
        public string? City { get; set; }
        public PropertyType? PropertyType { get; set; }
        public decimal? PriceMax { get; set; }
        public int? BedroomsMin { get; set; }
        public bool? PetsAllowed { get; set; }
    }
}
