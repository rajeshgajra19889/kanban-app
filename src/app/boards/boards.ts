import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BoardSummary } from '../models';
import { KanbanService } from '../kanban.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-boards',
  styleUrl: './boards.scss',
  templateUrl: './boards.html',
})
export class Boards {
  boards = signal<BoardSummary[]>([]);
  loading = signal(true);
  newTitle = new FormControl('');
  template = signal('');
  error = signal('');
  toast = signal('');
  renamingId = signal<number | null>(null);
  editTitle = new FormControl('');
  private openTimer: ReturnType<typeof setTimeout> | undefined;

  svc = inject(KanbanService);
  private router = inject(Router);

  private reload() {
    this.svc.loadBoards().subscribe({
      next: (r) => { this.boards.set(r.boards); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  constructor() {
    this.reload();
    this.svc.onBoardChanged = (id) => {
      this.reload();
    };
    this.svc.onInvite = () => {
      this.reload();
      this.toast.set('You were invited to a board!');
      setTimeout(() => this.toast.set(''), 4000);
    };
  }

  open(id: number) {
    clearTimeout(this.openTimer);
    this.openTimer = setTimeout(() => this.router.navigate([`/b/${id}`]), 300);
  }

  create() {
    const t = this.newTitle.value?.trim() ?? '';
    if (!t) return;
    this.error.set('');
    this.svc.createBoard(t, this.template() || undefined).subscribe({
      next: (b) => {
        this.newTitle.setValue('');
        this.boards.update((list) => [...list, b]);
      },
      error: () => this.error.set('Create failed'),
    });
  }

  remove(id: number, title: string) {
    if (!confirm(`Delete board "${title}" and all its data?`)) return;
    this.svc.deleteBoard(id).subscribe(() => {
      this.boards.update((list) => list.filter((b) => b.id !== id));
    });
  }

  rename(id: number, current: string) {
    clearTimeout(this.openTimer);
    this.renamingId.set(id);
    this.editTitle.setValue(current);
  }

  commitRename() {
    const id = this.renamingId();
    if (id === null) return;
    this.renamingId.set(null);
    const title = this.editTitle.value?.trim() ?? '';
    const prev = this.boards().find((b) => b.id === id)?.title ?? '';
    if (title && title !== prev) {
      this.svc.renameBoard(id, title).subscribe(() => {
        this.boards.update((list) => list.map((b) => (b.id === id ? { ...b, title } : b)));
      });
    }
  }

  cancelRename() {
    this.renamingId.set(null);
  }

  logout() {
    this.svc.logout();
  }
}