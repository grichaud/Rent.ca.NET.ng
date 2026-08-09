import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.service';
import { ListingTier } from './api.types';
import { ListingStatus } from './landlord.service';

/**
 * Espejo de los contratos de Features/Admin. Los mensajes de esta area llegan en texto
 * plano, no como claves de traduccion: el panel es interno y el origen tampoco los traduce.
 */
export interface AdminDashboard {
  totalProperties: number;
  featuredProperties: number;
  promotedProperties: number;
  totalLandlords: number;
  activeSpecials: number;
  conversations: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  roles: string[];
  isAdmin: boolean;
}

export interface AdminLandlordRow {
  id: string;
  email: string;
  companyName: string | null;
  tier: ListingTier;
  /** Tier ya resuelto por el servidor: Limited si la vigencia expiro. */
  effectiveTier: ListingTier;
  tierExpiresAt: string | null;
  isVerified: boolean;
  listingsCount: number;
}

export interface AdminPropertyRow {
  id: string;
  title: string;
  cityName: string;
  landlordEmail: string;
  status: ListingStatus;
  tier: ListingTier;
  effectiveTier: ListingTier;
  tierExpiresAt: string | null;
  createdAt: string;
}

export interface AdminPage<T> {
  rows: T[];
  totalRows: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
}

export interface SetTierPayload {
  tier: ListingTier;
  expiresAt: string | null;
}

export interface AdminSpecialRow {
  id: string;
  propertyId: string;
  propertyTitle: string;
  propertyCity: string;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AdminPropertyOption {
  id: string;
  title: string;
  city: string;
}

export interface AdminSpecials {
  rows: AdminSpecialRow[];
  totalRows: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
  propertyOptions: AdminPropertyOption[];
}

export interface CreateSpecialPayload {
  propertyId: string;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

/** La propiedad de un special no es editable. */
export type UpdateSpecialPayload = Omit<CreateSpecialPayload, 'propertyId'>;

export interface AdminSearchRow {
  id: string;
  normalizedQuery: string;
  citySlug: string;
  searchCount: number;
  lastSearchedAt: string;
}

export interface AdminAi {
  totalConversations: number;
  totalMessages: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  toolBreakdown: { name: string; count: number }[];
  /** Siempre 7 cubos, del mas antiguo a hoy. */
  last7Days: { date: string; count: number }[];
  recent: {
    id: string;
    updatedAt: string;
    title: string | null;
    userEmail: string | null;
    sessionId: string | null;
    messageCount: number;
    lastMessage: string | null;
  }[];
}

export type AiMessageRole = 'User' | 'Assistant' | 'System' | 'Tool';

export interface AdminAiConversation {
  id: string;
  title: string | null;
  userEmail: string | null;
  sessionId: string | null;
  createdAt: string;
  messages: {
    id: string;
    role: AiMessageRole;
    content: string;
    toolName: string | null;
    toolArgsJson: string | null;
    toolResultJson: string | null;
    createdAt: string;
  }[];
}

export interface AdminPropertyFilters {
  city?: string | null;
  tier?: ListingTier | null;
  status?: ListingStatus | null;
  landlord?: string | null;
  page?: number | null;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  dashboard(): Observable<AdminDashboard> {
    return this.http.get<AdminDashboard>(`${this.base}/api/admin/dashboard`);
  }

  users(email?: string | null): Observable<AdminUserRow[]> {
    return this.http.get<AdminUserRow[]>(`${this.base}/api/admin/users`, {
      params: this.params({ email }),
    });
  }

  toggleAdmin(userId: string): Observable<{ isAdmin: boolean; message: string }> {
    return this.http.post<{ isAdmin: boolean; message: string }>(
      `${this.base}/api/admin/users/${userId}/toggle-admin`, {});
  }

  landlords(filters: { email?: string | null; tier?: ListingTier | null; page?: number | null }):
    Observable<AdminPage<AdminLandlordRow>> {
    return this.http.get<AdminPage<AdminLandlordRow>>(`${this.base}/api/admin/landlords`, {
      params: this.params(filters),
    });
  }

  setLandlordTier(id: string, payload: SetTierPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.base}/api/admin/landlords/${id}/tier`, payload);
  }

  properties(filters: AdminPropertyFilters): Observable<AdminPage<AdminPropertyRow>> {
    return this.http.get<AdminPage<AdminPropertyRow>>(`${this.base}/api/admin/properties`, {
      params: this.params(filters),
    });
  }

  setPropertyTier(id: string, payload: SetTierPayload): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.base}/api/admin/properties/${id}/tier`, payload);
  }

  specials(page?: number | null): Observable<AdminSpecials> {
    return this.http.get<AdminSpecials>(`${this.base}/api/admin/specials`, {
      params: this.params({ page }),
    });
  }

  createSpecial(payload: CreateSpecialPayload): Observable<{ id: string; message: string }> {
    return this.http.post<{ id: string; message: string }>(
      `${this.base}/api/admin/specials`, payload);
  }

  updateSpecial(id: string, payload: UpdateSpecialPayload): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.base}/api/admin/specials/${id}`, payload);
  }

  /** Por defecto desactiva; `hard` borra la fila de verdad. */
  deleteSpecial(id: string, hard = false): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/api/admin/specials/${id}`, {
      params: hard ? new HttpParams().set('hard', 'true') : undefined,
    });
  }

  searches(q?: string | null): Observable<AdminSearchRow[]> {
    return this.http.get<AdminSearchRow[]>(`${this.base}/api/admin/searches`, {
      params: this.params({ q }),
    });
  }

  updateSearch(
    id: string,
    payload: { normalizedQuery: string; citySlug: string | null },
  ): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.base}/api/admin/searches/${id}`, payload);
  }

  deleteSearch(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/api/admin/searches/${id}`);
  }

  ai(userEmail?: string | null): Observable<AdminAi> {
    return this.http.get<AdminAi>(`${this.base}/api/admin/ai`, {
      params: this.params({ userEmail }),
    });
  }

  conversation(id: string): Observable<AdminAiConversation> {
    return this.http.get<AdminAiConversation>(`${this.base}/api/admin/ai/${id}`);
  }

  /**
   * Omite los vacios: un `?email=` suelto ensucia la URL y no filtra nada.
   *
   * Recibe `object` y no `Record<string, unknown>`: las interfaces de filtros declaradas
   * arriba no tienen firma de indice y TypeScript rechaza asignarlas al Record.
   */
  private params(values: object): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined || value === '') continue;
      params = params.set(key, String(value));
    }
    return params;
  }
}
