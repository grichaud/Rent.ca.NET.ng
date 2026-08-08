namespace Rent.Api.Features.Email;

public class EmailOptions
{
    public const string SectionName = "Email";

    public string ApiKey { get; set; } = string.Empty;
    public string FromAddress { get; set; } = "onboarding@resend.dev";
    public string FromName { get; set; } = "Rent.ca";
    public string BaseUrl { get; set; } = "https://api.resend.com";

    /// <summary>
    /// Modo demo. Con un valor aqui, todo correo se entrega a esta unica direccion en vez de
    /// al destinatario real, y el destinatario previsto queda anotado en el asunto. Permite
    /// enviar correo de verdad mientras el remitente siga siendo el dominio de pruebas de
    /// Resend (onboarding@resend.dev), que solo entrega al dueno de la cuenta.
    /// </summary>
    public string RedirectAllTo { get; set; } = string.Empty;

    /// <summary>
    /// Copia oculta de cada envio real, para vigilancia del operador. Se ignora mientras
    /// RedirectAllTo este activo y cuando coincide con el destinatario.
    /// </summary>
    public string BccAll { get; set; } = string.Empty;

    /// <summary>
    /// Origen absoluto del CLIENTE para los enlaces de correos compuestos fuera de una
    /// peticion. El digest de alertas lo necesita porque el motor corre desde un cron y no
    /// tiene request del que deducir el host. Sin barra final.
    ///
    /// Vacio significa "usa App:ClientBaseUrl", que es lo correcto en desarrollo; solo hay que
    /// rellenarlo si el correo debe apuntar a un dominio distinto del configurado ahi.
    /// </summary>
    public string PublicBaseUrl { get; set; } = string.Empty;
}
