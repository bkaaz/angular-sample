# angular-signal-store

Example project demonstrating **NgRx Signal Store** with **rxResource** in Angular 21.

It is a reference implementation for a larger Nx codebase. The architecture — not the file
layout — is the point.

## Read first

- [docs/architecture.md](./docs/architecture.md) — one store per resource, why late joins,
  dependency rules, caching decisions, the fixed API contract.
- [docs/implementation-guide.md](./docs/implementation-guide.md) — hard rules, skeletons,
  anti-patterns, verification checklist.

## Stack

- Angular 21 (standalone components, no NgModule)
- `@ngrx/signals` — only state management package, no `@ngrx/store` / `@ngrx/effects`
- RxJS 7.8
- Vitest (tests)

## Project conventions

### File structure

One directory per **resource**, five layers inside. `clients` is a resource with no views of
its own; `debts` consumes it.

```
src/app/features/
  clients/
    api/    clients-api.service.ts, clients-mock.interceptor.ts
    model/  client.model.ts              # transport types only
    store/  clients.store.ts             # ClientsStore + injectClientsDemand
    util/   client-name.util.ts          # pure: clientFullName()
  debts/
    api/    debts-api.service.ts, debts-mock.interceptor.ts
    model/  debt.model.ts
    store/  debts.store.ts
    util/   debt-row.util.ts             # DebtRow view model + toDebtRow()
    view/   debts-list.component.ts, debt-detail.component.ts
```

Resource stores never import each other. `debts` may depend on `clients` (one-way, because
`toDebtRow` needs `clientFullName`). They meet only inside a pure function.

### Mock API

Instead of a real backend, use `HttpInterceptorFn` registered in `app.config.ts` via
`provideHttpClient(withInterceptors([...]))`. One interceptor per resource, like one store per
resource. The interceptor catches `/api/<resource>` and returns
`of(new HttpResponse({ body: MOCK_DATA }))` — so requests never reach the network and never
show up in the browser's network panel.

The API is fixed and cannot be changed. Its limitations are listed in
[docs/architecture.md](./docs/architecture.md#known-api-limitations) and each workaround carries
a `TODO(api):` comment.

### Signal Store pattern

```typescript
export const DebtsStore = signalStore(
  { providedIn: 'root' },
  withProps(() => {
    // inject() here — inside the factory, in the injection context
    const api = inject(DebtsApi);
    return {
      // _ prefix = private (OmitPrivate<T> strips these from the public API)
      _resource: rxResource<DebtDetail[], void>({
        // api referenced here — NOT inject() inside stream
        stream: () => api.getDebts(),  // "stream", not "loader"!
      }),
    };
  }),
  withComputed((store) => ({
    debts: computed(() => store._resource.value() ?? []),
    isLoading: computed(() => store._resource.isLoading()),
    hasError: computed(() => store._resource.status() === 'error'),
  })),
  withMethods((store) => ({
    reload: () => store._resource.reload(),
  }))
);
```

**Critical:** `rxResource` in Angular 19+ uses `stream:`, not `loader:`.

**Critical:** Never call `inject()` inside the `stream` function. `stream` runs outside the
injection context. Angular's rxResource **silently catches** the resulting error — no console
output, just `status: 'error'` on the resource. Always capture injected values in the
`withProps` factory (before the `return`) and reference them by closure inside `stream`.

```typescript
// WRONG — inject() inside stream, silently fails with status: 'error'
withProps(() => ({
  _resource: rxResource({ stream: () => inject(SomeService).get() }),
}))

// CORRECT — explicit return, inject() called in factory
withProps(() => {
  const svc = inject(SomeService);
  return {
    _resource: rxResource({ stream: () => svc.get() }),
  };
})
```

The compact `() => ({...})` form is dangerous here because it makes the `inject()` appear
to be "in the factory" while it's actually deferred inside the `stream` arrow. Always use
the explicit `() => { ... return {...} }` form when `withProps` holds an `rxResource`.

**Critical:** `params` is compared with `Object.is`. Returning a fresh array or object on every
recomputation causes an **infinite refetch loop**. Return a primitive — a sorted, joined string.
Returning `undefined` puts the resource in `idle` and issues no request.

### Caching

Deliberately different per resource, see [docs/architecture.md](./docs/architecture.md#data-lifetime-and-staleness):

- `DebtsStore` — `providedIn: 'root'` + parameterless `rxResource` = fetched once per app
  session. No `ensureLoaded`: the store existing means the request went out.
- `ClientsStore` — no cache. Holds only what currently-living views declare via
  `injectClientsDemand()`; the demand is withdrawn on component destroy.

Never add an accumulating cache (a `requestedIds` array that only grows). It is unbounded, it
goes stale silently, and fetching k ids one at a time transfers O(k²) bytes.

### Components

- Standalone, `inject()` instead of constructor injection
- Inline templates in the `.ts` file (no separate `.html`) — exception: `app.html` (root)
- Angular 17+ control flow: `@if`, `@for`, `@empty`
- No visual requirements — minimal HTML, no CSS frameworks
- Compose resources in a `computed`; combine loading flags across every store the view reads
- Template branch order: loading → error → data → not-found

### Routing

Lazy loading via `loadComponent`. Route params reach components as `input()` because
`provideRouter(routes, withComponentInputBinding())` is enabled.

```typescript
{
  path: 'debts',
  loadComponent: () =>
    import('./features/debts/view/debts-list.component').then(m => m.DebtsListComponent),
}
```

### State updates

State changes only via `patchState(store, { ... })` inside `withMethods`.
