using System.Security.Claims;
using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Auth;
using Rent.Api.Features.Shared;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.RenterPortal;

/// <summary>
/// Port de Features/RenterPortal del origen: dashboard, cuenta (perfil + contrasena) y las
/// consultas enviadas. Los mensajes de exito y de error accionable viajan como CLAVES de
/// traduccion (<c>renter.*</c>), igual que hace el endpoint de consultas: la pantalla que los
/// pinta es quien conoce el idioma del visitante.
/// </summary>
public sealed record RenterDashboardResponse(
    string? FirstName,
    int SavedProperties,
    int ActiveAlerts,
    int InquiriesSent);

public sealed record RenterProfileResponse(
    string Email,
    string FullName,
    string? Phone,
    bool HasPassword);

public sealed record UpdateProfileRequest(string FullName, string? Phone);

public sealed record ChangePasswordRequest(
    string CurrentPassword,
    string NewPassword,
    string ConfirmPassword);

public sealed record RenterInquiryDto(
    Guid Id,
    string PropertyTitle,
    string PropertySlug,
    string PropertyCity,
    string CitySlug,
    string Message,
    DateOnly? MoveInDate,
    bool IsRead,
    DateTimeOffset CreatedAt);

/// <summary>Port de RenterPortal/Validators/AccountProfileValidator.cs.</summary>
public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.FullName)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(200);

        RuleFor(x => x.Phone)
            .MaximumLength(30).WithMessage("Phone number is too long.")
            .When(x => !string.IsNullOrWhiteSpace(x.Phone));
    }
}

/// <summary>Port de RenterPortal/Validators/ChangePasswordValidator.cs.</summary>
public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword)
            .NotEmpty().WithMessage("Current password is required.");

        RuleFor(x => x.NewPassword)
            .NotEmpty().WithMessage("New password is required.")
            .MinimumLength(8).WithMessage("Password must be at least 8 characters.")
            .Matches("[A-Z]").WithMessage("Password must contain an uppercase letter.")
            .Matches("[0-9]").WithMessage("Password must contain a digit.");

        RuleFor(x => x.ConfirmPassword)
            .Equal(x => x.NewPassword).WithMessage("Passwords do not match.");
    }
}

public static class RenterPortalEndpoints
{
    public static void MapRenterPortalEndpoints(this IEndpointRouteBuilder app)
    {
        // Solo Renter, como el [Authorize(Roles = Roles.Renter)] de las paginas del origen.
        var group = app.MapGroup("/api/renter")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .RequireAuthorization(policy => policy.RequireRole(Roles.Renter))
            .WithTags("RenterPortal");

        group.MapGet("/dashboard", async (
            UserManager<ApplicationUser> userManager,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;
            var user = await userManager.FindByIdAsync(userId.ToString());
            if (user is null) return Results.Unauthorized();

            var firstName = string.IsNullOrWhiteSpace(user.FullName)
                ? null
                : user.FullName.Trim().Split(' ')[0];

            return Results.Ok(new RenterDashboardResponse(
                firstName,
                await db.Favorites.CountAsync(f => f.UserId == userId, ct),
                await db.Alerts.CountAsync(a => a.UserId == userId && a.IsActive, ct),
                await db.ContactInquiries.CountAsync(i => i.SenderUserId == userId, ct)));
        })
        .WithName("RenterDashboard");

        group.MapGet("/profile", async (
            UserManager<ApplicationUser> userManager,
            ClaimsPrincipal principal) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;
            var user = await userManager.FindByIdAsync(userId.ToString());
            if (user is null) return Results.Unauthorized();

            return Results.Ok(new RenterProfileResponse(
                user.Email ?? string.Empty,
                user.FullName ?? string.Empty,
                user.PhoneNumber,
                await userManager.HasPasswordAsync(user)));
        })
        .WithName("RenterProfile");

        group.MapPut("/profile", async (
            UpdateProfileRequest request,
            IValidator<UpdateProfileRequest> validator,
            UserManager<ApplicationUser> userManager,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var userId = CurrentUser.GetId(principal)!.Value;
            var user = await userManager.FindByIdAsync(userId.ToString());
            if (user is null) return Results.Unauthorized();

            user.FullName = request.FullName.Trim();
            user.PhoneNumber = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            user.UpdatedAt = DateTimeOffset.UtcNow;

            var update = await userManager.UpdateAsync(user);
            if (!update.Succeeded) return update.Errors.ToValidationProblem();

            return Results.Ok(new { message = "renter.accountProfileSaved" });
        })
        .WithName("UpdateRenterProfile");

        group.MapPost("/password", async (
            ChangePasswordRequest request,
            IValidator<ChangePasswordRequest> validator,
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            ClaimsPrincipal principal,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;
            var user = await userManager.FindByIdAsync(userId.ToString());
            if (user is null) return Results.Unauthorized();

            // Alta por Google: no hay contrasena local que cambiar.
            if (!await userManager.HasPasswordAsync(user))
            {
                return Results.Problem(
                    title: "renter.accountGoogle",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var change = await userManager.ChangePasswordAsync(
                user, request.CurrentPassword, request.NewPassword);

            if (!change.Succeeded)
            {
                // PasswordMismatch es el unico fallo que el usuario puede accionar; viaja como
                // clave y anclado a su campo. El resto (politicas de Identity) va en general.
                var mismatch = change.Errors.Any(e => e.Code == "PasswordMismatch");
                return mismatch
                    ? Results.ValidationProblem(new Dictionary<string, string[]>
                    {
                        ["currentPassword"] = ["renter.accountIncorrectCurrent"]
                    })
                    : change.Errors.ToValidationProblem();
            }

            // Cambiar la contrasena rota el security stamp; sin refrescar la cookie, la
            // siguiente validacion del stamp cerraria la sesion que acaba de cambiarla.
            await signInManager.RefreshSignInAsync(user);
            loggerFactory.CreateLogger("RenterPortal.Password")
                .LogInformation("User {UserId} changed password.", user.Id);

            return Results.Ok(new { message = "renter.accountPasswordChanged" });
        })
        .WithName("ChangeRenterPassword");

        group.MapGet("/inquiries", async (
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            var rows = await db.ContactInquiries
                .AsNoTracking()
                .Where(i => i.SenderUserId == userId)
                .Select(i => new RenterInquiryDto(
                    i.Id,
                    i.Property.Title,
                    i.Property.Slug,
                    i.Property.City,
                    db.Cities
                        .Where(c => c.Name == i.Property.City)
                        .Select(c => c.Slug)
                        .FirstOrDefault() ?? string.Empty,
                    i.Message,
                    i.MoveInDate,
                    i.IsRead,
                    i.CreatedAt))
                .ToListAsync(ct);

            // Orden en memoria: SQLite (el banco de pruebas) no sabe ordenar DateTimeOffset.
            return Results.Ok(rows.OrderByDescending(r => r.CreatedAt).ToList());
        })
        .WithName("RenterInquiries");
    }
}
