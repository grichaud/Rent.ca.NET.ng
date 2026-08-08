using FluentValidation;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.Auth;

public sealed record LoginRequest(string Email, string Password, bool RememberMe);

public sealed record SignupRequest(
    string FullName,
    string Email,
    string Password,
    string ConfirmPassword,
    string Role,
    string? Culture);

public sealed record ForgotPasswordRequest(string Email, string? Culture);

public sealed record ResetPasswordRequest(
    string Email,
    string Token,
    string Password,
    string ConfirmPassword);

public sealed record ExternalConfirmRequest(string FullName, string Role);

/// <summary>
/// Usuario de la sesion. Sale de aqui y no de <c>ApplicationUser</c>: la entidad lleva el hash
/// de la contrasena y los sellos de seguridad, que jamas deben cruzar la red.
/// </summary>
public sealed record CurrentUserDto(
    Guid Id,
    string Email,
    string? FullName,
    string? AvatarUrl,
    IReadOnlyList<string> Roles);

/// <summary>
/// Respuesta de las operaciones que dejan sesion iniciada.
///
/// <paramref name="RedirectPath"/> viaja SIN el prefijo de idioma (<c>/landlord</c>, no
/// <c>/en/landlord</c>): quien conoce la cultura activa es el cliente, que la lleva en la URL.
/// La regla de a que portal va cada rol si es del servidor, que es quien sabe los roles.
/// </summary>
public sealed record AuthResponse(CurrentUserDto User, string RedirectPath);

/// <summary>
/// Respuesta de <c>/api/auth/me</c>. Es un objeto envolvente y no el usuario a secas porque
/// ASP.NET NO escribe un cuerpo cuando el valor es null: <c>Results.Ok(null)</c> devuelve 200
/// con el cuerpo vacio, y un cuerpo vacio con content-type JSON rompe a cualquier cliente
/// estricto. Con el envoltorio, la respuesta siempre es un objeto valido.
///
/// <paramref name="ExternalProviders"/> viaja aqui y no en un endpoint propio para no gastar
/// una segunda peticion: el cliente ya pide esto al arrancar, y sin la lista no puede saber si
/// pintar el boton de Google (que sin credenciales configuradas llevaria a un error).
/// </summary>
public sealed record MeResponse(CurrentUserDto? User, IReadOnlyList<string> ExternalProviders);

public sealed record ExternalPendingResponse(ExternalPendingDto? Pending);

/// <summary>
/// Datos del alta pendiente por Google, para pintar el selector de rol. Salen de la cookie
/// externa, no de parametros del cliente: el correo lo afirma el proveedor, no el navegador.
/// </summary>
public sealed record ExternalPendingDto(string Email, string Provider, string SuggestedFullName);

public sealed class SignupRequestValidator : AbstractValidator<SignupRequest>
{
    public SignupRequestValidator()
    {
        RuleFor(x => x.FullName)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(200);

        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("Enter a valid email.");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Password is required.")
            .MinimumLength(8).WithMessage("Password must be at least 8 characters.")
            .Matches("[A-Z]").WithMessage("Password must contain an uppercase letter.")
            .Matches("[0-9]").WithMessage("Password must contain a digit.");

        RuleFor(x => x.ConfirmPassword)
            .Equal(x => x.Password).WithMessage("Passwords do not match.");

        RuleFor(x => x.Role)
            .NotEmpty()
            .Must(r => r == Roles.Renter || r == Roles.Landlord)
            .WithMessage("Role must be Renter or Landlord.");
    }
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().EmailAddress();

        RuleFor(x => x.Token)
            .NotEmpty().WithMessage("Reset link is invalid or expired.");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Password is required.")
            .MinimumLength(8).WithMessage("Password must be at least 8 characters.")
            .Matches("[A-Z]").WithMessage("Password must contain an uppercase letter.")
            .Matches("[0-9]").WithMessage("Password must contain a digit.");

        RuleFor(x => x.ConfirmPassword)
            .Equal(x => x.Password).WithMessage("Passwords do not match.");
    }
}

public sealed class ExternalConfirmRequestValidator : AbstractValidator<ExternalConfirmRequest>
{
    public ExternalConfirmRequestValidator()
    {
        RuleFor(x => x.FullName)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(200);

        RuleFor(x => x.Role)
            .NotEmpty()
            .Must(r => r == Roles.Renter || r == Roles.Landlord)
            .WithMessage("Role must be Renter or Landlord.");
    }
}
