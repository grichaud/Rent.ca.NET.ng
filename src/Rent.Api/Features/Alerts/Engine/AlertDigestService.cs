using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Rent.Api.Features.Email;
using Rent.Api.Infrastructure.Data;
using Rent.Api.Infrastructure.Identity;

namespace Rent.Api.Features.Alerts.Engine;

public interface IAlertDigestService
{
    Task<DigestRunResult> RunAsync(CancellationToken ct = default);
}

public class AlertDigestService : IAlertDigestService
{
    /// <summary>
    /// Tope de listings contados para una sola alerta. Solo afecta a la cifra de "+N mas" del
    /// correo —el digest muestra como mucho MaxItemsPerEmail—, y evita que una alerta dormida
    /// mucho tiempo materialice un resultado sin limite solo para imprimir un numero.
    /// </summary>
    private const int CountCap = 100;

    private static readonly string[] SupportedLocales = ["en", "fr"];

    private readonly AppDbContext _db;
    private readonly AlertMatcher _matcher;
    private readonly IEmailSender _email;
    private readonly AlertEngineOptions _options;
    private readonly string _baseUrl;
    private readonly ILogger<AlertDigestService> _logger;

    public AlertDigestService(
        AppDbContext db,
        AlertMatcher matcher,
        IEmailSender email,
        IOptions<AlertEngineOptions> options,
        IOptions<EmailOptions> emailOptions,
        IOptions<AppOptions> appOptions,
        ILogger<AlertDigestService> logger)
    {
        _db = db;
        _matcher = matcher;
        _email = email;
        _options = options.Value;
        _logger = logger;

        // Los enlaces del digest llevan a PANTALLAS, asi que apuntan al cliente. Email:PublicBaseUrl
        // solo hace falta cuando el correo debe enviar a un dominio distinto del que sirve la app.
        var configured = string.IsNullOrWhiteSpace(emailOptions.Value.PublicBaseUrl)
            ? appOptions.Value.ClientBaseUrl
            : emailOptions.Value.PublicBaseUrl;
        _baseUrl = configured.TrimEnd('/');
    }

    public async Task<DigestRunResult> RunAsync(CancellationToken ct = default)
    {
        var startedAt = Stopwatch.GetTimestamp();
        var now = DateTimeOffset.UtcNow;

        var active = await _db.Alerts
            .Include(a => a.User)
            .Where(a => a.IsActive)
            .ToListAsync(ct);

        // La comprobacion de cadencia y el orden van en memoria: leen LastSentAt, y SQLite (el
        // banco de pruebas) no sabe comparar ni ordenar una columna DateTimeOffset.
        // Primero las atendidas hace mas tiempo, para que una ejecucion que tope en
        // MaxAlertsPerRun no deje siempre fuera a las mismas; las nunca enviadas van delante.
        var dueCount = active.Count(a => AlertSchedule.IsDue(a, now));
        var due = active
            .Where(a => AlertSchedule.IsDue(a, now))
            .OrderBy(a => a.LastSentAt ?? DateTimeOffset.MinValue)
            .Take(_options.MaxAlertsPerRun)
            .ToList();

        if (due.Count < dueCount)
        {
            _logger.LogWarning(
                "Alert engine capped this run at {Cap} alerts; the remainder will be picked up next run.",
                _options.MaxAlertsPerRun);
        }

        var citySlugs = await LoadCitySlugsAsync(ct);

        int sent = 0, noMatches = 0, failed = 0, included = 0;

        foreach (var alert in due)
        {
            ct.ThrowIfCancellationRequested();

            var recipient = alert.User?.Email;
            if (string.IsNullOrWhiteSpace(recipient))
            {
                _logger.LogWarning("Alert {AlertId} has no deliverable email; skipping.", alert.Id);
                failed++;
                continue;
            }

            try
            {
                var since = AlertSchedule.WindowStart(alert);
                var matches = await _matcher.FindNewMatchesAsync(alert, since, CountCap, ct);

                // Un listing cuya ciudad no tiene fila en Cities no puede producir una URL de
                // detalle que funcione, asi que se descarta en vez de mandarlo como enlace roto.
                var linkable = matches
                    .Where(m => citySlugs.ContainsKey(m.City))
                    .ToList();

                if (linkable.Count == 0)
                {
                    noMatches++;
                    continue;
                }

                var locale = SupportedLocales.Contains(alert.Locale) ? alert.Locale : "en";

                var shown = linkable.Take(_options.MaxItemsPerEmail).ToList();
                var citySlug = citySlugs[shown[0].City];

                await _email.SendAlertDigestAsync(new AlertDigestEmail(
                    ToEmail: recipient,
                    ToName: alert.User?.FullName ?? string.Empty,
                    AlertName: alert.Name,
                    AlertSummary: alert.City ?? shown[0].City,
                    Items: shown.Select(m => new AlertDigestItem(
                        Title: m.Title,
                        Url: $"{_baseUrl}/{locale}/{citySlugs[m.City]}/{m.Slug}",
                        Location: string.IsNullOrWhiteSpace(m.Neighbourhood)
                            ? m.City
                            : $"{m.Neighbourhood}, {m.City}",
                        MinPrice: m.MinPrice,
                        MaxPrice: m.MaxPrice,
                        MinBedrooms: m.MinBedrooms,
                        MaxBedrooms: m.MaxBedrooms,
                        MinBathrooms: m.MinBathrooms,
                        ImageUrl: m.ImageUrl)).ToList(),
                    TotalMatches: linkable.Count,
                    SearchUrl: $"{_baseUrl}/{locale}/{citySlug}",
                    ManageAlertsUrl: $"{_baseUrl}/{locale}/renter/alerts",
                    Locale: locale), ct);

                // Se marca SOLO despues de un envio correcto. Una ejecucion que no encontro
                // nada deja LastSentAt intacto a proposito: la ventana tiene que seguir
                // creciendo para que un listing publicado hoy siga siendo elegible manana.
                alert.LastSentAt = now;
                alert.UpdatedAt = now;
                await _db.SaveChangesAsync(ct);

                sent++;
                included += shown.Count;

                if (_options.SendDelayMs > 0)
                    await Task.Delay(_options.SendDelayMs, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Una alerta mala no puede abortar el lote. LastSentAt se queda como estaba,
                // asi que esta alerta simplemente se reintenta en la siguiente ejecucion.
                _logger.LogError(ex, "Alert {AlertId} digest failed; will retry next run.", alert.Id);
                failed++;
            }
        }

        var elapsed = Stopwatch.GetElapsedTime(startedAt);
        _logger.LogInformation(
            "Alert engine finished: considered={Considered} due={Due} sent={Sent} noMatches={NoMatches} failed={Failed} in {Ms}ms.",
            active.Count, due.Count, sent, noMatches, failed, (long)elapsed.TotalMilliseconds);

        return new DigestRunResult
        {
            Considered = active.Count,
            Due = due.Count,
            Sent = sent,
            NoMatches = noMatches,
            Failed = failed,
            PropertiesIncluded = included,
            ElapsedMs = (long)elapsed.TotalMilliseconds
        };
    }

    private async Task<Dictionary<string, string>> LoadCitySlugsAsync(CancellationToken ct) =>
        await _db.Cities
            .AsNoTracking()
            .ToDictionaryAsync(c => c.Name, c => c.Slug, StringComparer.OrdinalIgnoreCase, ct);
}
