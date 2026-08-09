using System.Security.Claims;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Auth;
using Rent.Api.Features.Listings;
using Rent.Api.Features.Shared;
using Rent.Api.Features.Shared.Services;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;
using Rent.Api.Infrastructure.Storage;

namespace Rent.Api.Features.LandlordPortal;

/// <summary>
/// CRUD de listings del landlord (port de LandlordManage/Pages/Listings del origen). El
/// formulario viaja como JSON; las fotos van aparte por multipart. Todas las consultas llevan
/// el filtro de dueno DENTRO del Where: el rol Landlord por si solo no basta.
/// </summary>
public static class LandlordListingEndpoints
{
    private const int MaxPhotosPerListing = 10;

    public static void MapLandlordListingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/landlord/listings")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .RequireAuthorization(policy => policy.RequireRole(Roles.Landlord))
            .WithTags("LandlordListings");

        group.MapGet("/", async (
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            var raw = await db.Properties
                .AsNoTracking()
                .Where(p => p.LandlordProfileId == userId)
                .Select(p => new
                {
                    p.Id,
                    p.Title,
                    p.Slug,
                    p.City,
                    p.Province,
                    p.Status,
                    p.ViewCount,
                    p.LeadCount,
                    p.CreatedAt,
                    // Recamaras y precio salen de la MISMA unidad (la mas barata): tomarlos de
                    // dos subconsultas con orden distinto haria que la fila mezclara dos unidades.
                    // El cast a double es por SQLite (el banco de pruebas), que no ordena decimal.
                    Cheapest = p.Units
                        .OrderBy(u => (double)u.Price)
                        .Select(u => new { u.Bedrooms, u.Price })
                        .FirstOrDefault(),
                    UnitCount = p.Units.Count,
                    PrimaryImageUrl = p.Images
                        .OrderByDescending(i => i.IsPrimary)
                        .ThenBy(i => i.DisplayOrder)
                        .Select(i => i.Url)
                        .FirstOrDefault(),
                    CitySlug = db.Cities
                        .Where(c => c.Name == p.City)
                        .Select(c => c.Slug)
                        .FirstOrDefault() ?? string.Empty
                })
                .ToListAsync(ct);

            // Orden en memoria: SQLite (el banco de pruebas) no sabe ordenar DateTimeOffset.
            var rows = raw
                .OrderByDescending(p => p.CreatedAt)
                .Select(p => new LandlordListingRowDto(
                    p.Id, p.Title, p.Slug, p.City, p.CitySlug, p.Province, p.Status,
                    p.Cheapest?.Bedrooms, p.Cheapest?.Price, p.UnitCount,
                    p.ViewCount, p.LeadCount, p.PrimaryImageUrl))
                .ToList();

            return Results.Ok(rows);
        })
        .WithName("LandlordListings");

        group.MapGet("/{id:guid}", async (
            Guid id,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            var property = await db.Properties
                .AsNoTracking()
                .Include(p => p.Units)
                .Include(p => p.Images)
                .Include(p => p.Amenities)
                .FirstOrDefaultAsync(p => p.Id == id && p.LandlordProfileId == userId, ct);
            if (property is null) return Results.NotFound();

            return Results.Ok(new LandlordListingDetailDto(
                property.Id,
                property.Title,
                property.Description,
                property.PropertyType,
                property.Status,
                property.StreetAddress,
                property.City,
                property.Province,
                property.PostalCode,
                property.Neighbourhood,
                property.PetsAllowed,
                property.Furnished,
                property.LeaseTerm,
                property.ParkingType,
                property.YearBuilt,
                property.TotalFloors,
                property.Amenities.Select(a => a.Id).ToList(),
                property.Units
                    .OrderBy(u => u.Price)
                    .Select(u => new ListingUnitInput(
                        u.Id, u.Bedrooms, u.Bathrooms, u.SqFt, u.Price,
                        u.AvailableDate, u.AvailableUnits))
                    .ToList(),
                ToImageDtos(property.Images)));
        })
        .WithName("LandlordListingDetail");

