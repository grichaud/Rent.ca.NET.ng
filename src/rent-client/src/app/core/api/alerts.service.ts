import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.service';
import { PropertyType } from './api.types';

export type AlertFrequency = 'Instant' | 'Daily' | 'Weekly';

/** Espejo de AlertDto en Features/Alerts/AlertEndpoints.cs. */
export interface Alert {
  id: string;
  name: string | null;
  city: string | null;
  propertyType: PropertyType | null;
  priceMin: number | null;
  priceMax: number | null;
  bedroomsMin: number | null;
  bathroomsMin: number | null;
  petsAllowed: boolean | null;
  frequency: AlertFrequency;
  isActive: boolean;
  lastSentAt: string | null;
  createdAt: string;
}

export interface CreateAlertPayload {
  name: string | null;
  city: string;
  propertyType: PropertyType | null;
  priceMin: number | null;
  priceMax: number | null;
  bedroomsMin: number | null;
  bathroomsMin: number | null;
  petsAllowed: boolean | null;
  frequency: AlertFrequency;
  culture: string;
}

@Injectable({ providedIn: 'root' })
export class AlertsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(): Observable<Alert[]> {
    return this.http.get<Alert[]>(`${this.base}/api/alerts`);
  }

  create(payload: CreateAlertPayload): Observable<Alert> {
    return this.http.post<Alert>(`${this.base}/api/alerts`, payload);
  }

  /** Pausar y reanudar son la misma llamada; devuelve la alerta con su estado nuevo. */
  toggle(id: string): Observable<Alert> {
    return this.http.post<Alert>(`${this.base}/api/alerts/${id}/toggle`, {});
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/alerts/${id}`);
  }
}
