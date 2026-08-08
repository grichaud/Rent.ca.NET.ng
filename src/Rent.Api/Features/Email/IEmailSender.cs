namespace Rent.Api.Features.Email;

/// <summary>
/// Envio de correo transaccional.
///
/// De los cuatro correos del origen aqui solo estan los dos que la autenticacion necesita.
/// El de consulta al propietario y el digest de alertas llegan con sus features en la Fase 7:
/// declararlos ya obligaria a portar tambien sus plantillas y sus datos, que no existen aun.
/// </summary>
public interface IEmailSender
{
    Task SendWelcomeAsync(WelcomeEmail data, CancellationToken ct = default);
    Task SendPasswordResetAsync(PasswordResetEmail data, CancellationToken ct = default);
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
