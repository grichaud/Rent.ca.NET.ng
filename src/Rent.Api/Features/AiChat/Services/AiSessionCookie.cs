using System.Collections.Concurrent;

namespace Rent.Api.Features.AiChat.Services;

/// <summary>
/// Identidad del visitante anonimo en el chat. Sin cuenta no hay UserId, asi que la
/// conversacion se ancla a esta cookie: es lo que permite que alguien pregunte por un piso
/// sin registrarse y siga viendo su hilo al recargar.
/// </summary>
public static class AiSessionCookie
{
    public const string Name = "rentca-aichat-session";

    public static Guid EnsureSessionId(HttpContext context)
    {
        if (context.Request.Cookies.TryGetValue(Name, out var raw) && Guid.TryParse(raw, out var existing))
            return existing;

        var fresh = Guid.NewGuid();
        context.Response.Cookies.Append(Name, fresh.ToString(), new CookieOptions
        {
            // HttpOnly: el cliente nunca necesita leerla, solo que viaje.
            HttpOnly = true,
            Secure = context.Request.IsHttps,
            SameSite = SameSiteMode.Lax,
            MaxAge = TimeSpan.FromDays(30),
            IsEssential = true
        });
        return fresh;
    }
}

public interface IRateLimiter
{
    bool TryAcquire(string key, int limit, TimeSpan window);
}

/// <summary>
/// Ventana deslizante en memoria. Es suficiente para un despliegue de una sola instancia,
/// que es el caso; con varias, cada una llevaria su propia cuenta.
/// </summary>
public sealed class InMemoryRateLimiter : IRateLimiter
{
    private readonly ConcurrentDictionary<string, List<DateTimeOffset>> _hits = new();

    public bool TryAcquire(string key, int limit, TimeSpan window)
    {
        var now = DateTimeOffset.UtcNow;
        var cutoff = now - window;

        var hits = _hits.GetOrAdd(key, _ => []);
        lock (hits)
        {
            hits.RemoveAll(t => t < cutoff);
            if (hits.Count >= limit) return false;
            hits.Add(now);
            return true;
        }
    }
}
