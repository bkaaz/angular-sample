import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DebtsStore } from '../store/debts.store';
import { toDebtRow } from '../util/debt-row.util';

@Component({
  selector: 'app-debts-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <h1>Długi</h1>

    @if (isLoading()) {
      <p>Ładowanie...</p>
    } @else if (hasError()) {
      <p style="color: red">Błąd ładowania danych.</p>
    } @else {
      <button (click)="reload()">Odśwież</button>

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
          @for (row of rows(); track row.id) {
            <tr style="cursor: pointer" [routerLink]="['/debts', row.id]">
              <td>{{ row.ownerName }}</td>
              <td>{{ row.amount }}</td>
              <td>{{ row.currency }}</td>
              <td>{{ row.dueDate | date: 'dd.MM.yyyy' }}</td>
              <td>{{ row.status }}</td>
              <td>{{ row.description }}</td>
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
  private readonly debts = inject(DebtsStore);

  protected readonly rows = computed(() => {
    const clientsById = this.debts.clientsById();
    return this.debts.debts().map((debt) => toDebtRow(debt, clientsById));
  });

  // Both flags, or the table flashes rows whose ownerName is still the `—` placeholder.
  protected readonly isLoading = computed(
    () => this.debts.isLoading() || this.debts.clientsLoading()
  );

  protected readonly hasError = computed(
    () => this.debts.hasError() || this.debts.clientsError()
  );

  protected reload(): void {
    this.debts.reload();
  }
}
