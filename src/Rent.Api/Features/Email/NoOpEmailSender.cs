namespace Rent.Api.Features.Email;

/// <summary>
/// Sustituto cuando no hay clave de Resend: deja rastro en el log y no falla. Sin el, un
/// entorno de desarrollo sin credenciales romperia el alta de usuarios por no poder enviar
/// el correo de bienvenida.
/// </summary>
public class NoOpEmailSender : IEmailSender
{
    private readonly ILogger<NoOpEmailSender> _logger;

    public NoOpEmailSender(ILogger<NoOpEmailSender> logger) => _logger = logger;

    public Task SendWelcomeAsync(WelcomeEmail data, CancellationToken ct = default)
    {
        _logger.LogInformation("[NoOp] Welcome email skipped (no API key). To={Email}", data.ToEmail);
        return Task.CompletedTask;
    }

    public Task SendPasswordResetAsync(PasswordResetEmail data, CancellationToken ct = default)
    {
        // El enlace se registra a proposito: en desarrollo es la unica forma de completar el
        // flujo de restablecer contrasena sin un proveedor de correo configurado.
        _logger.LogInformation(
            "[NoOp] Password-reset email skipped (no API key). To={Email} ResetUrl={Url}",
            data.ToEmail, data.ResetUrl);
        return Task.CompletedTask;
    }
}
