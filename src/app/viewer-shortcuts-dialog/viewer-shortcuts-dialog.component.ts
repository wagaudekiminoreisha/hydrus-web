import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { VIEWER_SHORTCUTS } from '../viewer-keyboard';

@Component({
  standalone: true,
  selector: 'app-viewer-shortcuts-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Viewer keyboard shortcuts</h2>
    <mat-dialog-content>
      <table><tbody>
        @for(shortcut of shortcuts; track shortcut.keys) {
          <tr><th scope="row"><kbd>{{shortcut.keys}}</kbd></th><td>{{shortcut.action}}</td></tr>
        }
      </tbody></table>
      <p>Selection uses your active selection group(s). Shortcuts work with hidden toolbar controls too.</p>
      <p>When a text field, menu, dialog, or native media player has focus, it keeps its own keyboard controls.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>Close</button></mat-dialog-actions>
  `,
  styles: [`
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 4px; text-align: left; vertical-align: top; }
    th { width: 100px; }
    kbd { font: 600 13px monospace; white-space: nowrap; }
  `]
})
export class ViewerShortcutsDialogComponent {
  readonly shortcuts = VIEWER_SHORTCUTS;
}
