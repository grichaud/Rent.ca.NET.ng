using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Rent.Api.Domain;
using Rent.Api.Features.Email;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.Auth;

/// <summary>
/// Inicio de sesion con Google. Se conserva el flujo por redireccion del origen en vez de
/// pasar a un token de cliente: el intercambio ocurre entre servidor y proveedor, y el
/// navegador nunca ve el secreto.
///
/// La diferencia con el origen es a donde se vuelve. Alli el callback devolvia una pagina; aqui
/// la pagina la sirve el cliente Angular, en OTRO origen, asi que el callback termina en un
/// redirect a <c>ClientBaseUrl</c>. Los avisos de error viajan como codigo en la query
/// (<c>?authError=...</c>) y no como texto, para que el cliente los traduzca al idioma activo.
/// </summary>
public static class ExternalAuthEndpoints
{
    public static void MapExternalAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth/external")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .WithTags("Auth");

        group.MapGet("/challenge", (
            string provider,
            string? returnUrl,
            string? culture,
            SignInManager<ApplicationUser> signInManager) =>
        {
            var normalizedCulture = AuthHelpers.NormalizeCulture(culture);
            var callback = $"/api/auth/external/callback?culture={normalizedCulture}";
            if (AuthHelpers.IsLocalPath(returnUrl))
                callback += $"&returnUrl={Uri.EscapeDataString(returnUrl!)}";

            var properties = signInManager.ConfigureExternalAuthenticationProperties(provider, callback);
            return Results.Challenge(properties, [provider]);
        })
        .AllowAnonymous()
        .WithName("ExternalChallenge");

        group.MapGet("/callback", async (
            string? remoteError,
            string? returnUrl,
            string? culture,
            SignInManager<ApplicationUser> signInManager,
            UserManager<ApplicationUser> userManager,
            IOptions<AppOptions> appOptions,
            ILoggerFactory loggerFactory) =>
        {
            var logger = loggerFactory.CreateLogger("Auth.ExternalCallback");
            var client = appOptions.Value.ClientBaseUrl.TrimEnd('/');
            var normalizedCulture = AuthHelpers.NormalizeCulture(culture);

            if (!string.IsNullOrEmpty(remoteError))
            {
                logger.LogWarning("External provider returned error: {Error}", remoteError);
                return Results.Redirect($"{client}/{normalizedCulture}/login?authError=google-failed");
            }

            var info = await signInManager.GetExternalLoginInfoAsync();
            if (info is null)
            {
                logger.LogWarning(
                    "ExternalLoginCallback: external cookie missing/expired immediately after provider redirect.");
                return Results.Redirect($"{client}/{normalizedCulture}/login?authError=external-info-missing");
            }

            var signIn = await signInManager.ExternalLoginSignInAsync(
                info.LoginProvider, info.ProviderKey, isPersistent: true, bypassTwoFactor: true);

            if (signIn.Succeeded)
            {
                logger.LogInformation(
                    "External login {Provider} succeeded for {Key}.", info.LoginProvider, info.ProviderKey);
                return await RedirectAfterSignInAsync(
                    info.GetEmail(), returnUrl, client, normalizedCulture, userManager);
            }

            var email = info.GetEmail();
            if (!string.IsNullOrWhiteSpace(email))
            {
                var existing = await userManager.FindByEmailAsync(email);
                if (existing is not null)
                {
                    // La cuenta ya existe con contrasena: se enlaza el proveedor en vez de
                    // fallar por correo duplicado.
                    var addLogin = await userManager.AddLoginAsync(existing, info);
                    if (addLogin.Succeeded)
                    {
                        await signInManager.SignInAsync(existing, isPersistent: true);
                        logger.LogInformation(
                            "Linked external login {Provider} to existing user {Email}.", info.LoginProvider, email);
                        return await RedirectAfterSignInAsync(
                            email, returnUrl, client, normalizedCulture, userManager);
                    }

                    logger.LogWarning(
                        "Failed to link external login for {Email}: {Errors}",
                        email, string.Join(", ", addLogin.Errors.Select(e => e.Description)));
                }
            }

            // Cuenta nueva: falta que el usuario elija rol. La cookie externa sigue viva y es
            // la que sostiene los datos hasta que confirme.
            var confirmUrl = $"{client}/{normalizedCulture}/external-login-confirm";
            if (AuthHelpers.IsLocalPath(returnUrl))
                confirmUrl += $"?returnUrl={Uri.EscapeDataString(returnUrl!)}";

            return Results.Redirect(confirmUrl);
        })
        .AllowAnonymous()
        .WithName("ExternalCallback");

