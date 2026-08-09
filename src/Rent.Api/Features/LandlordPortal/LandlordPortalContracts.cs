using FluentValidation;
using Rent.Api.Domain;
using Rent.Api.Features.Listings;

namespace Rent.Api.Features.LandlordPortal;

/// <summary>
/// Contratos del portal del landlord (port de Features/LandlordManage del origen). Igual que
/// en el resto de slices: DTOs, nunca entidades EF, y los mensajes accionables viajan como
/// claves de traduccion <c>landlord.*</c> que resuelve la pantalla.
/// </summary>
public sealed record RecentInquiryDto(
    Guid Id,
    string SenderName,
    string PropertyTitle,
    bool IsRead,
    DateTimeOffset CreatedAt);

public sealed record LandlordDashboardResponse(
    string? FirstName,
    int TotalListings,
    int TotalViews,
    int TotalInquiries,
    int UnreadInquiries,
    IReadOnlyList<RecentInquiryDto> Recent);

public sealed record LandlordListingRowDto(
    Guid Id,
    string Title,
    string Slug,
    string CityName,
    string CitySlug,
    string Province,
    ListingStatus Status,
    int? Bedrooms,
    decimal? Price,
    int UnitCount,
    int ViewCount,
    int LeadCount,
    string? PrimaryImageUrl);

public sealed record LandlordInquiryDto(
    Guid Id,
    string PropertyTitle,
    string PropertySlug,
    string CitySlug,
    string SenderName,
    string SenderEmail,
    string? SenderPhone,
    string Message,
    DateOnly? MoveInDate,
    bool IsRead,
    DateTimeOffset CreatedAt);

/// <summary>
/// Los contadores van SIEMPRE sobre el total sin filtrar, como en el origen: el subtitulo
/// "N consultas · M sin leer" no cambia al activar el filtro de no leidas.
/// </summary>
public sealed record LandlordInboxResponse(
    int TotalCount,
    int UnreadCount,
    IReadOnlyList<LandlordInquiryDto> Inquiries);

public sealed record LandlordProfileResponse(
    string Email,
    string FullName,
    string? Phone,
    string? CompanyName,
    string? Website,
    string? Description,
    bool IsVerified,
    bool HasPassword);

public sealed record UpdateLandlordProfileRequest(
    string FullName,
    string? Phone,
    string? CompanyName,
    string? Website,
    string? Description);

/// <summary>Unidad del formulario. <c>Id</c> null para nuevas; en Edit identifica la fila.</summary>
public sealed record ListingUnitInput(
    Guid? Id,
    int Bedrooms,
    decimal Bathrooms,
    int? SqFt,
    decimal Price,
    DateOnly? AvailableDate,
    int AvailableUnits);

/// <summary>
/// Port de ListingFormInput del origen, sin las fotos: aqui el formulario viaja como JSON y
/// las fotos van aparte por multipart (<c>POST /photos</c>), que es lo que un SPA puede hacer
/// sin recargar. <c>CityName</c> es texto libre, como en el origen: NO es FK al catalogo.
/// </summary>
public sealed record ListingFormRequest(
    string Title,
    string? Description,
    PropertyType PropertyType,
    ListingStatus Status,
    string StreetAddress,
    string CityName,
    string Province,
    string PostalCode,
    string? Neighbourhood,
    bool PetsAllowed,
    bool Furnished,
    LeaseTerm? LeaseTerm,
    string? ParkingType,
    int? YearBuilt,
    int? TotalFloors,
    List<Guid> AmenityIds,
    List<ListingUnitInput> Units);

/// <summary>Lo que la pantalla de edicion necesita para rellenar el formulario.</summary>
public sealed record LandlordListingDetailDto(
    Guid Id,
    string Title,
    string? Description,
    PropertyType PropertyType,
    ListingStatus Status,
    string StreetAddress,
    string CityName,
    string Province,
    string PostalCode,
    string? Neighbourhood,
    bool PetsAllowed,
    bool Furnished,
    LeaseTerm? LeaseTerm,
    string? ParkingType,
    int? YearBuilt,
    int? TotalFloors,
    List<Guid> AmenityIds,
    IReadOnlyList<ListingUnitInput> Units,
    IReadOnlyList<ListingImageDto> Images);