        group.MapPost("/", async (
            ListingFormRequest request,
            IValidator<ListingFormRequest> validator,
            AppDbContext db,
            ClaimsPrincipal principal,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var userId = CurrentUser.GetId(principal)!.Value;

            // Un titulo sin caracteres [a-z0-9] (CJK, solo emojis...) produce slug vacio y la
            // URL publica del listing colapsaria a la ruta de la ciudad. Fallback neutro.
            var baseSlug = SlugGenerator.From(request.Title);
            if (baseSlug.Length == 0) baseSlug = "listing";
            var slug = await SlugGenerator.UniqueAsync(db, baseSlug, null, ct);

            var property = new Property
            {
                Id = Guid.NewGuid(),
                LandlordProfileId = userId,
                Title = request.Title.Trim(),
                Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
                PropertyType = request.PropertyType,
                Status = request.Status,
                // El tier lo decide el negocio, nunca el formulario: todo listing nace Limited.
                Tier = ListingTier.Limited,
                StreetAddress = request.StreetAddress.Trim(),
                City = request.CityName.Trim(),
                Province = request.Province.Trim(),
                PostalCode = request.PostalCode.Trim(),
                Neighbourhood = string.IsNullOrWhiteSpace(request.Neighbourhood) ? null : request.Neighbourhood.Trim(),
                Slug = slug,
                PetsAllowed = request.PetsAllowed,
                Furnished = request.Furnished,
                LeaseTerm = request.LeaseTerm,
                ParkingType = string.IsNullOrWhiteSpace(request.ParkingType) ? null : request.ParkingType.Trim(),
                YearBuilt = request.YearBuilt,
                TotalFloors = request.TotalFloors
            };

            if (request.AmenityIds.Count > 0)
            {
                // Ids inexistentes se ignoran en silencio, igual que el origen.
                var amenities = await db.Amenities
                    .Where(a => request.AmenityIds.Contains(a.Id))
                    .ToListAsync(ct);
                foreach (var amenity in amenities) property.Amenities.Add(amenity);
            }

            foreach (var input in request.Units)
            {
                property.Units.Add(new Unit
                {
                    Id = Guid.NewGuid(),
                    PropertyId = property.Id,
                    Bedrooms = input.Bedrooms,
                    Bathrooms = input.Bathrooms,
                    SqFt = input.SqFt,
                    Price = input.Price,
                    AvailableDate = input.AvailableDate,
                    AvailableUnits = input.AvailableUnits
                });
            }

            db.Properties.Add(property);
            await db.SaveChangesAsync(ct);

            loggerFactory.CreateLogger("LandlordPortal.Listings").LogInformation(
                "Landlord {LandlordId} created property {PropertyId} ({Slug})",
                userId, property.Id, property.Slug);

            return Results.Ok(new { id = property.Id, message = "landlord.listingCreated" });
        })
        .WithName("CreateLandlordListing");

