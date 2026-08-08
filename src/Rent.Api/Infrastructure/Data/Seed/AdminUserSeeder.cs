using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Rent.Api.Domain;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Infrastructure.Data.Seed;

public static class AdminUserSeeder
{
    public const string DefaultEmail = "admin@rent.local";
    public const string DefaultPassword = "Admin123!";

    public static async Task SeedAsync(
        UserManager<ApplicationUser> userManager,
        IHostEnvironment environment,
        IConfiguration configuration,
        CancellationToken ct = default)
    {
        var explicitOptIn = configuration.GetValue<bool>("Admin:SeedDefaultAdmin");
        if (!environment.IsDevelopment() && !explicitOptIn)
        {
            return;
        }

        var existing = await userManager.FindByEmailAsync(DefaultEmail);
        if (existing is not null)
        {
            if (!await userManager.IsInRoleAsync(existing, Roles.Admin))
            {
                await userManager.AddToRoleAsync(existing, Roles.Admin);
            }
            return;
        }

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = DefaultEmail,
            UserName = DefaultEmail,
            FullName = "Site Admin",
            EmailConfirmed = true
        };

        var created = await userManager.CreateAsync(user, DefaultPassword);
        if (!created.Succeeded) return;

        await userManager.AddToRoleAsync(user, Roles.Admin);
    }
}
