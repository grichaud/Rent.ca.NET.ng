using System.Security.Claims;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Auth;
using Rent.Api.Features.Shared;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.Alerts;

/// <summary>
/// Criterios de una alerta guardada.
/// </summary>
/// <param name="PetsAllowed">
/// Tri-estado: true = admite mascotas, false = no las admite, null = da igual. En el origen
/// viajaba como cadena ("true"/"false"/"") porque lo mandaba un formulario HTML; aqui es JSON
/// y puede ser un booleano de verdad, asi que sobra el parseo manual.
/// </param>
public sealed record CreateAlertRequest(
    string? Name,
    string? City,
    PropertyType? PropertyType,
    decimal? PriceMin,
    decimal? PriceMax,
    int? BedroomsMin,
    decimal? BathroomsMin,
    bool? PetsAllowed,
    AlertFrequency Frequency,
    string? Culture);

public sealed record AlertDto(
    Guid Id,
    string? Name,
    string? City,
    PropertyType? PropertyType,
    decimal? PriceMin,
    decimal? PriceMax,
    int? BedroomsMin,
    decimal? BathroomsMin,
    bool? PetsAllowed,
    AlertFrequency Frequency,
    bool IsActive,
    DateTimeOffset? LastSentAt,
    DateTimeOffset CreatedAt);

public sealed class CreateAlertRequestValidator : AbstractValidator<CreateAlertRequest>
{
    public CreateAlertRequestValidator()
    {
        RuleFor(x => x.Name)
            .MaximumLength(80).WithMessage("Name must be 80 characters or fewer.")
            .When(x => !string.IsNullOrWhiteSpace(x.Name));

        RuleFor(x => x.City)
            .NotEmpty().WithMessage("City is required.")
            .MaximumLength(100);

        RuleFor(x => x.PriceMin)
            .GreaterThanOrEqualTo(0).WithMessage("Min price must be 0 or greater.")
            .When(x => x.PriceMin.HasValue);

        RuleFor(x => x.PriceMax)
            .GreaterThan(0).WithMessage("Max price must be greater than 0.")
            .When(x => x.PriceMax.HasValue);

        RuleFor(x => x)
            .Must(x => !x.PriceMin.HasValue || !x.PriceMax.HasValue || x.PriceMin.Value <= x.PriceMax.Value)
            .WithMessage("Min price cannot be greater than max price.")
            .OverridePropertyName(nameof(CreateAlertRequest.PriceMax));

        RuleFor(x => x.BedroomsMin)
            .InclusiveBetween(0, 10).WithMessage("Bedrooms must be between 0 and 10.")
            .When(x => x.BedroomsMin.HasValue);

        RuleFor(x => x.BathroomsMin)
            .InclusiveBetween(0m, 10m).WithMessage("Bathrooms must be between 0 and 10.")
            .When(x => x.BathroomsMin.HasValue);

        RuleFor(x => x.Frequency)
            .IsInEnum().WithMessage("Pick a valid frequency.");
    }
}

public static class AlertEndpoints
{
    public static void MapAlertEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/alerts")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .RequireAuthorization(policy => policy.RequireRole(Roles.Renter))
            .WithTags("Alerts");

        group.MapGet("/", async (
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            // Se trae todo y se ordena en memoria: SQLite (el banco de pruebas) no sabe
            // ordenar por DateTimeOffset. Es la misma razon que en FavoriteService.
            var rows = await db.Alerts
                .AsNoTracking()
                .Where(a => a.UserId == userId)
                .ToListAsync(ct);

            return Results.Ok(rows
                .OrderByDescending(a => a.CreatedAt)
                .Select(ToDto)
                .ToList());
        })
        .WithName("ListAlerts");

        group.MapPost("/", async (
            CreateAlertRequest request,
            IValidator<CreateAlertRequest> validator,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var alert = new Alert
            {
                Id = Guid.NewGuid(),
                UserId = CurrentUser.GetId(principal)!.Value,
                Name = string.IsNullOrWhiteSpace(request.Name) ? null : request.Name.Trim(),
                // Se guarda ahora porque el motor de digest corre sin peticion y no tendria
                // ninguna cultura ambiente que leer a la hora de enviar.
                Locale = AuthHelpers.NormalizeCulture(request.Culture),
                City = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim(),
                PropertyType = request.PropertyType,
                PriceMin = request.PriceMin,
                PriceMax = request.PriceMax,
                BedroomsMin = request.BedroomsMin,
                BathroomsMin = request.BathroomsMin,
                PetsAllowed = request.PetsAllowed,
                Frequency = request.Frequency,
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            db.Alerts.Add(alert);
            await db.SaveChangesAsync(ct);

            return Results.Ok(ToDto(alert));
        })
        .WithName("CreateAlert");

        // Pausar y reanudar son la misma accion: el cliente no tiene que llevar la cuenta del
        // estado para saber a que endpoint llamar.
        group.MapPost("/{id:guid}/toggle", async (
            Guid id,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            var alert = await db.Alerts.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);
            if (alert is null) return Results.NotFound();

            alert.IsActive = !alert.IsActive;
            alert.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            return Results.Ok(ToDto(alert));
        })
        .WithName("ToggleAlert");

        group.MapDelete("/{id:guid}", async (
            Guid id,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            // El filtro por UserId va en la consulta y no en una comprobacion posterior: asi
            // el id de otra persona devuelve 404 sin llegar a revelar que existe.
            var alert = await db.Alerts.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);
            if (alert is null) return Results.NotFound();

            db.Alerts.Remove(alert);
            await db.SaveChangesAsync(ct);

            return Results.NoContent();
        })
        .WithName("DeleteAlert");
    }

    private static AlertDto ToDto(Alert a) => new(
        a.Id, a.Name, a.City, a.PropertyType, a.PriceMin, a.PriceMax,
        a.BedroomsMin, a.BathroomsMin, a.PetsAllowed, a.Frequency,
        a.IsActive, a.LastSentAt, a.CreatedAt);
}
