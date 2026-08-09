using Rent.Api.Domain;

namespace Rent.Api.Tests;

/// <summary>
/// Vigencia del tier y de las promociones (port de <c>Domain/EffectiveTierTests.cs</c> del
/// origen).
///
/// Es la regla que decide QUE SE COBRA: un anuncio destacado cuya vigencia expiro tiene que
/// dejar de aparecer arriba solo, sin que nadie corra un proceso nocturno. Como se resuelve al
/// leer y no con un campo persistido, el fallo seria silencioso — el anuncio seguiria
/// destacado para siempre y nadie lo notaria salvo la competencia.
///
/// Todos los tests pasan el instante explicitamente en vez de depender del reloj: un test que
/// mira la hora real falla solo, de madrugada, sin haber cambiado nada.
/// </summary>
public class ListingTierTests
{
    private static readonly DateTimeOffset Ahora = new(2026, 8, 9, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Un_tier_sin_vigencia_no_caduca_nunca()
    {
        var property = new Property { Tier = ListingTier.Featured, TierExpiresAt = null };

        Assert.Equal(ListingTier.Featured, property.EffectiveTier(Ahora));
    }

    [Fact]
    public void Un_tier_con_vigencia_futura_se_mantiene()
    {
        var property = new Property
        {
            Tier = ListingTier.Promoted,
            TierExpiresAt = Ahora.AddDays(1),
        };

        Assert.Equal(ListingTier.Promoted, property.EffectiveTier(Ahora));
    }

    [Fact]
    public void Un_tier_caducado_cae_a_Limited()
    {
        var property = new Property
        {
            Tier = ListingTier.Featured,
            TierExpiresAt = Ahora.AddSeconds(-1),
        };

        Assert.Equal(ListingTier.Limited, property.EffectiveTier(Ahora));
    }

    [Fact]
    public void La_vigencia_del_propietario_se_resuelve_igual_que_la_del_anuncio()
    {
        var landlord = new LandlordProfile
        {
            Tier = ListingTier.Featured,
            TierExpiresAt = Ahora.AddMinutes(-1),
        };

        Assert.Equal(ListingTier.Limited, landlord.EffectiveTier(Ahora));
    }

    [Fact]
    public void El_instante_exacto_de_caducidad_todavia_cuenta_como_vigente()
    {
        // El corte es estrictamente menor: justo AL expirar sigue valiendo. Da igual cual sea
        // el criterio mientras este fijado; lo que no puede es cambiar sin que nadie se entere.
        var property = new Property { Tier = ListingTier.Promoted, TierExpiresAt = Ahora };

        Assert.Equal(ListingTier.Promoted, property.EffectiveTier(Ahora));
    }

    [Fact]
    public void La_promocion_activa_es_la_primera_dentro_de_su_ventana()
    {
        var property = new Property
        {
            RentSpecials =
            [
                new RentSpecial { Title = "Caducada", IsActive = true, EndDate = Ahora.AddDays(-1) },
                new RentSpecial { Title = "Vigente", IsActive = true, StartDate = Ahora.AddDays(-1), EndDate = Ahora.AddDays(1) },
            ],
        };

        Assert.Equal("Vigente", property.ActiveSpecial(Ahora)?.Title);
    }

    [Fact]
    public void Una_promocion_que_aun_no_ha_empezado_no_cuenta()
    {
        var property = new Property
        {
            RentSpecials = [new RentSpecial { Title = "Futura", IsActive = true, StartDate = Ahora.AddDays(1) }],
        };

        Assert.Null(property.ActiveSpecial(Ahora));
    }

    [Fact]
    public void Una_promocion_desactivada_no_cuenta_aunque_este_en_ventana()
    {
        var property = new Property
        {
            RentSpecials =
            [
                new RentSpecial
                {
                    Title = "Apagada",
                    IsActive = false,
                    StartDate = Ahora.AddDays(-1),
                    EndDate = Ahora.AddDays(1),
                },
            ],
        };

        Assert.Null(property.ActiveSpecial(Ahora));
    }

    [Fact]
    public void Sin_promociones_no_hay_ninguna_activa()
    {
        Assert.Null(new Property().ActiveSpecial(Ahora));
    }

    [Fact]
    public void Una_promocion_sin_fechas_esta_siempre_vigente()
    {
        var special = new RentSpecial { Title = "Permanente", IsActive = true };

        Assert.True(special.IsActiveAt(Ahora));
    }
}
