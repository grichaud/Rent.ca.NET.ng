using System.Globalization;
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

    public static (string Subject, string Html) Inquiry(InquiryEmail data)
    {
        var subject = $"New lead for \"{data.PropertyTitle}\"";
        var moveIn = data.MoveInDate is null ? "Not specified" : data.MoveInDate.Value.ToString("MMM d, yyyy");
        var phoneRow = string.IsNullOrWhiteSpace(data.SenderPhone)
            ? string.Empty
            : Row("Phone", Encode(data.SenderPhone));

        var body = new StringBuilder();
        body.Append($"<p style='font-size:16px;color:{BodyText};margin:0 0 8px;'>Hi {Encode(data.LandlordName)},</p>");
        body.Append($"<p style='font-size:16px;color:{BodyText};margin:0 0 24px;'>You have a new lead for <strong>{Encode(data.PropertyTitle)}</strong>.</p>");
        body.Append("<table style='width:100%;border-collapse:collapse;margin:0 0 24px;'>");
        body.Append(Row("From", $"{Encode(data.SenderName)} &lt;{Encode(data.SenderEmail)}&gt;"));
        body.Append(phoneRow);
        body.Append(Row("Move-in", Encode(moveIn)));
        body.Append("</table>");
        body.Append($"<div style='border-left:3px solid {Brand};padding:8px 16px;margin:0 0 24px;color:{BodyText};font-size:15px;'>");
        // Se codifica ANTES de meter los <br/>: al reves, el propio escape convertiria las
        // etiquetas en texto y el mensaje saldria con "&lt;br/&gt;" a la vista.
        body.Append(Encode(data.Message).Replace("\n", "<br/>"));
        body.Append("</div>");
        body.Append(Buttons(("Open inbox", data.InboxUrl, true), ("View listing", data.PropertyUrl, false)));

        return (subject, Wrap(subject, body.ToString()));
    }

    public static (string Subject, string Html) AlertDigest(AlertDigestEmail data)
    {
        var fr = data.Locale == "fr";
        var culture = new CultureInfo(fr ? "fr-CA" : "en-CA");
        var count = data.TotalMatches;

        var label = string.IsNullOrWhiteSpace(data.AlertName) ? data.AlertSummary : data.AlertName;
        var noun = fr
            ? (count == 1 ? "nouvelle annonce" : "nouvelles annonces")
            : (count == 1 ? "new listing" : "new listings");
        var subject = fr
            ? $"{count} {noun} pour « {label} »"
            : $"{count} {noun} for \"{label}\"";

        var greeting = string.IsNullOrWhiteSpace(data.ToName)
            ? (fr ? "Bonjour" : "Hi there")
            : (fr ? $"Bonjour {Encode(data.ToName)}" : $"Hi {Encode(data.ToName)}");
        var intro = fr
            ? $"Voici ce qui vient d&rsquo;être publié et qui correspond à votre alerte <strong>{Encode(label)}</strong>."
            : $"Here&rsquo;s what was just listed matching your <strong>{Encode(label)}</strong> alert.";

        var body = new StringBuilder();
        body.Append($"<p style='font-size:16px;color:{BodyText};margin:0 0 12px;'>{greeting},</p>");
        body.Append($"<p style='font-size:16px;color:{BodyText};margin:0 0 24px;'>{intro}</p>");

        foreach (var item in data.Items)
            body.Append(DigestCard(item, culture, fr));

        // Solo aparece cuando la ejecucion recorto la lista (MaxItemsPerEmail).
        var remaining = data.TotalMatches - data.Items.Count;
        if (remaining > 0)
        {
            var more = fr
                ? $"+ {remaining} autre{(remaining == 1 ? "" : "s")} correspondance{(remaining == 1 ? "" : "s")}."
                : $"+ {remaining} more match{(remaining == 1 ? "" : "es")}.";
            body.Append($"<p style='font-size:14px;color:{MutedText};margin:0 0 20px;'>{more}</p>");
        }

        body.Append(Buttons(
            (fr ? "Voir toutes les annonces" : "View all listings", data.SearchUrl, true),
            (fr ? "Gérer mes alertes" : "Manage alerts", data.ManageAlertsUrl, false)));

        var footnote = fr
            ? "Vous recevez ce courriel parce que vous avez créé une alerte sur Rent.ca. Vous pouvez la mettre en pause ou la supprimer à tout moment."
            : "You&rsquo;re receiving this because you set up an alert on Rent.ca. You can pause or delete it at any time.";
        body.Append($"<p style='font-size:13px;color:{MutedText};margin:24px 0 0;'>{footnote}</p>");

        return (subject, Wrap(subject, body.ToString(), data.Locale));
    }

    private static string DigestCard(AlertDigestItem item, CultureInfo culture, bool fr)
    {
        var price = FormatPriceRange(item.MinPrice, item.MaxPrice, culture, fr);
        var beds = item.MaxBedrooms is int maxBed && maxBed != item.MinBedrooms
            ? $"{item.MinBedrooms}–{maxBed}"
            : item.MinBedrooms.ToString(culture);
        var specs = fr
            ? $"{beds} ch. &middot; {item.MinBathrooms.ToString("0.#", culture)} sdb."
            : $"{beds} bd &middot; {item.MinBathrooms.ToString("0.#", culture)} ba";

        var sb = new StringBuilder();
        sb.Append("<table role='presentation' cellpadding='0' cellspacing='0' style='width:100%;border:1px solid #e2e8f0;border-radius:12px;margin:0 0 12px;'><tr>");

        if (!string.IsNullOrWhiteSpace(item.ImageUrl))
        {
            sb.Append("<td style='width:96px;padding:12px 0 12px 12px;vertical-align:top;'>");
            sb.Append($"<img src='{Encode(item.ImageUrl)}' width='96' height='72' alt='' style='width:96px;height:72px;object-fit:cover;border-radius:8px;display:block;'/>");
            sb.Append("</td>");
        }

        sb.Append("<td style='padding:12px;vertical-align:top;'>");
        sb.Append($"<a href='{Encode(item.Url)}' style='color:{BodyText};font-size:15px;font-weight:600;text-decoration:none;'>{Encode(item.Title)}</a>");
        sb.Append($"<div style='color:{MutedText};font-size:13px;margin:4px 0 0;'>{Encode(item.Location)}</div>");
        sb.Append($"<div style='color:{BodyText};font-size:14px;margin:6px 0 0;'><strong>{price}</strong> <span style='color:{MutedText};'>&middot; {specs}</span></div>");
        sb.Append("</td></tr></table>");
        return sb.ToString();
    }

    private static string FormatPriceRange(decimal? min, decimal? max, CultureInfo culture, bool fr)
    {
        if (min is not decimal lo) return fr ? "Prix sur demande" : "Price on request";
        var loText = lo.ToString("C0", culture);
        if (max is not decimal hi || hi == lo) return Encode(loText);
        return $"{Encode(loText)}&ndash;{Encode(hi.ToString("C0", culture))}";
    }

    private static string Row(string label, string value) =>
        $"<tr><td style='padding:6px 0;color:{MutedText};font-size:13px;width:90px;'>{Encode(label)}</td><td style='padding:6px 0;color:{BodyText};font-size:14px;'>{value}</td></tr>";

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