        group.MapPut("/{id:guid}", async (
            Guid id,
            ListingFormRequest request,
            IValidator<ListingFormRequest> validator,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var userId = CurrentUser.GetId(principal)!.Value;

            var property = await db.Properties
                .Include(p => p.Units)
                .Include(p => p.Amenities)
                .FirstOrDefaultAsync(p => p.Id == id && p.LandlordProfileId == userId, ct);
            if (property is null) return Results.NotFound();

            property.Title = request.Title.Trim();
            property.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
            property.PropertyType = request.PropertyType;
            property.Status = request.Status;
            property.StreetAddress = request.StreetAddress.Trim();
            property.City = request.CityName.Trim();
            property.Province = request.Province.Trim();
            property.PostalCode = request.PostalCode.Trim();
            property.Neighbourhood = string.IsNullOrWhiteSpace(request.Neighbourhood) ? null : request.Neighbourhood.Trim();
            property.PetsAllowed = request.PetsAllowed;
            property.Furnished = request.Furnished;
            property.LeaseTerm = request.LeaseTerm;
            property.ParkingType = string.IsNullOrWhiteSpace(request.ParkingType) ? null : request.ParkingType.Trim();
            property.YearBuilt = request.YearBuilt;
            property.TotalFloors = request.TotalFloors;
            property.UpdatedAt = DateTimeOffset.UtcNow;
            // El Slug NO se regenera: se fija al crear. Regenerarlo cambiaba la URL publica al
            // editar el titulo y dejaba en 404 los bookmarks y los links ya enviados por email.
            // El Tier tampoco se toca: no es del formulario.

            property.Amenities.Clear();
            if (request.AmenityIds.Count > 0)
            {
                var amenities = await db.Amenities
                    .Where(a => request.AmenityIds.Contains(a.Id))
                    .ToListAsync(ct);
                foreach (var amenity in amenities) property.Amenities.Add(amenity);
            }

            // Merge por Id: NO borrar-y-recrear. Recrear romperia las FK y perderia CreatedAt.
            var keptIds = request.Units.Where(u => u.Id.HasValue).Select(u => u.Id!.Value).ToHashSet();
            foreach (var removed in property.Units.Where(u => !keptIds.Contains(u.Id)).ToList())
            {
                // Solo la coleccion: Unit.PropertyId es requerido, asi que EF borra el huerfano
                // en cascada. Anadir tambien db.Units.Remove emite un segundo DELETE de la misma
                // fila y el segundo afecta 0 filas -> DbUpdateConcurrencyException.
                property.Units.Remove(removed);
            }

            foreach (var input in request.Units)
            {
                var unit = input.Id.HasValue
                    ? property.Units.FirstOrDefault(u => u.Id == input.Id.Value)
                    : null;
                if (unit is null)
                {
                    // Add explicito en el DbSet: Unit.Id se inicializa con Guid.NewGuid(), asi
                    // que al anadirla solo por la navegacion EF ve la clave puesta, la cree
                    // existente y emite UPDATE en vez de INSERT (0 filas -> excepcion).
                    unit = new Unit { Id = Guid.NewGuid(), PropertyId = property.Id };
                    db.Units.Add(unit);
                    property.Units.Add(unit);
                }

                unit.Bedrooms = input.Bedrooms;
                unit.Bathrooms = input.Bathrooms;
                unit.SqFt = input.SqFt;
                unit.Price = input.Price;
                unit.AvailableDate = input.AvailableDate;
                unit.AvailableUnits = input.AvailableUnits;
                unit.UpdatedAt = DateTimeOffset.UtcNow;
            }

            await db.SaveChangesAsync(ct);

            return Results.Ok(new { message = "landlord.listingUpdated" });
        })
        .WithName("UpdateLandlordListing");

