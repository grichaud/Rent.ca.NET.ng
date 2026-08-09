using FluentValidation;
using Rent.Api.Domain;

namespace Rent.Api.Features.Admin;

/// <summary>
/// Contratos del panel de administracion (port de Features/Admin del origen).
///
/// A diferencia del resto de portales, los mensajes de esta area viajan como TEXTO en ingles
/// y no como claves de traduccion: el origen tampoco los tiene traducidos (sus flashes son
/// literales hardcodeados y no existe ninguna clave <c>admin.flash*</c> en los .resx). Es una
/// herramienta interna; mantener la paridad pesa mas que inventar traducciones nuevas.
/// </summary>
public sealed record AdminDashboardResponse(
    int TotalProperties,
    int FeaturedProperties,
    int PromotedProperties,
    int TotalLandlords,
    int ActiveSpecials,
    int Conversations);

public sealed record AdminUserRow(
    Guid Id,
    string Email,
    string? FullName,
    DateTimeOffset CreatedAt,
    IReadOnlyList<string> Roles,
    bool IsAdmin);

public sealed record AdminLandlordRow(
    Guid Id,
    string Email,
    string? CompanyName,
    ListingTier Tier,
    /// <summary>Tier ya resuelto: si la vigencia expiro, degrada a Limited.</summary>
    ListingTier EffectiveTier,
    DateTimeOffset? TierExpiresAt,
    bool IsVerified,
    int ListingsCount);

public sealed record AdminPropertyRow(
    Guid Id,
    string Title,
    string CityName,
    string LandlordEmail,
    ListingStatus Status,
    ListingTier Tier,
    ListingTier EffectiveTier,
    DateTimeOffset? TierExpiresAt,
    DateTimeOffset CreatedAt);

/// <summary>Pagina de resultados; <paramref name="TotalRows"/> es el total SIN paginar.</summary>
public sealed record AdminPage<T>(IReadOnlyList<T> Rows, int TotalRows, int PageIndex, int PageSize)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling((double)TotalRows / PageSize);
}

public sealed record SetTierRequest(ListingTier Tier, DateTimeOffset? ExpiresAt);

public sealed record AdminSpecialRow(
    Guid Id,
    Guid PropertyId,
    string PropertyTitle,
    string PropertyCity,
    string Title,
    string? Description,
    DateTimeOffset? StartDate,
    DateTimeOffset? EndDate,
    bool IsActive,
    DateTimeOffset CreatedAt);

public sealed record AdminPropertyOption(Guid Id, string Title, string City);

/// <summary>La pantalla de specials necesita el catalogo de propiedades para el selector.</summary>
public sealed record AdminSpecialsResponse(
    IReadOnlyList<AdminSpecialRow> Rows,
    int TotalRows,
    int PageIndex,
    int PageSize,
    IReadOnlyList<AdminPropertyOption> PropertyOptions)
{
    public int TotalPages => PageSize == 0 ? 0 : (int)Math.Ceiling((double)TotalRows / PageSize);
}

public sealed record CreateSpecialRequest(
    Guid PropertyId,
    string Title,
    string? Description,
    DateTimeOffset? StartDate,
    DateTimeOffset? EndDate,
    bool IsActive);

/// <summary>La propiedad de un special NO es editable, igual que en el origen.</summary>
public sealed record UpdateSpecialRequest(
    string Title,
    string? Description,
    DateTimeOffset? StartDate,
    DateTimeOffset? EndDate,
    bool IsActive);

public sealed record AdminSearchRow(
    Guid Id,
    string NormalizedQuery,
    string CitySlug,
    int SearchCount,
    DateTimeOffset LastSearchedAt);

public sealed record UpdateSearchRequest(string NormalizedQuery, string? CitySlug);

public sealed record AiToolUsage(string Name, int Count);

/// <summary><paramref name="Date"/> viaja como fecha sola (yyyy-MM-dd): es un bucket diario.</summary>
public sealed record AiDailyBucket(DateOnly Date, int Count);

public sealed record AiRecentConversation(
    Guid Id,
    DateTimeOffset UpdatedAt,
    string? Title,
    string? UserEmail,
    Guid? SessionId,
    int MessageCount,
    string? LastMessage);

public sealed record AdminAiResponse(
    int TotalConversations,
    int TotalMessages,
    long EstimatedTokens,
    decimal EstimatedCostUsd,
    IReadOnlyList<AiToolUsage> ToolBreakdown,
    IReadOnlyList<AiDailyBucket> Last7Days,
    IReadOnlyList<AiRecentConversation> Recent);

public sealed record AiMessageDto(
    Guid Id,
    AiMessageRole Role,
    string Content,
    string? ToolName,
    string? ToolArgsJson,
    string? ToolResultJson,
    DateTimeOffset CreatedAt);

public sealed record AdminAiConversationResponse(
    Guid Id,
    string? Title,
    string? UserEmail,
    Guid? SessionId,
    DateTimeOffset CreatedAt,
    IReadOnlyList<AiMessageDto> Messages);

public sealed class SetTierRequestValidator : AbstractValidator<SetTierRequest>
{
    public SetTierRequestValidator()
    {
        RuleFor(x => x.Tier).IsInEnum().WithMessage("Pick a valid tier.");

        RuleFor(x => x.ExpiresAt)
            .GreaterThan(DateTimeOffset.UtcNow).WithMessage("Expiration must be in the future.")
            .When(x => x.ExpiresAt.HasValue);
    }
}

public sealed class CreateSpecialRequestValidator : AbstractValidator<CreateSpecialRequest>
{
    public CreateSpecialRequestValidator()
    {
        RuleFor(x => x.PropertyId).NotEqual(Guid.Empty).WithMessage("Pick a property.");
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(2000);

        RuleFor(x => x)
            .Must(x => !x.StartDate.HasValue || !x.EndDate.HasValue || x.StartDate <= x.EndDate)
            .WithMessage("Start date must be on or before end date.")
            .OverridePropertyName(nameof(CreateSpecialRequest.EndDate));
    }
}

public sealed class UpdateSpecialRequestValidator : AbstractValidator<UpdateSpecialRequest>
{
    public UpdateSpecialRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(2000);

        RuleFor(x => x)
            .Must(x => !x.StartDate.HasValue || !x.EndDate.HasValue || x.StartDate <= x.EndDate)
            .WithMessage("Start date must be on or before end date.")
            .OverridePropertyName(nameof(UpdateSpecialRequest.EndDate));
    }
}

public sealed class UpdateSearchRequestValidator : AbstractValidator<UpdateSearchRequest>
{
    public UpdateSearchRequestValidator()
    {
        RuleFor(x => x.NormalizedQuery)
            .NotEmpty().WithMessage("Query cannot be empty.")
            .MaximumLength(200);

        RuleFor(x => x.CitySlug).MaximumLength(100);
    }
}
