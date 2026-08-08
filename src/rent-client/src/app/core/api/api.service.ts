import { HttpClient, HttpParams } from '@angular/common/http';
import { InjectionToken, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { Observable } from 'rxjs';
import {
  City, HomeResponse, ListingDetail, MapMarkersResponse, SearchResponse, SearchSort,
} from './api.types';

/**
 * Base de la API.
 *
 * En el navegador va vacia: las peticiones salen relativas al mismo origen y la cookie de
 * sesion viaja sola. En el servidor de SSR **no existe origen**, asi que una URL relativa
 * fallaria; hay que apuntar al host real de la API. En produccion lo inyecta la variable
 * API_BASE_URL del App Service de SSR.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => {
    if (isPlatformServer(inject(PLATFORM_ID))) {
      return process.env['API_BASE_URL'] ?? 'http://localhost:5282';
    }
    return '';
  },
});

export interface SearchFilters {
  minPrice?: number | null;
  maxPrice?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  types?: string[] | null;
  petsAllowed?: boolean;
  furnished?: boolean;
  hasParking?: boolean;
  sort?: SearchSort;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  getHome(): Observable<HomeResponse> {
    return this.http.get<HomeResponse>(`${this.base}/api/home`);
  }

  getCities(featuredOnly = false): Observable<City[]> {
    const params = featuredOnly ? new HttpParams().set('featured', 'true') : undefined;
    return this.http.get<City[]>(`${this.base}/api/cities`, { params });
  }

  search(citySlug: string, filters: SearchFilters = {}): Observable<SearchResponse> {
    return this.http.get<SearchResponse>(
      `${this.base}/api/search/${encodeURIComponent(citySlug)}`,
      { params: toParams(filters) });
  }

  getListing(citySlug: string, propertySlug: string): Observable<ListingDetail> {
    return this.http.get<ListingDetail>(
      `${this.base}/api/listings/${encodeURIComponent(citySlug)}/${encodeURIComponent(propertySlug)}`);
  }

  getMapMarkers(citySlug: string, filters: SearchFilters = {}): Observable<MapMarkersResponse> {
    return this.http.get<MapMarkersResponse>(
      `${this.base}/api/maps/${encodeURIComponent(citySlug)}`,
      { params: toParams(filters) });
  }
}

function toParams(filters: SearchFilters): HttpParams {
  let params = new HttpParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === false) continue;
    if (Array.isArray(value)) {
      // La API acepta repetido y CSV; se manda CSV por dejar la URL mas corta y cacheable.
      if (value.length) params = params.set(key, value.join(','));
      continue;
    }
    params = params.set(key, String(value));
  }

  return params;
}