        // Soft delete, como el origen: el listing se desactiva, nunca se borra. Ni filas ni
        // archivos: los favoritos y consultas que cuelgan de el siguen teniendo sentido.
        group.MapPost("/{id:guid}/deactivate", async (
            Guid id,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            var property = await db.Properties
                .FirstOrDefaultAsync(p => p.Id == id && p.LandlordProfileId == userId, ct);
            if (property is null) return Results.NotFound();

            property.Status = ListingStatus.Inactive;
            property.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { message = "landlord.listingDeactivated" });
        })
        .WithName("DeactivateLandlordListing");

        // Las fotos van aparte del form JSON. El antiforgery integrado de los endpoints con
        // form se apaga porque el filtro del grupo ya valida la cabecera X-XSRF-TOKEN — es la
        // misma proteccion, aplicada de forma uniforme en toda la API.
        group.MapPost("/{id:guid}/photos", async (
            Guid id,
            IFormFileCollection files,
            AppDbContext db,
            IImageStorage storage,
            ClaimsPrincipal principal,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;
            var logger = loggerFactory.CreateLogger("LandlordPortal.Photos");

            var property = await db.Properties
                .Include(p => p.Images)
                .FirstOrDefaultAsync(p => p.Id == id && p.LandlordProfileId == userId, ct);
            if (property is null) return Results.NotFound();

            var nextOrder = property.Images.Count == 0 ? 0 : property.Images.Max(i => i.DisplayOrder) + 1;
            var hasPrimary = property.Images.Any(i => i.IsPrimary);
            var room = Math.Max(0, MaxPhotosPerListing - property.Images.Count);

            string? warning = files.Count > room ? "landlord.imageTooMany" : null;

            foreach (var file in files.Take(room))
            {
                if (file.Length == 0) continue;
                try
                {
                    var url = await storage.SaveAsync(property.Id, file, ct);
                    var image = new PropertyImage
                    {
                        Id = Guid.NewGuid(),
                        PropertyId = property.Id,
                        Url = url,
                        AltText = property.Title,
                        IsPrimary = !hasPrimary,
                        DisplayOrder = nextOrder++
                    };
                    // Add explicito en el DbSet: la clave ya viene puesta y anadirla solo por
                    // la navegacion haria que EF emitiera UPDATE. El fixup del Add ya la mete
                    // en property.Images; anadirla tambien a mano duplicaba la referencia y el
                    // endpoint devolvia la galeria con la foto repetida.
                    db.PropertyImages.Add(image);
                    hasPrimary = true;
                }
                catch (Exception ex)
                {
                    // Un archivo rechazado por el storage no debe tumbar la subida entera: el
                    // landlord perderia el resto del lote.
                    logger.LogWarning(ex, "Rejected image {FileName} for property {PropertyId}",
                        file.FileName, property.Id);
                    warning = "landlord.imageRejected";
                }
            }

            await db.SaveChangesAsync(ct);

            return Results.Ok(new ListingPhotosResponse(ToImageDtos(property.Images), warning));
        })
        .WithName("UploadLandlordListingPhotos")
        .WithMetadata(new RequestSizeLimitAttribute(40 * 1024 * 1024))
        .DisableAntiforgery();

        group.MapPost("/{id:guid}/photos/{imageId:guid}/cover", async (
            Guid id,
            Guid imageId,
            AppDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            var property = await db.Properties
                .Include(p => p.Images)
                .FirstOrDefaultAsync(p => p.Id == id && p.LandlordProfileId == userId, ct);
            if (property is null) return Results.NotFound();
            if (property.Images.All(i => i.Id != imageId)) return Results.NotFound();

            foreach (var image in property.Images) image.IsPrimary = image.Id == imageId;
            await db.SaveChangesAsync(ct);

            return Results.Ok(new ListingPhotosResponse(ToImageDtos(property.Images), null));
        })
        .WithName("SetLandlordListingCover");

        group.MapDelete("/{id:guid}/photos/{imageId:guid}", async (
            Guid id,
            Guid imageId,
            AppDbContext db,
            IImageStorage storage,
            ClaimsPrincipal principal,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var userId = CurrentUser.GetId(principal)!.Value;

            var property = await db.Properties
                .Include(p => p.Images)
                .FirstOrDefaultAsync(p => p.Id == id && p.LandlordProfileId == userId, ct);
            if (property is null) return Results.NotFound();

            var image = property.Images.FirstOrDefault(i => i.Id == imageId);
            if (image is null) return Results.NotFound();

            var wasPrimary = image.IsPrimary;
            property.Images.Remove(image);
            db.PropertyImages.Remove(image);

            // Si se borro la portada, promover la siguiente para no dejar la ficha sin cover.
            if (wasPrimary)
            {
                var next = property.Images.OrderBy(i => i.DisplayOrder).FirstOrDefault();
                if (next is not null) next.IsPrimary = true;
            }

            // Fila primero, archivo despues: huerfano fisico se acepta, fila huerfana no. Al
            // reves, un fallo del SaveChanges dejaria en la galeria una imagen cuyo archivo
            // ya no existe.
            await db.SaveChangesAsync(ct);

            try
            {
                await storage.DeleteAsync(image.Url, ct);
            }
            catch (Exception ex)
            {
                loggerFactory.CreateLogger("LandlordPortal.Photos")
                    .LogWarning(ex, "Could not delete blob for image {ImageId}", image.Id);
            }

            return Results.Ok(new ListingPhotosResponse(ToImageDtos(property.Images), null));
        })
        .WithName("DeleteLandlordListingPhoto");
    }

    private static IReadOnlyList<ListingImageDto> ToImageDtos(IEnumerable<PropertyImage> images) =>
        images
            .OrderByDescending(i => i.IsPrimary)
            .ThenBy(i => i.DisplayOrder)
            .Select(i => new ListingImageDto(i.Id, i.Url, i.AltText, i.IsPrimary, i.DisplayOrder, i.Category))
            .ToList();
}
