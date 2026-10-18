import { Component, input } from '@angular/core';
import { HydrusFileDownloadService } from '../hydrus-file-download.service';
import { HydrusFilesService } from '../hydrus-files.service';
import { HydrusBasicFile } from '../hydrus-file';
import { toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom, of, switchMap } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ErrorService } from '../error.service';

@Component({
  selector: 'app-file-context-menu-actions',
  templateUrl: './file-context-menu-actions.component.html',
  styleUrl: './file-context-menu-actions.component.scss'
})
export class FileContextMenuActionsComponent {

  constructor(
    public downloadService: HydrusFileDownloadService,
    private filesService: HydrusFilesService,
    private snackbar: MatSnackBar,
    private errorService: ErrorService
  ) {
  }

  file = input.required<HydrusBasicFile>();

  fullFile$ = toObservable(this.file).pipe(
    switchMap(f => f.gallery_local?of(this.filesService.getGalleryFile(f.hash,f.file_id)!):this.filesService.getFileByHash(f.hash))
  )

  saveFile() {
    this.downloadService.saveFile(this.file());
  }

  shareFile() {
    this.downloadService.shareFile(this.file());
  }

  async deleteFile(){
    try {
      await firstValueFrom(this.filesService.deleteFile(this.file().hash));
      const snackbarRef = this.snackbar.open('File sent to trash', 'Undo', {
        duration: 2000
      });
      snackbarRef.onAction().subscribe(() => {
        this.undeleteFile()
      })
    } catch (error) {
      this.errorService.handleHydrusError(error);
    }
  }

  async undeleteFile(){
    try {
      await firstValueFrom(this.filesService.undeleteFile(this.file().hash));
      const snackbarRef = this.snackbar.open('File removed from trash', 'Undo', {
        duration: 2000
      });
      snackbarRef.onAction().subscribe(() => {
        this.deleteFile()
      })
    } catch (error) {
      this.errorService.handleHydrusError(error);
    }
  }

  async archiveFile(){
    try {
      await firstValueFrom(this.filesService.archiveFile(this.file().hash))
      const snackbarRef = this.snackbar.open('File archived', 'Undo', {
        duration: 2000
      });
      snackbarRef.onAction().subscribe(() => {
        this.unarchiveFile()
      })
    } catch (error) {
      this.errorService.handleHydrusError(error);
    }
  }

  async unarchiveFile(){
    try {
      await firstValueFrom(this.filesService.unarchiveFile(this.file().hash));
      const snackbarRef = this.snackbar.open('File moved to inbox', 'Undo', {
        duration: 2000
      });
      snackbarRef.onAction().subscribe(() => {
        this.archiveFile()
      })
    } catch (error) {
      this.errorService.handleHydrusError(error);
    }
  }

}
