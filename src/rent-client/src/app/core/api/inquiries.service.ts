import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.service';

export interface InquiryPayload {
  propertyId: string;
  senderName: string;
  senderEmail: string;
  senderPhone: string | null;
  message: string;
  /** Formato ISO (yyyy-MM-dd) o null; el contrato de la API espera un DateOnly. */
  moveInDate: string | null;
  culture: string;
}

@Injectable({ providedIn: 'root' })
export class InquiriesService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** Se permite sin sesion, igual que en el origen: exigir cuenta perderia contactos. */
  submit(payload: InquiryPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/api/inquiries`, payload);
  }
}
