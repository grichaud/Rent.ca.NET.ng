using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Features.Alerts;
using Rent.Api.Features.Alerts.Engine;
using Rent.Api.Features.Auth;
using Rent.Api.Features.Email;
using Rent.Api.Features.Favorites;
using Rent.Api.Features.Home;
using Rent.Api.Features.Inquiries;
using Rent.Api.Features.LandlordPortal;
using Rent.Api.Features.Listings;
using Rent.Api.Features.Maps;
using Rent.Api.Features.RenterPortal;
using Rent.Api.Features.Search;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Data.Seed;
using Rent.Api.Infrastructure.Identity;
using Rent.Api.Infrastructure.Storage;

// El web root tiene que existir ANTES de crear el builder: si la carpeta falta cuando el
// host arranca (p.ej. ejecutando el .dll desde bin/, donde el build no la copia),
// WebRootPath queda null, el storage local de fotos rechaza todo archivo y /uploads
// devuelve 404. Crearla aqui cubre bin, publish y dev por igual.
Directory.CreateDirectory(Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"));

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

// Cookie adaptada a SPA (401/403 bajo /api), cookie externa de 30 min, Google si esta
// configurado y antiforgery con el nombre de cabecera que usa Angular. Fase 6 del PRP.
builder.Services.AddSpaAuthentication(builder.Configuration);

builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// Servicios de negocio portados del origen sin cambios.
builder.Services.AddScoped<SearchHandler>();
builder.Services.AddScoped<AlertMatcher>();
builder.Services.AddScoped<IAlertDigestService, AlertDigestService>();
builder.Services.AddScoped<MapMarkersHandler>();
builder.Services.AddScoped<Rent.Api.Features.Favorites.IFavoriteService,
    Rent.Api.Features.Favorites.FavoriteService>();
builder.Services.AddScoped<Rent.Api.Features.Admin.Services.IPopularSearchTracker,
    Rent.Api.Features.Admin.Services.PopularSearchTracker>();

builder.Services.Configure<MapsOptions>(builder.Configuration.GetSection(MapsOptions.SectionName));

builder.Services.Configure<AlertEngineOptions>(
    builder.Configuration.GetSection(AlertEngineOptions.SectionName));

// Correo transaccional. Sin clave de Resend se usa el sustituto que solo escribe en el log,
// para que un entorno sin credenciales siga permitiendo altas y restablecer contrasena.
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection(EmailOptions.SectionName));

var emailApiKey = builder.Configuration[$"{EmailOptions.SectionName}:ApiKey"];
if (!string.IsNullOrWhiteSpace(emailApiKey))
{
    builder.Services.AddHttpClient<ResendEmailSender>(client =>
    {
        var emailBaseUrl = builder.Configuration[$"{EmailOptions.SectionName}:BaseUrl"];
        client.BaseAddress = new Uri(string.IsNullOrWhiteSpace(emailBaseUrl)
            ? "https://api.resend.com"
            : emailBaseUrl.TrimEnd('/') + "/");
        client.Timeout = TimeSpan.FromSeconds(10);
    });
    builder.Services.AddScoped<IEmailSender>(sp => sp.GetRequiredService<ResendEmailSender>());
}
else
{
    builder.Services.AddSingleton<IEmailSender, NoOpEmailSender>();
}

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

// Sirve wwwroot/uploads (las fotos de listings del storage Local). Va antes de la
// autenticacion: las imagenes son publicas, como en el origen.
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health");

// Superficie publica (Fase 3). Los portales y admin llegan en fases posteriores.
app.MapHomeEndpoints();
app.MapSearchEndpoints();
app.MapListingsEndpoints();
app.MapMapEndpoints();

// Autenticacion (Fase 6).
app.MapAuthEndpoints();

// Consultas, favoritos y alertas (Fase 7).
app.MapInquiryEndpoints();
app.MapFavoriteEndpoints();
app.MapAlertEndpoints();
app.MapAlertDispatchEndpoint();

// Portal del renter (Fase 8).
app.MapRenterPortalEndpoints();

// Portal del landlord (Fase 9).
app.MapLandlordPortalEndpoints();
app.MapLandlordListingEndpoints();

if (!builder.Configuration.IsGoogleConfigured())
{
    app.Logger.LogWarning(
        "Google authentication not configured (missing Authentication:Google:ClientId/ClientSecret). External login disabled.");
}

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
