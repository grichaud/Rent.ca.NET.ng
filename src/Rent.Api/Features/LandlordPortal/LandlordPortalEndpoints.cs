using System.Security.Claims;
using System.Text.RegularExpressions;
using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Auth;
using Rent.Api.Features.Listings;
using Rent.Api.Features.RenterPortal;
using Rent.Api.Features.Shared;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.LandlordPortal;

/// <summary>
/// Dashboard, inbox y cuenta del landlord (port de Features/LandlordManage del origen, sin
/// los listings, que viven en <see cref="LandlordListingEndpoints"/>). Solo rol Landlord;
/// el id del dueno es el del usuario: LandlordProfile comparte PK con AspNetUsers.
/// </summary>
public static partial class LandlordPortalEndpoints
{
    /// <summary>
    /// El seeder guarda su centinela de version DENTRO de LandlordProfile.Description. Si el
    /// landlord demo edita su bio y el tag desaparece, el siguiente arranque borra y recrea
    /// todo el catalogo demo (cascada a Units/Images/Inquiries/Favorites). Se oculta al leer
    /// y se re-adjunta al guardar, igual que el origen.
    /// </summary>
    [GeneratedRegex(@"\s*\[seed:[^\]]+\]\s*$")]
    private static partial Regex SeedTagRegex();

    public static void MapLandlordPortalEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/landlord")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .RequireAuthorization(policy => policy.RequireRole(Roles.Landlord))
            .WithTags("LandlordPortal");

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

            var listings = db.Properties.AsNoTracking()
                .Where(p => p.LandlordProfileId == userId);

            // Se cuentan filas de ContactInquiries, no Property.LeadCount: LeadCount es un
            // contador desnormalizado que solo sube, asi que discreparia del inbox.
            var inquiries = db.ContactInquiries.AsNoTracking()
                .Where(i => i.Property.LandlordProfileId == userId);

            var raw = await inquiries
                .Select(i => new RecentInquiryDto(
                    i.Id, i.SenderName, i.Property.Title, i.IsRead, i.CreatedAt))
                .ToListAsync(ct);

