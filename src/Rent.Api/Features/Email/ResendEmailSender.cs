using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Rent.Api.Features.Email;

public class ResendEmailSender : IEmailSender
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _http;
    private readonly EmailOptions _options;
    private readonly ILogger<ResendEmailSender> _logger;

    public ResendEmailSender(HttpClient http, IOptions<EmailOptions> options, ILogger<ResendEmailSender> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;

        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);
        }
    }

    public Task SendWelcomeAsync(WelcomeEmail data, CancellationToken ct = default)
    {
        var (subject, html) = EmailTemplates.Welcome(data);
        return SendAsync(data.ToEmail, subject, html, ct);
    }

    public Task SendPasswordResetAsync(PasswordResetEmail data, CancellationToken ct = default)
    {
        var (subject, html) = EmailTemplates.PasswordReset(data);
        return SendAsync(data.ToEmail, subject, html, ct);
    }

    public Task SendInquiryToLandlordAsync(InquiryEmail data, CancellationToken ct = default)
    {
        var (subject, html) = EmailTemplates.Inquiry(data);
        // replyTo apunta a quien pregunta: asi el propietario responde con "Responder" y el
        // correo llega al interesado, no al remitente tecnico de la plataforma.
        return SendAsync(data.LandlordEmail, subject, html, ct, replyTo: data.SenderEmail);
    }

    public Task SendAlertDigestAsync(AlertDigestEmail data, CancellationToken ct = default)
    {
        var (subject, html) = EmailTemplates.AlertDigest(data);
        return SendAsync(data.ToEmail, subject, html, ct);
    }

    private async Task SendAsync(
        string to, string subject, string html, CancellationToken ct, string? replyTo = null)
    {
        var from = string.IsNullOrWhiteSpace(_options.FromName)
            ? _options.FromAddress
            : $"{_options.FromName} <{_options.FromAddress}>";

        var recipient = to;
        string[]? bcc = null;
        if (!string.IsNullOrWhiteSpace(_options.RedirectAllTo))
        {
            recipient = _options.RedirectAllTo;
            subject = $"[demo -> {to}] {subject}";
        }
        else if (!string.IsNullOrWhiteSpace(_options.BccAll)
            && !string.Equals(_options.BccAll, to, StringComparison.OrdinalIgnoreCase))
        {
            bcc = [_options.BccAll];
        }

        var payload = new ResendRequest(from, [recipient], subject, html, replyTo, bcc);

        using var response = await _http.PostAsJsonAsync("emails", payload, JsonOptions, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Resend returned {Status} for {To} ({Subject}): {Body}",
                (int)response.StatusCode, to, subject, body);
            response.EnsureSuccessStatusCode();
            return;
        }

        var parsed = JsonSerializer.Deserialize<ResendResponse>(body, JsonOptions);
        _logger.LogInformation(
            "Resend accepted {Subject} for {To} (id={Id}).", subject, to, parsed?.Id ?? "(none)");
    }

    private record ResendRequest(
        string From, string[] To, string Subject, string Html, string? ReplyTo, string[]? Bcc);

    private record ResendResponse(string? Id);
}
