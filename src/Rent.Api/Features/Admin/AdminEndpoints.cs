using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Auth;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.Admin;

/// <summary>
/// Panel de administracion: metricas, usuarios, propietarios y listings (port de
/// Features/Admin/Pages Index, Users, Landlords y Properties del origen).
///
/// El rol Admin se exige AQUI, en el servidor: el guard del cliente es solo experiencia de
/// usuario. Los mensajes van en texto plano por la razon explicada en AdminContracts.cs.
/// </summary>
public static class AdminEndpoints
{
    private const int PageSize = 50;

    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .RequireAuthorization(policy => policy.RequireRole(Roles.Admin))
            .WithTags("Admin");

        group.MapGet("/dashboard", async (AppDbContext db, CancellationToken ct) =>
        {
            // Featured/Promoted cuentan el tier ALMACENADO, no el efectivo: es la cifra de
            // cuantos se vendieron, no de cuantos siguen vigentes.
            return Results.Ok(new AdminDashboardResponse(
                await db.Properties.CountAsync(ct),
                await db.Properties.CountAsync(p => p.Tier == ListingTier.Featured, ct),
                await db.Properties.CountAsync(p => p.Tier == ListingTier.Promoted, ct),
                await db.LandlordProfiles.CountAsync(ct),
                await db.RentSpecials.CountAsync(s => s.IsActive, ct),
                await db.AiConversations.CountAsync(ct)));
        })
        .WithName("AdminDashboard");

        // ---- Usuarios ---------------------------------------------------------------

