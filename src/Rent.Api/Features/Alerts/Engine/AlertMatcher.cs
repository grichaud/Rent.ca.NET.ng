using Microsoft.EntityFrameworkCore;
using Rent.Api.Domain;
using Rent.Api.Infrastructure.Data;

namespace Rent.Api.Features.Alerts.Engine;

/// <summary>
/// Busca listings publicados desde la ultima vez que se atendio una alerta y que cumplen sus
/// criterios.
///
/// A proposito NO reutiliza <see cref="Features.Search.SearchHandler"/>: ese registra cada
/// consulta en PopularSearches para el panel de admin, asi que dispararlo desde un motor
/// horario fabricaria una busqueda fantasma por alerta y por ejecucion. La semantica de los
/// filtros lo imita adrede (precio, dormitorios y banos se evaluan contra Units, no contra la
/// propiedad) y ambos deben mantenerse en paso.
/// </summary>
public class AlertMatcher
{
    private readonly AppDbContext _db;

    public AlertMatcher(AppDbContext db) => _db = db;

    public async Task<IReadOnlyList<AlertMatch>> FindNewMatchesAsync(
        Alert alert, DateTimeOffset since, int max, CancellationToken ct = default)
    {
        if (max <= 0) return [];

        // OJO: el corte por `since` se aplica en memoria mas abajo, no aqui. El proveedor
        // SQLite de EF Core (el de los tests) no sabe traducir una comparacion de
        // DateTimeOffset, asi que `.Where(p => p.CreatedAt > since)` revienta al ejecutar.
        // Todos los demas filtros siguen en SQL: lo que vuelve ya viene acotado por ciudad,
        // tipo, precio, dormitorios, banos y mascotas; solo la ventana de fechas es en cliente.
        var q = _db.Properties
            .AsNoTracking()
            .Where(p => p.Status == ListingStatus.Active);

        if (!string.IsNullOrWhiteSpace(alert.City))
        {
            // Alert.City guarda el NOMBRE de la ciudad, igual que Property.City. La
            // intercalacion por defecto de SQL Server no distingue mayusculas, asi que
            // "toronto" sigue casando con "Toronto".
            var city = alert.City.Trim();
            q = q.Where(p => p.City == city);
        }

        if (alert.PropertyType is PropertyType type)
            q = q.Where(p => p.PropertyType == type);

        if (alert.PriceMin is decimal priceMin)
            q = q.Where(p => p.Units.Any(u => u.Price >= priceMin));

        if (alert.PriceMax is decimal priceMax)
            q = q.Where(p => p.Units.Any(u => u.Price <= priceMax));

        if (alert.BedroomsMin is int bedrooms)
            q = q.Where(p => p.Units.Any(u => u.Bedrooms >= bedrooms));

        if (alert.BathroomsMin is decimal bathrooms)
            q = q.Where(p => p.Units.Any(u => u.Bathrooms >= bathrooms));

        if (alert.PetsAllowed is bool pets)
            q = q.Where(p => p.PetsAllowed == pets);

        // Las unidades vuelven como lista y los Min/Max corren en memoria: SQLite tampoco sabe
        // traducir agregados sobre decimal. Es la misma razon por la que SearchHandler proyecta
        // de esta forma.
        var raw = await q
            .Select(p => new
            {
                p.Id,
                p.Title,
                p.Slug,
                p.City,
                p.Province,
                p.Neighbourhood,
                p.CreatedAt,
                ImageUrl = p.Images
                    .OrderByDescending(i => i.IsPrimary)
                    .ThenBy(i => i.DisplayOrder)
                    .Select(i => i.Url)
                    .FirstOrDefault(),
                Units = p.Units.Select(u => new { u.Price, u.Bedrooms, u.Bathrooms }).ToList()
            })
            .ToListAsync(ct);

        // Ventana de fechas y orden por mas reciente, ambos en cliente por lo dicho arriba.
        // Nota de escala: esto materializa todo listing activo que pase los demas filtros. Con
        // el tamano de este catalogo son unas decenas de filas; si alguna ciudad llegara a
        // miles de listings activos, revisar dando a Property una columna sombra DateTime (no
        // DateTimeOffset) que SQLite si sepa comparar, y empujar esto a SQL.
        return raw
            .Where(p => p.CreatedAt > since)
            .OrderByDescending(p => p.CreatedAt)
            .Take(max)
            .Select(p => new AlertMatch(
                p.Id,
                p.Title,
                p.Slug,
                p.City,
                p.Province,
                p.Neighbourhood,
                p.ImageUrl,
                p.Units.Count == 0 ? null : p.Units.Min(u => (decimal?)u.Price),
                p.Units.Count == 0 ? null : p.Units.Max(u => (decimal?)u.Price),
                p.Units.Count == 0 ? 0 : p.Units.Min(u => u.Bedrooms),
                p.Units.Count == 0 ? null : p.Units.Max(u => (int?)u.Bedrooms),
                p.Units.Count == 0 ? 0m : p.Units.Min(u => u.Bathrooms),
                p.CreatedAt))
            .ToList();
    }
}
