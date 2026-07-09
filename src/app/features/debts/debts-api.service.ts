import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, switchMap } from 'rxjs';
import { Client, Debt, DebtDetail, DebtWithOwner } from './debt.model';
import { toDebtWithOwner } from './debt.utils';

@Injectable({ providedIn: 'root' })
export class DebtsApi {
  private http = inject(HttpClient);

  private clientsByIds(ids: string[]) {
    return this.http.get<Client[]>('/api/clients', { params: { ids: ids.join(',') } });
  }

  private clientsMap(ids: string[]) {
    return this.clientsByIds(ids).pipe(
      map((clients) => new Map(clients.map((c) => [c.id, c])))
    );
  }

  getDebtsWithOwners() {
    return this.http.get<Debt[]>('/api/debts').pipe(
      switchMap((debts) =>
        forkJoin(debts.map((d) => this.http.get<DebtDetail>(`/api/debts/${d.id}`))).pipe(
          switchMap((details) => {
            const ownerIds = [...new Set(details.map((d) => d.ownerId))];
            return this.clientsMap(ownerIds).pipe(
              map((cm) => details.map((detail) => toDebtWithOwner(detail, cm)))
            );
          })
        )
      )
    );
  }

  getDebtWithOwner(id: string) {
    return this.http.get<DebtDetail>(`/api/debts/${id}`).pipe(
      switchMap((detail) =>
        this.clientsMap([detail.ownerId]).pipe(
          map((cm) => toDebtWithOwner(detail, cm))
        )
      )
    );
  }
}
