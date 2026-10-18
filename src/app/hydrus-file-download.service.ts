import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { saveAs } from 'file-saver-es';
import { HydrusBasicFile } from './hydrus-file';
import { HydrusFilesService } from './hydrus-files.service';
import { HydrusVersionService } from './hydrus-version.service';
import { BehaviorSubject, firstValueFrom, Subject, takeUntil } from 'rxjs';
import { ErrorService } from './error.service';

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: {mode?: 'read' | 'readwrite'}) => Promise<FileSystemDirectoryHandle>;
}

export type DownloadJobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface DownloadJob {
  id: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  status: DownloadJobStatus;
  destination: string;
  currentFile?: string;
  startedAt: number;
  finishedAt?: number;
}

interface DownloadController {
  cancelled: boolean;
  cancel$: Subject<void>;
  currentWritable?: FileSystemWritableFileStream;
}

class DownloadCancelledError extends Error { }

@Injectable({
  providedIn: 'root'
})
export class HydrusFileDownloadService {

  readonly downloadJobs$ = new BehaviorSubject<DownloadJob[]>([]);

  private readonly downloadControllers = new Map<string, DownloadController>();
  private nextDownloadJobID = 1;

  constructor(
    private filesService: HydrusFilesService,
    private snackbar: MatSnackBar,
    private hydrusVersionService: HydrusVersionService,
    private errorService: ErrorService
  ) { }

  public canShare = navigator.share && navigator.canShare;

  public async saveFile(hfile: HydrusBasicFile) {
    try {
      const directory = await this.chooseDownloadDirectory();
      if (directory === null) {
        return;
      }
      if (directory) {
        return this.saveFiles([hfile], directory);
      }
      return this.saveFileToBrowserDownloads(hfile);
    } catch (error) {
      this.errorService.handleHydrusError(error, 'Error downloading file');
    }
  }

  private async saveFileToBrowserDownloads(hfile: HydrusBasicFile) {
    if(hfile.gallery_local){saveAs(await firstValueFrom(this.filesService.getFileAsFile(hfile)),hfile.gallery_name);return;}
    const hydrusVersion = await firstValueFrom(this.hydrusVersionService.hydrusVersion$);
    if (hydrusVersion.hydrus_version < 532) {
      const snackBarRef = this.snackbar.open('Downloading file...');
      return this.saveFileBlob(hfile).then(() => {
        snackBarRef.dismiss();
      }, error => {
        snackBarRef.dismiss();
        this.errorService.handleHydrusError(error, 'Error downloading file')
      });
    } else {
      const url = `${hfile.file_url}&download=true`;
      window.open(url, '_self');
    }
  }

  public async chooseDownloadDirectory(): Promise<FileSystemDirectoryHandle | null | undefined> {
    const showDirectoryPicker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!showDirectoryPicker) {
      this.snackbar.open('Folder selection is not supported by this browser; using its default download location', undefined, {
        duration: 4000
      });
      return undefined;
    }

