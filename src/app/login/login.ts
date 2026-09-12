import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { KanbanService } from '../kanban.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  email = new FormControl('');
  password = new FormControl('');
  error = signal('');
  loading = signal(false);
  isRegister = signal(false);

  private svc = inject(KanbanService);
  private router = inject(Router);

  async submit() {
    this.error.set('');
    const e = this.email.value?.trim() ?? '';
    const p = this.password.value ?? '';
    if (!e || p.length < 6) {
      this.error.set('Email + 6-char password required');
      return;
    }
    this.loading.set(true);
    const fn = this.isRegister() ? this.svc.register(e, p) : this.svc.login(e, p);
    fn.subscribe({
      next: (r) => {
        localStorage.setItem('kanban-token', r.token);
        this.svc.user.set(r.user);
        this.svc.setAuth(r.token);
        this.svc.requestNotify();
        this.loading.set(false);
        this.router.navigate(['/boards']);
      },
      error: (err) => {
        this.error.set(err.error?.error ?? 'Server error');
        this.loading.set(false);
      },
    });
  }
}