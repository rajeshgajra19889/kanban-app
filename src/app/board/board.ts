import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Component, computed, inject, signal, OnDestroy } from '@angular/core';
import {
  Attachment, BoardMember, Card, CardTemplate, ChecklistItem, CardComment, List, MentionEvent, OnlineUser,
} from '../models';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { KanbanService } from '../kanban.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MarkdownPipe } from '../markdown.pipe';

interface CmdItem {
  label: string;
  hint: string;
  run: () => void;
}

@Component({
  imports: [DragDropModule, ReactiveFormsModule, RouterLink, MarkdownPipe],
  selector: 'app-board',
  styleUrl: './board.scss',
  templateUrl: './board.html',
})
export class Board implements OnDestroy {
  kanban = inject(KanbanService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  boardId = signal(0);
  boardTitle = signal('');
  renamingTitle = signal(false);
  editTitleCtrl = new FormControl('');
  role = signal('owner');
  members = signal<BoardMember[]>([]);
  lists = signal<List[]>([]);
  cards = signal<Card[]>([]);
  archivedCards = signal<Card[]>([]);
  checklist = signal<ChecklistItem[]>([]);
  comments = signal<CardComment[]>([]);
  activity = signal<{ id: number; message: string; created_at: string }[]>([]);
  loading = signal(true);
  listIds = computed<string[]>(() => this.lists().map((l) => l.id.toString()));
  onlineUsers = signal<OnlineUser[]>([]);
  toasts = signal<string[]>([]);
  dark = signal(false);
  archiveOpen = signal(false);
  activityOpen = signal(false);
  statsOpen = signal(false);
  settingsOpen = signal(false);
  membersOpen = signal(false);
  cmdOpen = signal(false);
  collapsed = signal<Set<number>>(new Set());
  selected = signal<Set<number>>(new Set());
  background = signal('');

  filterMode = signal<'all' | 'mine' | 'overdue' | 'today'>('all');
  sortMode = signal<'manual' | 'priority' | 'due' | 'title'>('manual');
  tick = signal(0);

  lastDeleted = signal<{ type: 'card' | 'list'; id: number; title: string; listId?: number; payload?: any } | null>(null);

  newListControl = new FormControl('');
  searchText = new FormControl('');

  editingCard = signal<Card | null>(null);
  titleControl = new FormControl('');
  descriptionControl = new FormControl('');
  colorControl = new FormControl('');
  labelsControl = signal<string[]>([]);
  assigneeControl = new FormControl('');
  dueControl = new FormControl('');
  priorityControl = new FormControl('');
  newChecklistControl = new FormControl('');
  newCommentControl = new FormControl('');
  coverInput = new FormControl('');

  inviteEmail = new FormControl('');
  inviteRole = new FormControl('editor');
  membersError = signal('');

  cmdQuery = signal('');
  cmdIndex = signal(0);

  mentionOpen = signal(false);
  mentionFiltered = signal<string[]>([]);
  mentionSelected = signal(0);

  cardViewers = signal<OnlineUser[]>([]);
  typingOn = signal('');
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  assigneeOpen = signal(false);
  assigneeFiltered = signal<BoardMember[]>([]);
  assigneeSelected = signal(0);

  readonly colorOptions = ['', 'blue', 'green', 'yellow', 'red', 'orange'];
  readonly labelOptions = ['Bug', 'Feature', 'Design', 'Docs', 'Urgent', 'Research'];
  readonly recurOptions = [
    { value: '', label: 'No repeat' },
    { value: 'daily', label: 'Repeat daily' },
    { value: 'weekly', label: 'Repeat weekly' },
    { value: 'monthly', label: 'Repeat monthly' },
  ];
  readonly labelColors: Record<string, string> = {
    Bug: '#ffd7d2',
    Feature: '#deebff',
    Design: '#e9dcff',
    Docs: '#e8ecf1',
    Urgent: '#ffebe6',
    Research: '#fff0c2',
  };
  readonly templates = signal<CardTemplate[]>(this.loadTemplates());
  private readonly colorHex: Record<string, string> = {
    blue: '#deebff',
    green: '#e3fcef',
    yellow: '#fffae6',
    red: '#ffebe6',
    orange: '#fff3e0',
  };

  isEditor = computed(() => this.role() !== 'viewer');
  selfHandle = computed(() => this.kanban.user()?.email?.split('@')[0]?.toLowerCase() ?? '');
  notifyOn = signal(this.kanban.notifyEnabled);

  cmdItems = computed<CmdItem[]>(() => this.buildCmdList(this.cmdQuery().trim().toLowerCase()));

  constructor() {
    this.kanban.onBoardChanged = (id) => {
      if (id === this.boardId()) this.reload(true);
    };
    this.kanban.onBoardOnline = (d) => {
      if (d.boardId === this.boardId()) this.onlineUsers.set(d.users);
    };
    this.kanban.onActivity = (d) => {
      if (d.boardId === this.boardId()) {
        this.kanban.fire('Activity', d.message);
        this.pushToast(d.message);
      }
    };
    this.kanban.onMention = (d: MentionEvent) => {
      this.kanban.fire('You were mentioned', `${d.boardTitle} — ${d.cardTitle}`);
      if (d.boardId === this.boardId()) this.pushToast(`Mentioned you in "${d.cardTitle}"`);
      else this.pushToast(`Mentioned in "${d.boardTitle}" — ${d.cardTitle}`);
    };
    this.kanban.onCommentUpdated = (d) => {
      if (d.boardId === this.boardId()) {
        this.comments.update((cs) =>
          cs.map((c) => (c.id === d.comment.id ? { ...c, reactions: d.comment.reactions ?? {} } : c)),
        );
      }
    };
    this.kanban.onCardViewers = (d) => {
      if (d.boardId === this.boardId() && this.editingCard()?.id === d.cardId) {
        this.cardViewers.set(d.users);
      }
    };
    this.kanban.onTyping = (d) => {
      if (d.boardId === this.boardId() && this.editingCard()?.id === d.cardId) {
        this.typingOn.set(d.stop ? '' : d.handle);
      }
    };
    this.newCommentControl.valueChanges.subscribe((v) => {
      const card = this.editingCard();
      if (!card || this.mentionOpen()) return;
      this.kanban.typing(this.boardId(), card.id, v ?? '');
      if (this.typingTimer) clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => this.kanban.typing(this.boardId(), card.id, ''), 1600);
      if (!(v ?? '').trim()) this.typingOn.set('');
    });
    this.newCommentControl.valueChanges.subscribe((v) => this.updateMentionList(v ?? ''));
    this.assigneeControl.valueChanges.subscribe((v) => this.updateAssigneeList(v ?? ''));
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.boardId.set(id);
    this.kanban.viewBoard(id);
    if (localStorage.getItem('kanban-dark') === '1') {
      this.dark.set(true);
      document.body.classList.add('dark');
    }
    this.addKeyboardShortcuts();
    this.setInterval(() => this.tick.set(Date.now()), 30000);
    this.reload(false);
  }