    try {
      return await showDirectoryPicker.call(window, {mode: 'readwrite'});
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }
      throw error;
    }
  }

  public async resolveDownloadDirectory(
    rootDirectory: FileSystemDirectoryHandle,
    relativeDirectory: string
  ): Promise<FileSystemDirectoryHandle> {
    let directory = rootDirectory;
    for(const part of relativeDirectory.split('/').filter(Boolean)) {
      if(part === '.' || part === '..' || /[<>:"|?*\0]/.test(part)) {
        throw new Error(`Invalid download folder prefix: ${relativeDirectory}`);
      }
      directory = await directory.getDirectoryHandle(part, {create: true});
    }
    return directory;
  }

  public async saveFiles(
    hfiles: HydrusBasicFile[],
    directory?: FileSystemDirectoryHandle,
    promptForSingleFile = true
  ) {
    if (hfiles.length === 0) {
      return;
    }
    if (hfiles.length === 1 && !directory && promptForSingleFile) {
      return this.saveFile(hfiles[0]);
    }

    const job = this.createDownloadJob(hfiles, directory);
    const controller = this.downloadControllers.get(job.id);
    const snackBarRef = this.snackbar.open(`${directory ? 'Saving' : 'Downloading'} ${hfiles.length} files...`);
    let downloaded = 0;
    const failures: unknown[] = [];

    // Blob downloads work across Hydrus versions and avoid repeatedly navigating
    // the current tab to the Client API's single-file download endpoint.
    for (const hfile of hfiles) {
      if (controller.cancelled) {
        break;
      }
      this.updateDownloadJob(job.id, {currentFile: hfile.hash + hfile.ext});
      try {
        await this.saveFileBlob(hfile, directory, controller);
        downloaded += 1;
        this.updateDownloadJob(job.id, {completedFiles: downloaded});
      } catch (error) {
        if (controller.cancelled || error instanceof DownloadCancelledError) {
          break;
        }
        failures.push(error);
        this.updateDownloadJob(job.id, {failedFiles: failures.length});
      }
    }

    snackBarRef.dismiss();
    controller.cancel$.complete();
    this.downloadControllers.delete(job.id);

    if (controller.cancelled) {
      this.updateDownloadJob(job.id, {
        status: 'cancelled',
        currentFile: undefined,
        finishedAt: Date.now()
      });
      this.snackbar.open(`Download stopped after ${downloaded} of ${hfiles.length} files`, undefined, {
        duration: 3000
      });
    } else if (failures.length > 0) {
      this.updateDownloadJob(job.id, {
        status: 'failed',
        currentFile: undefined,
        finishedAt: Date.now()
      });
      this.errorService.handleHydrusError(
        failures[0],
        `${failures.length} of ${hfiles.length} files failed to download`
      );
    } else {
      this.updateDownloadJob(job.id, {
        status: 'completed',
        currentFile: undefined,
        finishedAt: Date.now()
      });
      this.snackbar.open(`${downloaded} files ${directory ? 'saved' : 'downloaded'}`, undefined, {
        duration: 2000
      });
    }
  }

  cancelDownload(id: string) {
    const controller = this.downloadControllers.get(id);
    if (!controller || controller.cancelled) {
      return;
    }

    controller.cancelled = true;
    controller.cancel$.next();
    if (controller.currentWritable) {
      void controller.currentWritable.abort(new DownloadCancelledError()).catch(() => undefined);
    }
    this.updateDownloadJob(id, {status: 'cancelled'});
  }

  dismissDownload(id: string) {
    const job = this.downloadJobs$.value.find(download => download.id === id);
    if (!job || job.status === 'running') {
      return;
    }
    this.downloadJobs$.next(this.downloadJobs$.value.filter(download => download.id !== id));
  }

  clearFinishedDownloads() {
    this.downloadJobs$.next(this.downloadJobs$.value.filter(download => download.status === 'running'));
  }

  private createDownloadJob(hfiles: HydrusBasicFile[], directory?: FileSystemDirectoryHandle) {
    const job: DownloadJob = {
      id: `${Date.now()}-${this.nextDownloadJobID++}`,
      totalFiles: hfiles.length,
      completedFiles: 0,
      failedFiles: 0,
      status: 'running',
      destination: directory?.name ?? 'Browser downloads',
      startedAt: Date.now()
    };
    this.downloadControllers.set(job.id, {
      cancelled: false,
      cancel$: new Subject<void>()
    });
    const activeJobs = this.downloadJobs$.value.filter(download => download.status === 'running');
    const finishedJobs = this.downloadJobs$.value
      .filter(download => download.status !== 'running')
      .slice(0, Math.max(0, 24 - activeJobs.length));
    this.downloadJobs$.next([
      job,
      ...activeJobs,
      ...finishedJobs
    ]);
    return job;
  }

  private updateDownloadJob(id: string, update: Partial<DownloadJob>) {
    this.downloadJobs$.next(this.downloadJobs$.value.map(download =>
      download.id === id ? {...download, ...update} : download
    ));
  }

  private async saveFileBlob(
    hfile: HydrusBasicFile,
    directory?: FileSystemDirectoryHandle,
    controller?: DownloadController
  ) {
    const fileRequest = controller
      ? this.filesService.getFileAsFile(hfile).pipe(takeUntil(controller.cancel$))
      : this.filesService.getFileAsFile(hfile);
    let file: File;
    try {
      file = await firstValueFrom(fileRequest);
    } catch (error) {
      if (controller?.cancelled) {
        throw new DownloadCancelledError();
      }
      throw error;
    }
    if (controller?.cancelled) {
      throw new DownloadCancelledError();
    }

    if (directory) {
      const fileHandle = await directory.getFileHandle(file.name, {create: true});
      const writable = await fileHandle.createWritable();
      if (controller) {
        controller.currentWritable = writable;
      }
      if (controller?.cancelled) {
        await writable.abort(new DownloadCancelledError()).catch(() => undefined);
        throw new DownloadCancelledError();
      }
      try {
        await writable.write(file);
        await writable.close();
      } finally {
        if (controller) {
          controller.currentWritable = undefined;
        }
      }
    } else {
      saveAs(file);
    }
  }

  shareFile(hfile: HydrusBasicFile) {
    const snackBarRef = this.snackbar.open('Sharing file...');
    return this.filesService.getFileAsFile(hfile).toPromise().then(file => {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({
          files: [file]
        });
      } else {
        throw new Error('Your browser doesn\'t support sharing this file');
      }
    })
    .then(() => {
      snackBarRef.dismiss();
    }, error => {
      snackBarRef.dismiss();
      if (error.message !== 'Share canceled') {
        this.errorService.handleHydrusError(error, 'Error sharing file');
      }
    });
  }
}
