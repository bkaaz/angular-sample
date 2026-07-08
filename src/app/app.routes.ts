import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'debts',
    loadComponent: () =>
      import('./features/debts/debts-list.component').then(
        (m) => m.DebtsListComponent
      ),
  },
  {
    path: '',
    redirectTo: 'debts',
    pathMatch: 'full',
  },
];
