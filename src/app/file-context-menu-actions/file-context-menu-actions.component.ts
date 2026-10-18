import {Clipboard} from '@angular/cdk/clipboard';
import {MatDialog} from '@angular/material/dialog';
import {Router} from '@angular/router';
import {IntegrationService} from '../integration.service';
import {HybridSearchService} from '../integration/hybrid-search.service';
import {comfyCapabilities,metadataOf,MediaRecord} from '../integration/media-relations';
import {ComfyGenerationDialogComponent} from '../integration/comfy-generation-dialog.component';
import { Component, input, output } from '@angular/core';
import { HydrusFileDownloadService } from '../hydrus-file-download.service';
import { HydrusFilesService } from '../hydrus-files.service';
import { HydrusBasicFile } from '../hydrus-file';
import { toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom, of, switchMap, catchError, shareReplay, concat, from, timeout } from 'rxjs';
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
    private errorService: ErrorService,
    private integration:IntegrationService,private hybrid:HybridSearchService,private router:Router,private clipboard:Clipboard,private dialog:MatDialog
  ) {
  }

  file = input.required<HydrusBasicFile>();

  leaveViewer=output<void>();
  fullFile$ = toObservable(this.file).pipe(
    switchMap(f => (f.gallery_local?of(this.filesService.getGalleryFile(f.hash,f.file_id)!):this.filesService.getFileByHash(f.hash)).pipe(timeout(15000),catchError(()=>of(undefined)))),
    shareReplay({bufferSize:1,refCount:true})
  );
  comfy$=this.fullFile$.pipe(switchMap(full=>{
    const file=this.file(),metadata={...metadataOf({notes:full?.notes}),...file.gallery_metadata};
    delete metadata.notes;
    const asset:MediaRecord={id:file.gallery_path||'hydrus:'+file.hash,hash:file.hash,source:file.gallery_path||file.gallery_local?'comfy':'hydrus',name:file.gallery_name||file.hash.slice(0,12),metadata};
    const local=!!file.gallery_local||!!file.gallery_path,initial={asset,capabilities:comfyCapabilities(asset,local)};
    if(!initial.capabilities.available)return of(initial);
    return concat(of(initial),from(this.integration.request<any>('/library').then(({library})=>({asset,capabilities:comfyCapabilities(asset,local,library)})).catch(()=>initial)));
  }),shareReplay({bufferSize:1,refCount:true}));

  async related(scope:'lineage'|'prefix'|'snapshot'){
    const file=this.file();
    this.leaveViewer.emit();
    try{
      await this.hybrid.findRelated(file);
      this.hybrid.scopeLineage=scope==='lineage';this.hybrid.scopePrefix=scope==='prefix';this.hybrid.scopeSnapshot=scope==='snapshot';
      await this.router.navigate(['/'],{queryParams:{tags:JSON.stringify([])}});
    }catch(error){this.snackbar.open('Unable to open related images. Check the ComfyUI connection.','Close',{duration:5000});}
  }
  copyWorkflow(workflow:unknown){this.copy(JSON.stringify(workflow,null,2));}
  copy(text:string){this.snackbar.open(this.clipboard.copy(text)?'Copied to clipboard':'Could not copy to clipboard','Close',{duration:2500});}
  generationDetails(metadata:unknown){this.leaveViewer.emit();this.dialog.open(ComfyGenerationDialogComponent,{data:metadata,maxWidth:'95vw',width:'800px'});}

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