        group.MapGet("/pending", async (SignInManager<ApplicationUser> signInManager) =>
        {
            var info = await signInManager.GetExternalLoginInfoAsync();
            if (info is null) return Results.Ok(new ExternalPendingResponse(null));

            return Results.Ok(new ExternalPendingResponse(new ExternalPendingDto(
                info.GetEmail() ?? string.Empty,
                info.ProviderDisplayName ?? info.LoginProvider,
                info.GetFullName() ?? string.Empty)));
        })
        .AllowAnonymous()
        .WithName("ExternalPending");

        group.MapPost("/confirm", async (
            ExternalConfirmRequest request,
            IValidator<ExternalConfirmRequest> validator,
            SignInManager<ApplicationUser> signInManager,
            UserManager<ApplicationUser> userManager,
            AppDbContext db,
            IEmailSender emailSender,
            IOptions<AppOptions> appOptions,
            ILoggerFactory loggerFactory,
            string? culture,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Auth.ExternalConfirm");

            var info = await signInManager.GetExternalLoginInfoAsync();
            if (info is null)
            {
                logger.LogWarning("ExternalLoginConfirm: external cookie missing/expired before user submitted.");
                return Results.Problem(
                    title: "Your sign-up session expired before you finished. Please start again.",
                    statusCode: StatusCodes.Status410Gone);
            }

            var email = info.GetEmail();
            if (string.IsNullOrWhiteSpace(email))
            {
                return Results.Problem(
                    title: "External provider did not return an email address.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var user = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                Email = email,
                UserName = email,
                FullName = request.FullName,
                // Lo confirma el proveedor: exigir otra verificacion por correo seria pedir dos
                // veces la misma prueba.
                EmailConfirmed = true
            };

            var create = await userManager.CreateAsync(user);
            if (!create.Succeeded) return create.Errors.ToValidationProblem();

            await userManager.AddToRoleAsync(user, request.Role);

            if (request.Role == Roles.Landlord)
            {
                db.LandlordProfiles.Add(new LandlordProfile
                {
                    Id = user.Id,
                    Tier = ListingTier.Limited
                });
                await db.SaveChangesAsync(ct);
            }

            var addLogin = await userManager.AddLoginAsync(user, info);
            if (!addLogin.Succeeded) return addLogin.Errors.ToValidationProblem();

            await signInManager.SignInAsync(user, isPersistent: true);
            logger.LogInformation(
                "User {Email} created via {Provider} with role {Role}.", user.Email, info.LoginProvider, request.Role);

            var portalPath = request.Role == Roles.Landlord ? "/landlord" : "/renter";
            var normalizedCulture = AuthHelpers.NormalizeCulture(culture);

            try
            {
                var client = appOptions.Value.ClientBaseUrl.TrimEnd('/');
                await emailSender.SendWelcomeAsync(
                    new WelcomeEmail(
                        user.Email!,
                        user.FullName ?? string.Empty,
                        request.Role,
                        $"{client}/{normalizedCulture}{portalPath}",
                        normalizedCulture),
                    ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to send welcome email to {Email}", user.Email);
            }

            var dto = await user.ToDtoAsync(userManager);
            return Results.Ok(new AuthResponse(dto, portalPath));
        })
        .AllowAnonymous()
        .WithName("ExternalConfirm");
    }

    private static async Task<IResult> RedirectAfterSignInAsync(
        string? email,
        string? returnUrl,
        string clientBaseUrl,
        string culture,
        UserManager<ApplicationUser> userManager)
    {
        if (AuthHelpers.IsLocalPath(returnUrl))
            return Results.Redirect($"{clientBaseUrl}{returnUrl}");

        var portalPath = "/";
        if (!string.IsNullOrWhiteSpace(email))
        {
            var user = await userManager.FindByEmailAsync(email);
            if (user is not null)
                portalPath = AuthHelpers.PortalPathFor(await userManager.GetRolesAsync(user));
        }

        var suffix = portalPath == "/" ? string.Empty : portalPath;
        return Results.Redirect($"{clientBaseUrl}/{culture}{suffix}");
    }
}