        group.MapGet("/users", async (
            string? email,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var query = db.Users.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(email))
            {
                var filter = email.Trim();
                query = query.Where(u => u.Email != null && u.Email.Contains(filter));
            }

            var raw = await query
                .Select(u => new { u.Id, u.Email, u.FullName, u.CreatedAt })
                .ToListAsync(ct);

            // Orden y tope en memoria: CreatedAt es DateTimeOffset y SQLite (el banco de
            // pruebas) no sabe ordenarlo. Es un tope de 50, no paginacion, igual que el origen.
            var ordered = raw
                .OrderByDescending(u => u.CreatedAt)
                .Take(PageSize)
                .ToList();

            // El join de roles se hace en memoria: son dos tablas diminutas y ahorra un join
            // por fila contra Identity.
            var ids = ordered.Select(u => u.Id).ToHashSet();
            var roleLinks = await db.UserRoles.AsNoTracking()
                .Where(r => ids.Contains(r.UserId))
                .ToListAsync(ct);
            var roleNames = await db.Roles.AsNoTracking()
                .ToDictionaryAsync(r => r.Id, r => r.Name ?? string.Empty, ct);

            var rows = ordered.Select(u =>
            {
                var roles = roleLinks
                    .Where(r => r.UserId == u.Id)
                    .Select(r => roleNames.TryGetValue(r.RoleId, out var name) ? name : string.Empty)
                    .Where(name => !string.IsNullOrEmpty(name))
                    .OrderBy(name => name)
                    .ToList();

                return new AdminUserRow(
                    u.Id, u.Email ?? string.Empty, u.FullName, u.CreatedAt,
                    roles, roles.Contains(Roles.Admin));
            }).ToList();

            return Results.Ok(rows);
        })
        .WithName("AdminUsers");

        group.MapPost("/users/{userId:guid}/toggle-admin", async (
            Guid userId,
            UserManager<ApplicationUser> userManager,
            CancellationToken ct) =>
        {
            var target = await userManager.FindByIdAsync(userId.ToString());
            if (target is null) return Results.NotFound(new { message = "User not found." });

            if (await userManager.IsInRoleAsync(target, Roles.Admin))
            {
                // Quitarse el rol siendo el ultimo admin dejaria el panel inaccesible para
                // todos, sin forma de recuperarlo desde la propia app.
                var admins = await userManager.GetUsersInRoleAsync(Roles.Admin);
                if (admins.Count <= 1)
                {
                    return Results.Problem(
                        title: "Cannot remove the last admin. Promote another user first.",
                        statusCode: StatusCodes.Status400BadRequest);
                }

                var removed = await userManager.RemoveFromRoleAsync(target, Roles.Admin);
                if (!removed.Succeeded)
                {
                    return Results.Problem(
                        title: "Failed to remove role: " + string.Join(", ", removed.Errors.Select(e => e.Description)),
                        statusCode: StatusCodes.Status400BadRequest);
                }

                return Results.Ok(new { isAdmin = false, message = $"Removed Admin role from {target.Email}." });
            }

            var added = await userManager.AddToRoleAsync(target, Roles.Admin);
            if (!added.Succeeded)
            {
                return Results.Problem(
                    title: "Failed to add role: " + string.Join(", ", added.Errors.Select(e => e.Description)),
                    statusCode: StatusCodes.Status400BadRequest);
            }

            return Results.Ok(new { isAdmin = true, message = $"Granted Admin role to {target.Email}." });
        })
        .WithName("AdminToggleUserAdmin");

        // ---- Propietarios -----------------------------------------------------------

        group.MapGet("/landlords", async (
            string? email,
            ListingTier? tier,
            int? page,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var query = db.LandlordProfiles.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(email))
            {
                var filter = email.Trim();
                query = query.Where(l => l.User.Email!.Contains(filter));
            }
            if (tier.HasValue) query = query.Where(l => l.Tier == tier.Value);

            var totalRows = await query.CountAsync(ct);
            var pageIndex = page is null or < 1 ? 1 : page.Value;

            // La unica pantalla que ordena y pagina en SQL: ordena por Tier (int) y por email
            // (texto), que SQLite si traduce.
            var rows = await query
                .OrderByDescending(l => l.Tier)
                .ThenBy(l => l.User.Email)
                .Skip((pageIndex - 1) * PageSize)
                .Take(PageSize)
                .Select(l => new
                {
                    l.Id,
                    Email = l.User.Email ?? string.Empty,
                    l.CompanyName,
                    l.Tier,
                    l.TierExpiresAt,
                    l.IsVerified,
                    // Se cuentan las propiedades reales en vez de leer el contador
                    // desnormalizado TotalListings, que puede haber quedado desfasado.
                    ListingsCount = l.Properties.Count
                })
                .ToListAsync(ct);

            var mapped = rows.Select(l => new AdminLandlordRow(
                l.Id, l.Email, l.CompanyName, l.Tier,
                ListingTierExtensions.Resolve(l.Tier, l.TierExpiresAt),
                l.TierExpiresAt, l.IsVerified, l.ListingsCount)).ToList();

            return Results.Ok(new AdminPage<AdminLandlordRow>(mapped, totalRows, pageIndex, PageSize));
        })
        .WithName("AdminLandlords");

        group.MapPost("/landlords/{id:guid}/tier", async (
            Guid id,
            SetTierRequest request,
            IValidator<SetTierRequest> validator,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var landlord = await db.LandlordProfiles.FirstOrDefaultAsync(l => l.Id == id, ct);
            if (landlord is null) return Results.NotFound(new { message = "Landlord not found." });

            landlord.Tier = request.Tier;
            // Limited no caduca: guardar una fecha ahi dejaria una vigencia sin efecto que
            // reaparecería como "expirada" en la tabla.
            landlord.TierExpiresAt = request.Tier == ListingTier.Limited ? null : request.ExpiresAt;
            landlord.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            // El tier NO se propaga a las propiedades del landlord: son dos ventas distintas.
            return Results.Ok(new { message = "Tier updated." });
        })
        .WithName("AdminSetLandlordTier");

        // ---- Propiedades ------------------------------------------------------------

        group.MapGet("/properties", async (
            string? city,
            ListingTier? tier,
            ListingStatus? status,
            string? landlord,
            int? page,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var query = db.Properties.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(city))
            {
                var filter = city.Trim();
                query = query.Where(p => p.City.Contains(filter));
            }
            if (tier.HasValue) query = query.Where(p => p.Tier == tier.Value);
            if (status.HasValue) query = query.Where(p => p.Status == status.Value);
            if (!string.IsNullOrWhiteSpace(landlord))
            {
                var filter = landlord.Trim();
                query = query.Where(p => p.LandlordProfile.User.Email!.Contains(filter));
            }

            var totalRows = await query.CountAsync(ct);
            var pageIndex = page is null or < 1 ? 1 : page.Value;

            // Proyeccion completa y despues orden + pagina en memoria: el segundo criterio es
            // CreatedAt (DateTimeOffset), que SQLite no ordena.
            var raw = await query
                .Select(p => new
                {
                    p.Id,
                    p.Title,
                    CityName = p.City,
                    LandlordEmail = p.LandlordProfile.User.Email ?? string.Empty,
                    p.Status,
                    p.Tier,
                    p.TierExpiresAt,
                    p.CreatedAt
                })
                .ToListAsync(ct);

            var rows = raw
                .OrderByDescending(p => p.Tier)
                .ThenByDescending(p => p.CreatedAt)
                .Skip((pageIndex - 1) * PageSize)
                .Take(PageSize)
                .Select(p => new AdminPropertyRow(
                    p.Id, p.Title, p.CityName, p.LandlordEmail, p.Status, p.Tier,
                    ListingTierExtensions.Resolve(p.Tier, p.TierExpiresAt),
                    p.TierExpiresAt, p.CreatedAt))
                .ToList();

            return Results.Ok(new AdminPage<AdminPropertyRow>(rows, totalRows, pageIndex, PageSize));
        })
        .WithName("AdminProperties");

        group.MapPost("/properties/{id:guid}/tier", async (
            Guid id,
            SetTierRequest request,
            IValidator<SetTierRequest> validator,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var property = await db.Properties.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (property is null) return Results.NotFound(new { message = "Property not found." });

            property.Tier = request.Tier;
            property.TierExpiresAt = request.Tier == ListingTier.Limited ? null : request.ExpiresAt;
            property.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { message = "Tier updated." });
        })
        .WithName("AdminSetPropertyTier");
    }
}