            return Results.Ok(new LandlordDashboardResponse(
                firstName,
                await listings.CountAsync(ct),
                await listings.SumAsync(p => p.ViewCount, ct),
                await inquiries.CountAsync(ct),
                await inquiries.CountAsync(i => !i.IsRead, ct),
                raw.OrderByDescending(i => i.CreatedAt).Take(5).ToList()));
        })
        .WithName("LandlordDashboard");

        group.MapGet("/inbox", async (
            string? filter,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            var baseQuery = db.ContactInquiries
                .AsNoTracking()
                .Where(i => i.Property.LandlordProfileId == userId);

            var totalCount = await baseQuery.CountAsync(ct);
            var unreadCount = await baseQuery.CountAsync(i => !i.IsRead, ct);

            // Cualquier valor distinto de "unread" (o su ausencia) equivale a "all".
            var filtered = filter == "unread" ? baseQuery.Where(i => !i.IsRead) : baseQuery;

            var rows = await filtered
                .Select(i => new LandlordInquiryDto(
                    i.Id,
                    i.Property.Title,
                    i.Property.Slug,
                    db.Cities
                        .Where(c => c.Name == i.Property.City)
                        .Select(c => c.Slug)
                        .FirstOrDefault() ?? string.Empty,
                    i.SenderName,
                    i.SenderEmail,
                    i.SenderPhone,
                    i.Message,
                    i.MoveInDate,
                    i.IsRead,
                    i.CreatedAt))
                .ToListAsync(ct);

            // Orden en memoria: SQLite (el banco de pruebas) no sabe ordenar DateTimeOffset.
            return Results.Ok(new LandlordInboxResponse(
                totalCount,
                unreadCount,
                rows.OrderByDescending(r => r.CreatedAt).ToList()));
        })
        .WithName("LandlordInbox");

        // Es un toggle bidireccional, como el origen: marcar como no leida tambien existe.
        group.MapPost("/inbox/{inquiryId:guid}/toggle", async (
            Guid inquiryId,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            // El filtro de dueno va DENTRO de la consulta: el rol Landlord por si solo no
            // basta, y un id ajeno devuelve 404 sin revelar que existe.
            var inquiry = await db.ContactInquiries
                .FirstOrDefaultAsync(i => i.Id == inquiryId && i.Property.LandlordProfileId == userId, ct);
            if (inquiry is null) return Results.NotFound();

            inquiry.IsRead = !inquiry.IsRead;
            await db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                isRead = inquiry.IsRead,
                message = inquiry.IsRead ? "landlord.markedRead" : "landlord.markedUnread"
            });
        })
        .WithName("ToggleLandlordInquiry");

        group.MapGet("/profile", async (
            UserManager<ApplicationUser> userManager,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;
            var user = await userManager.FindByIdAsync(userId.ToString());
            if (user is null) return Results.Unauthorized();

            var profile = await db.LandlordProfiles.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == userId, ct);

            return Results.Ok(new LandlordProfileResponse(
                user.Email ?? string.Empty,
                user.FullName ?? string.Empty,
                user.PhoneNumber,
                profile?.CompanyName,
                profile?.Website,
                SeedTagRegex().Replace(profile?.Description ?? string.Empty, string.Empty),
                profile?.IsVerified ?? false,
                await userManager.HasPasswordAsync(user)));
        })
        .WithName("LandlordProfile");

        group.MapPut("/profile", async (
            UpdateLandlordProfileRequest request,
            IValidator<UpdateLandlordProfileRequest> validator,
            UserManager<ApplicationUser> userManager,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var userId = CurrentUser.GetId(principal)!.Value;
            var user = await userManager.FindByIdAsync(userId.ToString());
            if (user is null) return Results.Unauthorized();

            var profile = await db.LandlordProfiles.FirstOrDefaultAsync(p => p.Id == userId, ct);
            if (profile is null) return Results.Unauthorized();

            user.FullName = request.FullName.Trim();
            user.PhoneNumber = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            user.UpdatedAt = DateTimeOffset.UtcNow;
            var update = await userManager.UpdateAsync(user);
            if (!update.Succeeded) return update.Errors.ToValidationProblem();

            profile.CompanyName = string.IsNullOrWhiteSpace(request.CompanyName) ? null : request.CompanyName.Trim();
            profile.Website = string.IsNullOrWhiteSpace(request.Website) ? null : request.Website.Trim();

            var seedTag = SeedTagRegex().Match(profile.Description ?? string.Empty).Value;
            var bio = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
            // La columna admite 2000; el validador tambien. Con el tag re-adjuntado la suma
            // puede pasarse y SQL Server tiraria un 500 por truncado: se recorta la bio, que
            // es lo unico prescindible (solo afecta al landlord demo, el unico con tag).
            if (bio is not null && !string.IsNullOrEmpty(seedTag) && bio.Length + seedTag.Length > 2000)
            {
                bio = bio[..(2000 - seedTag.Length)];
            }
            profile.Description = string.IsNullOrEmpty(seedTag) ? bio : bio + seedTag;

            profile.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { message = "landlord.accountBrandSaved" });
        })
        .WithName("UpdateLandlordProfile");

        // Mismo contrato y semantica que el del renter: el origen tambien comparte validador
        // y flujo entre ambos portales.
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
                var mismatch = change.Errors.Any(e => e.Code == "PasswordMismatch");
                return mismatch
                    ? Results.ValidationProblem(new Dictionary<string, string[]>
                    {
                        ["currentPassword"] = ["renter.accountIncorrectCurrent"]
                    })
                    : change.Errors.ToValidationProblem();
            }

            // Cambiar la contrasena rota el security stamp; sin refrescar la cookie, la
            // siguiente peticion cerraria la sesion que acaba de cambiarla.
            await signInManager.RefreshSignInAsync(user);
            loggerFactory.CreateLogger("LandlordPortal.Password")
                .LogInformation("Landlord {UserId} changed password.", user.Id);

            return Results.Ok(new { message = "renter.accountPasswordChanged" });
        })
        .WithName("ChangeLandlordPassword");

        // Catalogo de amenities para el formulario de listing, ya ordenado como lo pinta el
        // origen (por categoria y nombre).
        group.MapGet("/amenities", async (AppDbContext db, CancellationToken ct) =>
        {
            var amenities = await db.Amenities.AsNoTracking()
                .OrderBy(a => a.Category).ThenBy(a => a.Name)
                .Select(a => new AmenityDto(a.Id, a.Name, a.Category, a.Icon))
                .ToListAsync(ct);

            return Results.Ok(amenities);
        })
        .WithName("LandlordAmenities");
    }
}
