import {
  Component,
  OnInit,
  Input,
  OnChanges,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Output,
  EventEmitter,
  HostListener,
  input,
  output,
  effect,
  model,
  computed
} from '@angular/core';
import { HydrusBasicFile, HydrusFile } from '../hydrus-file';
import { AppComponent } from '../app.component';
import { IPageInfo } from '@iharbeck/ngx-virtual-scroller';
import { PhotoswipeService } from '../photoswipe.service';
import { FileInfoSheetComponent } from '../file-info-sheet/file-info-sheet.component';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { HydrusFileDownloadService } from '../hydrus-file-download.service';
import { difference, union } from 'set-utilities';
import { HydrusFilesService } from '../hydrus-files.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { GENERIC_SELECTION_GROUP_ID, SelectionGroup } from '../selection-groups.service';
import { merge } from 'rxjs';

@Component({
  selector: 'app-image-list',
  templateUrl: './image-list.component.html',
  styleUrls: ['./image-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageListComponent implements OnInit, OnChanges, OnDestroy {

  private lastSelectionClick?: {
    fileID: number;
    wasSelected: boolean;
    timestamp: number;
  };

  private selectionDrag?: {
    pointerID: number;
    startIndex: number;
    lastIndex: number;
    shouldSelect: boolean;
    initialSelection: Set<number>;
    active: boolean;
  };

  private suppressClickUntil = 0;
  private touchHold?: {id:number; x:number; y:number; timer:ReturnType<typeof setTimeout>; held:boolean};
  @HostListener('document:pointermove', ['$event'])
  cancelMovedTouch(event:PointerEvent) {const hold=this.touchHold;if(hold&&hold.id===event.pointerId&&!hold.held&&Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>10){clearTimeout(hold.timer);this.touchHold=undefined;}}
  @HostListener('document:pointerup', ['$event'])
  @HostListener('document:pointercancel', ['$event'])
  finishTouch(event:PointerEvent) {const hold=this.touchHold;if(hold?.id===event.pointerId){clearTimeout(hold.timer);if(hold.held)this.suppressClickUntil=Date.now()+400;this.touchHold=undefined;}}


  //@Input() files: HydrusBasicFile[] = [];

  files = input.required<HydrusBasicFile[]>();
  requestMore=input<(()=>Promise<HydrusBasicFile[]>)|undefined>();
  hasMoreFiles=input<(()=>boolean)|undefined>();
  galleryActions=input<{label:string;icon:string;run:(file:HydrusBasicFile)=>void}[]>([]);



  //@Output() scrollEnd: EventEmitter<IPageInfo> = new EventEmitter();

  scrollEnd = output<IPageInfo>()


  selected = model<Set<number>>(new Set());

  selectionMode = input(false);

  selectionGroups = input<SelectionGroup[]>([]);

  activeSelectionGroupID = input(GENERIC_SELECTION_GROUP_ID);

  activeSelectionGroupIDs = input<Set<string>>(new Set([GENERIC_SELECTION_GROUP_ID]));

  activeSelectionColor = input('#3f51b5');

  activeSelectionGroupName = input('General selection');

  showSelectionGroups = input(true);

  anySelected = computed(() => this.selected().size > 0)

  selectionActive = computed(() => this.selectionMode() || this.anySelected())

  selectionChanges$ = merge(
    toObservable(this.files),
    toObservable(this.selected),
    toObservable(this.selectionGroups),
    toObservable(this.activeSelectionGroupID),
    toObservable(this.activeSelectionGroupIDs),
    toObservable(this.activeSelectionColor),
    toObservable(this.activeSelectionGroupName),
    toObservable(this.showSelectionGroups)
  )

  shiftSelect = output<number>()

  selectionActions = output<void>()

  constructor(
    public appComponent: AppComponent,
    public photoswipe: PhotoswipeService,
    public cdr: ChangeDetectorRef,
    private bottomSheet: MatBottomSheet,
    public downloadService: HydrusFileDownloadService
  ) {
  }

  scrollElement = this.appComponent.sidenavContent.getElementRef().nativeElement

  ngOnInit() {

  }

  ngOnChanges() {

  }

  vsEnd(event: IPageInfo) {
    if (!(event.endIndex !== this.files()?.length - 1)) {
      this.scrollEnd.emit(event);
    }
  }

  ngOnDestroy() {if(this.touchHold)clearTimeout(this.touchHold.timer);this.touchHold=undefined;}
  fileClick(event: MouseEvent, file: HydrusBasicFile) {
    if(this.touchHold){clearTimeout(this.touchHold.timer);if(this.touchHold.held)this.suppressClickUntil=Date.now()+400;this.touchHold=undefined;}
    event.preventDefault();
    if(Date.now() < this.suppressClickUntil) {
      event.stopPropagation();
      return;
    }
    if(event.shiftKey) {
      //this.selectToggle(file);
      this.shiftSelect.emit(file.file_id);
    } else if(event.ctrlKey) {
      this.selectToggle(file);
    } else if(this.selectionActive()) {
      if(event.detail > 1) {
        return;
      }
      if(event.detail === 1) {
        this.lastSelectionClick = {
          fileID: file.file_id,
          wasSelected: this.selected().has(file.file_id),
          timestamp: Date.now()
        };
      }
      this.selectToggle(file);
    } else {
      this.viewFile(file);
    }

  }

  viewFile(file: HydrusBasicFile) {
    this.photoswipe.openPhotoSwipe(this.files(), file.file_id, {
      isSelected: fileID => this.selected().has(fileID),
      toggle: selectedFile => this.selectToggle(selectedFile),
      selectedCount: () => this.selected().size,
      openActions: () => this.selectionActions.emit(),
      activeColor: () => this.activeSelectionColor(),
      activeGroupName: () => this.activeSelectionGroupName(),
      memberships: fileID => this.fileGroupMemberships(fileID),
      files:()=>this.files(),loadMore:this.requestMore(),hasMore:this.hasMoreFiles(),
      changes: this.selectionChanges$
    });
  }

  fileGroupMemberships(fileID: number) {
    if(!this.showSelectionGroups()) {
      return [];
    }

    return this.selectionGroups()
      .filter(group => group.id !== GENERIC_SELECTION_GROUP_ID && group.fileIDs.has(fileID));
  }

  selectionPointerDown(event: PointerEvent, file: HydrusBasicFile) {
    if(event.pointerType==='touch'&&!event.isPrimary){if(this.touchHold)clearTimeout(this.touchHold.timer);this.touchHold=undefined;return;}
    if(event.pointerType==='touch'&&!this.selectionActive()) {
      if(this.touchHold)clearTimeout(this.touchHold.timer);
      const hold={id:event.pointerId,x:event.clientX,y:event.clientY,held:false,timer:setTimeout(()=>{hold.held=true;this.selectToggle(file);this.suppressClickUntil=Date.now()+1500;this.cdr.markForCheck();},450)};
      this.touchHold=hold;return;
    }
    if(
      !this.selectionActive()
      || event.button !== 0
      || event.pointerType === 'touch'
      || event.ctrlKey
      || event.shiftKey
    ) {
      return;
    }

    const startIndex = this.files().findIndex(item => item.file_id === file.file_id);
    if(startIndex < 0) {
      return;
    }

    this.selectionDrag = {
      pointerID: event.pointerId,
      startIndex,
      lastIndex: startIndex,
      shouldSelect: !this.selected().has(file.file_id),
      initialSelection: new Set(this.selected()),
      active: false
    };
  }

  selectionPointerEnter(event: PointerEvent, file: HydrusBasicFile) {
    const drag = this.selectionDrag;
    const currentIndex = this.files().findIndex(item => item.file_id === file.file_id);
    if(
      !drag
      || drag.pointerID !== event.pointerId
      || (event.buttons & 1) === 0
      || currentIndex < 0
      || currentIndex === drag.lastIndex
    ) {
      return;
    }

    event.preventDefault();
    drag.active = true;
    drag.lastIndex = currentIndex;

    const rangeStart = Math.min(drag.startIndex, currentIndex);
    const rangeEnd = Math.max(drag.startIndex, currentIndex);
    const nextSelection = new Set(drag.initialSelection);
    this.files().slice(rangeStart, rangeEnd + 1).forEach(item => {
      if(drag.shouldSelect) {
        nextSelection.add(item.file_id);
      } else {
        nextSelection.delete(item.file_id);
      }
    });
    this.selected.set(nextSelection);
  }

  @HostListener('document:pointerup', ['$event'])
  @HostListener('document:pointercancel', ['$event'])
  endSelectionDrag(event: PointerEvent) {
    if(!this.selectionDrag || this.selectionDrag.pointerID !== event.pointerId) {
      return;
    }
    if(this.selectionDrag.active) {
      this.suppressClickUntil = Date.now() + 150;
    }
    this.selectionDrag = undefined;
  }

  fileDoubleClick(event: MouseEvent, file: HydrusBasicFile) {
    if(!this.selectionActive()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const previousClick = this.lastSelectionClick;
    this.lastSelectionClick = undefined;
    if(
      previousClick
      && previousClick.fileID === file.file_id
      && Date.now() - previousClick.timestamp < 750
      && this.selected().has(file.file_id) !== previousClick.wasSelected
    ) {
      this.selectToggle(file);
    }

    this.viewFile(file);
  }

  fileInfo(file: HydrusBasicFile, editTags = false) {
    FileInfoSheetComponent.open(this.bottomSheet, file, {editTags})
  }

  select(file: HydrusBasicFile) {
    this.selected.update(s => union(s, new Set([file.file_id])))
  }

  deselect(file: HydrusBasicFile) {
    this.selected.update(s => difference(s, new Set([file.file_id])))
  }

  selectToggle(file: HydrusBasicFile) {
    this.selected.update(s => {
      if (s.has(file.file_id)) {
        return difference(s, new Set([file.file_id]));
      } else {
        return union(s, new Set([file.file_id]));
      }
    })
  }



}
