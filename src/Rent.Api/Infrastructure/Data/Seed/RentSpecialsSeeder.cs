using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;

namespace Rent.Api.Infrastructure.Data.Seed;

public static class RentSpecialsSeeder
{
    // Idempotent on (property slug, special title). When SamplePropertiesSeeder bumps its
    // version it deletes the old demo properties, which cascade-deletes their specials.
    // This seeder then re-inserts the canonical set below by looking up the new slugs.
    public static async Task SeedAsync(AppDbContext db, CancellationToken ct = default)
    {
        var specials = new[]
        {
            new SpecialSpec(
                Slug:"modern-condo-downtown-toronto",
                Title:"First month free",
                Description:"Sign a 12-month lease before month end and your first month is on us. Includes a parking spot and storage locker.",
                RunDays:60),
            new SpecialSpec(
                Slug:"luxury-loft-liberty-village",
                Title:"Half month off + no admin fees",
                Description:"Save half a month on rent and skip the application fees on any 12-month lease signed this season.",
                RunDays:45),
            new SpecialSpec(
                Slug:"ocean-view-condo-coal-harbour",
                Title:"Two weeks free + storage locker",
                Description:"Two weeks free rent and a complimentary storage locker for any new 12-month lease.",
                RunDays:60),
            new SpecialSpec(
                Slug:"chic-condo-old-montreal",
                Title:"Reduced security deposit",
                Description:"Half-month security deposit instead of one full month for new tenants this quarter.",
                RunDays:45),
            new SpecialSpec(
                Slug:"executive-condo-beltline-calgary",
                Title:"Utilities included for 6 months",
                Description:"Heat, water, and high-speed internet included in your rent for the first six months.",
                RunDays:60),
        };

        var now = DateTimeOffset.UtcNow;
        var added = false;
        foreach (var s in specials)
        {
            var property = await db.Properties
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Slug == s.Slug, ct);
            if (property is null) continue;

            var hasSpecial = await db.RentSpecials
                .AnyAsync(x => x.PropertyId == property.Id && x.Title == s.Title, ct);
            if (hasSpecial) continue;

            db.RentSpecials.Add(new RentSpecial
            {
                Id = Guid.NewGuid(),
                PropertyId = property.Id,
                Title = s.Title,
                Description = s.Description,
                StartDate = now.AddDays(-3),
                EndDate = now.AddDays(s.RunDays),
                IsActive = true,
                CreatedAt = now
            });
            added = true;
        }

        if (added) await db.SaveChangesAsync(ct);
    }

    private sealed record SpecialSpec(string Slug, string Title, string Description, int RunDays);
}
