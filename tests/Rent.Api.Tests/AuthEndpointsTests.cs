using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rent.Api.Tests;

/// <summary>
/// Cubre los tres riesgos que el PRP marca como ALTO en la fase de autenticacion: que la API
/// responda con codigos y no con redirecciones, que el antiforgery bloquee lo que debe, y que
/// la cookie de sesion sostenga realmente la identidad entre peticiones.
/// </summary>
public class AuthEndpointsTests : IClassFixture<AuthApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly AuthApiFactory _factory;

    public AuthEndpointsTests(AuthApiFactory factory) => _factory = factory;

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        // Sin esto, un 302 se seguiria en silencio y el test no podria distinguir "devolvio
        // 401" de "redirigio al login y ese devolvio 200", que es justo lo que se comprueba.
        AllowAutoRedirect = false
    });

    [Fact]
    public async Task Me_sin_sesion_devuelve_ok_con_usuario_nulo()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = await response.Content.ReadFromJsonAsync<MeResponseDto>(Json);
        Assert.NotNull(me);
        Assert.Null(me!.User);
    }

    [Fact]
    public async Task Login_con_credenciales_invalidas_devuelve_401_y_no_redirige()
    {
        var client = CreateClient();
        await ArmAntiforgeryAsync(client);

        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "nadie@example.com",
            password = "NoExiste123",
            rememberMe = false
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task Post_sin_token_antiforgery_es_rechazado()
    {
        var client = CreateClient();

        // Deliberadamente sin pasar por /api/auth/csrf: no hay cabecera ni cookie que emparejar.
        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "alguien@example.com",
            password = "Password123",
            rememberMe = false
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Signup_deja_sesion_iniciada_y_logout_la_cierra()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await ArmAntiforgeryAsync(client);

        var email = $"renter-{Guid.NewGuid():N}@example.com";
        var signup = await client.PostAsJsonAsync("/api/auth/signup", new
        {
            fullName = "Ada Lovelace",
            email,
            password = "Password123",
            confirmPassword = "Password123",
            role = "Renter",
            culture = "en"
        });

        Assert.Equal(HttpStatusCode.OK, signup.StatusCode);
        var auth = await signup.Content.ReadFromJsonAsync<AuthResponseDto>(Json);
        Assert.NotNull(auth);
        Assert.Equal("/renter", auth!.RedirectPath);
        Assert.Equal(email, auth.User.Email);
        Assert.Contains("Renter", auth.User.Roles);

        // La cookie emitida por el alta tiene que sostener la identidad en la siguiente peticion.
        var me = await client.GetFromJsonAsync<MeResponseDto>("/api/auth/me", Json);
        Assert.NotNull(me?.User);
        Assert.Equal(email, me!.User!.Email);

        // El token de antiforgery va ligado a la identidad: el que se emitio siendo anonimo ya
        // no vale una vez hay sesion. Es exactamente lo que hace el cliente tras autenticarse.
        await ArmAntiforgeryAsync(client);

        var logout = await client.PostAsync("/api/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        var afterLogout = await client.GetFromJsonAsync<MeResponseDto>("/api/auth/me", Json);
        Assert.Null(afterLogout!.User);
    }

    [Fact]
    public async Task Login_tras_signup_devuelve_el_portal_del_rol()
    {
        await _factory.SeedRolesAsync();
        var email = $"landlord-{Guid.NewGuid():N}@example.com";

        var signupClient = CreateClient();
        await ArmAntiforgeryAsync(signupClient);
        var signup = await signupClient.PostAsJsonAsync("/api/auth/signup", new
        {
            fullName = "Grace Hopper",
            email,
            password = "Password123",
            confirmPassword = "Password123",
            role = "Landlord",
            culture = "en"
        });
        Assert.Equal(HttpStatusCode.OK, signup.StatusCode);

        // Cliente nuevo: sin la cookie del alta, para que el login sea real y no herede sesion.
        var client = CreateClient();
        await ArmAntiforgeryAsync(client);
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "Password123",
            rememberMe = true
        });

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var auth = await login.Content.ReadFromJsonAsync<AuthResponseDto>(Json);
        Assert.Equal("/landlord", auth!.RedirectPath);
    }

    [Fact]
    public async Task Signup_con_password_debil_devuelve_errores_por_campo()
    {
        await _factory.SeedRolesAsync();
        var client = CreateClient();
        await ArmAntiforgeryAsync(client);

        var response = await client.PostAsJsonAsync("/api/auth/signup", new
        {
            fullName = "Alan Turing",
            email = $"weak-{Guid.NewGuid():N}@example.com",
            password = "corta",
            confirmPassword = "corta",
            role = "Renter",
            culture = "en"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemResponse>(Json);
        Assert.NotNull(problem);
        Assert.True(problem!.Errors.ContainsKey("password"), "El error debe venir bajo la clave del campo.");
    }

    [Fact]
    public async Task Forgot_password_responde_igual_exista_o_no_la_cuenta()
    {
        var client = CreateClient();
        await ArmAntiforgeryAsync(client);

        var response = await client.PostAsJsonAsync("/api/auth/forgot-password", new
        {
            email = $"desconocido-{Guid.NewGuid():N}@example.com",
            culture = "en"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Validate_reset_token_rechaza_un_token_inventado()
    {
        var client = CreateClient();

        var response = await client.GetFromJsonAsync<ResetValidationResponse>(
            "/api/auth/reset-password/validate?email=nadie@example.com&token=inventado", Json);

        Assert.False(response!.Valid);
    }

    /// <summary>
    /// Reproduce lo que hace Angular: pedir el token, leerlo de la cookie <c>XSRF-TOKEN</c> y
    /// reenviarlo en la cabecera. Las cookies las conserva el handler del cliente de prueba.
    /// </summary>
    private static async Task ArmAntiforgeryAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();

        var token = ReadSetCookie(response, "XSRF-TOKEN");
        Assert.False(string.IsNullOrEmpty(token), "El endpoint /csrf debe emitir la cookie XSRF-TOKEN.");

        client.DefaultRequestHeaders.Remove("X-XSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-XSRF-TOKEN", token);
    }

    private static string? ReadSetCookie(HttpResponseMessage response, string name)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var cookies)) return null;

        foreach (var cookie in cookies)
        {
            var parts = cookie.Split(';')[0].Split('=', 2);
            if (parts.Length == 2 && parts[0] == name) return Uri.UnescapeDataString(parts[1]);
        }

        return null;
    }

    private sealed record AuthResponseDto(CurrentUserResponse User, string RedirectPath);

    private sealed record MeResponseDto(CurrentUserResponse? User);

    private sealed record CurrentUserResponse(
        Guid Id, string Email, string? FullName, string? AvatarUrl, string[] Roles);

    private sealed record ValidationProblemResponse(Dictionary<string, string[]> Errors);

    private sealed record ResetValidationResponse(bool Valid);
}
