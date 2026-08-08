using FluentValidation.Results;
using Microsoft.AspNetCore.Identity;
using Rent.Api.Domain;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.Auth;

internal static class AuthHelpers
{
    private static readonly string[] SupportedCultures = ["en", "fr"];

    public static async Task<CurrentUserDto> ToDtoAsync(
        this ApplicationUser user, UserManager<ApplicationUser> userManager)
    {
        var roles = await userManager.GetRolesAsync(user);
        return new CurrentUserDto(user.Id, user.Email ?? string.Empty, user.FullName, user.AvatarUrl, [.. roles]);
    }

    /// <summary>
    /// Portal que corresponde al usuario. Admin gana a Landlord y Landlord a Renter: el rol
    /// mas privilegiado manda, igual que en el origen.
    /// </summary>
    public static string PortalPathFor(IEnumerable<string> roles)
    {
        var set = roles.ToHashSet(StringComparer.Ordinal);
        if (set.Contains(Roles.Admin)) return "/admin";
        if (set.Contains(Roles.Landlord)) return "/landlord";
        if (set.Contains(Roles.Renter)) return "/renter";
        return "/";
    }

    public static string NormalizeCulture(string? culture)
        => culture is not null && SupportedCultures.Contains(culture) ? culture : "en";

    /// <summary>
    /// Errores de FluentValidation en el formato de ValidationProblemDetails, con las claves en
    /// camelCase para que coincidan con los nombres de control del formulario en Angular.
    /// </summary>
    public static IResult ToValidationProblem(this ValidationResult validation)
    {
        var errors = validation.Errors
            .GroupBy(e => ToCamelCase(e.PropertyName))
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray());

        return Results.ValidationProblem(errors);
    }

    /// <summary>
    /// Errores de Identity (contrasena debil, correo duplicado). No traen nombre de campo, asi
    /// que se agrupan bajo la clave vacia, que es la que el cliente pinta como error general.
    /// </summary>
    public static IResult ToValidationProblem(this IEnumerable<IdentityError> identityErrors)
        => Results.ValidationProblem(new Dictionary<string, string[]>
        {
            [""] = identityErrors.Select(e => e.Description).ToArray()
        });

    /// <summary>
    /// Solo se acepta una ruta relativa propia. Sin esta comprobacion, un <c>returnUrl</c>
    /// apuntando a otro dominio convertiria el flujo de login en un redirector abierto.
    /// </summary>
    public static bool IsLocalPath(string? path)
        => !string.IsNullOrEmpty(path)
           && path.StartsWith('/')
           && !path.StartsWith("//")
           && !path.StartsWith("/\\");

    private static string ToCamelCase(string value)
        => string.IsNullOrEmpty(value) ? value : char.ToLowerInvariant(value[0]) + value[1..];
}
