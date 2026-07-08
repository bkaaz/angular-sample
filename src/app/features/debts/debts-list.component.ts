import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DebtsStore } from './debts.store';

@Component({
  selector: 'app-debts-list',
  standalone: true,
  imports: [DatePipe],
  template: `
    <h1>Długi</h1>

    @if (store.isLoading()) {
      <p>Ładowanie...</p>
    }

    @if (store.hasError()) {
      <p style="color: red">Błąd ładowania danych.</p>
    }

    @if (!store.isLoading() && !store.hasError()) {
      <button (click)="store.reload()">Odśwież</button>

      <table border="1" cellpadding="6" cellspacing="0" style="margin-top: 1rem; border-collapse: collapse;">
        <thead>
          <tr>
            <th>Właściciel</th>
            <th>Kwota</th>
            <th>Waluta</th>
            <th>Termin</th>
            <th>Status</th>
            <th>Opis</th>
          </tr>
        </thead>
        <tbody>
          @for (debt of store.debtsWithOwners(); track debt.id) {
            <tr>
              <td>{{ debt.ownerName }}</td>
              <td>{{ debt.amount }}</td>
              <td>{{ debt.currency }}</td>
              <td>{{ debt.dueDate | date: 'dd.MM.yyyy' }}</td>
              <td>{{ debt.status }}</td>
              <td>{{ debt.description }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6">Brak długów</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class DebtsListComponent {
  protected readonly store = inject(DebtsStore);
}
