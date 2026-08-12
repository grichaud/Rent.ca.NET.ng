using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Rent.Api.Domain;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Infrastructure.Data.Seed;

public static class SamplePropertiesSeeder
{
    private const string DemoLandlordEmail = "demo.landlord@rentca.net";

    /// <summary>
    /// Solo para desarrollo, igual que <see cref="AdminUserSeeder.DevelopmentPassword"/>: esta
    /// en el codigo y en BASELINE.md, asi que es publica.
    ///
    /// Este propietario es el dueno de TODO el catalogo de demo. Sembrar una contrasena conocida
    /// en una URL abierta a internet dejaria que cualquiera que lea el repositorio entre al portal
    /// y borre los anuncios del sitio. Fuera de desarrollo se genera una aleatoria que no se
    /// guarda en ningun sitio: nadie necesita iniciar sesion como el, solo tiene que existir para
    /// ser el propietario de las fichas.
    /// </summary>
    public const string DevelopmentPassword = "DemoLandlord1!";

    // Bump this when changing the sample data so prod re-seeds itself.
    // The version string is stored in the demo landlord's Description field. If it
    // does not match, all demo-landlord properties are wiped and re-inserted.
    private const string SeedVersion = "v5-2026-05-12-verified-badge";

    public static async Task SeedAsync(
        AppDbContext db,
        UserManager<ApplicationUser> userManager,
        IHostEnvironment environment,
        CancellationToken ct = default)
    {
        var (landlordId, profile) = await EnsureDemoLandlordAsync(db, userManager, environment);

        // Auto-upgrade prod databases whose seed predates this version. The signal is
        // the LandlordProfile.Description sentinel; on mismatch we wipe the demo-landlord
        // properties (Property cascade handles Units, Images, Inquiries, Favorites and the
        // PropertyAmenities junction) and re-insert the canonical catalog below.
        var seedTag = $"[seed:{SeedVersion}]";
        if (profile.Description is null || !profile.Description.Contains(seedTag))
        {
            var legacy = await db.Properties
                .Where(p => p.LandlordProfileId == landlordId)
                .ToListAsync(ct);
            if (legacy.Count > 0)
            {
                db.Properties.RemoveRange(legacy);
                await db.SaveChangesAsync(ct);
            }
            profile.Description = $"Sample listings populated by the seeder for portfolio demo purposes. {seedTag}";
            await db.SaveChangesAsync(ct);
        }

        if (await db.Properties.AnyAsync(p => p.LandlordProfileId == landlordId, ct))
            return;

        var amenities = await db.Amenities.ToDictionaryAsync(a => a.Name, ct);
        foreach (var (property, amenityNames) in BuildSamples(landlordId))
        {
            foreach (var name in amenityNames)
            {
                if (amenities.TryGetValue(name, out var amenity))
                    property.Amenities.Add(amenity);
            }
            db.Properties.Add(property);
        }
        await db.SaveChangesAsync(ct);
    }

    private static async Task<(Guid id, LandlordProfile profile)> EnsureDemoLandlordAsync(
        AppDbContext db,
        UserManager<ApplicationUser> userManager,
        IHostEnvironment environment)
    {
        var existing = await userManager.FindByEmailAsync(DemoLandlordEmail);
        if (existing is not null)
        {
            // Auto-reparacion de los despliegues que ya sembraron la contrasena publica. Sin esto,
            // el blindaje de abajo solo protegeria a las bases NUEVAS: la cuenta ya existe en
            // produccion y esta rama sale antes de tocarla. Se comprueba la contrasena conocida en
            // vez de rotar a ciegas en cada arranque, asi que despues del primer arranque
            // corregido esto no vuelve a escribir nada.
            if (!environment.IsDevelopment() && await userManager.CheckPasswordAsync(existing, DevelopmentPassword))
            {
                var token = await userManager.GeneratePasswordResetTokenAsync(existing);
                await userManager.ResetPasswordAsync(existing, token, GenerateUnguessablePassword());
            }

            var existingProfile = await db.LandlordProfiles.FirstAsync(p => p.Id == existing.Id);
            return (existing.Id, existingProfile);
        }

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = DemoLandlordEmail,
            UserName = DemoLandlordEmail,
            EmailConfirmed = true,
            FullName = "Demo Properties Inc."
        };
        var password = environment.IsDevelopment() ? DevelopmentPassword : GenerateUnguessablePassword();
        var result = await userManager.CreateAsync(user, password);
        if (!result.Succeeded)
            throw new InvalidOperationException("Failed to create demo landlord: " + string.Join("; ", result.Errors.Select(e => e.Description)));

