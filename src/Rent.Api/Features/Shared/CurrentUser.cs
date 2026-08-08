using System.Security.Claims;

namespace Rent.Api.Features.Shared;

/// <summary>
/// Id del usuario autenticado, o null si la peticion es anonima.
///
/// En la Fase 3 devuelve siempre null porque la autenticacion para SPA se configura en la
/// Fase 6. Los endpoints ya lo consultan para que el marcado de favoritos empiece a
/// funcionar en cuanto exista la cookie, sin tener que volver a tocarlos.
/// </summary>
public static class CurrentUser
{
    public static Guid? GetId(ClaimsPrincipal? principal)
    {
        if (principal?.Identity?.IsAuthenticated != true) return null;

        var raw = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(raw, out var id) ? id : null;
    }
}
