using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Auth;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.Admin;

/// <summary>
/// Promociones, busquedas populares y uso de la IA (port de Features/Admin/Pages Specials,
/// Searches, Ai y AiConversation del origen).
/// </summary>
public static class AdminContentEndpoints
{
    private const int PageSize = 50;
    private const int TopSearches = 20;
    private const int RecentConversations = 25;

    /// <summary>4 caracteres por token: la regla de bolsillo del origen para estimar coste.</summary>
    private const int CharsPerToken = 4;
    private const decimal CostPerMillionTokens = 800m / 1000m;

    public static void MapAdminContentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .RequireAuthorization(policy => policy.RequireRole(Roles.Admin))
            .WithTags("Admin");

        // ---- Promociones ------------------------------------------------------------

        group.MapGet("/specials", async (
            int? page,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var totalRows = await db.RentSpecials.CountAsync(ct);
            var pageIndex = page is null or < 1 ? 1 : page.Value;

            var raw = await db.RentSpecials
                .AsNoTracking()
                .Select(s => new AdminSpecialRow(
                    s.Id,
                    s.PropertyId,
                    s.Property.Title,
                    s.Property.City,
                    s.Title,
                    s.Description,
                    s.StartDate,
                    s.EndDate,
                    s.IsActive,
                    s.CreatedAt))
                .ToListAsync(ct);

            // Activas primero y dentro de cada grupo las mas nuevas. En memoria: CreatedAt es
            // DateTimeOffset.
            var rows = raw
                .OrderByDescending(s => s.IsActive)
                .ThenByDescending(s => s.CreatedAt)
                .Skip((pageIndex - 1) * PageSize)
                .Take(PageSize)
                .ToList();

            var options = await db.Properties
                .AsNoTracking()
                .Select(p => new AdminPropertyOption(p.Id, p.Title, p.City))
                .ToListAsync(ct);

            return Results.Ok(new AdminSpecialsResponse(
                rows,
                totalRows,
                pageIndex,
                PageSize,
                options.OrderBy(p => p.City).ThenBy(p => p.Title).ToList()));
        })
        .WithName("AdminSpecials");

