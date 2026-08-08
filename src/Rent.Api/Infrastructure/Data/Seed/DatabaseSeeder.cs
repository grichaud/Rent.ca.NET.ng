using System.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Infrastructure.Data.Seed;

public static class DatabaseSeeder
{
    public static async Task RunAsync(IServiceProvider services, CancellationToken ct = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger(typeof(DatabaseSeeder).FullName!);

        // Azure SQL Free tier (serverless) auto-pauses after 1h idle and takes ~30-60s to
        // resume. On a cold start we must wait for it to come back online BEFORE migrating;
        // otherwise MigrateAsync throws (error 40613) and â€” since RunAsync is awaited before
        // app.Run() â€” the whole process crashes and the front end returns ERR_CONNECTION_CLOSED.
        await WaitForDatabaseAsync(db, logger, ct);

        await db.Database.MigrateAsync(ct);

        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        foreach (var role in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(role));
            }
        }

        await CitiesSeeder.SeedAsync(db, ct);
        await AmenitiesSeeder.SeedAsync(db, ct);

        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<Domain.ApplicationUser>>();
        await SamplePropertiesSeeder.SeedAsync(db, userManager, ct);
        await RentSpecialsSeeder.SeedAsync(db, ct);

        var environment = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        await AdminUserSeeder.SeedAsync(userManager, environment, configuration, ct);
    }

    /// <summary>
    /// Polls the database connection until it is reachable, giving a serverless database that
    /// is resuming from auto-pause time to come online. Probes the raw ADO.NET connection (not
    /// through EF's retry strategy) so each attempt fails fast and the total wait stays bounded.
    /// Best-effort: if the window elapses it returns without throwing, so app startup can proceed
    /// and per-request retries (EnableRetryOnFailure) take over once the database is back.
    /// </summary>
    private static async Task WaitForDatabaseAsync(AppDbContext db, ILogger logger, CancellationToken ct)
    {
        const int maxAttempts = 8;
        var delay = TimeSpan.FromSeconds(5);
        var connection = db.Database.GetDbConnection();

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                if (connection.State != ConnectionState.Open)
                {
                    await connection.OpenAsync(ct);
                }

                await connection.CloseAsync();

                if (attempt > 1)
                {
                    logger.LogInformation(
                        "Database reachable after {Attempt} attempt(s) (it was likely resuming from serverless auto-pause).",
                        attempt);
                }

                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex,
                    "Database not reachable yet (attempt {Attempt}/{MaxAttempts}); it may be resuming from serverless auto-pause.",
                    attempt, maxAttempts);

                if (attempt < maxAttempts)
                {
                    await Task.Delay(delay, ct);
                }
            }
        }

        logger.LogWarning(
            "Database still not reachable after the warm-up window. Continuing startup anyway; per-request retries will recover once it resumes.");
    }
}
