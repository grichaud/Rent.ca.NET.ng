namespace Rent.Api.Infrastructure.Data.Seed;

/// <summary>
/// Ajustes de la puesta a punto de la base. Se enlazan de la seccion "Database".
///
/// Existen por una razon de COSTE, no de estilo. La base es Azure SQL serverless con auto-pausa,
/// y despertarla cuesta **una hora entera** de cuota por corta que sea la consulta: el retardo
/// minimo de auto-pausa que admite Azure es de 60 minutos. Con el presupuesto gratuito
/// (100.000 vCore-segundos = ~55 horas al mes) eso son menos de dos despertares al dia.
///
/// Migrar y sembrar al arrancar convertia CADA reinicio del App Service —y en F1 los hay a
/// diario— en un despertar de una hora. Medido: la app hermana, que ademas tenia un monitor
/// externo reiniciandola, tuvo consumo los 14 dias de 14 y agoto la cuota del mes.
/// </summary>
public class DatabaseOptions
{
    public const string SectionName = "Database";

    /// <summary>
    /// Si el arranque aplica migraciones y siembra.
    ///
    /// En desarrollo conviene que si: arrancar la API deja la base lista sin ceremonia, y de eso
    /// dependen los scripts de validacion y la suite E2E. Fuera de desarrollo el valor por
    /// defecto es <c>false</c> y el trabajo lo dispara el despliegue contra
    /// <c>/api/maintenance/migrate</c>, para que un reinicio no cueste una hora de cuota.
    /// </summary>
    public bool MigrateOnStartup { get; set; }

    /// <summary>
    /// Secreto compartido que exige la ruta de mantenimiento. Vacio significa que la ruta
    /// responde 404: un despliegue mal configurado queda inerte, no con el esquema expuesto.
    /// </summary>
    public string MaintenanceToken { get; set; } = string.Empty;
}