        group.MapPost("/specials", async (
            CreateSpecialRequest request,
            IValidator<CreateSpecialRequest> validator,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            if (!await db.Properties.AnyAsync(p => p.Id == request.PropertyId, ct))
                return Results.NotFound(new { message = "Property not found." });

            var special = new RentSpecial
            {
                Id = Guid.NewGuid(),
                PropertyId = request.PropertyId,
                Title = request.Title.Trim(),
                Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
                StartDate = request.StartDate,
                EndDate = request.EndDate,
                IsActive = request.IsActive,
                CreatedAt = DateTimeOffset.UtcNow
            };

            db.RentSpecials.Add(special);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { id = special.Id, message = $"Special '{special.Title}' created." });
        })
        .WithName("AdminCreateSpecial");

        group.MapPut("/specials/{id:guid}", async (
            Guid id,
            UpdateSpecialRequest request,
            IValidator<UpdateSpecialRequest> validator,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var special = await db.RentSpecials.FirstOrDefaultAsync(s => s.Id == id, ct);
            if (special is null) return Results.NotFound(new { message = "Special not found." });

            // La propiedad no se toca: mover una promocion de piso es crear otra.
            special.Title = request.Title.Trim();
            special.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
            special.StartDate = request.StartDate;
            special.EndDate = request.EndDate;
            special.IsActive = request.IsActive;
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { message = $"Special '{special.Title}' updated." });
        })
        .WithName("AdminUpdateSpecial");

        // Por defecto desactiva; ?hard=true borra de verdad. Es el mismo par del origen: una
        // promocion caducada suele querer conservarse como historico.
        group.MapDelete("/specials/{id:guid}", async (
            Guid id,
            bool? hard,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var special = await db.RentSpecials.FirstOrDefaultAsync(s => s.Id == id, ct);
            if (special is null) return Results.NotFound(new { message = "Special not found." });

            string message;
            if (hard == true)
            {
                db.RentSpecials.Remove(special);
                message = "Special permanently deleted.";
            }
            else
            {
                special.IsActive = false;
                message = "Special deactivated (soft-delete).";
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { message });
        })
        .WithName("AdminDeleteSpecial");

        // ---- Busquedas populares ----------------------------------------------------

        group.MapGet("/searches", async (
            string? q,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var query = db.PopularSearches.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(q))
            {
                var filter = q.Trim();
                query = query.Where(s => s.NormalizedQuery.Contains(filter) || s.CitySlug.Contains(filter));
            }

            var raw = await query.ToListAsync(ct);

            // Top 20 por uso; el desempate por fecha obliga a ordenar en memoria.
            var rows = raw
                .OrderByDescending(s => s.SearchCount)
                .ThenByDescending(s => s.LastSearchedAt)
                .Take(TopSearches)
                .Select(s => new AdminSearchRow(
                    s.Id, s.NormalizedQuery, s.CitySlug, s.SearchCount, s.LastSearchedAt))
                .ToList();

            return Results.Ok(rows);
        })
        .WithName("AdminSearches");

        group.MapPut("/searches/{id:guid}", async (
            Guid id,
            UpdateSearchRequest request,
            IValidator<UpdateSearchRequest> validator,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var entry = await db.PopularSearches.FirstOrDefaultAsync(s => s.Id == id, ct);
            if (entry is null) return Results.NotFound(new { message = "Entry not found." });

            // Se normaliza igual que al registrar la busqueda; si no, la fila editada dejaria
            // de casar con el upsert del tracker y se duplicaria en la siguiente busqueda.
            entry.NormalizedQuery = request.NormalizedQuery.Trim().ToLowerInvariant();
            entry.CitySlug = (request.CitySlug ?? string.Empty).Trim().ToLowerInvariant();
            // SearchCount y LastSearchedAt no se tocan: son telemetria, no contenido editable.

            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Indice unico (NormalizedQuery, CitySlug): fusionar dos filas de telemetria
                // no es algo que el panel deba decidir por su cuenta.
                return Results.Problem(
                    title: "An entry with that query/city already exists. Use Delete instead.",
                    statusCode: StatusCodes.Status409Conflict);
            }

            return Results.Ok(new { message = "Search entry updated." });
        })
        .WithName("AdminUpdateSearch");

        group.MapDelete("/searches/{id:guid}", async (
            Guid id,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var entry = await db.PopularSearches.FirstOrDefaultAsync(s => s.Id == id, ct);
            if (entry is null) return Results.NotFound(new { message = "Entry not found." });

            db.PopularSearches.Remove(entry);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { message = "Search entry deleted." });
        })
        .WithName("AdminDeleteSearch");

        // ---- Uso de la IA -----------------------------------------------------------

        group.MapGet("/ai", async (
            string? userEmail,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var totalConversations = await db.AiConversations.CountAsync(ct);
            var totalMessages = await db.AiMessages.CountAsync(ct);

            // Estimacion de tokens sumando longitudes en memoria: a escala de portafolio son
            // unos cientos de mensajes y evita depender de LEN() del proveedor.
            var lengths = await db.AiMessages.AsNoTracking()
                .Select(m => m.Content.Length)
                .ToListAsync(ct);
            var totalChars = lengths.Sum(l => (long)l);
            var estimatedTokens = totalChars / CharsPerToken;
            var estimatedCost = estimatedTokens / 1_000_000m * CostPerMillionTokens;

            var toolBreakdown = await db.AiMessages.AsNoTracking()
                .Where(m => m.Role == AiMessageRole.Tool && m.ToolName != null)
                .GroupBy(m => m.ToolName!)
                .Select(g => new AiToolUsage(g.Key, g.Count()))
                .ToListAsync(ct);

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var since = DateTimeOffset.UtcNow.AddDays(-7);
            var stamps = await db.AiMessages.AsNoTracking()
                .Select(m => m.CreatedAt)
                .ToListAsync(ct);

            var perDay = stamps
                .Where(stamp => stamp >= since)
                .GroupBy(stamp => DateOnly.FromDateTime(stamp.UtcDateTime))
                .ToDictionary(g => g.Key, g => g.Count());

            // Siempre 7 cubos, del mas antiguo al de hoy: un dia sin actividad tiene que
            // aparecer como barra a cero, no desaparecer del grafico.
            var buckets = Enumerable.Range(0, 7)
                .Select(offset => today.AddDays(offset - 6))
                .Select(date => new AiDailyBucket(date, perDay.TryGetValue(date, out var count) ? count : 0))
                .ToList();

            var conversationQuery = db.AiConversations.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(userEmail))
            {
                var filter = userEmail.Trim();
                conversationQuery = conversationQuery.Where(
                    c => c.User != null && c.User.Email != null && c.User.Email.Contains(filter));
            }

            var conversations = await conversationQuery
                .Select(c => new
                {
                    c.Id,
                    c.UpdatedAt,
                    c.Title,
                    UserEmail = c.User != null ? c.User.Email : null,
                    c.SessionId
                })
                .ToListAsync(ct);

            var top = conversations
                .OrderByDescending(c => c.UpdatedAt)
                .Take(RecentConversations)
                .ToList();
            var topIds = top.Select(c => c.Id).ToHashSet();

            var messages = await db.AiMessages.AsNoTracking()
                .Where(m => topIds.Contains(m.ConversationId))
                .Select(m => new { m.ConversationId, m.Content, m.CreatedAt })
                .ToListAsync(ct);

            var byConversation = messages
                .GroupBy(m => m.ConversationId)
                .ToDictionary(g => g.Key, g => g.ToList());

            var recent = top.Select(c =>
            {
                byConversation.TryGetValue(c.Id, out var own);
                var last = own?.OrderByDescending(m => m.CreatedAt).FirstOrDefault();
                return new AiRecentConversation(
                    c.Id, c.UpdatedAt, c.Title, c.UserEmail, c.SessionId,
                    own?.Count ?? 0, Truncate(last?.Content, 80));
            }).ToList();

            return Results.Ok(new AdminAiResponse(
                totalConversations,
                totalMessages,
                estimatedTokens,
                estimatedCost,
                toolBreakdown.OrderByDescending(t => t.Count).ToList(),
                buckets,
                recent));
        })
        .WithName("AdminAi");

        group.MapGet("/ai/{id:guid}", async (
            Guid id,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var conversation = await db.AiConversations
                .AsNoTracking()
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.Id == id, ct);
            if (conversation is null) return Results.NotFound();

            var raw = await db.AiMessages.AsNoTracking()
                .Where(m => m.ConversationId == id)
                .ToListAsync(ct);

            // Orden ascendente: una conversacion se lee de arriba abajo.
            var messages = raw
                .OrderBy(m => m.CreatedAt)
                .Select(m => new AiMessageDto(
                    m.Id, m.Role, m.Content, m.ToolName, m.ToolArgsJson, m.ToolResultJson, m.CreatedAt))
                .ToList();

            return Results.Ok(new AdminAiConversationResponse(
                conversation.Id,
                conversation.Title,
                conversation.User?.Email,
                conversation.SessionId,
                conversation.CreatedAt,
                messages));
        })
        .WithName("AdminAiConversation");
    }

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrEmpty(value)) return null;
        return value.Length <= max ? value : value[..max] + "…";
    }
}
