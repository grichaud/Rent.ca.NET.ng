using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Tests;

/// <summary>
/// Levanta la API real contra SQLite en memoria.
///
/// El entorno "Testing" ya evita que Program.cs registre SQL Server y ejecute el seeder, asi
/// que aqui solo hay que aportar el DbContext. Se usa SQLite y no el proveedor InMemory porque
/// este ultimo no aplica claves ni indices unicos, y precisamente el correo unico es una de las
/// reglas que el alta debe respetar.
///
/// La conexion se mantiene abierta durante toda la vida de la factory: una base SQLite en
/// memoria desaparece en cuanto se cierra su ultima conexion.
/// </summary>
public sealed class AuthApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            _connection.Open();

            services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection));

            using var scope = services.BuildServiceProvider().CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Database.EnsureCreated();
        });
    }

    /// <summary>
    /// Los roles los crea el seeder de produccion, que en Testing no corre. Sin ellos
    /// <c>AddToRoleAsync</c> no asigna nada y el alta terminaria sin rol.
    /// </summary>
    public async Task SeedRolesAsync()
    {
        using var scope = Services.CreateScope();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

        foreach (var role in Roles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
                await roleManager.CreateAsync(new IdentityRole<Guid>(role) { Id = Guid.NewGuid() });
        }
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) _connection.Dispose();
    }
}
