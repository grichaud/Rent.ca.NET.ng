using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rent.Api.Features.AiChat.Services;
using Rent.Api.Features.AiChat.Tools;

namespace Rent.Api.Tests;

/// <summary>
/// Asistente de IA (Fase 11). Lo que importa: que un visitante sin cuenta pueda preguntar pero
/// no sin token CSRF; que la conversacion se persista y se pueda recuperar; que el hilo de otro
/// no se pueda continuar; y que el bucle de herramientas ejecute, registre y devuelva el
/// resultado al modelo.
/// </summary>
public class AiChatEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public AiChatEndpointsTests(AuthApiFactory factory) => _factory = factory;

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false
    });

    private static object Payload(string message, Guid? conversationId = null, string locale = "en") => new
    {
        conversationId,
        message,
        locale,
        context = new { currentPage = "/en/toronto", currentCity = "Toronto", currentPropertyId = (Guid?)null }
    };

    /// <summary>
    /// Reensambla el texto de un flujo SSE.
    ///
    /// Hace falta porque la respuesta se emite en trozos de 24 caracteres, cada uno en su
    /// propio evento: buscar una frase entera en el cuerpo crudo NUNCA la encuentra aunque el
    /// asistente la haya dicho. Es el mismo trabajo que hace el cliente Angular.
    /// </summary>
    private static async Task<string> ReadStreamedTextAsync(HttpResponseMessage response)
    {
        var raw = await response.Content.ReadAsStringAsync();
        var text = new System.Text.StringBuilder();

        foreach (var block in raw.Split("\n\n", StringSplitOptions.RemoveEmptyEntries))
        {
            string? name = null, data = null;
            foreach (var line in block.Split('\n'))
            {
                if (line.StartsWith("event:", StringComparison.Ordinal)) name = line[6..].Trim();
                else if (line.StartsWith("data:", StringComparison.Ordinal)) data = line[5..].Trim();
            }

            if (name != "message" || data is null) continue;

            using var doc = System.Text.Json.JsonDocument.Parse(data);
            if (doc.RootElement.TryGetProperty("content", out var content))
                text.Append(content.GetString());
        }

        return text.ToString();
    }

    // ---- Acceso -------------------------------------------------------------------

    [Fact]
    public async Task Sin_token_de_antiforgery_el_chat_da_400()
    {
        var client = CreateClient();

        var response = await client.PostAsJsonAsync("/api/ai/chat", Payload("hola"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Un_visitante_anonimo_puede_conversar()
    {
        var client = CreateClient();
        await client.ArmAntiforgeryAsync();

        var response = await client.PostAsJsonAsync("/api/ai/chat", Payload("Hola, busco piso"));
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("event: message", body);
        Assert.Contains("event: done", body);
        // Sin clave de API responde el sustituto, que es lo que permite validar sin gastar cuota.
        Assert.Equal(NoOpOpenRouterClient.Placeholder, await ReadStreamedTextAsync(response));
    }

    [Fact]
    public async Task Un_mensaje_vacio_se_rechaza()
    {
        var client = CreateClient();
        await client.ArmAntiforgeryAsync();

        var response = await client.PostAsJsonAsync("/api/ai/chat", Payload("   "));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Un_mensaje_demasiado_largo_se_rechaza()
    {
        var client = CreateClient();
        await client.ArmAntiforgeryAsync();

        var response = await client.PostAsJsonAsync("/api/ai/chat", Payload(new string('a', 2001)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- Persistencia del hilo ------------------------------------------------------

    [Fact]
    public async Task La_conversacion_se_guarda_y_se_recupera()
    {
        var client = CreateClient();
        await client.ArmAntiforgeryAsync();

        var sent = await client.PostAsJsonAsync("/api/ai/chat", Payload("Busco un loft en Toronto"));
        sent.EnsureSuccessStatusCode();

        var active = await client.GetAsync("/api/ai/conversation");
        active.EnsureSuccessStatusCode();
        var body = await active.ReadAsync<ActiveConversationEnvelope>();

        Assert.NotNull(body?.Conversation);
        // El titulo del hilo sale del primer mensaje, que es como se reconoce en el panel.
        Assert.Equal("Busco un loft en Toronto", body!.Conversation!.Title);

        var roles = body.Conversation.Messages.Select(m => m.Role).ToList();
        Assert.Equal(["user", "assistant"], roles);
        Assert.Equal("Busco un loft en Toronto", body.Conversation.Messages[0].Content);
    }

    [Fact]
    public async Task Sin_hilo_previo_la_conversacion_activa_viene_vacia()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/api/ai/conversation");
        response.EnsureSuccessStatusCode();
        var body = await response.ReadAsync<ActiveConversationEnvelope>();

        // Objeto envolvente con null dentro, no un 204: un cuerpo vacio rompe a un cliente estricto.
        Assert.NotNull(body);
        Assert.Null(body!.Conversation);
    }

    [Fact]
    public async Task El_hilo_de_otro_visitante_no_se_puede_continuar()
    {
        var first = CreateClient();
        await first.ArmAntiforgeryAsync();
        await first.PostAsJsonAsync("/api/ai/chat", Payload("Hilo del primero"));
        var firstThread = (await (await first.GetAsync("/api/ai/conversation"))
            .ReadAsync<ActiveConversationEnvelope>())!.Conversation!;

        // Cliente nuevo = cookie de sesion nueva. Manda el id ajeno a proposito.
        var intruder = CreateClient();
        await intruder.ArmAntiforgeryAsync();
        await intruder.PostAsJsonAsync("/api/ai/chat", Payload("Hilo del intruso", firstThread.Id));

        var intruderThread = (await (await intruder.GetAsync("/api/ai/conversation"))
            .ReadAsync<ActiveConversationEnvelope>())!.Conversation!;

        Assert.NotEqual(firstThread.Id, intruderThread.Id);
        Assert.DoesNotContain(intruderThread.Messages, m => m.Content == "Hilo del primero");
    }

    [Fact]
    public async Task Empezar_de_nuevo_no_borra_el_historial()
    {
        var client = CreateClient();
        await client.ArmAntiforgeryAsync();
        await client.PostAsJsonAsync("/api/ai/chat", Payload("Mensaje que debe sobrevivir"));

        var reset = await client.PostAsJsonAsync("/api/ai/conversation/new", new { });
        reset.EnsureSuccessStatusCode();

        // El endpoint solo asegura la cookie: el hilo sigue vivo para el panel de admin, y es
        // el cliente quien deja de mandar su id. Por eso /conversation lo sigue devolviendo.
        var active = await (await client.GetAsync("/api/ai/conversation"))
            .ReadAsync<ActiveConversationEnvelope>();
        Assert.NotNull(active?.Conversation);
    }

    // ---- Bucle de herramientas -------------------------------------------------------

    [Fact]
    public async Task El_bucle_ejecuta_la_herramienta_y_devuelve_su_resultado_al_modelo()
    {
        await _factory.SeedListingAsync("Vancouver", "vancouver");

        var fake = new FakeOpenRouterClient();
        fake.EnqueueToolCall("search_properties", """{"city":"Vancouver"}""");
        fake.EnqueueText("He encontrado un piso en Vancouver.");

        using var scripted = _factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddSingleton<IOpenRouterClient>(fake)));

        var client = scripted.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await client.ArmAntiforgeryAsync();

        var response = await client.PostAsJsonAsync("/api/ai/chat", Payload("¿Que hay en Vancouver?"));
        response.EnsureSuccessStatusCode();

        Assert.Equal("He encontrado un piso en Vancouver.", await ReadStreamedTextAsync(response));

        // Dos vueltas: la que pide la herramienta y la que ya contesta texto.
        Assert.Equal(2, fake.Requests.Count);

        // La segunda peticion tiene que llevar el resultado de la herramienta, o el modelo
        // estaria contestando sin los datos que pidio.
        var secondTurn = fake.Requests[1].Messages;
        Assert.Contains(secondTurn, m => m.Role == "tool" && m.Name == "search_properties");
        Assert.Contains(secondTurn, m => m.Role == "assistant" && m.ToolCalls is { Count: > 0 });
    }

    [Fact]
    public async Task Las_llamadas_a_herramientas_quedan_registradas_para_el_panel()
    {
        await _factory.SeedListingAsync("Halifax", "halifax");

        var fake = new FakeOpenRouterClient();
        fake.EnqueueToolCall("get_city_info", """{"city":"Halifax"}""");
        fake.EnqueueText("Halifax tiene pisos disponibles.");

        using var scripted = _factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddSingleton<IOpenRouterClient>(fake)));

        var client = scripted.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await client.ArmAntiforgeryAsync();
        await client.PostAsJsonAsync("/api/ai/chat", Payload("Hablame de Halifax"));

        // El panel de admin lee estas filas: sin ellas su desglose de herramientas sale vacio.
        var admin = await CreateAdminClientAsync();
        var metrics = await (await admin.GetAsync("/api/admin/ai")).ReadAsync<AiMetricsDto>();

        Assert.NotNull(metrics);
        Assert.Contains(metrics!.ToolBreakdown, t => t.Name == "get_city_info");
    }

    [Fact]
    public async Task Una_herramienta_desconocida_no_tumba_la_conversacion()
    {
        var fake = new FakeOpenRouterClient();
        fake.EnqueueToolCall("herramienta_inventada", "{}");
        fake.EnqueueText("Disculpa, no pude usar esa herramienta.");

        using var scripted = _factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddSingleton<IOpenRouterClient>(fake)));

        var client = scripted.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        await client.ArmAntiforgeryAsync();

        var response = await client.PostAsJsonAsync("/api/ai/chat", Payload("Haz algo raro"));
        response.EnsureSuccessStatusCode();

        Assert.Equal("Disculpa, no pude usar esa herramienta.", await ReadStreamedTextAsync(response));
    }

    // ---- Herramientas por separado ----------------------------------------------------

    [Fact]
    public async Task La_busqueda_devuelve_enlaces_CON_prefijo_de_idioma()
    {
        await _factory.SeedListingAsync("Winnipeg", "winnipeg");

        using var scope = _factory.Services.CreateScope();
        var tool = scope.ServiceProvider.GetRequiredService<SearchPropertiesTool>();

        var result = await tool.ExecuteAsync(
            """{"city":"Winnipeg"}""",
            new ToolExecutionContext(null, Guid.NewGuid(), "fr"));

        var json = System.Text.Json.JsonSerializer.Serialize(result.Data);

        // Divergencia intencionada: el origen emite "/winnipeg/slug", sin idioma, y sus rutas
        // reales son /{culture}/{citySlug}/{slug} — todos sus enlaces del chat son 404.
        Assert.Contains("/fr/winnipeg/", json);
    }

    [Fact]
    public async Task Crear_una_alerta_sin_sesion_pide_iniciarla_en_vez_de_fallar()
    {
        using var scope = _factory.Services.CreateScope();
        var tool = scope.ServiceProvider.GetRequiredService<CreateAlertTool>();

        var result = await tool.ExecuteAsync(
            """{"city":"Toronto"}""",
            new ToolExecutionContext(null, Guid.NewGuid(), "en"));

        Assert.False(result.Success);
        var json = System.Text.Json.JsonSerializer.Serialize(result.Data);
        // El modelo lee esto y sabe pedirle al usuario que entre, en vez de decir solo "no pude".
        Assert.Contains("requiresLogin", json);
    }

    [Fact]
    public async Task Una_ciudad_inexistente_se_informa_sin_excepcion()
    {
        using var scope = _factory.Services.CreateScope();
        var tool = scope.ServiceProvider.GetRequiredService<GetCityInfoTool>();

        var result = await tool.ExecuteAsync(
            """{"city":"Ciudad Inventada"}""",
            new ToolExecutionContext(null, Guid.NewGuid(), "en"));

        Assert.False(result.Success);
    }

    [Fact]
    public async Task Unos_argumentos_rotos_degradan_a_busqueda_sin_filtros()
    {
        await _factory.SeedListingAsync();

        using var scope = _factory.Services.CreateScope();
        var tool = scope.ServiceProvider.GetRequiredService<SearchPropertiesTool>();

        // El modelo genera los argumentos como texto: un JSON invalido no puede reventar el turno.
        var result = await tool.ExecuteAsync("{ esto no es json", new ToolExecutionContext(null, Guid.NewGuid(), "en"));

        Assert.True(result.Success);
    }

    // ---- Cuota ------------------------------------------------------------------------

    [Fact]
    public void La_cuota_por_hora_corta_al_superar_el_limite()
    {
        var limiter = new InMemoryRateLimiter();
        var key = $"sess:{Guid.NewGuid()}";

        for (var i = 0; i < 3; i++)
            Assert.True(limiter.TryAcquire(key, 3, TimeSpan.FromHours(1)));

        Assert.False(limiter.TryAcquire(key, 3, TimeSpan.FromHours(1)));
        // Otra clave no se ve afectada: la cuota es por visitante, no global.
        Assert.True(limiter.TryAcquire($"sess:{Guid.NewGuid()}", 3, TimeSpan.FromHours(1)));
    }

    private async Task<HttpClient> CreateAdminClientAsync()
    {
        await _factory.SeedRolesAsync();
        var email = await _factory.CreateAdminAsync();
        var client = CreateClient();
        await client.LoginAsync(email);
        return client;
    }

    private sealed record ActiveConversationEnvelope(ConversationDto? Conversation);

    private sealed record ConversationDto(
        Guid Id, string? Title, DateTimeOffset UpdatedAt, List<MessageDto> Messages);

    private sealed record MessageDto(Guid Id, string Role, string Content, DateTimeOffset CreatedAt);

    private sealed record ToolUsageDto(string Name, int Count);

    private sealed record AiMetricsDto(int TotalConversations, List<ToolUsageDto> ToolBreakdown);
}