        await userManager.AddToRoleAsync(user, Roles.Landlord);

        var profile = new LandlordProfile
        {
            Id = user.Id,
            CompanyName = "Demo Properties Inc.",
            Description = "Sample listings populated by the seeder for portfolio demo purposes.",
            IsVerified = true,
            Tier = ListingTier.Featured,
            LogoUrl = Photo.CondoTower
        };
        db.LandlordProfiles.Add(profile);
        await db.SaveChangesAsync();
        return (user.Id, profile);
    }

    /// <summary>
    /// Contrasena aleatoria que NO se guarda ni se registra en ningun sitio: se descarta en cuanto
    /// Identity la convierte en hash. Es deliberado — la cuenta solo tiene que existir para ser la
    /// propietaria del catalogo de demo, nadie inicia sesion con ella. Si algun dia hiciera falta
    /// entrar, la via es el restablecimiento por correo, no una constante en el codigo.
    ///
    /// El sufijo garantiza los requisitos de Identity (mayuscula, minuscula, digito y simbolo) sin
    /// depender de que los bytes aleatorios los cumplan por casualidad.
    /// </summary>
    private static string GenerateUnguessablePassword() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)) + "Aa1!";

    /// <summary>
    /// Real-estate stock photos. Each ID was visually verified to be a residential property.
    /// Mapping locks the Next.js canonical photo IDs from the Bloque E QA pass (2026-05-06):
    /// 7 IDs are taken straight from the Next.js seed; 2 IDs (BasementInterior, TownhouseExterior)
    /// were swapped for verified Photo.X constants because the Next.js originals were a tropical
    /// mansion (wrong for basement/duplex/apt) and an apartment block (wrong for townhouse).
    /// </summary>
    private static class Photo
    {
        private static string U(string id, int w = 1200, int h = 800) =>
            $"https://images.unsplash.com/photo-{id}?w={w}&h={h}&fit=crop&q=80";

        // Verified 2026-05-06 â€” see unsplash-photo-verification-bloque-E.png
        public static readonly string StudioInterior     = U("1522708323590-d24dbb6b0267"); // bright studio with kitchen + sleeping area
        public static readonly string ApartmentLiving    = U("1502672260266-1c1ef2d93688"); // cozy living room with couch + plants
        public static readonly string BasementInterior   = U("1666282167632-c613fbeb163c"); // SUBSTITUTED â€” couch + coffee table interior
        public static readonly string TownhouseExterior  = U("1706808849777-96e0d7be3bb7"); // SUBSTITUTED â€” modern house front yard
        public static readonly string ApartmentBuilding  = U("1460317442991-0ec209397118"); // mid-rise apartment with balconies
        public static readonly string CondoTower         = U("1486406146926-c627a92ad1ab"); // dark glass condo high-rise from below
        public static readonly string LoftExterior       = U("1545324418-cc1a3fa10c00"); // dark apartment building exterior
        public static readonly string ModernHousePool    = U("1600596542815-ffad4c1539a9"); // white modern house with pool
        public static readonly string ModernHouseDark    = U("1600585154340-be6161a56a0c"); // dark modern house at twilight

        // Secondary interior shots reused for image carousels.
        public static readonly string LivingRoom1        = U("1603072845032-7b5bd641a82a");
        public static readonly string LivingRoom2        = U("1738168279272-c08d6dd22002");
        public static readonly string LivingRoom3        = U("1647082550285-119acfd169f2");
        public static readonly string LivingRoom4        = U("1737233459465-8eaf6c7d8856");
        public static readonly string LivingRoom5        = U("1738168246881-40f35f8aba0a");
        public static readonly string Bedroom            = U("1662454419716-c4c504728811");
    }

    private static IEnumerable<(Property property, string[] amenities)> BuildSamples(Guid landlordId)
    {
        // ---- Toronto (8) ----
        yield return (Make(landlordId,
            title: "Cozy Studio near Riverdale Park",
            type: PropertyType.Studio,
            street: "123 Broadview Ave", city: "Toronto", province: "ON", postal: "M4K 2S1",
            neighbourhood: "Riverdale", lat: 43.6677, lng: -79.3530,
            slug: "cozy-studio-riverdale-park",
            tier: ListingTier.Limited,
            descriptionEn: "Bright and cozy studio apartment just steps from Riverdale Park.",
            descriptionFr: "Studio chaleureux et lumineux Ã  deux pas du parc Riverdale.",
            petsAllowed: true, furnished: false,
            units: [ new Unit { Bedrooms = 0, Bathrooms = 1, SqFt = 380, Price = 1550, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20)) } ],
            images: [ Photo.StudioInterior, Photo.LivingRoom1, Photo.Bedroom ]),
            ["Hardwood Floors", "Heat Included", "Cats Allowed"]);

        yield return (Make(landlordId,
            title: "Modern Apartment in Riverdale",
            type: PropertyType.Apartment,
            street: "88 Pape Ave", city: "Toronto", province: "ON", postal: "M4K 1Y3",
            neighbourhood: "Riverdale", lat: 43.6680, lng: -79.3475,
            slug: "modern-apartment-riverdale",
            tier: ListingTier.Limited,
            descriptionEn: "Stylish 1-bedroom in the heart of Riverdale with thoughtful finishes throughout.",
            descriptionFr: "Ã‰lÃ©gant 1 chambre au cÅ“ur de Riverdale avec des finitions soignÃ©es.",
            petsAllowed: true, furnished: true,
            units: [ new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 580, Price = 1950, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(15)) } ],
            images: [ Photo.ApartmentLiving, Photo.LivingRoom2, Photo.Bedroom ]),
            ["Hardwood Floors", "In-Suite Laundry", "Cats Allowed", "Heat Included"]);

        yield return (Make(landlordId,
            title: "Renovated Basement Suite in Bloor West Village",
            type: PropertyType.Basement,
            street: "2280 Bloor St W", city: "Toronto", province: "ON", postal: "M6S 1A4",
            neighbourhood: "Bloor West Village", lat: 43.6512, lng: -79.4818,
            slug: "renovated-basement-bloor-west-village",
            tier: ListingTier.Limited,
            descriptionEn: "Renovated basement suite in Bloor West Village, steps from the subway and High Park.",
            descriptionFr: "Sous-sol rÃ©novÃ© Ã  Bloor West Village, Ã  proximitÃ© du mÃ©tro et de High Park.",
            petsAllowed: true, furnished: false,
            units: [ new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 520, Price = 1580, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(25)) } ],
            images: [ Photo.BasementInterior, Photo.LivingRoom3 ]),
            ["Heat Included", "Water Included", "Cats Allowed"]);

        yield return (Make(landlordId,
            title: "Charming Townhouse in Riverdale",
            type: PropertyType.Townhouse,
            street: "246 Logan Ave", city: "Toronto", province: "ON", postal: "M4K 3E2",
            neighbourhood: "Riverdale", lat: 43.6650, lng: -79.3470,
            slug: "charming-townhouse-riverdale",
            tier: ListingTier.Promoted,
            descriptionEn: "Charming townhouse in Riverdale with multiple floor plans and a quiet leafy street.",
            descriptionFr: "Charmante maison de ville Ã  Riverdale avec plusieurs plans et une rue paisible et verdoyante.",
            petsAllowed: true, furnished: false,
            units:
            [
                new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 620, Price = 1250, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 880, Price = 2150, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20)) },
                new Unit { Bedrooms = 3, Bathrooms = 1, SqFt = 1100, Price = 2950, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)) }
            ],
            images: [ Photo.TownhouseExterior, Photo.LivingRoom4, Photo.Bedroom ]),
            ["Hardwood Floors", "Pet Friendly", "Dogs Allowed", "Outdoor Parking"]);

        yield return (Make(landlordId,
            title: "Spacious 2BR Apartment in Leslieville",
            type: PropertyType.Apartment,
            street: "412 Queen St E", city: "Toronto", province: "ON", postal: "M4M 1J6",
            neighbourhood: "Leslieville", lat: 43.6630, lng: -79.3340,
            slug: "spacious-2br-apartment-leslieville",
            tier: ListingTier.Promoted,
            descriptionEn: "Spacious two-bedroom apartment in Leslieville close to Queen Street cafÃ©s and parks.",
            descriptionFr: "Spacieux 2 chambres Ã  Leslieville prÃ¨s des cafÃ©s de la rue Queen et des parcs.",
            petsAllowed: true, furnished: false,
            units:
            [
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 760, Price = 1850, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(15)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 820, Price = 1950, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)) }
            ],
            images: [ Photo.ApartmentBuilding, Photo.LivingRoom5, Photo.Bedroom ]),
            ["Hardwood Floors", "In-Suite Laundry", "Cats Allowed", "Heat Included"]);

        yield return (Make(landlordId,
            title: "Modern Condo in the Heart of Downtown Toronto",
            type: PropertyType.Condo,
            street: "88 King St W", city: "Toronto", province: "ON", postal: "M5V 3K2",
            neighbourhood: "King West", lat: 43.6440, lng: -79.4006,
            slug: "modern-condo-downtown-toronto",
            tier: ListingTier.Featured,
            descriptionEn: "Modern downtown condo with skyline views in the King West entertainment corridor.",
            descriptionFr: "Condo moderne au centre-ville avec vue sur les gratte-ciel, dans le corridor King West.",
            petsAllowed: true, furnished: false,
            units:
            [
                new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 540, Price = 2350, AvailableUnits = 3, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 820, Price = 3250, AvailableUnits = 2, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)) },
                new Unit { Bedrooms = 3, Bathrooms = 1, SqFt = 1100, Price = 4700, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(21)) }
            ],
            images: [ Photo.CondoTower, Photo.LivingRoom1, Photo.LivingRoom3, Photo.Bedroom ]),
            ["Gym", "Pool", "Concierge", "Elevator", "In-Suite Laundry", "Smart Access", "Underground Parking", "Pet Friendly"]);

        yield return (Make(landlordId,
            title: "Luxury Loft in Liberty Village",
            type: PropertyType.Loft,
            street: "70 Jefferson Ave", city: "Toronto", province: "ON", postal: "M5V 0E5",
            neighbourhood: "Liberty Village", lat: 43.6390, lng: -79.4202,
            slug: "luxury-loft-liberty-village",
            tier: ListingTier.Featured,
            descriptionEn: "Luxury loft in Liberty Village with industrial details and easy access to King West.",
            descriptionFr: "Loft de luxe Ã  Liberty Village avec dÃ©tails industriels et accÃ¨s facile Ã  King West.",
            petsAllowed: false, furnished: true,
            units:
            [
                new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 720, Price = 2650, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 1040, Price = 3550, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(35)) }
            ],
            images: [ Photo.LoftExterior, Photo.LivingRoom2, Photo.Bedroom ]),
            ["Hardwood Floors", "Elevator", "In-Suite Laundry", "Air Conditioning", "Underground Parking"]);

        yield return (Make(landlordId,
            title: "Cozy Studio near University of Toronto",
            type: PropertyType.Studio,
            street: "215 Bloor St W", city: "Toronto", province: "ON", postal: "M5S 1X8",
            neighbourhood: "The Annex", lat: 43.6701, lng: -79.4080,
            slug: "cozy-studio-university-toronto",
            tier: ListingTier.Limited,
            descriptionEn: "Cozy studio near the University of Toronto in The Annex, perfect for students and faculty.",
            descriptionFr: "Studio chaleureux prÃ¨s de l'UniversitÃ© de Toronto dans The Annex, parfait pour Ã©tudiants et professeurs.",
            petsAllowed: false, furnished: true,
            units: [ new Unit { Bedrooms = 0, Bathrooms = 1, SqFt = 360, Price = 1450, AvailableUnits = 2, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)) } ],
            images: [ Photo.ApartmentLiving, Photo.LivingRoom4 ]),
            ["Heat Included", "Water Included", "Hardwood Floors"]);

        // ---- Vancouver (4) ----
        yield return (Make(landlordId,
            title: "Stunning Ocean-View Condo in Coal Harbour",
            type: PropertyType.Condo,
            street: "1166 W Georgia St", city: "Vancouver", province: "BC", postal: "V6E 4M3",
            neighbourhood: "Coal Harbour", lat: 49.2900, lng: -123.1290,
            slug: "ocean-view-condo-coal-harbour",
            tier: ListingTier.Featured,
            descriptionEn: "Stunning ocean-view condo with panoramic Coal Harbour views and luxury finishes.",
            descriptionFr: "Magnifique condo avec vue panoramique sur la mer Ã  Coal Harbour et finitions de luxe.",
            petsAllowed: false, furnished: true,
            units:
            [
                new Unit { Bedrooms = 2, Bathrooms = 2, SqFt = 1120, Price = 4800, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20)) },
                new Unit { Bedrooms = 3, Bathrooms = 2, SqFt = 1480, Price = 6200, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(40)) }
            ],
            images: [ Photo.CondoTower, Photo.LivingRoom1, Photo.LivingRoom5, Photo.Bedroom ]),
            ["Concierge", "Pool", "Sauna", "Gym", "Elevator", "24/7 Security", "Underground Parking", "In-Suite Laundry"]);

        yield return (Make(landlordId,
            title: "Modern 1BR in Kitsilano Steps from the Beach",
            type: PropertyType.Apartment,
            street: "2050 W 4th Ave", city: "Vancouver", province: "BC", postal: "V6K 1N4",
            neighbourhood: "Kitsilano", lat: 49.2700, lng: -123.1550,
            slug: "modern-1br-kitsilano-beach",
            tier: ListingTier.Promoted,
            descriptionEn: "Modern one-bedroom in Kitsilano just steps from the beach and West 4th cafÃ©s.",
            descriptionFr: "Moderne 1 chambre Ã  Kitsilano Ã  deux pas de la plage et des cafÃ©s de West 4th.",
            petsAllowed: true, furnished: false,
            units:
            [
                new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 540, Price = 2380, AvailableUnits = 2, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 760, Price = 2950, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(25)) }
            ],
            images: [ Photo.ApartmentBuilding, Photo.LivingRoom2 ]),
            ["Hardwood Floors", "Balcony", "Cats Allowed", "Dogs Allowed", "In-Suite Laundry"]);

        yield return (Make(landlordId,
            title: "Spacious House in East Vancouver",
            type: PropertyType.House,
            street: "1450 Commercial Dr", city: "Vancouver", province: "BC", postal: "V5L 3X1",
            neighbourhood: "Commercial Drive", lat: 49.2750, lng: -123.0700,
            slug: "spacious-house-east-vancouver",
            tier: ListingTier.Promoted,
            descriptionEn: "Spacious house in East Vancouver near Commercial Drive's vibrant restaurants and shops.",
            descriptionFr: "Maison spacieuse dans l'Est de Vancouver prÃ¨s des restaurants et boutiques de Commercial Drive.",
            petsAllowed: true, furnished: false,
            units:
            [
                new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 600, Price = 1650, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(15)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 950, Price = 2650, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)) },
                new Unit { Bedrooms = 3, Bathrooms = 1, SqFt = 1380, Price = 3850, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(45)) }
            ],
            images: [ Photo.ModernHousePool, Photo.LivingRoom3, Photo.Bedroom ]),
            ["Fireplace", "Pet Friendly", "Dogs Allowed", "Outdoor Parking"]);

        yield return (Make(landlordId,
            title: "Sleek Studio in Yaletown",
            type: PropertyType.Studio,
            street: "999 Pacific Blvd", city: "Vancouver", province: "BC", postal: "V6Z 2P3",
            neighbourhood: "Yaletown", lat: 49.2745, lng: -123.1209,
            slug: "sleek-studio-yaletown",
            tier: ListingTier.Limited,
            descriptionEn: "Sleek studio in the heart of Yaletown with floor-to-ceiling windows and city views.",
            descriptionFr: "Studio Ã©lÃ©gant au cÅ“ur de Yaletown avec fenÃªtres pleine hauteur et vue sur la ville.",
            petsAllowed: false, furnished: true,
            units: [ new Unit { Bedrooms = 0, Bathrooms = 1, SqFt = 420, Price = 1850, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)) } ],
            images: [ Photo.LoftExterior, Photo.LivingRoom4 ]),
            ["Gym", "Concierge", "Elevator", "Smart Access"]);

        // ---- Montreal (3) ----
        yield return (Make(landlordId,
            title: "Chic Condo in Old Montreal",
            type: PropertyType.Condo,
            street: "470 Rue Saint-Pierre", city: "Montreal", province: "QC", postal: "H2Y 1T8",
            neighbourhood: "Old Montreal", lat: 45.5070, lng: -73.5560,
            slug: "chic-condo-old-montreal",
            tier: ListingTier.Featured,
            descriptionEn: "Chic condo in historic Old Montreal with cobblestone-street views and original details.",
            descriptionFr: "Condo chic dans le Vieux-MontrÃ©al historique avec vue sur les rues pavÃ©es et cachet d'origine.",
            petsAllowed: false, furnished: true,
            units:
            [
                new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 620, Price = 2800, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(15)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 880, Price = 3750, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)) }
            ],
            images: [ Photo.CondoTower, Photo.LivingRoom2, Photo.Bedroom ]),
            ["Hardwood Floors", "Elevator", "In-Suite Laundry", "Air Conditioning"]);

        yield return (Make(landlordId,
            title: "Classic Plateau Apartment with French Doors",
            type: PropertyType.Apartment,
            street: "4400 Rue Saint-Denis", city: "Montreal", province: "QC", postal: "H2W 2P5",
            neighbourhood: "Plateau-Mont-Royal", lat: 45.5230, lng: -73.5800,
            slug: "classic-plateau-apartment-montreal",
            tier: ListingTier.Promoted,
            descriptionEn: "Classic Plateau apartment with French doors, wood floors, and Mont-Royal nearby.",
            descriptionFr: "Appartement classique du Plateau avec portes franÃ§aises, planchers de bois et Mont-Royal Ã  proximitÃ©.",
            petsAllowed: true, furnished: false,
            units:
            [
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 800, Price = 1780, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 860, Price = 1850, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(35)) }
            ],
            images: [ Photo.ApartmentBuilding, Photo.LivingRoom5 ]),
            ["Hardwood Floors", "Balcony", "Pet Friendly", "Heat Included"]);

        yield return (Make(landlordId,
            title: "Bright Duplex in Mile End",
            type: PropertyType.Duplex,
            street: "5575 Avenue du Parc", city: "Montreal", province: "QC", postal: "H2T 1Y9",
            neighbourhood: "Mile End", lat: 45.5260, lng: -73.5970,
            slug: "bright-duplex-mile-end",
            tier: ListingTier.Limited,
            descriptionEn: "Bright duplex in Mile End close to bagels, coffee, and the Plateau metro station.",
            descriptionFr: "Duplex lumineux dans Mile End prÃ¨s des bagels, du cafÃ© et du mÃ©tro Plateau.",
            petsAllowed: true, furnished: false,
            units: [ new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 920, Price = 1680, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20)) } ],
            images: [ Photo.BasementInterior, Photo.LivingRoom1, Photo.Bedroom ]),
            ["Hardwood Floors", "Cats Allowed", "Heat Included", "Water Included"]);

        // ---- Calgary (3) ----
        yield return (Make(landlordId,
            title: "Executive Condo in Beltline Calgary",
            type: PropertyType.Condo,
            street: "1110 12 Ave SW", city: "Calgary", province: "AB", postal: "T2R 0T7",
            neighbourhood: "Beltline", lat: 51.0420, lng: -114.0750,
            slug: "executive-condo-beltline-calgary",
            tier: ListingTier.Featured,
            descriptionEn: "Executive condo in Beltline with downtown views and walking access to 17th Avenue.",
            descriptionFr: "Condo exÃ©cutif Ã  Beltline avec vue sur le centre-ville et accÃ¨s piÃ©ton Ã  la 17e Avenue.",
            petsAllowed: true, furnished: false,
            units:
            [
                new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 580, Price = 1980, AvailableUnits = 2, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 880, Price = 2680, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(25)) }
            ],
            images: [ Photo.CondoTower, Photo.LivingRoom3, Photo.Bedroom ]),
            ["Gym", "Pool", "Elevator", "Smart Access", "Pet Friendly", "Underground Parking"]);

        yield return (Make(landlordId,
            title: "Modern Townhouse in Garrison Woods",
            type: PropertyType.Townhouse,
            street: "2055 27 Ave SW", city: "Calgary", province: "AB", postal: "T2T 6E5",
            neighbourhood: "Garrison Woods", lat: 51.0260, lng: -114.0900,
            slug: "modern-townhouse-garrison-woods",
            tier: ListingTier.Promoted,
            descriptionEn: "Modern townhouse in Garrison Woods with a private garage and family-friendly streets.",
            descriptionFr: "Maison de ville moderne Ã  Garrison Woods avec garage privÃ© et rues conviviales pour les familles.",
            petsAllowed: true, furnished: false,
            units: [ new Unit { Bedrooms = 3, Bathrooms = 3, SqFt = 1620, Price = 2850, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)) } ],
            images: [ Photo.TownhouseExterior, Photo.LivingRoom4, Photo.Bedroom ]),
            ["Fireplace", "Pet Friendly", "Dogs Allowed", "Outdoor Parking", "Air Conditioning"]);

        yield return (Make(landlordId,
            title: "Affordable 1BR Apartment in Kensington",
            type: PropertyType.Apartment,
            street: "1217 Kensington Rd NW", city: "Calgary", province: "AB", postal: "T2N 3C8",
            neighbourhood: "Kensington", lat: 51.0510, lng: -114.0890,
            slug: "affordable-1br-apartment-kensington-calgary",
            tier: ListingTier.Limited,
            descriptionEn: "Affordable one-bedroom in Kensington with great walkability to shops and the Bow River.",
            descriptionFr: "1 chambre abordable Ã  Kensington avec excellente proximitÃ© des boutiques et de la riviÃ¨re Bow.",
            petsAllowed: false, furnished: false,
            units: [ new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 520, Price = 1550, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(15)) } ],
            images: [ Photo.ApartmentBuilding, Photo.LivingRoom2 ]),
            ["Heat Included", "Water Included", "Elevator"]);

        // ---- Edmonton (2) ----
        yield return (Make(landlordId,
            title: "Spacious 2BR in Oliver Edmonton",
            type: PropertyType.Apartment,
            street: "10130 104 St NW", city: "Edmonton", province: "AB", postal: "T5J 3K5",
            neighbourhood: "Oliver", lat: 53.5470, lng: -113.5050,
            slug: "spacious-2br-oliver-edmonton",
            tier: ListingTier.Promoted,
            descriptionEn: "Spacious two-bedroom in Oliver near downtown Edmonton's restaurants and ICE District.",
            descriptionFr: "Spacieux 2 chambres Ã  Oliver prÃ¨s des restaurants du centre-ville d'Edmonton et du ICE District.",
            petsAllowed: true, furnished: false,
            units:
            [
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 780, Price = 1780, AvailableUnits = 2, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(14)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 860, Price = 1980, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(28)) }
            ],
            images: [ Photo.LoftExterior, Photo.LivingRoom5, Photo.Bedroom ]),
            ["Gym", "Elevator", "In-Suite Laundry", "Air Conditioning", "Pet Friendly"]);

        yield return (Make(landlordId,
            title: "Cozy House in Strathcona Edmonton",
            type: PropertyType.House,
            street: "10310 Whyte Ave", city: "Edmonton", province: "AB", postal: "T6E 1Z9",
            neighbourhood: "Old Strathcona", lat: 53.5180, lng: -113.4920,
            slug: "cozy-house-strathcona-edmonton",
            tier: ListingTier.Limited,
            descriptionEn: "Cozy house in Old Strathcona steps from Whyte Avenue, music venues, and the U of A.",
            descriptionFr: "Maison chaleureuse Ã  Old Strathcona Ã  deux pas de l'avenue Whyte, des salles de spectacle et de l'UniversitÃ© de l'Alberta.",
            petsAllowed: true, furnished: false,
            units: [ new Unit { Bedrooms = 3, Bathrooms = 2, SqFt = 1380, Price = 2420, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(40)) } ],
            images: [ Photo.ModernHouseDark, Photo.LivingRoom1, Photo.Bedroom ]),
            ["Fireplace", "Pet Friendly", "Dogs Allowed", "Outdoor Parking"]);

        // ---- Ottawa (2) ----
        yield return (Make(landlordId,
            title: "Bright Apartment in the Glebe Ottawa",
            type: PropertyType.Apartment,
            street: "880 Bank St", city: "Ottawa", province: "ON", postal: "K1S 4G7",
            neighbourhood: "The Glebe", lat: 45.4000, lng: -75.6890,
            slug: "bright-apartment-glebe-ottawa",
            tier: ListingTier.Promoted,
            descriptionEn: "Bright apartment in The Glebe near Lansdowne Park, the canal, and Bank Street shops.",
            descriptionFr: "Appartement lumineux dans The Glebe prÃ¨s du parc Lansdowne, du canal et des boutiques de la rue Bank.",
            petsAllowed: true, furnished: false,
            units:
            [
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 720, Price = 2150, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(15)) },
                new Unit { Bedrooms = 2, Bathrooms = 1, SqFt = 800, Price = 2250, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30)) }
            ],
            images: [ Photo.BasementInterior, Photo.LivingRoom2, Photo.Bedroom ]),
            ["Hardwood Floors", "Heat Included", "Cats Allowed", "Pet Friendly"]);

        yield return (Make(landlordId,
            title: "Modern Condo near Parliament Hill",
            type: PropertyType.Condo,
            street: "350 Sparks St", city: "Ottawa", province: "ON", postal: "K1P 5H3",
            neighbourhood: "Centretown", lat: 45.4170, lng: -75.6960,
            slug: "modern-condo-parliament-hill-ottawa",
            tier: ListingTier.Limited,
            descriptionEn: "Modern condo in Centretown within walking distance of Parliament Hill and the museums.",
            descriptionFr: "Condo moderne Ã  Centretown Ã  distance de marche de la Colline du Parlement et des musÃ©es.",
            petsAllowed: false, furnished: false,
            units: [ new Unit { Bedrooms = 1, Bathrooms = 1, SqFt = 580, Price = 2350, AvailableUnits = 1, AvailableDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(10)) } ],
            images: [ Photo.CondoTower, Photo.LivingRoom4 ]),
            ["Gym", "Concierge", "Elevator", "Smart Access"]);
    }

    private static Property Make(
        Guid landlordId,
        string title,
        PropertyType type,
        string street,
        string city,
        string province,
        string postal,
        string? neighbourhood,
        double lat,
        double lng,
        string slug,
        ListingTier tier,
        string descriptionEn,
        string descriptionFr,
        bool petsAllowed,
        bool furnished,
        Unit[] units,
        string[] images)
    {
        var property = new Property
        {
            Id = Guid.NewGuid(),
            LandlordProfileId = landlordId,
            Title = title,
            Description = descriptionEn,
            DescriptionFr = descriptionFr,
            PropertyType = type,
            Status = ListingStatus.Active,
            Tier = tier,
            StreetAddress = street,
            City = city,
            Province = province,
            PostalCode = postal,
            Neighbourhood = neighbourhood,
            Latitude = lat,
            Longitude = lng,
            Slug = slug,
            // Verified badge mirrors Next.js list-style cards: shown on Featured + Promoted tiers,
            // hidden on Limited (Bloque F.5).
            IsVerified = tier is ListingTier.Featured or ListingTier.Promoted,
            PetsAllowed = petsAllowed,
            Furnished = furnished,
            LeaseTerm = Domain.LeaseTerm.OneYear
        };

        foreach (var u in units)
        {
            u.Id = Guid.NewGuid();
            u.PropertyId = property.Id;
            property.Units.Add(u);
        }

        for (var i = 0; i < images.Length; i++)
        {
            property.Images.Add(new PropertyImage
            {
                Id = Guid.NewGuid(),
                PropertyId = property.Id,
                Url = images[i],
                AltText = $"{title} - photo {i + 1}",
                IsPrimary = i == 0,
                DisplayOrder = i,
                Category = i == 0 ? "exterior" : "interior"
            });
        }

        return property;
    }
}
