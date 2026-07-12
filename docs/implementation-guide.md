# Implementation guide

Read [architecture.md](./architecture.md) first — it explains *why*. This document is *how*.

The skeletons below are minimal on purpose. Adapt names and paths to the target repo. Do not copy
the reference files verbatim; copy the shape.

---

## Order of work

Build in this order. Each step compiles and is reviewable on its own.

1. **Models** — one file per resource, transport types only.
2. **API services** — one per resource, one method per endpoint, no joins.
3. **The owning store** — the resource the feature is *about* (debts).
4. **Store features** — one per related resource (clients), parameterised by ids.
5. **Projection** — the pure function that combines two resources for display.
6. **Views** — inject the store, compose presentation with `computed`.
7. **Wiring** — route providers, interceptors, `withComponentInputBinding()`.

---

## Hard rules

Violating any of these produces bugs that are silent, not loud. That is why they are listed before
the code.

### `rxResource`

- The option is **`stream:`**, not `loader:`. `loader:` was removed in Angular 19.
- **NEVER call `inject()` inside `stream`.** `stream` runs outside the injection context.
  Angular's `rxResource` **silently swallows** the resulting error: no console output, the
  resource just sits in `status: 'error'`. Capture injected values in the enclosing factory and
  close over them.
- Because of the above, always use the **explicit factory form** when `withProps` holds an
  `rxResource`:

  ```typescript
  // WRONG — inject() is deferred into stream, fails silently
  withProps(() => ({
    _resource: rxResource({ stream: () => inject(SomeService).get() }),
  }))

  // CORRECT — explicit return, inject() runs in the factory
  withProps(() => {
    const svc = inject(SomeService);
    return { _resource: rxResource({ stream: () => svc.get() }) };
  })
  ```

  The compact `() => ({...})` form makes the `inject()` *look* like it is in the factory when it
  is actually inside the `stream` arrow.

- **`params` must return a primitive.** `rxResource` compares params with `Object.is`. A fresh
  array or object on every recomputation is never equal to the previous one, so the resource
  refetches forever. Use a sorted, joined string — it is also literally what goes into the query
  string.

  ```typescript
  // WRONG — new array identity each time => infinite refetch loop
  params: () => [...ids()]

  // CORRECT — primitive, stable under Object.is
  params: () => (ids().length ? [...ids()].sort().join(',') : undefined)
  ```

- **`params` returning `undefined` puts the resource in `idle`** — no request is issued. Declare
  the type as `rxResource<T, P | undefined>` and `stream` will receive `P` narrowed. Use this for
  "nothing to fetch yet". Only `undefined` triggers idle; `null` does **not**.

### Store features

- **Parameterise features; do not constrain their input.** Pass ids as a function argument and mix
  in with `withFeature`. Do **not** use `signalStoreFeature({ props: type<{…}>() }, …)`: besides
  coupling the host to a property name, it breaks `signalStore` overload resolution once the host
  has more than one preceding feature. TypeScript then falls back to default generics and the
  entire store degrades to an index signature — every `store.debts()` becomes a compile error far
  from the real cause. Verified against `@ngrx/signals@21.1.1`.
- A feature's `rxResource` lives in the **host store's injector**. Mix resource features only into
  route- or component-scoped stores, never a root one.

### Store hygiene

- Prefix private members with `_`. `OmitPrivate<T>` strips them from the public store type.
- State changes only via `patchState(store, { ... })`, only inside `withMethods`.
- Stores expose **signals**, never observables.
- Derived signals that build on other derived signals need a **separate `withComputed` block**.

### Never

- **Never join in an API service.** One method, one endpoint.
- **Never create a facade service** that combines two resources.
- **Never let a resource feature import another resource's store.** It receives ids as an argument.
- **Never put a view model in the `model` layer.** It belongs with the projection that builds it.
- **Never use `providedIn: 'root'` for a resource store.** Scope it to a route.
- **Never add a cache** — no growing `requestedIds`, no `shareReplay` on a resource fetch.

---

## Skeleton: the owning store

```typescript
// No providedIn — the route provides it.
export const DebtsStore = signalStore(
  withProps(() => {
    const api = inject(DebtsApi);              // inject() ONLY here
    return {
      _resource: rxResource<DebtDetail[], void>({
        stream: () => api.getDebts(),          // closure, no inject()
      }),
    };
  }),
  withComputed((store) => ({
    debts: computed(() => store._resource.value() ?? []),
    isLoading: computed(() => store._resource.isLoading()),
    hasError: computed(() => store._resource.status() === 'error'),
  })),
  withComputed((store) => ({
    debtsById: computed(() => new Map(store.debts().map((d) => [d.id, d]))),
    ownerIds: computed(() => [...new Set(store.debts().map((d) => d.ownerId))]),
  })),
  // withFeature hands the store to the factory, so withClients needs no input constraint.
  withFeature((store) => withClients(() => store.ownerIds())),
  withMethods((store) => ({
    reload: () => store._resource.reload(),
  })),
);
```

