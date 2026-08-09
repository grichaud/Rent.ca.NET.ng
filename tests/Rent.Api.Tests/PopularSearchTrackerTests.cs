using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Rent.Api.Features.Admin.Services;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Tests;

/// <summary>
/// El contador de busquedas populares (port de la mitad de escritura de
/// <c>PopularSearchesTests.cs</c> del origen; la de administracion ya vive en
/// <see cref="AdminEndpointsTests"/>).
///
/// Se prueba <c>TrackInlineAsync</c> y no <c>TrackAsync</c> a proposito: el segundo es
/// fire-and-forget —no bloquea la respuesta de la busqueda— y por tanto no hay nada que
/// esperar de forma determinista. La logica de escritura es la misma en ambos.
///
/// El detalle que sostiene todo esto es el UPSERT: la tabla tiene clave unica por
/// (consulta normalizada, ciudad), asi que la segunda busqueda igual tiene que INCREMENTAR,
/// no insertar una fila nueva ni reventar por conflicto.
/// </summary>
public class PopularSearchTrackerTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public PopularSearchTrackerTests(AuthApiFactory factory) => _factory = factory;

    private async Task TrackAsync(string? query, string citySlug)
    {
        using var scope = _factory.Services.CreateScope();
        var tracker = scope.ServiceProvider.GetRequiredService<IPopularSearchTracker>();
        await tracker.TrackInlineAsync(query, citySlug);
    }

    private async Task<(string Query, int Count)?> ReadAsync(string citySlug)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.PopularSearches.AsNoTracking()
            .FirstOrDefaultAsync(s => s.CitySlug == citySlug);
        return row is null ? null : (row.NormalizedQuery, row.SearchCount);
    }

    [Fact]
    public async Task La_primera_busqueda_inserta_la_fila_con_uno()
    {
        var city = $"track-{Guid.NewGuid():N}";

        await TrackAsync("minprice=1234", city);

        var row = await ReadAsync(city);
        Assert.NotNull(row);
        Assert.Equal("minprice=1234", row!.Value.Query);
        Assert.Equal(1, row.Value.Count);
    }

    [Fact]
    public async Task La_misma_busqueda_otra_vez_incrementa_en_vez_de_duplicar()
    {
        var city = $"track-{Guid.NewGuid():N}";

        await TrackAsync("minprice=1234", city);
        await TrackAsync("minprice=1234", city);
        await TrackAsync("minprice=1234", city);

        var row = await ReadAsync(city);
        Assert.Equal(3, row!.Value.Count);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.PopularSearches.CountAsync(s => s.CitySlug == city));
    }

    [Fact]
    public async Task Una_busqueda_vacia_se_guarda_con_el_centinela()
    {
        // La tabla registra la COMBINACION DE FILTROS normalizada, no texto libre: una busqueda
        // sin filtros es un dato valido ("cuanta gente entra a la ciudad sin filtrar nada") y
        // necesita una clave, porque la columna forma parte del indice unico.
        var city = $"track-{Guid.NewGuid():N}";

        await TrackAsync(null, city);
        await TrackAsync("   ", city);

        var row = await ReadAsync(city);
        Assert.Equal("(empty)", row!.Value.Query);
        Assert.Equal(2, row.Value.Count);
    }

    [Fact]
    public async Task La_consulta_y_la_ciudad_se_normalizan_a_minusculas()
    {
        var city = $"track-{Guid.NewGuid():N}";

        await TrackAsync("  MinPrice=1234  ", city.ToUpperInvariant());

        var row = await ReadAsync(city);
        Assert.NotNull(row);
        Assert.Equal("minprice=1234", row!.Value.Query);
    }

    [Fact]
    public async Task Dos_ciudades_distintas_no_comparten_contador()
    {
        var uno = $"track-{Guid.NewGuid():N}";
        var otro = $"track-{Guid.NewGuid():N}";

        await TrackAsync("bedrooms=2", uno);
        await TrackAsync("bedrooms=2", uno);
        await TrackAsync("bedrooms=2", otro);

        Assert.Equal(2, (await ReadAsync(uno))!.Value.Count);
        Assert.Equal(1, (await ReadAsync(otro))!.Value.Count);
    }
}
