import { City, ListingDetail, PropertyType } from '../api/api.types';
import { absoluteUrl } from './site-url';

/**
 * Datos estructurados schema.org.
 *
 * Es lo unico del `<head>` que no existe en NINGUNA de las versiones del producto, y es donde
 * un portal inmobiliario gana el clic: sin esto el resultado es una linea azul mas; con esto
 * el buscador puede mostrar precio, habitaciones y disponibilidad.
 *
 * Regla que se aplica en todo el archivo: **no se afirma lo que no se sabe**. Un campo sin
 * dato se omite en vez de salir vacio o inventado — un JSON-LD que contradice a la pagina
 * vale menos que no tener ninguno.
 */

/** Del enum del catalogo al tipo de alojamiento de schema.org. */
const ACCOMMODATION_TYPES: Record<PropertyType, string> = {
  Apartment: 'Apartment',
  Condo: 'Apartment',
  Studio: 'Apartment',
  Loft: 'Apartment',
  Basement: 'Apartment',
  House: 'SingleFamilyResidence',
  Townhouse: 'SingleFamilyResidence',
  Duplex: 'SingleFamilyResidence',
  Other: 'Accommodation',
};

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Identidad del sitio. Solo en la home: repetirla en cada pagina no aporta nada. */
export function siteJsonLd(baseUrl: string, culture: string, siteName: string): object[] {
  const homeUrl = `${baseUrl}/${culture}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${baseUrl}/#website`,
      name: siteName,
      url: homeUrl,
      inLanguage: culture,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${baseUrl}/#organization`,
      name: siteName,
      url: baseUrl,
    },
  ];
}

/**
 * La pagina de una ciudad es un listado, no un producto. Se declara como `CollectionPage` con
 * un `ItemList` de sus resultados: describe lo que la pagina realmente contiene sin fingir que
 * cada resultado esta detallado aqui — por eso los elementos son URLs y no fichas completas.
 */
export function cityJsonLd(
  baseUrl: string,
  culture: string,
  city: City,
  listings: { slug: string; title: string; citySlug: string }[],
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: city.name,
    url: `${baseUrl}/${culture}/${city.slug}`,
    inLanguage: culture,
    about: {
      '@type': 'City',
      name: city.name,
      address: { '@type': 'PostalAddress', addressRegion: city.province, addressCountry: 'CA' },
      ...(city.latitude !== null && city.longitude !== null
        ? { geo: { '@type': 'GeoCoordinates', latitude: city.latitude, longitude: city.longitude } }
        : {}),
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: listings.length,
      itemListElement: listings.map((listing, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: listing.title,
        url: `${baseUrl}/${culture}/${listing.citySlug}/${listing.slug}`,
      })),
    },
  };
}

/** La ficha: `RealEstateListing` con el alojamiento y la oferta de precio. */
export function listingJsonLd(
  baseUrl: string,
  culture: string,
  listing: ListingDetail,
  description: string,
): object {
  const url = `${baseUrl}/${culture}/${listing.citySlug}/${listing.slug}`;
  const units = listing.units;

  // El precio anunciado es el de la unidad mas barata, que es el que ve el usuario en la
  // pagina ("Desde $X"). Declarar otro seria un cebo de precio.
  const prices = units.map((u) => u.price).filter((p) => p > 0);
  const hasAvailability = units.some((u) => u.availableUnits > 0);

  const bedrooms = units.length ? Math.min(...units.map((u) => u.bedrooms)) : null;
  const bathrooms = units.length ? Math.min(...units.map((u) => u.bathrooms)) : null;

  const accommodation: Record<string, unknown> = {
    '@type': ACCOMMODATION_TYPES[listing.propertyType] ?? 'Accommodation',
    name: listing.title,
    address: {
      '@type': 'PostalAddress',
      streetAddress: listing.streetAddress,
      addressLocality: listing.city,
      addressRegion: listing.province,
      postalCode: listing.postalCode,
      addressCountry: 'CA',
    },
    petsAllowed: listing.petsAllowed,
  };

  if (listing.latitude !== null && listing.longitude !== null) {
    accommodation['geo'] = {
      '@type': 'GeoCoordinates',
      latitude: listing.latitude,
      longitude: listing.longitude,
    };
  }
  // `0` es un dato valido (un estudio tiene cero dormitorios), asi que se compara con null y
  // no por veracidad: un `if (bedrooms)` se comeria justo los estudios.
  if (bedrooms !== null) accommodation['numberOfBedrooms'] = bedrooms;
  if (bathrooms !== null) accommodation['numberOfBathroomsTotal'] = bathrooms;
  if (listing.totalUnits) accommodation['numberOfAccommodationUnits'] = listing.totalUnits;
  if (listing.amenities.length) {
    accommodation['amenityFeature'] = listing.amenities.map((a) => ({
      '@type': 'LocationFeatureSpecification',
      name: a.name,
      value: true,
    }));
  }

  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    url,
    name: listing.title,
    inLanguage: culture,
    datePosted: listing.createdAt,
    about: accommodation,
  };

  if (description) node['description'] = description;

  if (listing.images.length) {
    node['image'] = listing.images.map((image) => absoluteUrl(baseUrl, image.url));
  }

  if (prices.length) {
    node['offers'] = {
      '@type': 'Offer',
      url,
      price: Math.min(...prices),
      priceCurrency: 'CAD',
      availability: hasAvailability
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      // El precio es mensual; sin esto un $1,850 se lee como el precio de compra del piso.
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: Math.min(...prices),
        priceCurrency: 'CAD',
        unitCode: 'MON',
      },
    };
  }

  if (listing.landlord?.companyName) {
    node['provider'] = { '@type': 'Organization', name: listing.landlord.companyName };
  }

  return node;
}