  private setInterval(fn: () => void, ms: number) {
    window.setInterval(fn, ms);
  }

  cardsOf(listId: number): Card[] {
    const s = this.searchText.value?.trim().toLowerCase() ?? '';
    const self = this.selfHandle();
    const arr = this.cards()
      .filter((c) => c.listId === listId)
      .filter((c) => !s || c.title.toLowerCase().includes(s) || c.assignee.toLowerCase().includes(s) || c.labels.some((l) => l.toLowerCase().includes(s)))
      .filter((c) => {
        if (this.filterMode() === 'mine') return c.assignee.toLowerCase().includes(self);
        if (this.filterMode() === 'overdue') return !!c.due && this.isOverdue(c);
        if (this.filterMode() === 'today') return !!c.due && this.dueToday(c);
        return true;
      });

    const sort = this.sortMode();
    return [...arr].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'priority') {
        const w = (p: string) => (p === 'P1' ? 0 : p === 'P2' ? 1 : p === 'P3' ? 2 : 3);
        return w(a.priority) - w(b.priority) || a.position - b.position || a.id - b.id;
      }
      if (sort === 'due') {
        if (!a.due && !b.due) return a.position - b.position || a.id - b.id;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due.localeCompare(b.due) || a.position - b.position || a.id - b.id;
      }
      return a.position - b.position || a.id - b.id;
    });
  }

  listCount(listId: number): number {
    return this.cards().filter((c) => c.listId === listId).length;
  }

  listFull(list: List): boolean {
    return list.wipLimit != null && this.listCount(list.id) >= list.wipLimit;
  }

  isCollapsed(id: number): boolean {
    return this.collapsed().has(id);
  }

  toggleCollapse(id: number) {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleDark() {
    this.dark.update((d) => !d);
    document.body.classList.toggle('dark', this.dark());
    localStorage.setItem('kanban-dark', this.dark() ? '1' : '0');
  }

  toggleNotify() {
    this.kanban.toggleNotify();
    this.notifyOn.set(this.kanban.notifyEnabled);
  }

  pushToast(msg: string) {
    this.toasts.update((a) => [...a.slice(-4), msg]);
    setTimeout(() => {
      this.toasts.update((a) => a.filter((m) => m !== msg));
    }, 3500);
  }

  reload(silent: boolean) {
    this.kanban.loadBoard(this.boardId()).subscribe({
      next: (board) => {
        this.boardTitle.set(board.board.title);
        this.background.set(board.board.background ?? '');
        this.selected.set(new Set());
        this.role.set(board.role ?? 'owner');
        this.members.set(board.members ?? []);
        this.lists.set(board.lists.sort((a, b) => a.position - b.position || a.id - b.id));
        this.cards.set(board.cards);
        this.archivedCards.set(board.archived);
        this.checklist.set((board as any).checklist?.map((c: any) => ({ ...c, cardId: c.card_id })) ?? []);
        this.comments.set((board as any).comments?.map((c: any) => ({ ...c, cardId: c.card_id })) ?? []);
        this.activity.set(board.activity);
        this.loading.set(false);
        this.openCardFromHash();
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private openCardFromHash() {
    if (this.hashOpened) return;
    this.hashOpened = true;
    const m = /^#card-(\d+)$/.exec(location.hash ?? '');
    if (!m) return;
    const id = Number(m[1]);
    const card = this.cards().find((c) => c.id === id);
    if (card) this.startEdit(card);
  }

  isSelected(cardId: number): boolean {
    return this.selected().has(cardId);
  }

  onCardClick(event: MouseEvent, card: Card) {
    if (event.shiftKey && event.target instanceof HTMLElement && (event.target as HTMLElement).closest('button')) return;
    if (event.shiftKey) {
      this.selected.update((s) => {
        const next = new Set(s);
        if (next.has(card.id)) next.delete(card.id);
        else next.add(card.id);
        return next;
      });
      return;
    }
    if (this.selected().size > 0) this.clearSelected(false);
    this.startEdit(card);
  }

  clearSelected(silent = true) {
    this.selected.set(new Set());
    if (!silent) this.pushToast('Selection cleared');
  }

  bulkArchive() {
    const ids = [...this.selected()];
    if (!ids.length || !confirm(`Archive ${ids.length} card(s)?`)) return;
    this.kanban.archiveCards(this.boardId(), ids).subscribe({
      next: () => {
        this.clearSelected();
        this.pushToast(`Archived ${ids.length} card(s)`);
      },
      error: () => this.pushToast('Archive failed'),
    });
  }

  bulkMove(listId: string) {
    if (!listId) return;
    const ids = [...this.selected()];
    if (!ids.length) return;
    this.kanban.moveCards(this.boardId(), ids, Number(listId)).subscribe({
      next: () => {
        this.clearSelected();
        this.pushToast(`Moved ${ids.length} card(s)`);
      },
      error: () => this.pushToast('Move failed'),
    });
  }

  setBackground(css: string) {
    const prev = this.background();
    this.background.set(css);
    this.kanban.updateBoardBackground(this.boardId(), css).subscribe({
      error: () => {
        this.background.set(prev);
        this.pushToast('Could not change background');
      },
    });
  }

  addList() {
    const title = this.newListControl.value?.trim();
    if (!title) return;
    this.kanban.addList(this.boardId(), title).subscribe(() => this.newListControl.setValue(''));
  }

  addCard(listId: number, target: EventTarget | null) {
    const input = target as HTMLInputElement;
    const title = input.value.trim();
    if (!title) return;
    this.kanban.addCard(this.boardId(), listId, title).subscribe(() => (input.value = ''));
  }

  renameList(list: List) {
    const title = prompt('List title', list.title);
    if (title && title.trim() && title.trim() !== list.title) {
      this.kanban.updateList(this.boardId(), list.id, { title: title.trim() }).subscribe();
    }
  }

  setWip(list: List) {
    const val = prompt('Cards allowed in this list (0 = no limit)', String(list.wipLimit ?? 0));
    if (val === null) return;
    this.kanban.updateList(this.boardId(), list.id, { wip_limit: Number(val) || 0 }).subscribe();
  }

  cardBg(card: Card): string {
    return this.colorHex[card.color] ?? '';
  }

  swatchBg(color: string): string {
    return this.colorHex[color] ?? '';
  }

  labelBg(label: string): string {
    return this.labelColors[label] ?? '#e8ecf1';
  }

  assigneeInitials(card: Card): string {
    const a = card.assignee.trim();
    if (!a) return '';
    return a.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  private localDayStart(dateStr: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return Number.NaN;
    return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  }

  dueToday(card: Card): boolean {
    if (!card.due) return false;
    const now = new Date();
    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dueStart = this.localDayStart(card.due);
    return !Number.isNaN(dueStart) && dueStart === nowStart;
  }

  isOverdue(card: Card): boolean {
    if (!card.due) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dueStart = this.localDayStart(card.due);
    return !Number.isNaN(dueStart) && dueStart < now.getTime();
  }

  deleteList(id: number) {
    const list = this.lists().find((l) => l.id === id);
    if (!list || !confirm(`Delete list "${list.title}" and all its cards?`)) return;
    this.kanban.deleteList(this.boardId(), id).subscribe({
      next: (r) => {
        this.lastDeleted.set({ type: 'list', id, title: list.title, payload: r });
        setTimeout(() => {
          this.lastDeleted.update((v) => (v && v.type === 'list' && v.id === id ? null : v));
        }, 15000);
      },
    });
  }

  deleteCard(id: number) {
    const card = this.cards().find((c) => c.id === id) ?? this.archivedCards().find((c) => c.id === id);
    if (!card || !confirm(`Delete card "${card.title}"?`)) return;
    this.kanban.deleteCard(this.boardId(), id).subscribe({
      next: (r) => {
        this.lastDeleted.set({ type: 'card', id, title: card.title, listId: card.listId, payload: r.card });
        setTimeout(() => {
          this.lastDeleted.update((v) => (v && v.type === 'card' && v.id === id ? null : v));
        }, 15000);
      },
    });
  }

  undoLast() {
    const last = this.lastDeleted();
    if (!last) return;
    if (last.type === 'card') {
      const c = last.payload;
      this.kanban
        .addCard(this.boardId(), c.list_id ?? last.listId!, c.title, {
          description: c.description,
          color: c.color,
          labels: c.labels,
          assignee: c.assignee,
          due: c.due,
          priority: c.priority,
          cover: c.cover ?? null,
          attachments: c.attachments ?? [],
          recur: c.recur ?? null,
        })
        .subscribe(() => this.lastDeleted.set(null));
    } else {
      const d = last.payload;
      this.kanban
        .restoreList(this.boardId(), { title: d.list.title, cards: d.cards })
        .subscribe(() => this.lastDeleted.set(null));
    }
  }

  startEdit(card: Card) {
    this.editingCard.set(card);
    this.titleControl.setValue(card.title);
    this.descriptionControl.setValue(card.description ?? '');
    this.colorControl.setValue(card.color ?? '');
    this.labelsControl.set([...(card.labels ?? [])]);
    this.assigneeControl.setValue(card.assignee ?? '');
    this.dueControl.setValue(card.due ?? '');
    this.priorityControl.setValue(card.priority ?? '');
    this.coverInput.setValue('');
    this.newChecklistControl.setValue('');
    this.newCommentControl.setValue('');
    this.mentionOpen.set(false);
    this.assigneeOpen.set(false);
    this.cardViewers.set([]);
    this.typingOn.set('');
    this.kanban.viewCard(this.boardId(), card.id);
    location.hash = 'card-' + card.id;
  }

  cancelEdit() {
    this.editingCard.set(null);
    this.kanban.viewCard(this.boardId(), null);
    if ((location.hash ?? '').startsWith('#card-')) location.hash = '';
  }

  toggleLabel(label: string) {
    this.labelsControl.update((ls) =>
      ls.includes(label) ? ls.filter((l) => l !== label) : [...ls, label],
    );
  }

  setRecur(v: string) {
    this.editingCard.update((c) => (c ? { ...c, recur: v || null } : c));
  }

  addCoverUrl() {
    const v = this.coverInput.value?.trim();
    if (!v) return;
    this.editingCard.update((c) => (c ? { ...c, cover: v } : c));
    this.coverInput.setValue('');
  }

  onCoverFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.editingCard.update((c) => (c ? { ...c, cover: String(reader.result ?? '') } : c));
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  clearCover() {
    this.editingCard.update((c) => (c ? { ...c, cover: null } : c));
  }

  addLink() {
    const v = this.coverInput.value?.trim();
    if (!v) return;
    this.editingCard.update((c) =>
      c
        ? {
            ...c,
            attachments: [...c.attachments, { id: 'a' + Date.now() + Math.random().toString(36).slice(2, 7), name: v, type: 'link' as const, url: v }],
          }
        : c,
    );
    this.coverInput.setValue('');
  }

  onAttachmentFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      const att: Attachment = {
        id: 'a' + Date.now() + Math.random().toString(36).slice(2, 7),
        name: file.name,
        type: 'image' as const,
        url,
      };
      this.editingCard.update((c) => (c ? { ...c, attachments: [...c.attachments, att] } : c));
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  removeAttachment(id: string) {
    this.editingCard.update((c) => (c ? { ...c, attachments: c.attachments.filter((a) => a.id !== id) } : c));
  }

  saveEdit() {
    const card = this.editingCard();
    if (!card) return;
    const title = this.titleControl.value?.trim();
    if (!title) return;
    this.kanban
      .updateCard(this.boardId(), card.id, {
        title,
        description: this.descriptionControl.value ?? '',
        color: this.colorControl.value ?? '',
        labels: this.labelsControl(),
        assignee: this.assigneeControl.value ?? '',
        due: this.dueControl.value ?? '',
        priority: this.priorityControl.value ?? '',
        cover: card.cover ?? null,
        attachments: card.attachments,
        recur: card.recur ?? null,
      })
      .subscribe(() => this.cancelEdit());
  }

  duplicateCard(card: Card) {
    this.kanban.duplicateCard(this.boardId(), card.id).subscribe();
  }

  copyToList(card: Card, raw: string) {
    const listId = Number(raw);
    const target = this.lists().find((l) => l.id === listId);
    if (!listId || !target) return;
    this.kanban.duplicateCard(this.boardId(), card.id).subscribe({
      next: (dup: any) => {
        const pos = this.cards().filter((c) => c.listId === listId && !c.archived).length;
        this.kanban.moveCard(this.boardId(), dup.id, listId, pos).subscribe({
          next: () => this.pushToast(`Copied "${card.title}" to ${target.title}`),
        });
      },
    });
  }

  private loadTemplates(): CardTemplate[] {
    try {
      const raw = JSON.parse(localStorage.getItem('kanban-templates') ?? '[]');
      return Array.isArray(raw) ? (raw as CardTemplate[]) : [];
    } catch {
      return [];
    }
  }

  saveTemplate() {
    const card = this.editingCard();
    if (!card) return;
    const name = prompt('Template name', card.title.slice(0, 24) || 'My template');
    if (!name) return;
    const items = this.checklist()
      .filter((i) => i.cardId === card.id)
      .map((i) => i.text);
    const next = [
      ...this.templates().filter((t) => t.name !== name),
      { name, color: card.color ?? '', labels: card.labels ?? [], checklist: items },
    ];
    this.templates.set(next);
    localStorage.setItem('kanban-templates', JSON.stringify(next));
    this.pushToast(`Saved template "${name}"`);
  }

  applyTemplate(name: string) {
    const card = this.editingCard();
    if (!card) return;
    const t = this.templates().find((x) => x.name === name);
    if (!t) return;
    this.colorControl.setValue(t.color);
    const union = Array.from(new Set([...(card.labels ?? []), ...t.labels]));
    this.labelsControl.set(union);
    const existing = new Set(this.checklist().filter((i) => i.cardId === card.id).map((i) => i.text.toLowerCase()));
    for (const text of t.checklist) {
      if (!existing.has(text.toLowerCase())) this.addChecklistItem(text);
    }
    this.pushToast(`Applied template "${name}"`);
  }

  archiveEditing() {
    const card = this.editingCard();
    if (!card) return;
    this.kanban.updateCard(this.boardId(), card.id, { archived: true }).subscribe(() => this.cancelEdit());
  }

  restoreArchived(card: Card) {
    this.kanban.updateCard(this.boardId(), card.id, { archived: false }).subscribe();
  }

  deleteEditing() {
    const card = this.editingCard();
    if (card) {
      this.deleteCard(card.id);
      this.cancelEdit();
    }
  }

  checklistOf(cardId: number): ChecklistItem[] {
    return this.checklist()
      .filter((c) => c.cardId === cardId)
      .sort((a, b) => a.position - b.position || a.id - b.id);
  }

  checklistProgress(cardId: number): number {
    const items = this.checklistOf(cardId);
    if (!items.length) return -1;
    return Math.round((items.filter((i) => i.done).length / items.length) * 100);
  }

  addChecklistItem(textParam?: string) {
    const card = this.editingCard();
    const text = (textParam ?? this.newChecklistControl.value)?.trim();
    if (!card || !text) return;
    this.kanban.addChecklistItem(this.boardId(), card.id, text).subscribe(() => {
      if (!textParam) this.newChecklistControl.setValue('');
    });
  }

  toggleChecklist(item: ChecklistItem) {
    this.kanban.toggleChecklist(this.boardId(), item.id, !item.done).subscribe();
  }

  removeChecklistItem(item: ChecklistItem) {
    this.kanban.deleteChecklistItem(this.boardId(), item.id).subscribe();
  }

  commentsOf(cardId: number): CardComment[] {
    return this.comments().filter((c) => c.cardId === cardId);
  }

  addComment() {
    const card = this.editingCard();
    const body = this.newCommentControl.value?.trim();
    if (!card || !body) return;
    this.kanban.addComment(this.boardId(), card.id, body).subscribe(() => {
      this.newCommentControl.setValue('');
      this.mentionOpen.set(false);
    });
  }

  removeComment(comment: CardComment) {
    this.kanban.deleteComment(this.boardId(), comment.id).subscribe();
  }

  reactionList(comment: CardComment): { emoji: string; count: number; mine: boolean }[] {
    const me = this.kanban.user()?.id ?? 0;
    return Object.entries(comment.reactions ?? {})
      .map(([emoji, ids]) => ({ emoji, count: ids.length, mine: ids.includes(me) }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  hasReaction(comment: CardComment, emoji: string): boolean {
    const me = this.kanban.user()?.id ?? 0;
    return (comment.reactions?.[emoji] ?? []).includes(me);
  }

  toggleReaction(comment: CardComment, emoji: string) {
    if (!this.isEditor()) return;
    this.kanban.reactComment(this.boardId(), comment.id, emoji).subscribe({
      next: (upd: any) => {
        this.comments.update((cs) =>
          cs.map((c) => (c.id === upd.id ? { ...c, reactions: upd.reactions ?? {} } : c)),
        );
      },
    });
  }

  private updateMentionList(v: string) {
    if (!this.editingCard()) {
      this.mentionOpen.set(false);
      return;
    }
    const m = /@([a-z0-9._-]*)$/i.exec(v);
    if (!m) {
      this.mentionOpen.set(false);
      return;
    }
    const prefix = m[1].toLowerCase();
    const self = this.selfHandle();
    const cands = this.members()
      .map((mem) => mem.email.split('@')[0])
      .filter((h) => h.toLowerCase() !== self && h.toLowerCase().startsWith(prefix))
      .slice(0, 6);
    this.mentionFiltered.set(cands);
    this.mentionOpen.set(cands.length > 0);
    this.mentionSelected.set(0);
  }

  chooseMention(handle: string) {
    const cur = this.newCommentControl.value ?? '';
    const pos = cur.lastIndexOf('@');
    this.newCommentControl.setValue(cur.slice(0, pos) + '@' + handle + ' ');
    this.mentionOpen.set(false);
  }

  onCommentKey(e: KeyboardEvent) {
    if (!this.mentionOpen()) return;
    const list = this.mentionFiltered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.mentionSelected.set(Math.min(this.mentionSelected() + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.mentionSelected.set(Math.max(this.mentionSelected() - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const h = list[this.mentionSelected()];
      if (h) this.chooseMention(h);
    }
  }

  updateAssigneeList(v: string) {
    if (!this.editingCard() || !this.isEditor()) {
      this.assigneeOpen.set(false);
      return;
    }
    const val = v.trim();
    if (!val) {
      this.assigneeOpen.set(false);
      return;
    }
    const prefix = val.toLowerCase();
    const matches = this.members()
      .filter(
        (m) =>
          m.email.toLowerCase().startsWith(prefix) ||
          m.email.split('@')[0].toLowerCase().startsWith(prefix),
      )
      .slice(0, 6);
    this.assigneeFiltered.set(matches);
    this.assigneeOpen.set(matches.length > 0 && !matches.some((m) => m.email.toLowerCase() === prefix));
    this.assigneeSelected.set(0);
  }

  chooseAssignee(email: string) {
    this.assigneeControl.setValue(email);
    this.assigneeOpen.set(false);
  }

  onAssigneeKey(e: KeyboardEvent) {
    if (!this.assigneeOpen()) return;
    const list = this.assigneeFiltered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.assigneeSelected.set(Math.min(this.assigneeSelected() + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.assigneeSelected.set(Math.max(this.assigneeSelected() - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const m = list[this.assigneeSelected()];
      if (m) this.chooseAssignee(m.email);
    } else if (e.key === 'Escape') {
      this.assigneeOpen.set(false);
    }
  }

  invite() {
    const email = this.inviteEmail.value?.trim() ?? '';
    if (!email) return;
    this.membersError.set('');
    this.kanban.inviteMember(this.boardId(), email, this.inviteRole.value ?? 'editor').subscribe({
      next: () => {
        this.inviteEmail.setValue('');
        this.loadMembers();
      },
      error: (err) => this.membersError.set(err.error?.error ?? 'Invite failed'),
    });
  }

  loadMembers() {
    this.kanban.listMembers(this.boardId()).subscribe({
      next: (r) => this.members.set(r.members),
    });
  }

  isOwner(): boolean {
    return this.role() === 'owner';
  }

  setMemberRole(m: BoardMember, role: string) {
    this.kanban.updateMember(this.boardId(), m.userId, role).subscribe(() => this.loadMembers());
  }

  removeMemberUser(m: BoardMember) {
    if (!confirm(`Remove ${m.email} from this board?`)) return;
    this.kanban.removeMember(this.boardId(), m.userId).subscribe(() => this.loadMembers());
  }

  stats() {
    const perList = this.lists().map((l) => ({ title: l.title, count: this.listCount(l.id) }));
    const perAssignee = new Map<string, number>();
    for (const c of this.cards()) {
      const a = c.assignee.trim() || 'Unassigned';
      perAssignee.set(a, (perAssignee.get(a) ?? 0) + 1);
    }
    return {
      total: this.cards().length,
      perList,
      perAssignee: [...perAssignee.entries()].map(([name, count]) => ({ name, count })),
    };
  }

  cardMapForExport(c: Card) {
    return {
      title: c.title,
      description: c.description,
      color: c.color,
      labels: c.labels,
      assignee: c.assignee,
      due: c.due,
      priority: c.priority,
      archived: c.archived,
      position: c.position,
      cover: c.cover ?? null,
      attachments: c.attachments ?? [],
      recur: c.recur ?? null,
    };
  }

  exportBoard() {
    const data = {
      board: this.boardTitle(),
      lists: this.lists().map((l) => ({
        title: l.title,
        wip_limit: l.wipLimit,
        cards: [
          ...this.cards().filter((c) => c.listId === l.id),
          ...this.archivedCards().filter((c) => c.listId === l.id),
        ].map((c) => this.cardMapForExport(c)),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kanban-${this.boardTitle().replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  onImportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const lists = parsed.lists ?? [];
        if (!Array.isArray(lists)) throw new Error('bad format');
        if (!confirm(`Replace current board with ${lists.length} imported list(s)?`)) return;
        this.kanban.importBoard(this.boardId(), { lists }).subscribe({
          error: () => this.pushToast('Import failed'),
        });
      } catch {
        this.pushToast('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  onListDrop(event: CdkDragDrop<List[]>) {
    const list = event.item.data as List;
    if (event.previousIndex === event.currentIndex) return;
    this.kanban.moveList(this.boardId(), list.id, event.currentIndex).subscribe();
  }

  onDrop(event: CdkDragDrop<Card[]>) {
    const card = event.item.data as Card;
    const targetListId = Number(event.container.id);
    const newIndex = event.currentIndex;

    if (event.previousContainer === event.container && event.previousIndex === newIndex) return;

    this.clearSelected();

    this.kanban.moveCard(this.boardId(), card.id, targetListId, newIndex).subscribe({
      error: (err) => {
        this.pushToast(err.status === 409 ? `List is at its WIP limit (${err.error?.limit})` : 'Move failed');
      },
    });

    this.droppedId.set(card.id);
    setTimeout(() => {
      this.droppedId.update((id) => (id === card.id ? null : id));
    }, 900);
  }

  droppedId = signal<number | null>(null);
  private hashOpened = false;

  relTime(iso: string, _tick: number): string {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  openCmd() {
    this.cmdOpen.set(true);
    this.cmdQuery.set('');
    this.cmdIndex.set(0);
    setTimeout(() => document.querySelector<HTMLInputElement>('.cmd-input')?.focus(), 0);
  }

  closeCmd() {
    this.cmdOpen.set(false);
  }

  goHome() {
    this.router.navigate(['/boards']);
  }

  renameBoard() {
    this.renamingTitle.set(true);
    this.editTitleCtrl.setValue(this.boardTitle());
    setTimeout(() => document.querySelector<HTMLInputElement>('.title-edit')?.focus(), 0);
  }

  commitBoardRename() {
    const t = (this.editTitleCtrl.value ?? '').trim();
    this.renamingTitle.set(false);
    if (t && t !== this.boardTitle()) {
      this.kanban.renameBoard(this.boardId(), t).subscribe(() => {
        this.boardTitle.set(t);
      });
    }
  }

  private buildCmdList(q: string): CmdItem[] {
    const items: CmdItem[] = [];
    if (!q || 'go home'.startsWith(q)) items.push({ label: 'Go home', hint: 'Boards', run: () => { this.closeCmd(); this.goHome(); } });
    items.push({ label: 'Toggle dark mode', hint: 'Settings', run: () => this.toggleDark() });
    items.push({ label: 'Export board', hint: 'JSON', run: () => this.exportBoard() });
    items.push({ label: 'New card', hint: 'Focus first list input', run: () => { this.closeCmd(); setTimeout(() => document.querySelector<HTMLInputElement>('.add-card')?.focus(), 0); } });
    const pushCard = (c: Card) =>
      items.push({
        label: c.title,
        hint: (this.lists().find((l) => l.id === c.listId)?.title ?? '') + ' · #' + c.id,
        run: () => {
          this.closeCmd();
          this.startEdit(c);
        },
      });
    if (!q) {
      for (const c of this.cards().slice(0, 8)) pushCard(c);
    } else {
      for (const c of this.cards()) {
        if (c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)) pushCard(c);
      }
    }
    return items.slice(0, 12);
  }

  runCmd(item: CmdItem) {
    item.run();
  }

  onCmdKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.closeCmd();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.cmdIndex.set(Math.min(this.cmdIndex() + 1, this.cmdItems().length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.cmdIndex.set(Math.max(this.cmdIndex() - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = this.cmdItems()[this.cmdIndex()];
      if (item) this.runCmd(item);
    }
  }

  private addKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!this.cmdOpen()) this.openCmd();
        else this.closeCmd();
        return;
      }
      if (this.cmdOpen()) return;
      if (this.editingCard()) {
        if (e.key === 'Escape') this.cancelEdit();
        return;
      }
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.search')?.focus();
      } else if ((e.key === 'n' || e.key === 'N')) {
        const first = document.querySelector<HTMLInputElement>('.add-card');
        first?.focus();
      } else if (e.key === 'Escape') {
        this.archiveOpen.set(false);
        this.activityOpen.set(false);
        this.statsOpen.set(false);
        this.membersOpen.set(false);
      }
    });
  }

  ngOnDestroy() {
    this.kanban.viewBoard(null);
    this.kanban.viewCard(this.boardId(), null);
  }
}