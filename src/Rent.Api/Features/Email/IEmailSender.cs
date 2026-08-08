namespace Rent.Api.Features.Email;

/// <summary>
/// Envio de correo transaccional. Los cuatro correos del origen.
/// </summary>
public interface IEmailSender
{
    Task SendWelcomeAsync(WelcomeEmail data, CancellationToken ct = default);
    Task SendPasswordResetAsync(PasswordResetEmail data, CancellationToken ct = default);
    Task SendInquiryToLandlordAsync(InquiryEmail data, CancellationToken ct = default);
    Task SendAlertDigestAsync(AlertDigestEmail data, CancellationToken ct = default);
}

public record WelcomeEmail(
    string ToEmail,
    string ToName,
    string Role,
    string PortalUrl,
    string Locale = "en");

public record PasswordResetEmail(
    string ToEmail,
    string ToName,
    string ResetUrl,
    string Locale = "en");

public record InquiryEmail(
    string LandlordEmail,
    string LandlordName,
    string PropertyTitle,
    string PropertyUrl,
    string InboxUrl,
    string SenderName,
    string SenderEmail,
    string? SenderPhone,
    string Message,
    DateOnly? MoveInDate);

/// <summary>
/// Un lote de listings nuevos que casan con una alerta guardada. A diferencia de los demas
/// correos, este se compone SIN peticion en curso: todas las URL tienen que llegar ya
/// absolutas y el idioma sale de la fila de la alerta, no de la cultura ambiente.
/// </summary>
public record AlertDigestEmail(
    string ToEmail,
    string ToName,
    string? AlertName,
    string AlertSummary,
    IReadOnlyList<AlertDigestItem> Items,
    int TotalMatches,
    string SearchUrl,
    string ManageAlertsUrl,
    string Locale = "en");

/// <summary>
/// Un listing dentro del digest. Los valores van en crudo para que la plantilla formatee
/// moneda y medidas segun el idioma, en vez de recibir cadenas ya compuestas en ingles.
/// </summary>
public record AlertDigestItem(
    string Title,
    string Url,
    string Location,
    decimal? MinPrice,
    decimal? MaxPrice,
    int MinBedrooms,
    int? MaxBedrooms,
    decimal MinBathrooms,
    string? ImageUrl);
