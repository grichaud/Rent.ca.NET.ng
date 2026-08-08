using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;

namespace Rent.Api.Infrastructure.Data.Seed;

public static class CitiesSeeder
{
    public static async Task SeedAsync(AppDbContext db, CancellationToken ct = default)
    {
        var cities = BuildCities();

        if (!await db.Cities.AnyAsync(ct))
        {
            db.Cities.AddRange(cities);
            await db.SaveChangesAsync(ct);
            return;
        }

        // Idempotent upgrade: refresh lat/lng/imageUrl on existing rows so prod databases
        // pick up the corrected Toronto coords and the new Unsplash image URLs without a
        // full wipe. Match by Slug (the only stable key).
        var bySlug = cities.ToDictionary(c => c.Slug);
        var existing = await db.Cities.ToListAsync(ct);
        var dirty = false;
        foreach (var row in existing)
        {
            if (!bySlug.TryGetValue(row.Slug, out var canonical)) continue;
            if (Math.Abs((row.Latitude ?? 0) - canonical.Latitude!.Value) > 0.001
                || Math.Abs((row.Longitude ?? 0) - canonical.Longitude!.Value) > 0.001
                || row.ImageUrl != canonical.ImageUrl
                || row.IsFeatured != canonical.IsFeatured)
            {
                row.Latitude = canonical.Latitude;
                row.Longitude = canonical.Longitude;
                row.ImageUrl = canonical.ImageUrl;
                row.IsFeatured = canonical.IsFeatured;
                dirty = true;
            }
        }
        if (dirty) await db.SaveChangesAsync(ct);
    }

    private static City[] BuildCities()
    {
        // Photo IDs match the cities.ts list in the Next.js source so the look stays consistent.
        return new[]
        {
            New("Toronto",        "ON", true,  43.6532,  -79.3832, Unsplash("1517935706615-2717063c2225")),
            New("Montreal",       "QC", true,  45.5017,  -73.5673, Unsplash("1519178614-68673b201f36")),
            New("Vancouver",      "BC", true,  49.2827, -123.1207, Unsplash("1609825488888-3a766db05542")),
            New("Calgary",        "AB", true,  51.0447, -114.0719, Unsplash("1680488736383-6e890a804b50")),
            New("Ottawa",         "ON", true,  45.4215,  -75.6972, Unsplash("1720050238968-0f591061438d")),
            New("Edmonton",       "AB", true,  53.5461, -113.4938, Unsplash("1641186539288-9c3f26725b12")),
            New("Winnipeg",       "MB", true,  49.8951,  -97.1384, Unsplash("1579454554937-235af69990bf")),
            New("Quebec City",    "QC", true,  46.8139,  -71.2080, Unsplash("1764911866769-bc27bb312c6f")),
            New("Hamilton",       "ON", true,  43.2557,  -79.8711, Unsplash("1598473801496-5b0e74340936")),
            New("Kitchener",      "ON", false, 43.4516,  -80.4925),
            New("London",         "ON", true,  42.9849,  -81.2453, Unsplash("1615288283030-0e966c5688c2")),
            New("Victoria",       "BC", false, 48.4284, -123.3656),
            New("Halifax",        "NS", true,  44.6488,  -63.5752, Unsplash("1570902128092-950ebe50a3da")),
            New("Oshawa",         "ON", false, 43.8971,  -78.8658),
            New("Windsor",        "ON", false, 42.3149,  -83.0364),
            New("Saskatoon",      "SK", true,  52.1332, -106.6700, Unsplash("1484949909760-d37c642ad869")),
            New("Regina",         "SK", false, 50.4452, -104.6189),
            New("St. John's",     "NL", false, 47.5615,  -52.7126),
            New("Barrie",         "ON", false, 44.3894,  -79.6903),
            New("Kelowna",        "BC", false, 49.8880, -119.4960),
            New("Sherbrooke",     "QC", false, 45.4040,  -71.8929),
            New("Guelph",         "ON", false, 43.5448,  -80.2482),
            New("Abbotsford",     "BC", false, 49.0504, -122.3045),
            New("Kingston",       "ON", false, 44.2312,  -76.4860),
            New("Trois-Rivieres", "QC", false, 46.3432,  -72.5432),
            New("Moncton",        "NB", false, 46.0878,  -64.7782),
            New("Saguenay",       "QC", false, 48.4168,  -71.0650),
            New("Burnaby",        "BC", false, 49.2488, -122.9805),
            New("Mississauga",    "ON", false, 43.5890,  -79.6441),
            New("Brampton",       "ON", false, 43.7315,  -79.7624),
        };
    }

    private static string Unsplash(string id) =>
        $"https://images.unsplash.com/photo-{id}?w=600&h=600&fit=crop&q=80";

    private static City New(string name, string province, bool featured, double lat, double lng, string? image = null)
    {
        return new City
        {
            Name = name,
            Province = province,
            Slug = Slugify(name),
            IsFeatured = featured,
            Latitude = lat,
            Longitude = lng,
            ImageUrl = image,
            ListingCount = 0
        };
    }

    private static string Slugify(string name) => name
        .ToLowerInvariant()
        .Replace("'", "")
        .Replace(".", "")
        .Replace(" ", "-");
}
