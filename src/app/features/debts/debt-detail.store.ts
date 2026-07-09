import { computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { signalStore, withComputed, withProps } from '@ngrx/signals';
import { DebtWithOwner } from './debt.model';
import { DebtsApi } from './debts-api.service';

export const DebtDetailStore = signalStore(
  withProps(() => {
    const api = inject(DebtsApi);
    const route = inject(ActivatedRoute);
    const debtId = toSignal(
      route.paramMap.pipe(map((p) => p.get('id') ?? undefined)),
      { initialValue: undefined as string | undefined }
    );
    return {
      _resource: rxResource<DebtWithOwner, string | undefined>({
        params: () => debtId(),
        stream: ({ params: id }) => api.getDebtWithOwner(id),
      }),
    };
  }),
  withComputed((store) => ({
    debt: computed(() => store._resource.value() ?? null),
    isLoading: computed(() => store._resource.isLoading()),
    hasError: computed(() => store._resource.status() === 'error'),
  }))
);
