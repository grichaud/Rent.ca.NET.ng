using System.Security.Claims;
using Rent.Api.Features.Shared;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.Favorites;

public static class FavoriteEndpoints
{
    public static void MapFavoriteEndpoints(this IEndpointRouteBuilder app)
    {
        // Solo Renter, igual que el origen. A un landlord no se le ofrece guardar listings, y
        // dejarle el endpoint abierto crearia filas de favoritos que ninguna pantalla suya
        // muestra.
        var group = app.MapGroup("/api/favorites")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .RequireAuthorization(policy => policy.RequireRole(Roles.Renter))
            .WithTags("Favorites");

        group.MapGet("/", async (
            IFavoriteService favorites,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;
            var cards = await favorites.ListAsync(userId, ct);
            return Results.Ok(cards.Select(c => c.ToDto()).ToList());
        })
        .WithName("ListFavorites");

        group.MapPost("/{propertyId:guid}/toggle", async (
            Guid propertyId,
            IFavoriteService favorites,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            if (propertyId == Guid.Empty) return Results.BadRequest();

            var userId = CurrentUser.GetId(principal)!.Value;
            var favorited = await favorites.ToggleAsync(userId, propertyId, ct);
            return Results.Ok(new { favorited });
        })
        .WithName("ToggleFavorite");

        group.MapDelete("/{propertyId:guid}", async (
            Guid propertyId,
            IFavoriteService favorites,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;
            var removed = await favorites.RemoveAsync(userId, propertyId, ct);
            return removed ? Results.NoContent() : Results.NotFound();
        })
        .WithName("RemoveFavorite");
    }

    /// <summary>
    /// Se reutiliza <see cref="PropertyCardDto"/> en vez de inventar un contrato propio: la
    /// lista de favoritos son tarjetas de propiedad y el cliente ya tiene ese componente.
    /// Los campos que <see cref="FavoriteCard"/> no trae (precio maximo, promocion) viajan
    /// nulos, igual que en el origen, que tampoco los muestra en esta pantalla.
    /// </summary>
    private static PropertyCardDto ToDto(this FavoriteCard c) => new(
        c.PropertyId,
        c.Title,
        c.Slug,
        c.City,
        c.CitySlug,
        c.Province,
        c.Neighbourhood,
        c.PrimaryImageUrl,
        c.FromPrice,
        null,
        c.MinBedrooms,
        null,
        c.MinBathrooms,
        c.PropertyType,
        c.EffectiveTier,
        c.IsVerified,
        c.PetsAllowed,
        c.Furnished,
        true,
        c.CreatedAt,
        null);
}
