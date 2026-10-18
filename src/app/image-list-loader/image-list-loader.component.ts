import { Component, OnInit, ChangeDetectionStrategy, OnChanges, input, signal, computed, output, effect } from '@angular/core';
import { HydrusFilesService } from '../hydrus-files.service';
import { HydrusBasicFile } from '../hydrus-file';
import { IPageInfo } from '@iharbeck/ngx-virtual-scroller';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ErrorService } from '../error.service';
import { first, firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { ServiceSelectDialogComponent } from '../service-select-dialog/service-select-dialog.component';
import { getLocalTagServices } from '../hydrus-services';
import { TagInputDialogComponent } from '../tag-input-dialog/tag-input-dialog.component';
import { HydrusTagsService } from '../hydrus-tags.service';
import { union } from 'set-utilities';
import { HydrusVersionService } from '../hydrus-version.service';
import { HydrusFileDownloadService } from '../hydrus-file-download.service';
import { MatMenuTrigger } from '@angular/material/menu';
import { GENERIC_SELECTION_GROUP_ID, SelectionGroup, SelectionGroupsService } from '../selection-groups.service';
import { SelectionGroupDialogComponent } from '../selection-group-dialog/selection-group-dialog.component';

@Component({
  selector: 'app-image-list-loader',
  templateUrl: './image-list-loader.component.html',
  styleUrls: ['./image-list-loader.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageListLoaderComponent implements OnInit, OnChanges {

  //@Input() fileIDs: number[] = [];

  fileIDs = input.required<number[]>();

  //@Input() loadAtOnce = 256;

  loadAtOnce = input(256);
  galleryActions=input<{label:string;icon:string;run:(file:HydrusBasicFile)=>void}[]>([]);
  gallerySelection=output<Set<number>>();
  providedMore=input<(()=>Promise<HydrusBasicFile[]>)|undefined>();
  providedFiles = input<HydrusBasicFile[]|null>(null);
  moreAvailable = input(false);
  loadMore = output<void>();
  hasLocalSelection = computed(()=>Array.from(this.selected()).some(id=>id<0));

  //loading = false;

  loading = signal(false);

  //currentFiles: HydrusBasicFile[] = [];

  currentFiles = signal<HydrusBasicFile[]>([]);

  selected = computed(() => this.selectionGroups.activeFileIDs());

  activeSelectionGroupName = computed(() => {
    const groups = this.selectionGroups.activeGroups();
    return groups.length === 1 ? groups[0].name : `${groups.length} active groups`;
  });

  selectionMode = signal(false);

  selectionShelfCollapsed = signal(false);

  numSelected = computed(() => this.selected().size)

  anySelected = computed(() => this.numSelected() > 0)

  selectionActive = computed(() => this.selectionMode() || this.anySelected())

  constructor(
    public filesService: HydrusFilesService,
    private snackbar: MatSnackBar,
    private dialog: MatDialog,
    private errorService: ErrorService,
    private tagsService: HydrusTagsService,
    private versionService: HydrusVersionService,
    private downloadService: HydrusFileDownloadService,
    public selectionGroups: SelectionGroupsService
  ) {

  }

  private reportSelection=effect(()=>{this.providedFiles();this.gallerySelection.emit(this.selected());});
  ngOnInit(): void {

  }

  private metadataRevision=0;
  ngOnChanges() {
    this.metadataRevision++;this.loading.set(false);
    if(this.providedFiles()!==null){this.currentFiles.set(this.providedFiles()!);return;}
    this.currentFiles.set([]);
    this.fetchMore();
  }

  listScrollEnd(event: IPageInfo) {
    if(this.providedFiles()!==null){if(this.moreAvailable())this.loadMore.emit();return;}
    if (!((event.endIndex + 1 >= this.fileIDs().length) || this.loading())) {
      this.fetchMore();
    }
  }

  async fetchMore() {
    if(this.loading())return;
    const revision=this.metadataRevision;this.loading.set(true);
    try{const files=await firstValueFrom(this.filesService.getFileMetadata(this.fileIDs().slice(this.currentFiles().length,this.currentFiles().length+this.loadAtOnce())));
      if(revision===this.metadataRevision)this.currentFiles.set(this.currentFiles().concat(files));
    }catch(error){if(revision===this.metadataRevision)this.errorService.handleHydrusError(error);}
    finally{if(revision===this.metadataRevision)this.loading.set(false);}
  }
  viewerMore=async()=>{if(this.providedFiles()!==null){return await this.providedMore()?.()||this.currentFiles();}await this.fetchMore();return this.currentFiles();};
  viewerHasMore=()=>this.providedFiles()!==null?this.moreAvailable():this.currentFiles().length<this.fileIDs().length;

  resetViewSelection(){this.selectionMode.set(false);this.selectionGroups.setActiveGroup(GENERIC_SELECTION_GROUP_ID);this.selectionGroups.setActiveFiles(new Set());}
  deselectAll() {
    this.selectionGroups.setActiveFiles(new Set())
    this.selectionMode.set(false)
  }

  selectAll() {
    this.selectionMode.set(true)
    this.selectionGroups.setActiveFiles(new Set(this.fileIDs()))
  }

  selectionButtonClick(event: MouseEvent, menuTrigger: MatMenuTrigger) {
    event.stopPropagation();
    if(this.selectionActive()) {
      this.openSelectionMenu(menuTrigger);
    } else {
      this.selectionMode.set(true);
    }
  }

  openSelectionMenu(menuTrigger: MatMenuTrigger) {
    this.selectionMode.set(true);
    menuTrigger.openMenu();
  }

  select(ids: number[]) {
    this.selectionMode.set(true)
    this.selectionGroups.setActiveFiles(union(this.selected(), new Set(ids)))
  }

  selectionChanged(selected: Set<number>) {
    this.selectionGroups.setActiveFiles(selected);
    if(selected.size > 0) {
      this.selectionMode.set(true);
    }
  }

  activateSelectionGroup(groupID: string) {
    if(this.selectionGroups.setActiveGroup(groupID)) {
      this.selectionMode.set(true);
    }
  }

  toggleSelectionGroup(groupID: string) {
    if(this.selectionGroups.toggleActiveGroup(groupID)) {
      this.selectionMode.set(true);
    }
  }

  createSelectionGroup() {
    this.selectionGroups.createGroup();
    this.selectionMode.set(true);
    this.selectionShelfCollapsed.set(false);
  }

  clearSelectionGroup(group: SelectionGroup) {
    this.selectionGroups.clearGroup(group.id);
    this.selectionMode.set(true);
  }

  async editSelectionGroup(group: SelectionGroup) {
    const dialogResult = await firstValueFrom(SelectionGroupDialogComponent.open(this.dialog, {
      name: group.name,
      color: group.color,
      downloadDirectory: group.downloadDirectory
    }).afterClosed());
    if(dialogResult) {
      this.selectionGroups.updateGroup(group.id, dialogResult);
    }
  }

  async deleteSelectionGroup(group: SelectionGroup) {
    if(this.selectionGroups.isGenericGroup(group.id)) {
      return;
    }
    if(group.fileIDs.size > 0 && !await ConfirmDialogComponent.confirmPromise(this.dialog, {
      title: `Delete ${group.name}?`,
      description: `This removes the group and its ${group.fileIDs.size} selected file${group.fileIDs.size === 1 ? '' : 's'}. It does not delete any files.`,
      confirmText: 'Delete group'
    })) {
      return;
    }
    this.selectionGroups.deleteGroup(group.id);
    this.selectionMode.set(true);
  }

  selectionGroupTooltip(group: SelectionGroup) {
    if(this.selectionGroups.isGenericGroup(group.id)) {
      return this.selectionGroups.groupModeActive()
        ? 'Turn named selection groups off and use General selection'
        : 'Named selection groups are off';
    }
    return this.selectionGroups.activeGroupIDs().has(group.id)
      ? `Stop applying new selections to ${group.name}`
      : `Also apply new selections to ${group.name}`;
  }

  // shiftSelect(id: number) {
  //   console.log(id);
  //   if (this.numSelected() < 1) {
  //     this.select([id]);
  //   } else {
  //     const currIndex = this.fileIDs().indexOf(id);
  //     const selectedIndicies = Array.from(this.selected()).map(id => this.fileIDs().indexOf(id));
  //     selectedIndicies.sort();
  //     let toSelect: number[];
  //     if (selectedIndicies[0] > currIndex) {
  //       // select from current to first selected
  //       toSelect = this.fileIDs().slice(currIndex, selectedIndicies[0]);
  //     } else if (selectedIndicies[selectedIndicies.length - 1] < currIndex) {
  //       // select from last selected to current
  //       toSelect = this.fileIDs().slice(selectedIndicies[selectedIndicies.length - 1] + 1, currIndex + 1);
  //     } else {
  //       const firstIndexAfterSelected = selectedIndicies.findIndex((v) => v > currIndex);
  //       const indexToSelectFrom = firstIndexAfterSelected - 1;
  //       toSelect = this.fileIDs().slice(selectedIndicies[indexToSelectFrom] + 1, currIndex + 1);
  //       // select from last selected that's before current to current
  //     }
  //     this.select(toSelect);
  //   }
  // }

  shiftSelect(id: number) {
    if (this.numSelected() < 1) {
      this.select([id]);
    } else {
      const currIndex = this.fileIDs().indexOf(id);
      const selectedIndicies = Array.from(this.selected()).map(id => this.fileIDs().indexOf(id));
      selectedIndicies.sort();
      let toSelect: number[];
      if (selectedIndicies[0] > currIndex) {
        // select from current to first selected
        toSelect = this.fileIDs().slice(currIndex, selectedIndicies[0]);
      } else {
        // select from first selected to current
        toSelect = this.fileIDs().slice(selectedIndicies[0] + 1, currIndex + 1);
      }
      this.select(toSelect);
    }
  }

  async archiveSelected() {
    if (!await ConfirmDialogComponent.confirmPromise(this.dialog, {
      title: 'Archive selected files?',
      description: `This will attempt to archive ${this.numSelected()} files. Any that are already archived will not be changed.`,
    })) return;

    try {
      await firstValueFrom(this.filesService.archiveFiles(Array.from(this.selected())));
      this.snackbar.open(`${this.numSelected()} files archived`, undefined, {
        duration: 2000
      });
    } catch (error) {
      this.errorService.handleHydrusError(error);
    }
  }

  async downloadSelected() {
    try {
      const selectedIDs = Array.from(this.selected());
      const activeGroups = this.selectionGroups.activeGroups().filter(group => group.fileIDs.size > 0);
      const usesGroupDirectories = activeGroups.length > 1
        || activeGroups.some(group => group.downloadDirectory.length > 0);
      const needsDirectoryPicker = selectedIDs.length > 1 || usesGroupDirectories;
      const directory = needsDirectoryPicker
        ? await this.downloadService.chooseDownloadDirectory()
        : undefined;
      if (directory === null) {
        return;
      }

      const files = await firstValueFrom(this.filesService.getFileMetadata(selectedIDs));
      if(!directory || !usesGroupDirectories) {
        await this.downloadService.saveFiles(files, directory, !needsDirectoryPicker);
        return;
      }

      const filesByID = new Map(files.map(file => [file.file_id, file]));
      const fileIDsByDirectory = new Map<string, Set<number>>();
      activeGroups.forEach(group => {
        const directoryFileIDs = fileIDsByDirectory.get(group.downloadDirectory) ?? new Set<number>();
        group.fileIDs.forEach(fileID => directoryFileIDs.add(fileID));
        fileIDsByDirectory.set(group.downloadDirectory, directoryFileIDs);
      });

      for(const [relativeDirectory, fileIDs] of fileIDsByDirectory) {
        const targetDirectory = await this.downloadService.resolveDownloadDirectory(directory, relativeDirectory);
        const batch = Array.from(fileIDs)
          .map(fileID => filesByID.get(fileID))
          .filter((file): file is HydrusBasicFile => Boolean(file));
        await this.downloadService.saveFiles(batch, targetDirectory);
      }
    } catch (error) {
      this.errorService.handleHydrusError(error, 'Error downloading selected files');
    }
  }

  async inboxSelected() {
    if (!await ConfirmDialogComponent.confirmPromise(this.dialog, {
      title: 'Inbox selected files?',
      description: `This will attempt to re-inbox ${this.numSelected()} files. Any that are already in the inbox will not be changed.`,
    })) return;

    try {
      await firstValueFrom(this.filesService.unarchiveFiles(Array.from(this.selected())));
      this.snackbar.open(`${this.numSelected()} files moved to inbox`, undefined, {
        duration: 2000
      });
    } catch (error) {
      this.errorService.handleHydrusError(error);
    }
  }

  async deleteSelected() {
    if (!await ConfirmDialogComponent.confirmPromise(this.dialog, {
      title: 'Delete selected files?',
      description: `This will attempt to delete ${this.numSelected()} files. Any that are already in the trash will not be changed.`,
    })) return;

    try {
      await firstValueFrom(this.filesService.deleteFiles(Array.from(this.selected())));
      this.snackbar.open(`${this.numSelected()} files sent to trash`, undefined, {
        duration: 2000
      });
    } catch (error) {
      this.errorService.handleHydrusError(error);
    }
  }

  async undeleteSelected() {
    if (!await ConfirmDialogComponent.confirmPromise(this.dialog, {
      title: 'Undelete selected files?',
      description: `This will attempt to undelete ${this.numSelected()} files. Any that are not in the trash will not be changed.`,
    })) return;

    try {
      await firstValueFrom(this.filesService.undeleteFiles(Array.from(this.selected())));
      this.snackbar.open(`${this.numSelected()} files removed from trash`, undefined, {
        duration: 2000
      });
    } catch (error) {
      this.errorService.handleHydrusError(error);
    }
  }

  async addTagsToSelected() {
    try {
      const serviceDialog = ServiceSelectDialogComponent.open(this.dialog, {serviceFilter: (services) => getLocalTagServices(services)})
      const service = await firstValueFrom(serviceDialog.afterClosed())
      if(!service) {
        return;
      }
      const tagsDialog = TagInputDialogComponent.open(this.dialog, {
        displayType: 'display',
        enableOrSearch: false,
        enableSystemPredicates: false,
        title: `Add tags to ${service.name} for ${this.numSelected()} files`,
        submitButtonText: 'Add',
      })
      const dialogResult = await firstValueFrom(tagsDialog.afterClosed());
      if (dialogResult) {
        const tags = dialogResult.flat() as string[];
        await firstValueFrom(this.tagsService.addTagsToServiceFileIDs(Array.from(this.selected()), tags, service.service_key));
        this.snackbar.open(`Tag${tags.length === 1 ? '' : 's'} added to ${this.numSelected()} files`, undefined, {
          duration: 2000
        });
      }
    } catch (error) {
      this.errorService.handleHydrusError(error);
    }
  }


  async removeTags() {
    try {
      const serviceDialog = ServiceSelectDialogComponent.open(this.dialog, {serviceFilter: (services) => getLocalTagServices(services)})
      const service = await firstValueFrom(serviceDialog.afterClosed());
      if(!service) {
        return;
      }
      const tagsDialog = TagInputDialogComponent.open(this.dialog, {
        displayType: 'display',
        enableOrSearch: false,
        enableSystemPredicates: false,
        title: `Remove tags from ${service.name} for ${this.numSelected()} files`,
        submitButtonText: 'Remove',
      })
      const dialogResult = await firstValueFrom(tagsDialog.afterClosed());
      if (dialogResult) {
        // the ability to disable creating new deleted mappings for tags that weren't on the file to begin with was added in hydrus v580
        if (!await firstValueFrom(this.versionService.isAtLeastVersion(580)) && !await ConfirmDialogComponent.confirmPromise(this.dialog, {
          title: 'Delete tags from selected files?',
          description: `This will attempt to delete the selected tags from ${this.numSelected()} files. A deletion record will be created for the tags on all selected files, including those that do not currently have the tags.`,
        })) return;
        const tags = dialogResult.flat() as string[];
        await firstValueFrom(this.tagsService.deleteTagsFromLocalServiceFileIDs(Array.from(this.selected()), tags, service.service_key));
        this.snackbar.open(`Tag${tags.length === 1 ? '' : 's'} removed from ${this.numSelected()} files`, undefined, {
          duration: 2000
        });
      }
    } catch (error) {
      this.errorService.handleHydrusError(error);
    }

  }

}
