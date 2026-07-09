import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Client } from '../model/client.model';

@Injectable({ providedIn: 'root' })
export class ClientsApi {
  private http = inject(HttpClient);

  /** The endpoint only accepts `ids` — there is no "fetch all" variant. */
  getByIds(ids: string[]): Observable<Client[]> {
    return this.http.get<Client[]>('/api/clients', {
      params: { ids: ids.join(',') },
    });
  }
}
