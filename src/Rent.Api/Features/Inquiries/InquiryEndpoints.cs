using System.Security.Claims;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Rent.Api.Domain;
using Rent.Api.Features.Auth;
using Rent.Api.Features.Email;
using Rent.Api.Features.Shared;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.Inquiries;

public sealed record InquiryRequest(
    Guid PropertyId,
    string SenderName,
    string SenderEmail,
    string? SenderPhone,
    string Message,
    DateOnly? MoveInDate,
    string? Culture);

public sealed class InquiryRequestValidator : AbstractValidator<InquiryRequest>
{
    public InquiryRequestValidator()
    {
        RuleFor(x => x.PropertyId).NotEmpty();
        RuleFor(x => x.SenderName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.SenderEmail).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.SenderPhone).MaximumLength(30);
        RuleFor(x => x.Message).NotEmpty().MinimumLength(10).MaximumLength(4000);
        RuleFor(x => x.MoveInDate)
            .Must(d => d is null || d >= DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)))
            .WithMessage("Move-in date must be today or later.");
    }
}

public static class InquiryEndpoints
{
    public static void MapInquiryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/inquiries")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .WithTags("Inquiries");

        // Anonimo a proposito, igual que el origen: exigir cuenta para preguntar por un piso
        // perderia la mayoria de los contactos. Si hay sesion se guarda quien fue.
        group.MapPost("/", async (
            InquiryRequest request,
            IValidator<InquiryRequest> validator,
            AppDbContext db,
            IEmailSender emailSender,
            IOptions<AppOptions> appOptions,
            ClaimsPrincipal principal,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Inquiries.Submit");

            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var property = await db.Properties
                .AsNoTracking()
                .Include(p => p.LandlordProfile)
                    .ThenInclude(lp => lp.User)
                .FirstOrDefaultAsync(
                    p => p.Id == request.PropertyId && p.Status == ListingStatus.Active, ct);

            if (property is null)
            {
                // Clave de traduccion y no texto: la pantalla que lo pinta conoce el idioma.
                return Results.Problem(
                    title: "detail.inquiryListingInactive",
                    statusCode: StatusCodes.Status404NotFound);
            }

            db.ContactInquiries.Add(new ContactInquiry
            {
                Id = Guid.NewGuid(),
                PropertyId = request.PropertyId,
                SenderUserId = CurrentUser.GetId(principal),
                SenderName = request.SenderName.Trim(),
                SenderEmail = request.SenderEmail.Trim(),
                SenderPhone = string.IsNullOrWhiteSpace(request.SenderPhone) ? null : request.SenderPhone.Trim(),
                Message = request.Message.Trim(),
                MoveInDate = request.MoveInDate,
                IsRead = false
            });

            await db.Properties
                .Where(p => p.Id == request.PropertyId)
                .ExecuteUpdateAsync(s => s.SetProperty(pp => pp.LeadCount, pp => pp.LeadCount + 1), ct);

            await db.SaveChangesAsync(ct);

            logger.LogInformation(
                "Inquiry submitted for property {PropertyId} by {Email}",
                request.PropertyId, request.SenderEmail);

            try
            {
                var landlordEmail = property.LandlordProfile?.User?.Email;
                if (!string.IsNullOrWhiteSpace(landlordEmail))
                {
                    // El origen del enlace es el del CLIENTE, no el de esta API: quien abre el
                    // correo es una persona y tiene que aterrizar en la pagina, no en un JSON.
                    var client = appOptions.Value.ClientBaseUrl.TrimEnd('/');
                    var culture = AuthHelpers.NormalizeCulture(request.Culture);
                    var citySlug = await db.Cities
                        .Where(c => c.Name == property.City)
                        .Select(c => c.Slug)
                        .FirstOrDefaultAsync(ct);

                    var propertyUrl = string.IsNullOrEmpty(citySlug)
                        ? $"{client}/{culture}"
                        : $"{client}/{culture}/{citySlug}/{property.Slug}";

                    await emailSender.SendInquiryToLandlordAsync(new InquiryEmail(
                        LandlordEmail: landlordEmail,
                        LandlordName: property.LandlordProfile?.User?.FullName ?? "there",
                        PropertyTitle: property.Title,
                        PropertyUrl: propertyUrl,
                        InboxUrl: $"{client}/{culture}/landlord/inbox",
                        SenderName: request.SenderName.Trim(),
                        SenderEmail: request.SenderEmail.Trim(),
                        SenderPhone: string.IsNullOrWhiteSpace(request.SenderPhone)
                            ? null
                            : request.SenderPhone.Trim(),
                        Message: request.Message.Trim(),
                        MoveInDate: request.MoveInDate), ct);
                }
            }
            catch (Exception ex)
            {
                // La consulta ya esta guardada y visible en el inbox del propietario: que el
                // aviso por correo falle no puede convertirse en un error para quien pregunta.
                logger.LogWarning(ex, "Failed to send inquiry email for property {PropertyId}", request.PropertyId);
            }

            return Results.Ok(new { message = "detail.inquirySent" });
        })
        .AllowAnonymous()
        .WithName("SubmitInquiry");
    }
}
