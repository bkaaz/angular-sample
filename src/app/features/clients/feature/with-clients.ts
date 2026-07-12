import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { signalStoreFeature, withComputed, withProps } from '@ngrx/signals';
import { ClientsApi } from '../api/clients-api.service';
import { Client } from '../model/client.model';

/**
 * Adds `clientsById` / `clientsLoading` / `clientsError` to a store, for the ids it asks for.
 * Mix in with `withFeature`, which supplies the host store to the factory:
 *
 *     withFeature((store) => withClients(() => store.ownerIds()))
 *
 * The clients are fetched into the host store's injector, so they live exactly as long as the
 * host. Mix this into a route- or component-scoped store, never a root one.
 */
export function withClients(ids: () => readonly string[]) {
  return signalStoreFeature(
    withProps(() => {
      const api = inject(ClientsApi);

      // Must be a primitive: rxResource compares params with Object.is, so a fresh array
      // would refetch forever.
      const key = computed(() => {
        const unique = [...new Set(ids())].sort();
        return unique.length ? unique.join(',') : undefined;
      });

      return {
        _clientsResource: rxResource<Client[], string | undefined>({
          params: () => key(), // undefined => idle, no request
          stream: ({ params }) => api.getByIds(params.split(',')),
        }),
      };
    }),
    withComputed((store) => ({
      clientsById: computed(
        () => new Map((store._clientsResource.value() ?? []).map((c) => [c.id, c]))
      ),
      clientsLoading: computed(() => store._clientsResource.isLoading()),
      clientsError: computed(() => store._clientsResource.status() === 'error'),
    }))
  );
}
