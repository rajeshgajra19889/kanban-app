import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Pipe({ name: 'md', pure: true })
export class MarkdownPipe implements PipeTransform {
  transform(value: string): string {
    const input = String(value ?? '');
    const html = marked.parse(input, { async: false, breaks: true }) as string;
    const withMentions = html.replace(/@([a-z0-9._-]+)/gi, '<span class="mention">@$1</span>');
    const clean = DOMPurify.sanitize(withMentions);
    return clean.replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=');
  }
}