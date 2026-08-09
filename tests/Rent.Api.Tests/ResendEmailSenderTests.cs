using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Rent.Api.Features.Email;

namespace Rent.Api.Tests;

/// <summary>
/// El enrutado de destinatarios del emisor de Resend (port de <c>ResendEmailSenderTests.cs</c>
/// del origen).
///
/// Es la valvula que impide que una demo escriba a personas reales: con
/// <c>RedirectAllTo</c> configurado, TODO correo va a esa direccion y el destinatario original
/// queda anotado en el asunto. Equivocarse aqui no da un error, da correos a desconocidos —
/// por eso se prueba el cuerpo exacto de la peticion y no solo que "no lance".
///
/// No se llama a la API de Resend: se intercepta el HttpClient y se inspecciona el JSON.
/// </summary>
public class ResendEmailSenderTests
{
    private sealed class CapturingHandler : HttpMessageHandler
    {
        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"id":"test-id"}"""),
            };
        }
    }

    private sealed record Sent(string From, string[] To, string Subject, string[]? Bcc);

    private static async Task<Sent> SendAsync(Action<EmailOptions> configure)
    {
        var options = new EmailOptions
        {
            FromName = "Rent.ca",
            FromAddress = "no-reply@rent.local",
        };
        configure(options);

        var handler = new CapturingHandler();
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.resend.com/") };
        var sender = new ResendEmailSender(
            http, Options.Create(options), NullLogger<ResendEmailSender>.Instance);

        await sender.SendWelcomeAsync(
            new WelcomeEmail("persona@example.com", "Persona", "Renter", "https://rent.local/en/renter"));

        using var doc = JsonDocument.Parse(handler.Body!);
        var root = doc.RootElement;
        return new Sent(
            root.GetProperty("from").GetString()!,
            root.GetProperty("to").EnumerateArray().Select(e => e.GetString()!).ToArray(),
            root.GetProperty("subject").GetString()!,
            root.TryGetProperty("bcc", out var bcc) && bcc.ValueKind == JsonValueKind.Array
                ? bcc.EnumerateArray().Select(e => e.GetString()!).ToArray()
                : null);
    }

    [Fact]
    public async Task Sin_redireccion_el_correo_va_a_su_destinatario_real()
    {
        var sent = await SendAsync(_ => { });

        Assert.Equal(["persona@example.com"], sent.To);
        Assert.DoesNotContain("[demo", sent.Subject);
        Assert.Null(sent.Bcc);
    }

    [Fact]
    public async Task El_nombre_del_remitente_se_compone_con_su_direccion()
    {
        var sent = await SendAsync(_ => { });

        Assert.Equal("Rent.ca <no-reply@rent.local>", sent.From);
    }

    [Fact]
    public async Task Sin_nombre_de_remitente_va_solo_la_direccion()
    {
        var sent = await SendAsync(o => o.FromName = string.Empty);

        Assert.Equal("no-reply@rent.local", sent.From);
    }

    [Fact]
    public async Task Con_redireccion_el_correo_va_al_dueno_y_el_asunto_anota_a_quien_iba()
    {
        var sent = await SendAsync(o => o.RedirectAllTo = "dueno@rent.local");

        Assert.Equal(["dueno@rent.local"], sent.To);
        Assert.StartsWith("[demo -> persona@example.com]", sent.Subject);
    }

    [Fact]
    public async Task La_redireccion_gana_a_la_copia_oculta()
    {
        // Si valieran las dos, el correo llegaria al dueno Y a la direccion de copia: dos
        // caminos por los que un mensaje de demo sale de donde deberia quedarse.
        var sent = await SendAsync(o =>
        {
            o.RedirectAllTo = "dueno@rent.local";
            o.BccAll = "copia@rent.local";
        });

        Assert.Equal(["dueno@rent.local"], sent.To);
        Assert.Null(sent.Bcc);
    }

    [Fact]
    public async Task La_copia_oculta_acompana_al_destinatario_real()
    {
        var sent = await SendAsync(o => o.BccAll = "copia@rent.local");

        Assert.Equal(["persona@example.com"], sent.To);
        Assert.Equal(["copia@rent.local"], sent.Bcc!);
    }

    [Fact]
    public async Task No_se_manda_copia_oculta_a_quien_ya_es_el_destinatario()
    {
        // Recibir el mismo correo dos veces parece un fallo del producto.
        var sent = await SendAsync(o => o.BccAll = "PERSONA@example.com");

        Assert.Equal(["persona@example.com"], sent.To);
        Assert.Null(sent.Bcc);
    }
}
