using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;

namespace Rent.Api.Infrastructure.Data.Seed;

public static class AmenitiesSeeder
{
    public static async Task SeedAsync(AppDbContext db, CancellationToken ct = default)
    {
        if (await db.Amenities.AnyAsync(ct)) return;

        var amenities = new (string name, string category, string icon)[]
        {
            // Building
            ("Elevator",           "building", "elevator"),
            ("Gym",                "building", "dumbbell"),
            ("Pool",               "building", "waves"),
            ("Sauna",              "building", "flame"),
            ("Concierge",          "building", "concierge-bell"),
            ("Party Room",         "building", "party-popper"),
            ("Rooftop Terrace",    "building", "building-2"),
            ("Visitor Parking",    "building", "car-front"),
            ("Bike Storage",       "building", "bike"),
            ("Package Locker",     "building", "package"),
            ("Smart Access",       "building", "key-round"),
            // Unit
            ("Dishwasher",         "unit",     "utensils"),
            ("In-Suite Laundry",   "unit",     "shirt"),
            ("Balcony",            "unit",     "tree-palm"),
            ("Air Conditioning",   "unit",     "snowflake"),
            ("Central Heating",    "unit",     "thermometer"),
            ("Fireplace",          "unit",     "flame"),
            ("Hardwood Floors",    "unit",     "square"),
            ("Walk-in Closet",     "unit",     "door-open"),
            ("Storage Locker",     "unit",     "archive"),
            ("Ensuite Bathroom",   "unit",     "bath"),
            // Utilities included
            ("Heat Included",      "utilities","thermometer-sun"),
            ("Water Included",     "utilities","droplets"),
            ("Hydro Included",     "utilities","zap"),
            ("Internet Included",  "utilities","wifi"),
            ("Cable Included",     "utilities","tv"),
            // Lifestyle
            ("Pet Friendly",       "lifestyle","paw-print"),
            ("Cats Allowed",       "lifestyle","cat"),
            ("Dogs Allowed",       "lifestyle","dog"),
            ("Non-Smoking",        "lifestyle","ban"),
            ("Short Term OK",      "lifestyle","calendar-clock"),
            // Parking
            ("Underground Parking","parking",  "parking-square"),
            ("Outdoor Parking",    "parking",  "car"),
            ("EV Charging",        "parking",  "plug-zap"),
            // Accessibility
            ("Wheelchair Access",  "access",   "accessibility"),
            ("Ground Floor",       "access",   "arrow-down"),
            // Security
            ("24/7 Security",      "security", "shield-check"),
            ("Security Cameras",   "security", "camera"),
            ("Intercom",           "security", "phone")
        };

        db.Amenities.AddRange(amenities.Select(a => new Amenity
        {
            Name = a.name,
            Category = a.category,
            Icon = a.icon
        }));

        await db.SaveChangesAsync(ct);
    }
}
