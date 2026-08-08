/**
 * Espejo en TypeScript de los contratos de Rent.Api (los ficheros `*Endpoints.cs` bajo
 * `Features`). Los enums llegan como string porque la API usa JsonStringEnumConverter.
 */

export type PropertyType =
  | 'Apartment' | 'Condo' | 'House' | 'Townhouse'
  | 'Basement' | 'Studio' | 'Loft' | 'Duplex' | 'Other';

export type ListingTier = 'Limited' | 'Promoted' | 'Featured';

export type LeaseTerm = 'MonthToMonth' | 'SixMonths' | 'OneYear' | 'TwoYears' | 'Flexible';

export type SearchSort = 'Newest' | 'PriceAsc' | 'PriceDesc' | 'Popular';

export interface PropertyCard {
  id: string;
  title: string;
  slug: string;
  city: string;
  citySlug: string;
  province: string;
  neighbourhood: string | null;
  primaryImageUrl: string | null;
  fromPrice: number | null;
  toPrice: number | null;
  minBedrooms: number;
  maxBedrooms: number | null;
  minBathrooms: number;
  propertyType: PropertyType;
  tier: ListingTier;
  isVerified: boolean;
  petsAllowed: boolean;
  furnished: boolean;
  isFavorited: boolean;
  createdAt: string;
  specialTitle: string | null;
}

export interface City {
  slug: string;
  name: string;
  province: string;
  imageUrl: string | null;
  listingCount: number;
  isFeatured: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface HomeResponse {
  featuredCities: City[];
  latestListings: PropertyCard[];
}

export interface SearchResponse {
  city: City | null;
  properties: PropertyCard[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Unit {
  id: string;
  name: string | null;
  bedrooms: number;
  bathrooms: number;
  sqFt: number | null;
  price: number;
  priceMax: number | null;
  availableUnits: number;
  availableDate: string | null;
}

export interface ListingImage {
  id: string;
  url: string;
  altText: string | null;
  isPrimary: boolean;
  displayOrder: number;
  category: string | null;
}

export interface Amenity {
  id: string;
  name: string;
  category: string | null;
  icon: string | null;
}

export interface Landlord {
  id: string;
  companyName: string | null;
  logoUrl: string | null;
  website: string | null;
  description: string | null;
  isVerified: boolean;
  tier: ListingTier;
  totalListings: number;
}

export interface RentSpecial {
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface ListingDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  descriptionFr: string | null;
  propertyType: PropertyType;
  tier: ListingTier;
  streetAddress: string;
  city: string;
  citySlug: string;
  province: string;
  postalCode: string;
  neighbourhood: string | null;
  latitude: number | null;
  longitude: number | null;
  yearBuilt: number | null;
  totalFloors: number | null;
  totalUnits: number | null;
  parkingType: string | null;
  petsAllowed: boolean;
  furnished: boolean;
  leaseTerm: LeaseTerm | null;
  isVerified: boolean;
  viewCount: number;
  createdAt: string;
  isFavorited: boolean;
  units: Unit[];
  images: ListingImage[];
  amenities: Amenity[];
  landlord: Landlord | null;
  activeSpecial: RentSpecial | null;
  similarListings: PropertyCard[];
}

export interface MapMarker {
  id: string;
  title: string;
  slug: string;
  citySlug: string;
  lat: number;
  lng: number;
  propertyType: PropertyType;
  tier: ListingTier;
  primaryImageUrl: string | null;
  fromPrice: number | null;
  minBedrooms: number;
}

export interface MapMarkersResponse {
  cityLat: number | null;
  cityLng: number | null;
  markers: MapMarker[];
}
