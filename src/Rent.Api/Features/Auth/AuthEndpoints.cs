using System.Security.Claims;
using System.Text;
using FluentValidation;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using Rent.Api.Domain;
using Rent.Api.Features.Email;
using Rent.Api.Features.Shared;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.Auth;

public static class AuthEndpoints
{
    private const string GenericResetMessage =
        "If an account with that email exists, we've sent a link to reset your password.";

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        // El filtro de antiforgery se aplica al grupo entero y no endpoint por endpoint:
        // olvidarlo en uno solo bastaria para dejar el agujero abierto.
        var group = app.MapGroup("/api/auth")
            .AddEndpointFilter(AntiforgeryTokens.ValidateAsync)
            .WithTags("Auth");

        group.MapGet("/csrf", (HttpContext http, IAntiforgery antiforgery) =>
        {
            AntiforgeryTokens.Issue(http, antiforgery);
            return Results.NoContent();
        })
        .AllowAnonymous()
        .WithName("GetCsrfToken");

        // Devuelve 200 con null y no 401 cuando no hay sesion: preguntar "quien soy" siendo
        // anonimo es una respuesta valida, no un fallo. Un 401 aqui obligaria al cliente a
        // tratar como error el caso normal de visitante sin cuenta.
        group.MapGet("/me", async (
            ClaimsPrincipal principal,
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager) =>
        {
            var providers = (await signInManager.GetExternalAuthenticationSchemesAsync())
                .Select(s => s.Name)
                .ToList();

            if (CurrentUser.GetId(principal) is not Guid userId)
                return Results.Ok(new MeResponse(null, providers));

            var user = await userManager.FindByIdAsync(userId.ToString());
            if (user is null) return Results.Ok(new MeResponse(null, providers));

            return Results.Ok(new MeResponse(await user.ToDtoAsync(userManager), providers));
        })
        .AllowAnonymous()
        .WithName("GetCurrentUser");

