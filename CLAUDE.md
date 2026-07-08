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
    const http = inject(HttpClient);
    return {
      // _ prefix = private (OmitPrivate<T> strips these from the public API)
      _resource: rxResource<T, void>({
        stream: () => http.get<T>('/api/...'),  // "stream", not "loader"!
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

**Important:** `rxResource` in Angular 19+ uses `stream:`, not `loader:`.

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
