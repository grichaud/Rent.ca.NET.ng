using System.Net;
using System.Text;

namespace Rent.Api.Features.Email;

/// <summary>
/// HTML de los correos, copiado del origen. Estilos en linea y tablas porque los clientes de
/// correo no soportan hojas de estilo ni flexbox.
/// </summary>
public static class EmailTemplates
{
    private const string Brand = "#338dff";
    private const string BrandDark = "#142857";
    private const string LightBg = "#f8fafc";
    private const string CardBg = "#ffffff";
    private const string BodyText = "#0f172a";
    private const string MutedText = "#475569";

    public static (string Subject, string Html) Welcome(WelcomeEmail data)
    {
        var fr = data.Locale == "fr";
        var subject = fr ? "Bienvenue sur Rent.ca" : "Welcome to Rent.ca";
        var greeting = string.IsNullOrWhiteSpace(data.ToName)
            ? (fr ? "Bonjour" : "Hi there")
            : (fr ? $"Bonjour {Encode(data.ToName)}" : $"Hi {Encode(data.ToName)}");
        var roleCopy = data.Role == "Landlord"
            ? (fr
                ? "Votre tableau de bord propriétaire est prêt. Publiez votre première annonce et commencez à recevoir des demandes."
                : "Your landlord dashboard is ready. Post your first listing and start receiving leads.")
            : (fr
                ? "Parcourez les annonces, enregistrez vos favoris et communiquez directement avec les propriétaires."
                : "Browse listings, save your favourites, and message landlords directly.");
        var ctaText = data.Role == "Landlord"
            ? (fr ? "Ouvrir le tableau de bord" : "Open landlord dashboard")
            : (fr ? "Commencer à parcourir" : "Start browsing");
        var welcomeLine = fr ? "Bienvenue sur Rent.ca." : "Welcome to Rent.ca.";

        var body = new StringBuilder();
        body.Append($"<p style='font-size:16px;color:{BodyText};margin:0 0 12px;'>{greeting},</p>");
        body.Append($"<p style='font-size:16px;color:{BodyText};margin:0 0 24px;'>{welcomeLine} {roleCopy}</p>");
        body.Append(Buttons((ctaText, data.PortalUrl, true)));

        return (subject, Wrap(subject, body.ToString(), data.Locale));
    }

    public static (string Subject, string Html) PasswordReset(PasswordResetEmail data)
    {
        var fr = data.Locale == "fr";
        var subject = fr ? "Réinitialisez votre mot de passe Rent.ca" : "Reset your Rent.ca password";
        var greeting = string.IsNullOrWhiteSpace(data.ToName)
            ? (fr ? "Bonjour" : "Hi there")
            : (fr ? $"Bonjour {Encode(data.ToName)}" : $"Hi {Encode(data.ToName)}");
        var instruction = fr
            ? "Touchez le bouton ci-dessous pour choisir un nouveau mot de passe. Le lien expire dans quelques heures."
            : "Tap the button below to choose a new password. The link expires in a few hours.";
        var buttonText = fr ? "Réinitialiser le mot de passe" : "Reset password";
        var disclaimer = fr
            ? "Si vous n&rsquo;avez pas fait cette demande, vous pouvez ignorer ce courriel."
            : "If you didn&rsquo;t request this, you can safely ignore this email.";

        var body = new StringBuilder();
        body.Append($"<p style='font-size:16px;color:{BodyText};margin:0 0 12px;'>{greeting},</p>");
        body.Append($"<p style='font-size:16px;color:{BodyText};margin:0 0 12px;'>{instruction}</p>");
        body.Append(Buttons((buttonText, data.ResetUrl, true)));
        body.Append($"<p style='font-size:13px;color:{MutedText};margin:24px 0 0;'>{disclaimer}</p>");

        return (subject, Wrap(subject, body.ToString(), data.Locale));
    }

    private static string Wrap(string title, string innerHtml, string locale = "en") => $@"<!doctype html>
<html lang=""{locale}"">
<head>
<meta charset=""utf-8""/>
<meta name=""viewport"" content=""width=device-width,initial-scale=1""/>
<title>{Encode(title)}</title>
</head>
<body style=""margin:0;padding:24px 0;background-color:{LightBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"">
  <table role=""presentation"" cellspacing=""0"" cellpadding=""0"" border=""0"" align=""center"" style=""max-width:560px;width:100%;background-color:{CardBg};border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.06);"">
    <tr>
      <td style=""padding:24px 32px;background:linear-gradient(135deg,{Brand},{BrandDark});color:#fff;font-weight:600;font-size:18px;letter-spacing:.2px;"">Rent.ca</td>
    </tr>
    <tr>
      <td style=""padding:32px;"">
        {innerHtml}
      </td>
    </tr>
    <tr>
      <td style=""padding:16px 32px 24px;color:{MutedText};font-size:12px;border-top:1px solid #e2e8f0;"">Sent by Rent.ca</td>
    </tr>
  </table>
</body>
</html>";

    private static string Buttons(params (string Text, string Url, bool Primary)[] buttons)
    {
        var sb = new StringBuilder();
        sb.Append("<div style='display:block;'>");
        foreach (var (text, url, primary) in buttons)
        {
            var bg = primary ? Brand : "#e2e8f0";
            var fg = primary ? "#ffffff" : BodyText;
            sb.Append($"<a href='{Encode(url)}' style='display:inline-block;padding:12px 20px;margin:0 8px 8px 0;border-radius:10px;background-color:{bg};color:{fg};font-weight:600;font-size:14px;text-decoration:none;'>{Encode(text)}</a>");
        }
        sb.Append("</div>");
        return sb.ToString();
    }

    private static string Encode(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);
}
