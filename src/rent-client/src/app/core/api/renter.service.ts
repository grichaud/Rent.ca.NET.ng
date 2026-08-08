import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.service';

/** Espejo de los contratos de Features/RenterPortal/RenterPortalEndpoints.cs. */
export interface RenterDashboard {
  firstName: string | null;
  savedProperties: number;
  activeAlerts: number;
  inquiriesSent: number;
}

export interface RenterProfile {
  email: string;
  fullName: string;
  phone: string | null;
  /** false cuando la cuenta entro por Google: no hay contrasena local que cambiar. */
  hasPassword: boolean;
}

export interface UpdateProfilePayload {
  fullName: string;
  phone: string | null;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface RenterInquiry {
  id: string;
  propertyTitle: string;
  propertySlug: string;
  propertyCity: string;
  /** Vacio si la ciudad del listing ya no existe en el catalogo; sin enlace en ese caso. */
  citySlug: string;
  message: string;
  /** Formato ISO (yyyy-MM-dd) o null; en la API es un DateOnly. */
  moveInDate: string | null;
  isRead: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class RenterService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  dashboard(): Observable<RenterDashboard> {
    return this.http.get<RenterDashboard>(`${this.base}/api/renter/dashboard`);
  }

  profile(): Observable<RenterProfile> {
    return this.http.get<RenterProfile>(`${this.base}/api/renter/profile`);
  }

  updateProfile(payload: UpdateProfilePayload): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.base}/api/renter/profile`, payload);
  }

  changePassword(payload: ChangePasswordPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/api/renter/password`, payload);
  }

  inquiries(): Observable<RenterInquiry[]> {
    return this.http.get<RenterInquiry[]>(`${this.base}/api/renter/inquiries`);
  }
}