        group.MapPost("/login", async (
            LoginRequest request,
            SignInManager<ApplicationUser> signInManager,
            UserManager<ApplicationUser> userManager) =>
        {
            var email = request.Email?.Trim() ?? string.Empty;

            var result = await signInManager.PasswordSignInAsync(
                email, request.Password ?? string.Empty, request.RememberMe, lockoutOnFailure: false);

            if (!result.Succeeded)
            {
                // Mismo mensaje se equivoque en el correo o en la contrasena: distinguirlos
                // convierte el login en un detector de que direcciones estan registradas.
                return Results.Problem(
                    title: "Invalid email or password.",
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            var user = await userManager.FindByEmailAsync(email);
            if (user is null)
            {
                return Results.Problem(
                    title: "Invalid email or password.",
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            var dto = await user.ToDtoAsync(userManager);
            return Results.Ok(new AuthResponse(dto, AuthHelpers.PortalPathFor(dto.Roles)));
        })
        .AllowAnonymous()
        .WithName("Login");

        group.MapPost("/signup", async (
            SignupRequest request,
            IValidator<SignupRequest> validator,
            UserManager<ApplicationUser> userManager,
            SignInManager<ApplicationUser> signInManager,
            AppDbContext db,
            IEmailSender emailSender,
            IOptions<AppOptions> appOptions,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Auth.Signup");

            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var user = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                Email = request.Email.Trim(),
                UserName = request.Email.Trim(),
                FullName = request.FullName
            };

            var create = await userManager.CreateAsync(user, request.Password);
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

            await signInManager.SignInAsync(user, isPersistent: true);
            logger.LogInformation("User {Email} signed up with role {Role}.", user.Email, request.Role);

            var portalPath = request.Role == Roles.Landlord ? "/landlord" : "/renter";
            var culture = AuthHelpers.NormalizeCulture(request.Culture);

            try
            {
                var clientBaseUrl = appOptions.Value.ClientBaseUrl.TrimEnd('/');
                await emailSender.SendWelcomeAsync(
                    new WelcomeEmail(
                        user.Email!,
                        user.FullName ?? string.Empty,
                        request.Role,
                        $"{clientBaseUrl}/{culture}{portalPath}",
                        culture),
                    ct);
            }
            catch (Exception ex)
            {
                // Un fallo del proveedor de correo no puede tumbar un alta ya consumada: la
                // cuenta existe y la sesion esta iniciada.
                logger.LogWarning(ex, "Failed to send welcome email to {Email}", user.Email);
            }

            var dto = await user.ToDtoAsync(userManager);
            return Results.Ok(new AuthResponse(dto, portalPath));
        })
        .AllowAnonymous()
        .WithName("Signup");

        group.MapPost("/logout", async (SignInManager<ApplicationUser> signInManager) =>
        {
            await signInManager.SignOutAsync();
            return Results.NoContent();
        })
        .AllowAnonymous()
        .WithName("Logout");

        group.MapPost("/forgot-password", async (
            ForgotPasswordRequest request,
            UserManager<ApplicationUser> userManager,
            IEmailSender emailSender,
            IOptions<AppOptions> appOptions,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Auth.ForgotPassword");
            var email = request.Email?.Trim() ?? string.Empty;
            var culture = AuthHelpers.NormalizeCulture(request.Culture);

            var user = string.IsNullOrEmpty(email) ? null : await userManager.FindByEmailAsync(email);
            if (user is not null && !string.IsNullOrEmpty(user.Email))
            {
                try
                {
                    var token = await userManager.GeneratePasswordResetTokenAsync(user);
                    var encoded = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
                    var clientBaseUrl = appOptions.Value.ClientBaseUrl.TrimEnd('/');
                    var resetUrl =
                        $"{clientBaseUrl}/{culture}/reset-password?email={Uri.EscapeDataString(user.Email)}&token={encoded}";

                    await emailSender.SendPasswordResetAsync(
                        new PasswordResetEmail(user.Email, user.FullName ?? string.Empty, resetUrl, culture), ct);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to send password reset email to {Email}", user.Email);
                }
            }
            else
            {
                logger.LogInformation("Password reset requested for unknown email {Email}; suppressed.", email);
            }

            // Misma respuesta exista o no la cuenta: lo contrario convierte este endpoint en un
            // comprobador de direcciones registradas.
            return Results.Ok(new { message = GenericResetMessage });
        })
        .AllowAnonymous()
        .WithName("ForgotPassword");

        // Permite a la pantalla de restablecer decidir si pinta el formulario o la tarjeta de
        // "enlace caducado" ANTES de que el usuario escriba una contrasena nueva.
        group.MapGet("/reset-password/validate", async (
            string? email,
            string? token,
            UserManager<ApplicationUser> userManager) =>
        {
            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(token))
                return Results.Ok(new { valid = false });

            var user = await userManager.FindByEmailAsync(email);
            if (user is null) return Results.Ok(new { valid = false });

            try
            {
                var decoded = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token));
                var valid = await userManager.VerifyUserTokenAsync(
                    user,
                    userManager.Options.Tokens.PasswordResetTokenProvider,
                    "ResetPassword",
                    decoded);
                return Results.Ok(new { valid });
            }
            catch (FormatException)
            {
                return Results.Ok(new { valid = false });
            }
        })
        .AllowAnonymous()
        .WithName("ValidateResetToken");

        group.MapPost("/reset-password", async (
            ResetPasswordRequest request,
            IValidator<ResetPasswordRequest> validator,
            UserManager<ApplicationUser> userManager,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Auth.ResetPassword");

            var validation = await validator.ValidateAsync(request, ct);
            if (!validation.IsValid) return validation.ToValidationProblem();

            var user = await userManager.FindByEmailAsync(request.Email);
            if (user is null)
            {
                // Mismo desenlace exista o no el usuario, igual que en el origen.
                return Results.Ok(new { message = "Password updated. You can now log in." });
            }

            string decodedToken;
            try
            {
                decodedToken = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(request.Token));
            }
            catch (FormatException)
            {
                return TokenExpired();
            }

            var result = await userManager.ResetPasswordAsync(user, decodedToken, request.Password);
            if (!result.Succeeded)
            {
                // Un token invalido o caducado merece la tarjeta de recuperacion; los demas
                // fallos (politica de contrasena) se pintan sobre el formulario.
                if (result.Errors.Any(e => e.Code.Contains("Token", StringComparison.OrdinalIgnoreCase)))
                    return TokenExpired();

                return result.Errors.ToValidationProblem();
            }

            logger.LogInformation("Password reset for {Email}.", user.Email);
            return Results.Ok(new { message = "Password updated. You can now log in." });
        })
        .AllowAnonymous()
        .WithName("ResetPassword");

        app.MapExternalAuthEndpoints();
    }

    private static IResult TokenExpired() => Results.Problem(
        title: "Reset link is invalid or expired.",
        statusCode: StatusCodes.Status410Gone);
}
