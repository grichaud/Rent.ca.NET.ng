import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from './api.service';
import { PropertyCard } from './api.types';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** Devuelve el estado resultante: true si quedo guardado, false si se quito. */
  toggle(propertyId: string): Observable<boolean> {
    return this.http
      .post<{ favorited: boolean }>(`${this.base}/api/favorites/${propertyId}/toggle`, {})
      .pipe(map((r) => r.favorited));
  }

  list(): Observable<PropertyCard[]> {
    return this.http.get<PropertyCard[]>(`${this.base}/api/favorites`);
  }

  remove(propertyId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/favorites/${propertyId}`);
  }
}
