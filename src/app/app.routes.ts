import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'debts',
    loadComponent: () =>
      import('./features/debts/view/debts-list.component').then(
        (m) => m.DebtsListComponent
      ),
  },
  {
    path: 'debts/:id',
    loadComponent: () =>
      import('./features/debts/view/debt-detail.component').then(
        (m) => m.DebtDetailComponent
      ),
  },
  {
    path: '',
    redirectTo: 'debts',
    pathMatch: 'full',
  },
];