Provide it on the parent route so one instance is shared by the sibling views and destroyed when
the user leaves:

```typescript
{
  path: 'debts',
  providers: [DebtsStore],
  children: [
    { path: '',    loadComponent: () => import('…/debts-list.component')  .then(m => m.DebtsListComponent) },
    { path: ':id', loadComponent: () => import('…/debt-detail.component').then(m => m.DebtDetailComponent) },
  ],
}
```

A parameterless `rxResource` fires once, when the store is first injected. **Do not add an
`ensureLoaded`** — the store existing already means the request went out. Deep-link and in-app
navigation follow the same path.

---

## Skeleton: a related-resource store feature

Exported by the related resource's own library. It knows nothing about the host.

```typescript
export function withClients(ids: () => readonly string[]) {
  return signalStoreFeature(
    withProps(() => {
      const api = inject(ClientsApi);

      const key = computed(() => {
        const unique = [...new Set(ids())].sort();
        return unique.length ? unique.join(',') : undefined;   // see the params rule
      });

      return {
        _clientsResource: rxResource<Client[], string | undefined>({
          params: () => key(),                                  // undefined => idle
          stream: ({ params }) => api.getByIds(params.split(',')),
        }),
      };
    }),
    withComputed((store) => ({
      clientsById: computed(
        () => new Map((store._clientsResource.value() ?? []).map((c) => [c.id, c])),
      ),
      clientsLoading: computed(() => store._clientsResource.isLoading()),
      clientsError: computed(() => store._clientsResource.status() === 'error'),
    })),
  );
}
```

Name the outputs after the resource (`clientsById`, `clientsLoading`, `clientsError`). Two
features mixed into one store must not collide on a key.

The dependency direction is what matters: **the host** knows it needs both resources and supplies
the ids. If the feature reached for `DebtsStore` itself, the two resources would be coupled
permanently.

---

## Skeleton: the view

```typescript
export class DebtsListComponent {
  private readonly debts = inject(DebtsStore);

  protected readonly rows = computed(() => {
    const clientsById = this.debts.clientsById();
    return this.debts.debts().map((debt) => toDebtRow(debt, clientsById));
  });

  protected readonly isLoading = computed(
    () => this.debts.isLoading() || this.debts.clientsLoading(),
  );
  protected readonly hasError = computed(
    () => this.debts.hasError() || this.debts.clientsError(),
  );
}
```

### Loading and error state

Independent fetching costs you the atomic emission that a single RxJS pipeline gives for free. Two
consequences you **must** handle:

1. **Combine the loading flags.** Without `isLoading = a.isLoading() || b.clientsLoading()`, the
   table flashes rows whose `ownerName` is still the `—` placeholder.
2. **Order the template branches: loading → error → data → not-found.** A lookup like
   `debtsById().get(id)` returns `undefined` while loading *and* when the id does not exist.
   Without the loading gate first, a deep-link briefly renders "not found".

```
@if (isLoading())       { …spinner… }
@else if (hasError())   { …error… }
@else if (debt(); as d) { …data… }
@else                   { …not found… }
```

---

## Verification checklist

Build passing proves nothing here — `rxResource` swallows errors from `stream`. Exercise the app
and check each item.

- [ ] No `inject()` appears inside any `stream` function.
- [ ] Every `withProps` holding an `rxResource` uses the explicit `() => { … return {…} }` form.
- [ ] Every `params` returns a primitive or `undefined`, never a fresh array/object.
- [ ] No `signalStoreFeature` uses a `type<{…}>()` input constraint.
- [ ] No resource store uses `providedIn: 'root'`.
- [ ] No resource feature imports another resource's store or API service.
- [ ] No API service calls more than one endpoint.
- [ ] The API service of each resource is **not** in the library's public API.
- [ ] View models are not in the `model` layer.
- [ ] Rendering the list issues **exactly one** `/api/clients` request, with sorted ids. More than
      one means the params key is unstable — a refetch loop.
- [ ] Navigating list → detail issues **zero** requests of any kind.
- [ ] Deep-link to a detail page renders it correctly from a cold start.
- [ ] Deep-link to a non-existent id shows "not found", never a stuck spinner.
- [ ] Browser console is free of errors and warnings.
- [ ] Every API workaround carries a `TODO(api):` comment saying what to delete when the backend
      changes.

To count requests when a mock interceptor short-circuits them (`of(new HttpResponse(...))` never
reaches the network), temporarily `console.log` inside the interceptor. Remove it after.
