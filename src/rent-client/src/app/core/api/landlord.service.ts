import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.service';
import { Amenity, LeaseTerm, ListingImage, PropertyType } from './api.types';
import { ChangePasswordPayload } from './renter.service';

/** Espejo de los contratos de Features/LandlordPortal (LandlordPortalContracts.cs). */
export type ListingStatus = 'Draft' | 'Active' | 'Inactive' | 'Archived';

export interface RecentInquiry {
  id: string;
  senderName: string;
  propertyTitle: string;
  isRead: boolean;
  createdAt: string;
}

export interface LandlordDashboard {
  firstName: string | null;
  totalListings: number;
  totalViews: number;
  totalInquiries: number;
  unreadInquiries: number;
  recent: RecentInquiry[];
}

export interface LandlordListingRow {
  id: string;
  title: string;
  slug: string;
  cityName: string;
  /** Vacio si la ciudad no esta en el catalogo; sin enlace publico en ese caso. */
  citySlug: string;
  province: string;
  status: ListingStatus;
  bedrooms: number | null;
  price: number | null;
  unitCount: number;
  viewCount: number;
  leadCount: number;
  primaryImageUrl: string | null;
}

export interface LandlordInquiry {
  id: string;
  propertyTitle: string;
  propertySlug: string;
  citySlug: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string | null;
  message: string;
  moveInDate: string | null;
  isRead: boolean;
  createdAt: string;
}

/** Los contadores van sobre el total sin filtrar: no cambian al activar el filtro. */
export interface LandlordInbox {
  totalCount: number;
  unreadCount: number;
  inquiries: LandlordInquiry[];
}

export interface LandlordProfile {
  email: string;
  fullName: string;
  phone: string | null;
  companyName: string | null;
  website: string | null;
  description: string | null;
  isVerified: boolean;
  hasPassword: boolean;
}

export interface UpdateLandlordProfilePayload {
  fullName: string;
  phone: string | null;
  companyName: string | null;
  website: string | null;
  description: string | null;
}

/** `id` null para unidades nuevas; en Edit identifica la fila existente. */
export interface ListingUnitPayload {
  id: string | null;
  bedrooms: number;
  bathrooms: number;
  sqFt: number | null;
  price: number;
  availableDate: string | null;
  availableUnits: number;
}

export interface ListingFormPayload {
  title: string;
  description: string | null;
  propertyType: PropertyType;
  status: ListingStatus;
  streetAddress: string;
  cityName: string;
  province: string;
  postalCode: string;
  neighbourhood: string | null;
  petsAllowed: boolean;
  furnished: boolean;
  leaseTerm: LeaseTerm | null;
  parkingType: string | null;
  yearBuilt: number | null;
  totalFloors: number | null;
  amenityIds: string[];
  units: ListingUnitPayload[];
}

export interface LandlordListingDetail extends ListingFormPayload {
  id: string;
  units: (ListingUnitPayload & { id: string })[];
  images: ListingImage[];
}

/** `warning` es una clave landlord.* (imagen rechazada, tope de 10) o null. */
export interface ListingPhotosResponse {
  images: ListingImage[];
  warning: string | null;
}

@Injectable({ providedIn: 'root' })
export class LandlordService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  dashboard(): Observable<LandlordDashboard> {
    return this.http.get<LandlordDashboard>(`${this.base}/api/landlord/dashboard`);
  }

  inbox(filter?: 'unread'): Observable<LandlordInbox> {
    const query = filter === 'unread' ? '?filter=unread' : '';
    return this.http.get<LandlordInbox>(`${this.base}/api/landlord/inbox${query}`);
  }

  /** Toggle bidireccional; devuelve el estado nuevo y la clave del flash. */
  toggleInquiry(inquiryId: string): Observable<{ isRead: boolean; message: string }> {
    return this.http.post<{ isRead: boolean; message: string }>(
      `${this.base}/api/landlord/inbox/${inquiryId}/toggle`, {});
  }

  profile(): Observable<LandlordProfile> {
    return this.http.get<LandlordProfile>(`${this.base}/api/landlord/profile`);
  }

  updateProfile(payload: UpdateLandlordProfilePayload): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.base}/api/landlord/profile`, payload);
  }

  changePassword(payload: ChangePasswordPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/api/landlord/password`, payload);
  }

  amenities(): Observable<Amenity[]> {
    return this.http.get<Amenity[]>(`${this.base}/api/landlord/amenities`);
  }

  listings(): Observable<LandlordListingRow[]> {
    return this.http.get<LandlordListingRow[]>(`${this.base}/api/landlord/listings`);
  }

  listing(id: string): Observable<LandlordListingDetail> {
    return this.http.get<LandlordListingDetail>(`${this.base}/api/landlord/listings/${id}`);
  }

  create(payload: ListingFormPayload): Observable<{ id: string; message: string }> {
    return this.http.post<{ id: string; message: string }>(
      `${this.base}/api/landlord/listings`, payload);
  }

  update(id: string, payload: ListingFormPayload): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.base}/api/landlord/listings/${id}`, payload);
  }

  deactivate(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.base}/api/landlord/listings/${id}/deactivate`, {});
  }

  /**
   * Multipart de verdad: FormData y SIN poner Content-Type a mano — el navegador escribe el
   * boundary; fijarlo manualmente rompe el parseo del multipart en el servidor.
   */
  uploadPhotos(id: string, files: File[]): Observable<ListingPhotosResponse> {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return this.http.post<ListingPhotosResponse>(
      `${this.base}/api/landlord/listings/${id}/photos`, form);
  }

  setCover(id: string, imageId: string): Observable<ListingPhotosResponse> {
    return this.http.post<ListingPhotosResponse>(
      `${this.base}/api/landlord/listings/${id}/photos/${imageId}/cover`, {});
  }

  deletePhoto(id: string, imageId: string): Observable<ListingPhotosResponse> {
    return this.http.delete<ListingPhotosResponse>(
      `${this.base}/api/landlord/listings/${id}/photos/${imageId}`);
  }
}
