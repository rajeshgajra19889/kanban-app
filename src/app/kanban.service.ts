import { HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import {
  User, BoardSummary, BoardData, DeletedList, MentionEvent, BoardMember, OnlineUser, CardComment,
} from './models';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('kanban-token');
  if (token && req.url.includes(environment.api)) {
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(req);
};

@Injectable({ providedIn: 'root' })
export class KanbanService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private API = environment.api;
  private socket: Socket;

  user = signal<User | null>(null);
  notifyEnabled = localStorage.getItem('kanban-notify') === '1';

  onBoardChanged: (boardId: number) => void = () => {};
  onBoardOnline: (data: { boardId: number; users: OnlineUser[] }) => void = () => {};
  onActivity: (data: { boardId: number; message: string }) => void = () => {};
  onMention: (d: MentionEvent) => void = () => {};
  onInvite: (boardId: number) => void = () => {};
  onCommentUpdated: (d: { boardId: number; comment: CardComment }) => void = () => {};
  onCardViewers: (d: { boardId: number; cardId: number; users: OnlineUser[] }) => void = () => {};
  onTyping: (d: { boardId: number; cardId: number; handle: string; stop: boolean }) => void = () => {};
  private currentBoard: number | null = null;

  constructor() {
    this.socket = io(this.API, {
      auth: { token: localStorage.getItem('kanban-token') || undefined },
    });
    this.socket.on('board:changed', (id: number) => this.onBoardChanged(id));
    this.socket.on('board:online', (d: { boardId: number; users: OnlineUser[] }) => this.onBoardOnline(d));
    this.socket.on('activity', (d: { boardId: number; message: string }) => {
      const { boardId, message } = d;
      this.fire('Activity', message);
      this.onActivity(d);
    });
    this.socket.on('mention', (d: MentionEvent) => {
      this.fire('You were mentioned', `${d.boardTitle} — ${d.cardTitle}`);
      this.onMention(d);
    });
    this.socket.on('invite', (d: { boardId: number }) => this.onInvite(d.boardId));
    this.socket.on('comment:updated', (d: { boardId: number; comment: CardComment }) => this.onCommentUpdated(d));
    this.socket.on('card:viewers', (d: { boardId: number; cardId: number; users: OnlineUser[] }) => this.onCardViewers(d));
    this.socket.on('typing', (d: { boardId: number; cardId: number; handle: string; stop: boolean }) => this.onTyping(d));
    this.socket.on('connect', () => {
      if (this.currentBoard != null) this.socket.emit('board:view', this.currentBoard);
    });
  }

  viewBoard(boardId: number | null) {
    this.currentBoard = boardId;
    this.socket.emit('board:view', boardId);
  }

  viewCard(boardId: number, cardId: number | null) {
    this.socket.emit('card:view', { boardId, cardId });
  }

  typing(boardId: number, cardId: number, text: string) {
    this.socket.emit('typing', { boardId, cardId, text });
  }

  setAuth(token: string | null) {
    this.socket.auth = { token: token ?? undefined };
    this.socket.disconnect();
    this.socket.connect();
  }

  requestNotify() {
    if (this.notifyEnabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(() => {});
    }
  }

  toggleNotify() {
    this.notifyEnabled = !this.notifyEnabled;
    localStorage.setItem('kanban-notify', this.notifyEnabled ? '1' : '0');
    this.requestNotify();
  }

  fire(title: string, body: string) {
    if (
      this.notifyEnabled &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(title, { body });
      } catch {}
    }
  }

  checkSession() {
    const token = localStorage.getItem('kanban-token');
    if (!token) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.http.get<{ user: User }>(`${this.API}/api/auth/me`).subscribe({
        next: (r) => { this.user.set(r.user); resolve(true); },
        error: () => { localStorage.removeItem('kanban-token'); resolve(false); },
      });
    });
  }

  login(email: string, password: string) {
    return this.http.post<{ token: string; user: User }>(`${this.API}/api/auth/login`, { email, password });
  }

  register(email: string, password: string) {
    return this.http.post<{ token: string; user: User }>(`${this.API}/api/auth/register`, { email, password });
  }

  logout() {
    localStorage.removeItem('kanban-token');
    this.user.set(null);
    this.router.navigate(['/login']);
  }

  loadBoards() {
    return this.http.get<{ boards: BoardSummary[] }>(`${this.API}/api/boards`);
  }

  createBoard(title: string, template?: string) {
    return this.http.post<BoardSummary>(`${this.API}/api/boards`, template ? { title, template } : { title });
  }

  loadBoard(id: number) {
    return this.http.get<BoardData>(`${this.API}/api/boards/${id}`);
  }

  deleteBoard(id: number) {
    return this.http.delete(`${this.API}/api/boards/${id}`);
  }

  renameBoard(id: number, title: string) {
    return this.http.patch(`${this.API}/api/boards/${id}`, { title });
  }

  updateBoardBackground(id: number, background: string) {
    return this.http.patch(`${this.API}/api/boards/${id}`, { background });
  }

  archiveCards(boardId: number, cardIds: number[]) {
    return this.http.post<{ ok: boolean; archived: number }>(`${this.API}/api/boards/${boardId}/cards/archive`, { cardIds });
  }

  moveCards(boardId: number, cardIds: number[], listId: number) {
    return this.http.patch<{ ok: boolean }>(`${this.API}/api/boards/${boardId}/cards/move`, { cardIds, listId });
  }

  addList(boardId: number, title: string) {
    return this.http.post(`${this.API}/api/boards/${boardId}/lists`, { title });
  }

  updateList(boardId: number, listId: number, opts: { title?: string; wip_limit?: number | null }) {
    return this.http.patch(`${this.API}/api/boards/${boardId}/lists/${listId}`, opts);
  }

  moveList(boardId: number, listId: number, position: number) {
    return this.http.patch(`${this.API}/api/boards/${boardId}/lists/${listId}/move`, { position });
  }

  deleteList(boardId: number, listId: number) {
    return this.http.delete<DeletedList>(`${this.API}/api/boards/${boardId}/lists/${listId}`);
  }

  restoreList(boardId: number, data: { title: string; cards: any[] }) {
    return this.http.post(`${this.API}/api/boards/${boardId}/lists/restore`, data);
  }

  addCard(boardId: number, listId: number, title: string, extra: Record<string, unknown> = {}) {
    return this.http.post(`${this.API}/api/boards/${boardId}/cards`, { listId, title, ...extra });
  }

  importBoard(boardId: number, data: { lists: any[] }) {
    return this.http.post(`${this.API}/api/boards/${boardId}/import`, data);
  }

  moveCard(boardId: number, cardId: number, listId: number, position: number) {
    return this.http.patch(`${this.API}/api/boards/${boardId}/cards/${cardId}/move`, { listId, position });
  }

  duplicateCard(boardId: number, cardId: number) {
    return this.http.post(`${this.API}/api/boards/${boardId}/cards/${cardId}/duplicate`, {});
  }

  deleteCard(boardId: number, cardId: number) {
    return this.http.delete<{ card: any }>(`${this.API}/api/boards/${boardId}/cards/${cardId}`);
  }

  updateCard(
    boardId: number,
    cardId: number,
    opts: {
      title?: string;
      description?: string;
      color?: string;
      labels?: string[];
      assignee?: string;
      due?: string;
      priority?: string;
      archived?: boolean;
      cover?: string | null;
      attachments?: any[];
      recur?: string | null;
    },
  ) {
    return this.http.patch(`${this.API}/api/boards/${boardId}/cards/${cardId}`, opts);
  }

  addChecklistItem(boardId: number, cardId: number, text: string) {
    return this.http.post(`${this.API}/api/boards/${boardId}/cards/${cardId}/checklist`, { text });
  }

  toggleChecklist(boardId: number, itemId: number, done: boolean) {
    return this.http.patch(`${this.API}/api/boards/${boardId}/checklist/${itemId}`, { done });
  }

  deleteChecklistItem(boardId: number, itemId: number) {
    return this.http.delete(`${this.API}/api/boards/${boardId}/checklist/${itemId}`);
  }

  addComment(boardId: number, cardId: number, body: string) {
    return this.http.post(`${this.API}/api/boards/${boardId}/cards/${cardId}/comments`, { body });
  }

  deleteComment(boardId: number, commentId: number) {
    return this.http.delete(`${this.API}/api/boards/${boardId}/comments/${commentId}`);
  }

  reactComment(boardId: number, commentId: number, emoji: string) {
    return this.http.post(`${this.API}/api/boards/${boardId}/comments/${commentId}/react`, { emoji });
  }

  listMembers(boardId: number) {
    return this.http.get<{ members: BoardMember[] }>(`${this.API}/api/boards/${boardId}/members`);
  }

  inviteMember(boardId: number, email: string, role: string) {
    return this.http.post(`${this.API}/api/boards/${boardId}/members`, { email, role });
  }

  updateMember(boardId: number, userId: number, role: string) {
    return this.http.patch(`${this.API}/api/boards/${boardId}/members/${userId}`, { role });
  }

  removeMember(boardId: number, userId: number) {
    return this.http.delete(`${this.API}/api/boards/${boardId}/members/${userId}`);
  }
}