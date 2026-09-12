export interface User {
  id: number;
  email: string;
}

export interface BoardSummary {
  id: number;
  title: string;
  position: number;
  role?: string;
  background?: string;
}

export interface List {
  id: number;
  boardId: number;
  title: string;
  position: number;
  wipLimit: number | null;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'link';
  url: string;
}

export interface Card {
  id: number;
  listId: number;
  title: string;
  description: string;
  color: string;
  labels: string[];
  assignee: string;
  due: string;
  priority: string;
  archived: boolean;
  position: number;
  cover?: string | null;
  attachments: Attachment[];
  recur?: string | null;
}

export interface ChecklistItem {
  id: number;
  cardId: number;
  text: string;
  done: boolean;
  position: number;
}

export interface CardComment {
  id: number;
  cardId: number;
  author: string;
  body: string;
  created_at: string;
  reactions?: Record<string, number[]>;
}

export interface Activity {
  id: number;
  message: string;
  created_at: string;
}

export interface BoardMember {
  role: string;
  userId: number;
  email: string;
}

export interface CardTemplate {
  name: string;
  color: string;
  labels: string[];
  checklist: string[];
}

export interface BoardData {
  board: { id: number; title: string; background?: string };
  role: string;
  members: BoardMember[];
  lists: List[];
  cards: Card[];
  archived: Card[];
  checklist: ChecklistItem[];
  comments: CardComment[];
  activity: Activity[];
}

export interface DeletedList {
  list: { title: string; position: number };
  cards: {
    title: string;
    description: string;
    color: string;
    labels: string[];
    assignee: string;
    due: string;
    priority: string;
    position: number;
    cover?: string | null;
    attachments?: Attachment[];
    recur?: string | null;
  }[];
}

export interface MentionEvent {
  boardId: number;
  boardTitle: string;
  cardTitle: string;
}

export interface OnlineUser {
  id: number;
  handle: string;
  color: string;
}