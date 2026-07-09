# angular-signal-store

Example project demonstrating **NgRx Signal Store** with **rxResource** in Angular 21.

## Stack

- Angular 21 (standalone components, no NgModule)
- `@ngrx/signals` — only state management package, no `@ngrx/store` / `@ngrx/effects`
- RxJS 7.8
- Vitest (tests)

## Project conventions

### File structure

Features live in `src/app/features/<name>/`:

```
src/app/features/debts/
  debt.model.ts              # model interface
  debts-mock.interceptor.ts  # mock HTTP
  debts.store.ts             # SignalStore
  debts-list.component.ts    # list component
```

### Mock API

Instead of a real backend, use `HttpInterceptorFn` registered in `app.config.ts` via `provideHttpClient(withInterceptors([...]))`. The interceptor catches specific URLs (`/api/<resource>`) and returns `of(new HttpResponse({ body: MOCK_DATA }))`.

### Signal Store pattern

```typescript
export const DebtsStore = signalStore(
  { providedIn: 'root' },
  withState({ ... }),
  withProps(() => {
    // inject() here — inside the factory, in the injection context
    const api = inject(DebtsApi);
    return {
      // _ prefix = private (OmitPrivate<T> strips these from the public API)
      _resource: rxResource<T, void>({
        // api referenced here — NOT inject() inside stream
        stream: () => api.getData(),  // "stream", not "loader"!
      }),
    };
  }),
  withComputed((store) => ({
    items: computed(() => store._resource.value() ?? []),
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

### Components

- Standalone, `inject()` instead of constructor injection
- Inline templates in the `.ts` file (no separate `.html`) — exception: `app.html` (root)
- Angular 17+ control flow: `@if`, `@for`, `@empty`
- No visual requirements — minimal HTML, no CSS frameworks

### Routing

Lazy loading via `loadComponent`:

```typescript
{
  path: 'debts',
  loadComponent: () =>
    import('./features/debts/debts-list.component').then(m => m.DebtsListComponent),
}
```

### State updates

State changes only via `patchState(store, { ... })` inside `withMethods`.
