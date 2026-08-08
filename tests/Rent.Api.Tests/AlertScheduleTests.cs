using Rent.Api.Domain;
using Rent.Api.Features.Alerts.Engine;

namespace Rent.Api.Tests;

/// <summary>
/// Cadencia del motor de digest. Son funciones puras con el reloj inyectado, asi que se puede
/// comprobar el comportamiento a una semana vista sin esperar una semana.
/// </summary>
public class AlertScheduleTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 8, 12, 0, 0, TimeSpan.Zero);

    private static Alert Alert(AlertFrequency frequency, DateTimeOffset? lastSentAt, bool isActive = true)
        => new()
        {
            Id = Guid.NewGuid(),
            Frequency = frequency,
            LastSentAt = lastSentAt,
            IsActive = isActive,
            CreatedAt = Now.AddDays(-30)
        };

    [Fact]
    public void Una_alerta_en_pausa_no_dispara_nunca()
    {
        Assert.False(AlertSchedule.IsDue(Alert(AlertFrequency.Instant, null, isActive: false), Now));
    }

    [Fact]
    public void Una_alerta_sin_enviar_dispara_siempre()
    {
        Assert.True(AlertSchedule.IsDue(Alert(AlertFrequency.Weekly, null), Now));
    }

    [Theory]
    [InlineData(22, false)]
    [InlineData(23, true)]
    [InlineData(48, true)]
    public void La_diaria_usa_una_ventana_de_23_horas(int hoursAgo, bool expected)
    {
        // 23h y no 24h a proposito: el planificador dispara cada hora y exigir el dia entero
        // haria que unos minutos de desfase corrieran el envio al turno siguiente, convirtiendo
        // con el tiempo un digest diario en uno cada dos dias.
        var alert = Alert(AlertFrequency.Daily, Now.AddHours(-hoursAgo));

        Assert.Equal(expected, AlertSchedule.IsDue(alert, Now));
    }

    [Theory]
    [InlineData(6, false)]
    [InlineData(7, true)]
    public void La_semanal_usa_una_ventana_de_siete_dias_menos_una_hora(int daysAgo, bool expected)
    {
        var alert = Alert(AlertFrequency.Weekly, Now.AddDays(-daysAgo));

        Assert.Equal(expected, AlertSchedule.IsDue(alert, Now));
    }

    [Fact]
    public void La_instantanea_dispara_aunque_acabe_de_enviarse()
    {
        Assert.True(AlertSchedule.IsDue(Alert(AlertFrequency.Instant, Now.AddMinutes(-1)), Now));
    }

    [Fact]
    public void La_ventana_de_una_alerta_nueva_empieza_en_su_creacion()
    {
        // Si cayera a DateTimeOffset.MinValue, el primer digest mandaria el catalogo entero.
        var alert = Alert(AlertFrequency.Daily, lastSentAt: null);

        Assert.Equal(alert.CreatedAt, AlertSchedule.WindowStart(alert));
    }

    [Fact]
    public void La_ventana_de_una_alerta_ya_enviada_empieza_en_el_ultimo_envio()
    {
        var lastSent = Now.AddDays(-2);
        var alert = Alert(AlertFrequency.Daily, lastSent);

        Assert.Equal(lastSent, AlertSchedule.WindowStart(alert));
    }
}
