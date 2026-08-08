using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;

namespace Rent.Api.Infrastructure.Data;

public class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<LandlordProfile> LandlordProfiles => Set<LandlordProfile>();
    public DbSet<City> Cities => Set<City>();
    public DbSet<Property> Properties => Set<Property>();
    public DbSet<Unit> Units => Set<Unit>();
    public DbSet<PropertyImage> PropertyImages => Set<PropertyImage>();
    public DbSet<Amenity> Amenities => Set<Amenity>();
    public DbSet<ContactInquiry> ContactInquiries => Set<ContactInquiry>();
    public DbSet<Favorite> Favorites => Set<Favorite>();
    public DbSet<Alert> Alerts => Set<Alert>();
    public DbSet<AiConversation> AiConversations => Set<AiConversation>();
    public DbSet<AiMessage> AiMessages => Set<AiMessage>();
    public DbSet<RentSpecial> RentSpecials => Set<RentSpecial>();
    public DbSet<PopularSearch> PopularSearches => Set<PopularSearch>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>(e =>
        {
            e.Property(x => x.FullName).HasMaxLength(200);
            e.Property(x => x.AvatarUrl).HasMaxLength(500);
        });

        builder.Entity<LandlordProfile>(e =>
        {
            e.ToTable("LandlordProfiles");
            e.HasKey(x => x.Id);
            e.Property(x => x.CompanyName).HasMaxLength(200);
            e.Property(x => x.LogoUrl).HasMaxLength(500);
            e.Property(x => x.Website).HasMaxLength(300);
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.Tier).HasConversion<string>().HasMaxLength(20);

            e.HasOne(x => x.User)
             .WithOne(x => x.LandlordProfile)
             .HasForeignKey<LandlordProfile>(x => x.Id)
             .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<City>(e =>
        {
            e.Property(x => x.Name).IsRequired().HasMaxLength(100);
            e.Property(x => x.Province).IsRequired().HasMaxLength(50);
            e.Property(x => x.Slug).IsRequired().HasMaxLength(100);
            e.Property(x => x.ImageUrl).HasMaxLength(500);
            e.HasIndex(x => x.Slug).IsUnique();
            e.HasIndex(x => x.IsFeatured);
        });

        builder.Entity<Property>(e =>
        {
            e.Property(x => x.Title).IsRequired().HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(4000);
            e.Property(x => x.StreetAddress).IsRequired().HasMaxLength(300);
            e.Property(x => x.City).IsRequired().HasMaxLength(100);
            e.Property(x => x.Province).IsRequired().HasMaxLength(50);
            e.Property(x => x.PostalCode).IsRequired().HasMaxLength(10);
            e.Property(x => x.Neighbourhood).HasMaxLength(100);
            e.Property(x => x.ParkingType).HasMaxLength(50);
            e.Property(x => x.Slug).IsRequired().HasMaxLength(200);

            e.Property(x => x.PropertyType).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Tier).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.LeaseTerm).HasConversion<string>().HasMaxLength(20);

            e.HasIndex(x => new { x.City, x.Status });
            e.HasIndex(x => x.Slug).IsUnique();
            e.HasIndex(x => new { x.Status, x.Tier });
            e.HasIndex(x => x.TierExpiresAt);

            e.HasOne(x => x.LandlordProfile)
             .WithMany(x => x.Properties)
             .HasForeignKey(x => x.LandlordProfileId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Unit>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.Bathrooms).HasPrecision(3, 1);
            e.Property(x => x.Price).HasPrecision(10, 2);
            e.Property(x => x.PriceMax).HasPrecision(10, 2);

            e.HasOne(x => x.Property)
             .WithMany(x => x.Units)
             .HasForeignKey(x => x.PropertyId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<PropertyImage>(e =>
        {
            e.Property(x => x.Url).IsRequired().HasMaxLength(1000);
            e.Property(x => x.AltText).HasMaxLength(300);
            e.Property(x => x.Category).HasMaxLength(50);

            e.HasOne(x => x.Property)
             .WithMany(x => x.Images)
             .HasForeignKey(x => x.PropertyId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Amenity>(e =>
        {
            e.Property(x => x.Name).IsRequired().HasMaxLength(100);
            e.Property(x => x.Category).HasMaxLength(50);
            e.Property(x => x.Icon).HasMaxLength(50);
            e.HasIndex(x => x.Name).IsUnique();

            e.HasMany(x => x.Properties)
             .WithMany(x => x.Amenities)
             .UsingEntity(j => j.ToTable("PropertyAmenities"));
        });

        builder.Entity<ContactInquiry>(e =>
        {
            e.Property(x => x.SenderName).IsRequired().HasMaxLength(200);
            e.Property(x => x.SenderEmail).IsRequired().HasMaxLength(256);
            e.Property(x => x.SenderPhone).HasMaxLength(30);
            e.Property(x => x.Message).IsRequired().HasMaxLength(4000);

            e.HasIndex(x => new { x.PropertyId, x.IsRead });

            e.HasOne(x => x.Property)
             .WithMany(x => x.Inquiries)
             .HasForeignKey(x => x.PropertyId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.SenderUser)
             .WithMany()
             .HasForeignKey(x => x.SenderUserId)
             .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<Favorite>(e =>
        {
            e.ToTable("Favorites");
            e.HasKey(x => x.Id);

            e.HasIndex(x => new { x.UserId, x.PropertyId }).IsUnique();
            e.HasIndex(x => new { x.UserId, x.CreatedAt });

            e.HasOne(x => x.User)
             .WithMany()
             .HasForeignKey(x => x.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Property)
             .WithMany()
             .HasForeignKey(x => x.PropertyId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Alert>(e =>
        {
            e.ToTable("Alerts");
            e.HasKey(x => x.Id);

            e.Property(x => x.Name).HasMaxLength(80);
            e.Property(x => x.Locale).HasMaxLength(5).IsRequired();
            e.Property(x => x.City).HasMaxLength(100);
            e.Property(x => x.PropertyType).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Frequency).HasConversion<string>().HasMaxLength(10);
            e.Property(x => x.PriceMin).HasPrecision(10, 2);
            e.Property(x => x.PriceMax).HasPrecision(10, 2);
            e.Property(x => x.BathroomsMin).HasPrecision(3, 1);

            e.HasIndex(x => new { x.UserId, x.IsActive });
            e.HasIndex(x => new { x.IsActive, x.City });

            // Serves the digest engine's due-alert scan: WHERE IsActive = 1 ORDER BY LastSentAt.
            e.HasIndex(x => new { x.IsActive, x.LastSentAt });

            e.HasOne(x => x.User)
             .WithMany()
             .HasForeignKey(x => x.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AiConversation>(e =>
        {
            e.ToTable("AiConversations");
            e.HasKey(x => x.Id);

            e.Property(x => x.Title).HasMaxLength(200);

            e.HasIndex(x => new { x.UserId, x.UpdatedAt });
            e.HasIndex(x => new { x.SessionId, x.UpdatedAt });

            e.HasOne(x => x.User)
             .WithMany()
             .HasForeignKey(x => x.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<AiMessage>(e =>
        {
            e.ToTable("AiMessages");
            e.HasKey(x => x.Id);

            e.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Content).IsRequired();
            e.Property(x => x.ToolName).HasMaxLength(50);

            e.HasIndex(x => new { x.ConversationId, x.CreatedAt });

            e.HasOne(x => x.Conversation)
             .WithMany(x => x.Messages)
             .HasForeignKey(x => x.ConversationId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<RentSpecial>(e =>
        {
            e.ToTable("RentSpecials");
            e.HasKey(x => x.Id);

            e.Property(x => x.Title).IsRequired().HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(2000);

            e.HasIndex(x => new { x.PropertyId, x.IsActive, x.EndDate });

            e.HasOne(x => x.Property)
             .WithMany(x => x.RentSpecials)
             .HasForeignKey(x => x.PropertyId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<PopularSearch>(e =>
        {
            e.ToTable("PopularSearches");
            e.HasKey(x => x.Id);

            e.Property(x => x.NormalizedQuery).IsRequired().HasMaxLength(200);
            e.Property(x => x.CitySlug).IsRequired().HasMaxLength(100).HasDefaultValue(string.Empty);

            e.HasIndex(x => new { x.NormalizedQuery, x.CitySlug }).IsUnique();
            e.HasIndex(x => new { x.SearchCount, x.LastSearchedAt });
        });
    }
}
