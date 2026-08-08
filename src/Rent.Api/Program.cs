using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Home;
using Rent.Api.Features.Listings;
using Rent.Api.Features.Maps;
using Rent.Api.Features.Search;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Data.Seed;
using Rent.Api.Infrastructure.Storage;

// Fase 2 del PRP: dominio y base de datos. Los endpoints llegan en la Fase 3 y la
// configuracion de auth para SPA (401 en /api/*, antiforgery) en la Fase 6.

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

// Los enums viajan como string ("Apartment", no 0). En la base ya se guardan como string
// (HasConversion<string>), asi que un numero en el JSON seria una tercera representacion
// del mismo dato y obligaria al cliente a mantener un mapa de indices.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

if (!builder.Environment.IsEnvironment("Testing"))
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured.");

    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlServer(connectionString, sqlOptions =>
        {
            sqlOptions.EnableRetryOnFailure(
                maxRetryCount: 5,
                maxRetryDelay: TimeSpan.FromSeconds(30),
                errorNumbersToAdd: null);
        }));
}

// Mismas politicas de password que el origen: cambiarlas invalidaria los hashes
// existentes si algun dia se importan usuarios.
builder.Services
    .AddIdentity<ApplicationUser, IdentityRole<Guid>>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = false;
        options.User.RequireUniqueEmail = true;
        options.SignIn.RequireConfirmedAccount = false;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

// AddIdentity registra autenticacion pero NO los servicios de autorizacion.
builder.Services.AddAuthorization();

// Servicios de negocio portados del origen sin cambios.
builder.Services.AddScoped<SearchHandler>();
builder.Services.AddScoped<MapMarkersHandler>();
builder.Services.AddScoped<Rent.Api.Features.Favorites.IFavoriteService,
    Rent.Api.Features.Favorites.FavoriteService>();
builder.Services.AddScoped<Rent.Api.Features.Admin.Services.IPopularSearchTracker,
    Rent.Api.Features.Admin.Services.PopularSearchTracker>();

builder.Services.Configure<MapsOptions>(builder.Configuration.GetSection(MapsOptions.SectionName));

builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("ImageStorage"));

var storageProvider = builder.Configuration.GetValue<string>("ImageStorage:Provider") ?? "Local";
if (string.Equals(storageProvider, "AzureBlob", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddScoped<IImageStorage, AzureBlobImageStorage>();
}
else
{
    builder.Services.AddScoped<IImageStorage, LocalImageStorage>();
}

builder.Services.AddHealthChecks();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health");

// Superficie publica (Fase 3). Auth, portales y admin llegan en fases posteriores.
app.MapHomeEndpoints();
app.MapSearchEndpoints();
app.MapListingsEndpoints();
app.MapMapEndpoints();

if (!app.Environment.IsEnvironment("Testing"))
{
    try
    {
        await DatabaseSeeder.RunAsync(app.Services);
    }
    catch (Exception ex)
    {
        // Igual que el origen: una base que aun esta despertando de auto-pause no debe
        // impedir que el proceso enlace el puerto. /health responde sin base de datos y
        // los reintentos por request se recuperan cuando vuelve.
        app.Logger.LogError(ex,
            "Database initialization failed during startup. Starting the app anyway so it can serve requests and recover once the database resumes.");
    }
}

app.Run();

public partial class Program { }
