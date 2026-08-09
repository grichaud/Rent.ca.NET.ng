using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Rent.Api.Domain;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Infrastructure.Data.Seed;

/// <summary>
/// Crea la primera cuenta de administrador.
///
/// Existe por un problema de huevo y gallina: el alta publica solo entrega los roles Renter y
/// Landlord —un administrador no se auto-nombra— y conceder el rol exige ya ser admin. Sin
/// esta siembra, un despliegue nuevo se queda con el panel inaccesible para siempre.
///
/// Fuera de desarrollo hay que pedirlo explicitamente Y dar una contrasena por configuracion:
/// la de desarrollo es publica (esta en este mismo archivo y en los scripts de validacion), y
/// sembrarla en una URL abierta a internet seria regalar el panel.
/// </summary>
public static class AdminUserSeeder
{
    public const string DefaultEmail = "admin@rent.local";

    /// <summary>Solo para desarrollo. En cualquier otro entorno la contrasena es obligatoria.</summary>
    public const string DevelopmentPassword = "Admin123!";

    public static async Task SeedAsync(
        UserManager<ApplicationUser> userManager,
        IHostEnvironment environment,
        IConfiguration configuration,
        ILogger logger,
        CancellationToken ct = default)
    {
        var isDevelopment = environment.IsDevelopment();
        var explicitOptIn = configuration.GetValue<bool>("Admin:SeedDefaultAdmin");

        if (!isDevelopment && !explicitOptIn) return;

        var email = configuration["Admin:SeedEmail"] ?? DefaultEmail;
        var password = configuration["Admin:SeedPassword"];

        if (!isDevelopment && string.IsNullOrWhiteSpace(password))
        {
            // Se avisa y NO se siembra: arrancar con la contrasena de desarrollo seria peor
            // que quedarse sin admin, porque el agujero no se notaria.
            logger.LogError(
                "Admin:SeedDefaultAdmin esta activo pero falta Admin:SeedPassword. No se siembra " +
                "ningun administrador: fuera de desarrollo la contrasena tiene que venir de " +
                "configuracion, nunca del codigo.");
            return;
        }

        password ??= DevelopmentPassword;

        var existing = await userManager.FindByEmailAsync(email);
        if (existing is not null)
        {
            // La contrasena de una cuenta que ya existe NO se toca: seria pisar el cambio que
            // el administrador haya hecho desde su pantalla de cuenta.
            if (!await userManager.IsInRoleAsync(existing, Roles.Admin))
                await userManager.AddToRoleAsync(existing, Roles.Admin);
            return;
        }

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            UserName = email,
            FullName = "Site Admin",
            EmailConfirmed = true
        };

        var created = await userManager.CreateAsync(user, password);
        if (!created.Succeeded)
        {
            logger.LogError(
                "No se pudo crear el administrador {Email}: {Errors}",
                email, string.Join(", ", created.Errors.Select(e => e.Description)));
            return;
        }

        await userManager.AddToRoleAsync(user, Roles.Admin);
        logger.LogInformation("Administrador sembrado: {Email}", email);
    }
}
