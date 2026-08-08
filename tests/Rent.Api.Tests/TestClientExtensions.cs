using System.Net.Http.Json;
using System.Text.Json;

namespace Rent.Api.Tests;

/// <summary>
/// Utilidades compartidas por los tests de integracion: el baile del antiforgery y el alta de
/// un usuario con sesion iniciada.
/// </summary>
internal static class TestClientExtensions
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Reproduce lo que hace Angular: pedir el token, leerlo de la cookie <c>XSRF-TOKEN</c> y
    /// reenviarlo en la cabecera. Hay que repetirlo despues de CADA cambio de sesion, porque el
    /// token de ASP.NET va ligado a la identidad.
    /// </summary>
    public static async Task ArmAntiforgeryAsync(this HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();

        var token = ReadSetCookie(response, "XSRF-TOKEN");
        Assert.False(string.IsNullOrEmpty(token), "El endpoint /csrf debe emitir la cookie XSRF-TOKEN.");

        client.DefaultRequestHeaders.Remove("X-XSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-XSRF-TOKEN", token);
    }

    /// <summary>Da de alta un usuario con el rol indicado y deja el cliente con su sesion.</summary>
    public static async Task<string> SignUpAsync(this HttpClient client, string role)
    {
        await client.ArmAntiforgeryAsync();

        var email = $"{role.ToLowerInvariant()}-{Guid.NewGuid():N}@example.com";
        var response = await client.PostAsJsonAsync("/api/auth/signup", new
        {
            fullName = $"Test {role}",
            email,
            password = "Password123",
            confirmPassword = "Password123",
            role,
            culture = "en"
        });

        response.EnsureSuccessStatusCode();

        // El token anterior se emitio siendo anonimo y ya no vale: hay sesion.
        await client.ArmAntiforgeryAsync();
        return email;
    }

    public static string? ReadSetCookie(HttpResponseMessage response, string name)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var cookies)) return null;

        foreach (var cookie in cookies)
        {
            var parts = cookie.Split(';')[0].Split('=', 2);
            if (parts.Length == 2 && parts[0] == name) return Uri.UnescapeDataString(parts[1]);
        }

        return null;
    }

    public static Task<T?> ReadAsync<T>(this HttpResponseMessage response)
        => response.Content.ReadFromJsonAsync<T>(Json);
}
