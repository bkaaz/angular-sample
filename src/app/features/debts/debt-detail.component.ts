import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DebtDetailStore } from './debt-detail.store';

@Component({
  selector: 'app-debt-detail',
  standalone: true,
  imports: [DatePipe, RouterLink],
  providers: [DebtDetailStore],
  template: `
    <a routerLink="/debts">&larr; Powrót do listy</a>

    <h1>Szczegóły długu</h1>

    @if (store.isLoading()) {
      <p>Ładowanie...</p>
    }

    @if (store.hasError()) {
      <p style="color: red">Błąd ładowania danych.</p>
    }

    @if (store.debt(); as debt) {
      <table border="1" cellpadding="6" cellspacing="0" style="margin-top: 1rem; border-collapse: collapse;">
        <tbody>
          <tr><th>Właściciel</th><td>{{ debt.ownerName }}</td></tr>
          <tr><th>Kwota</th><td>{{ debt.amount }} {{ debt.currency }}</td></tr>
          <tr><th>Termin</th><td>{{ debt.dueDate | date: 'dd.MM.yyyy' }}</td></tr>
          <tr><th>Status</th><td>{{ debt.status }}</td></tr>
          <tr><th>Opis</th><td>{{ debt.description }}</td></tr>
        </tbody>
      </table>
    }
  `,
})
export class DebtDetailComponent {
  protected readonly store = inject(DebtDetailStore);
}
