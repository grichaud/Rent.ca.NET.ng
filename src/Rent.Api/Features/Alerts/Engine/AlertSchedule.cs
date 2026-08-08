using Rent.Api.Domain;

namespace Rent.Api.Features.Alerts.Engine;

/// <summary>
/// Reglas de cadencia del motor. Funciones puras: sin entrada/salida y sin reloj propio, que
/// es lo que permite probarlas sin levantar nada.
/// </summary>
public static class AlertSchedule
{
    /// <summary>
    /// 23h y no 24h. El planificador dispara cada hora, asi que exigir un dia entero dejaria
    /// que unos minutos de desfase empujaran una alerta diaria al turno siguiente y, con el
    /// tiempo, convirtiera un digest "diario" en uno cada dos dias.
    /// </summary>
    public static readonly TimeSpan DailyInterval = TimeSpan.FromHours(23);

    /// <summary>El mismo margen de <see cref="DailyInterval"/>, aplicado a una semana.</summary>
    public static readonly TimeSpan WeeklyInterval = TimeSpan.FromDays(7) - TimeSpan.FromHours(1);

    /// <summary>
    /// Si la alerta toca en esta ejecucion. Una alerta en pausa no dispara nunca; una que no
    /// se ha enviado jamas dispara siempre.
    /// </summary>
    public static bool IsDue(Alert alert, DateTimeOffset now)
    {
        if (!alert.IsActive) return false;
        if (alert.LastSentAt is not DateTimeOffset last) return true;

        var elapsed = now - last;
        return alert.Frequency switch
        {
            AlertFrequency.Instant => true,
            AlertFrequency.Weekly => elapsed >= WeeklyInterval,
            // Daily, y cualquier frecuencia que se anada mas adelante: se cae a la cadencia
            // diaria en vez de a "nunca", para que un valor nuevo del enum degrade a enviar de
            // menos y no a desactivar la alerta en silencio.
            _ => elapsed >= DailyInterval
        };
    }

    /// <summary>
    /// Inicio de la ventana de listings "nuevos". Cae a la fecha de creacion para que una
    /// alerta recien hecha no mande el catalogo entero en su primer digest.
    /// </summary>
    public static DateTimeOffset WindowStart(Alert alert) => alert.LastSentAt ?? alert.CreatedAt;
}
