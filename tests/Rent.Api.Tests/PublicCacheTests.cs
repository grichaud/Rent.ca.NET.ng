using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rent.Api.Tests;

/// <summary>
/// Las cabeceras de cache de los endpoints publicos (Fase 14, PRP 12.3).
///
/// No es una prueba de rendimiento: es de AISLAMIENTO. Las respuestas publicas de este
/// catalogo no son iguales para todo el mundo —`isFavorited` depende de quien pregunta—, asi
/// que marcar `public` una respuesta con sesion dejaria los favoritos de una persona en la
/// cache del navegador de otra, o en cualquier proxy por el camino.
///
/// El fallo seria invisible en desarrollo (un solo usuario, sin proxies) y solo aparecería en
/// produccion, con dos visitantes y una cache intermedia. De ahi que se fije por test.
/// </summary>
public class PublicCacheTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public PublicCacheTests(AuthApiFactory factory) => _factory = factory;

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false
    });

    [Theory]
    [InlineData("/api/home")]
    [InlineData("/api/cities")]
    [InlineData("/api/sitemap")]
    public async Task Un_visitante_anonimo_recibe_la_respuesta_cacheable(string url)
    {
        await _factory.SeedListingAsync();

        var response = await CreateClient().GetAsync(url);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cacheControl = response.Headers.CacheControl;
        Assert.NotNull(cacheControl);
        Assert.True(cacheControl!.Public);
        Assert.Equal(TimeSpan.FromSeconds(300), cacheControl.MaxAge);
    }

    [Fact]
    public async Task La_respuesta_declara_que_varia_con_la_cookie()
    {
        // Sin esto, un intermediario podria servir la respuesta guardada de un anonimo a quien
        // llega con sesion: misma URL, contenido distinto.
        await _factory.SeedListingAsync();

        var response = await CreateClient().GetAsync("/api/home");

        Assert.Contains("Cookie", response.Headers.Vary);
    }

    [Fact]
    public async Task Un_visitante_con_sesion_no_recibe_nada_cacheable()
    {
        await _factory.SeedListingAsync();
        // Los roles se siembran a mano: la factory levanta la API con el entorno "Testing",
        // que salta el seeder de Program.cs, y sin rol Renter el alta muere.
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Renter");

        var response = await client.GetAsync("/api/home");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cacheControl = response.Headers.CacheControl;
        Assert.NotNull(cacheControl);
        Assert.False(cacheControl!.Public);
        Assert.True(cacheControl.Private);
        Assert.True(cacheControl.NoStore);
        // Y sigue avisando de que la cookie cambia la respuesta.
        Assert.Contains("Cookie", response.Headers.Vary);
    }

    [Fact]
    public async Task La_busqueda_por_ciudad_tambien_se_cachea_para_anonimos()
    {
        await _factory.SeedListingAsync();

        var response = await CreateClient().GetAsync("/api/search/toronto");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.Public);
    }

    [Fact]
    public async Task Los_endpoints_privados_no_se_marcan_cacheables()
    {
        // El portal del inquilino no lleva el filtro; lo que no puede pasar es que alguien se
        // lo ponga por error y su panel acabe en una cache compartida.
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await client.SignUpAsync("Renter");

        var response = await client.GetAsync("/api/renter/dashboard");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEqual(true, response.Headers.CacheControl?.Public);
    }
}