/// <summary>
/// Estado de la galeria tras cualquier operacion de fotos. <c>Warning</c> es una clave
/// <c>landlord.*</c> (imagen rechazada, tope superado) o null si todo entro.
/// </summary>
public sealed record ListingPhotosResponse(
    IReadOnlyList<ListingImageDto> Images,
    string? Warning);

/// <summary>Port literal de LandlordManage/Validators/LandlordProfileValidator.cs.</summary>
public sealed class UpdateLandlordProfileRequestValidator : AbstractValidator<UpdateLandlordProfileRequest>
{
    public UpdateLandlordProfileRequestValidator()
    {
        RuleFor(x => x.FullName)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(200);

        RuleFor(x => x.Phone)
            .MaximumLength(30).WithMessage("Phone number is too long.")
            .When(x => !string.IsNullOrWhiteSpace(x.Phone));

        RuleFor(x => x.CompanyName)
            .MaximumLength(200)
            .When(x => !string.IsNullOrWhiteSpace(x.CompanyName));

        RuleFor(x => x.Website)
            .MaximumLength(300)
            .Must(w => Uri.TryCreate(w, UriKind.Absolute, out var uri)
                       && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
            .WithMessage("Website must be a valid URL starting with http:// or https://")
            .When(x => !string.IsNullOrWhiteSpace(x.Website));

        RuleFor(x => x.Description)
            .MaximumLength(2000)
            .When(x => !string.IsNullOrWhiteSpace(x.Description));
    }
}

/// <summary>Port literal de LandlordManage/Validators/ListingFormValidator.cs.</summary>
public sealed class ListingFormRequestValidator : AbstractValidator<ListingFormRequest>
{
    public ListingFormRequestValidator()
    {
        // JsonStringEnumConverter tambien acepta enteros: sin IsInEnum, un "status": 42
        // pasaria el bind y HasConversion<string> guardaria "42" en la columna.
        RuleFor(x => x.PropertyType).IsInEnum();
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.LeaseTerm).IsInEnum().When(x => x.LeaseTerm.HasValue);

        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(4000);
        RuleFor(x => x.StreetAddress).NotEmpty().MaximumLength(300);
        RuleFor(x => x.CityName).NotEmpty().MaximumLength(100);
        // Los codigos de provincia canadienses son de 2 letras; el select los cierra a las 13.
        RuleFor(x => x.Province).NotEmpty().MaximumLength(2);
        RuleFor(x => x.PostalCode).NotEmpty().MaximumLength(10);

        RuleFor(x => x.ParkingType).MaximumLength(50);
        RuleFor(x => x.YearBuilt).InclusiveBetween(1800, 2100).When(x => x.YearBuilt.HasValue);
        RuleFor(x => x.TotalFloors).InclusiveBetween(1, 200).When(x => x.TotalFloors.HasValue);

        RuleFor(x => x.Units).NotEmpty().WithMessage("A listing needs at least one unit.");
        RuleForEach(x => x.Units).SetValidator(new ListingUnitInputValidator());
    }
}

public sealed class ListingUnitInputValidator : AbstractValidator<ListingUnitInput>
{
    public ListingUnitInputValidator()
    {
        RuleFor(x => x.Bedrooms).InclusiveBetween(0, 20);
        RuleFor(x => x.Bathrooms).InclusiveBetween(0.5m, 20m);
        RuleFor(x => x.Price).GreaterThan(0).LessThan(100000);
        RuleFor(x => x.SqFt).InclusiveBetween(1, 20000).When(x => x.SqFt.HasValue);
        RuleFor(x => x.AvailableUnits).InclusiveBetween(0, 500);
    }
}
