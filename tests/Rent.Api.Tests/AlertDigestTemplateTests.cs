using Rent.Api.Features.Email;

namespace Rent.Api.Tests;

/// <summary>
/// La plantilla del correo de digest (port de <c>AlertDigestTemplateTests.cs</c> del origen).
///
/// Un correo no se puede corregir despues de enviarlo: no hay recarga que valga. Y es el unico
/// sitio del producto donde texto escrito por un usuario —el nombre que le pone a su alerta—
/// acaba dentro de un HTML que lee OTRA persona en su bandeja. De ahi que el escapado tenga
/// test propio.
///
/// El idioma viaja en el modelo (<c>Locale</c>) y no se toma de la cultura del hilo: el motor
/// corre sin peticion HTTP, asi que no hay cultura ambiente de la que tirar. Sin esto, una
/// alerta creada en frances mandaria su digest en ingles.
/// </summary>
public class AlertDigestTemplateTests
{
    private static AlertDigestEmail Digest(
        string locale = "en",
        string? alertName = "Downtown 2BR",
        int totalMatches = 3,
        int items = 3)
    {
        var lista = Enumerable.Range(1, items)
            .Select(i => new AlertDigestItem(
                Title: $"Piso {i}",
                Url: $"https://rent.local/en/toronto/piso-{i}",
                Location: "Toronto, ON",
                MinPrice: 1800m,
                MaxPrice: 2400m,
                MinBedrooms: 1,
                MaxBedrooms: 2,
                MinBathrooms: 1m,
                ImageUrl: null))
            .ToList();

        return new AlertDigestEmail(
            ToEmail: "persona@example.com",
            ToName: "Persona",
            AlertName: alertName,
            AlertSummary: "Toronto, hasta 2500 $",
            Items: lista,
            TotalMatches: totalMatches,
            SearchUrl: "https://rent.local/en/toronto",
            ManageAlertsUrl: "https://rent.local/en/renter/alerts",
            Locale: locale);
    }

    [Fact]
    public void El_asunto_en_ingles_lleva_el_numero_y_el_nombre_de_la_alerta()
    {
        var (subject, _) = EmailTemplates.AlertDigest(Digest());

        Assert.Equal("3 new listings for \"Downtown 2BR\"", subject);
    }

    [Fact]
    public void El_asunto_en_frances_esta_traducido()
    {
        var (subject, _) = EmailTemplates.AlertDigest(Digest(locale: "fr"));

        Assert.Contains("nouvelles annonces", subject);
        Assert.DoesNotContain("new listings", subject);
    }

    [Fact]
    public void Con_una_sola_coincidencia_el_sustantivo_va_en_singular_en_los_dos_idiomas()
    {
        var (ingles, _) = EmailTemplates.AlertDigest(Digest(totalMatches: 1, items: 1));
        var (frances, _) = EmailTemplates.AlertDigest(Digest(locale: "fr", totalMatches: 1, items: 1));

        Assert.Contains("1 new listing for", ingles);
        Assert.DoesNotContain("new listings", ingles);
        Assert.Contains("1 nouvelle annonce", frances);
        Assert.DoesNotContain("nouvelles annonces", frances);
    }

    [Fact]
    public void Sin_nombre_la_alerta_se_identifica_por_su_resumen()
    {
        // Poner nombre es opcional: sin este respaldo el asunto seria «3 new listings for ""».
        var (subject, _) = EmailTemplates.AlertDigest(Digest(alertName: null));

        Assert.Contains("Toronto, hasta 2500 $", subject);
    }

    [Fact]
    public void Se_avisa_de_las_coincidencias_que_no_caben_en_el_correo()
    {
        var (_, html) = EmailTemplates.AlertDigest(Digest(totalMatches: 12, items: 10));

        Assert.Contains("+ 2 more matches", html);
    }

    [Fact]
    public void Sin_recorte_no_aparece_la_linea_de_sobrantes()
    {
        var (_, html) = EmailTemplates.AlertDigest(Digest(totalMatches: 3, items: 3));

        Assert.DoesNotContain("more match", html);
    }

    [Fact]
    public void El_correo_enlaza_a_los_pisos_y_a_gestionar_alertas()
    {
        var (_, html) = EmailTemplates.AlertDigest(Digest());

        Assert.Contains("https://rent.local/en/toronto/piso-1", html);
        Assert.Contains("https://rent.local/en/renter/alerts", html);
    }

    [Fact]
    public void El_idioma_del_correo_llega_al_atributo_lang()
    {
        var (_, html) = EmailTemplates.AlertDigest(Digest(locale: "fr"));

        Assert.Contains(@"<html lang=""fr""", html);
    }

    [Fact]
    public void El_nombre_de_la_alerta_se_escapa_en_el_cuerpo()
    {
        // El nombre lo escribe el usuario y lo LEE otra persona en su bandeja. Sin escapar,
        // una alerta llamada asi inyecta HTML en un correo ajeno.
        var (_, html) = EmailTemplates.AlertDigest(Digest(alertName: "<script>alert(1)</script>"));

        Assert.DoesNotContain("<script>alert(1)</script>", html);
        Assert.Contains("&lt;script&gt;", html);
    }

    [Fact]
    public void El_nombre_del_destinatario_tambien_se_escapa()
    {
        var data = Digest() with { ToName = "<img src=x onerror=1>" };

        var (_, html) = EmailTemplates.AlertDigest(data);

        Assert.DoesNotContain("<img src=x", html);
        Assert.Contains("&lt;img", html);
    }

    [Fact]
    public void El_titulo_del_documento_no_arrastra_el_asunto_sin_escapar()
    {
        // El asunto va crudo -es texto plano en el cliente de correo- pero se reutiliza como
        // titulo del documento HTML, y ahi si tiene que ir codificado.
        var (subject, html) = EmailTemplates.AlertDigest(Digest(alertName: "<b>oferta</b>"));

        Assert.Contains("<b>oferta</b>", subject);
        Assert.DoesNotContain("<title><b>oferta</b>", html);
    }
}
