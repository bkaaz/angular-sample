import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, of, switchMap } from 'rxjs';
import { Debt, DebtDetail } from '../model/debt.model';

@Injectable({ providedIn: 'root' })
export class DebtsApi {
  private http = inject(HttpClient);

  /**
   * TODO(api): N+1. `GET /api/debts` does not return `ownerId`, so every detail has to be
   * fetched separately. Once the list endpoint returns `ownerId`, drop the switchMap and
   * forkJoin below and return `this.http.get<DebtDetail[]>('/api/debts')`.
   *
   * TODO(api): the same gap makes a deep-link to `/debts/:id` fetch every debt, even though
   * `GET /api/debts/:id` works standalone. Optimising it would need a second source of truth
   * in the detail view; not worth it while N is small.
   */
  getDebts(): Observable<DebtDetail[]> {
    return this.http.get<Debt[]>('/api/debts').pipe(
      switchMap((debts) =>
        // forkJoin never emits on an empty array
        debts.length
          ? forkJoin(debts.map((d) => this.http.get<DebtDetail>(`/api/debts/${d.id}`)))
          : of([])
      )
    );
  }
}
