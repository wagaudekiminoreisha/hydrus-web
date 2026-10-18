import {HydrusBasicFile} from '../hydrus-file';
import {HybridSearchService} from '../integration/hybrid-search.service';
import { Component, OnInit, AfterViewInit, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { combineLatest, firstValueFrom, map } from 'rxjs';
import { UntilDestroy } from '@ngneat/until-destroy';
import { defaultSort, displaySortGroups, HydrusSortType, isDisplaySortMetaTypeGroup, isDisplaySortType, SortInfo, sortToString } from '../hydrus-sort';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { getTagServices, isNonDeletedFileService } from '../hydrus-services';
import { ServiceSelectDialogComponent } from '../service-select-dialog/service-select-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { HydrusServicesService } from '../hydrus-services.service';
import { BrowseSearchHistoryEntry, BrowseStateService } from './browse-state.service';
import { HydrusSearchTag } from '../hydrus-tags';
import { parseSelectionGroupSearchTag, SelectionGroupsService } from '../selection-groups.service';

@UntilDestroy()
@Component({
  selector: 'app-browse',
  templateUrl: './browse.component.html',
  styleUrls: ['./browse.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowseComponent implements OnInit, AfterViewInit, OnDestroy {

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private hydrusServices: HydrusServicesService,
    private browseState: BrowseStateService,
    private selectionGroups: SelectionGroupsService,
    public hybrid:HybridSearchService
    ) {
  }

  tagsFormControl = new FormControl(this.browseState.tags$.value, {nonNullable: true});

  sort$ = this.browseState.sort$;
  searching$ = this.browseState.searching$;
  tagServiceKey$ = this.browseState.tagServiceKey$;
  fileServiceKey$ = this.browseState.fileServiceKey$;

  tagService$ = combineLatest([this.tagServiceKey$, this.hydrusServices.hydrusServicesArray$]).pipe(
    map(([serviceKey, services]) => services.find(s => s.service_key === serviceKey))
  )

  fileService$ = combineLatest([this.fileServiceKey$, this.hydrusServices.hydrusServicesArray$]).pipe(
    map(([serviceKey, services]) => services.find(s => s.service_key === serviceKey))
  )

  displaySortGroups = displaySortGroups;
  isDisplaySortMetaTypeGroup = isDisplaySortMetaTypeGroup;
  isDisplaySortType = isDisplaySortType;
  sortToString = sortToString;
  defaultSort = defaultSort;

  currentSearch$ = this.browseState.currentSearch$;
  searchTotal$ = this.browseState.searchTotal$;
  searchHistory$ = this.browseState.searchHistory$;

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      if (params.has('tags')) {
        this.tagsFormControl.setValue(JSON.parse(params.get('tags')))
        this.refresh();
        this.router.navigate(['/'], { replaceUrl: true });
      } else if (params.has('addTags')) {
        this.tagsFormControl.setValue([...this.tagsFormControl.value, ...JSON.parse(params.get('addTags'))])
        this.refresh();
        this.router.navigate(['/'], { replaceUrl: true });
      }
    });
  }


  ngAfterViewInit() {
    this.browseState.ensureInitialSearch();
  }

  tagsSub = this.tagsFormControl.valueChanges.subscribe(tags => this.browseState.tags$.next(tags));

  ngOnDestroy() {
    this.tagsSub.unsubscribe();
  }

  setSortInfo(sort: SortInfo) {
    this.sort$.next(sort);
    this.browseState.refreshIfStarted();
  }

  galleryActions=[{label:'Related images',icon:'account_tree',run:(file:HydrusBasicFile)=>void this.relatedSearch(file)}];
  async relatedSearch(file:HydrusBasicFile){await this.hybrid.findRelated(file);this.tagsFormControl.setValue([]);this.refresh();}
  clearRelated(){this.hybrid.related.set(undefined);this.refresh();}
  toggleHybrid(){this.hybrid.setEnabled(!this.hybrid.enabled());this.refresh();}

  refresh() {
    this.browseState.refresh();
  }

  restoreSearch(entry: BrowseSearchHistoryEntry) {
    this.browseState.restoreSearch(entry);
    this.tagsFormControl.setValue(this.browseState.tags$.value, {emitEvent: false});
  }

  clearSearchHistory() {
    this.browseState.clearSearchHistory();
  }

  searchHistoryLabel(entry: BrowseSearchHistoryEntry) {
    const tags = entry.tags.length > 0
      ? entry.tags.map(tag => this.searchTagLabel(tag)).join(' AND ')
      : 'All files';
    return `${tags} · ${sortToString(entry.sort)}`;
  }

  private searchTagLabel(tag: HydrusSearchTag): string {
    if(typeof tag !== 'string') {
      return `(${tag.map(nestedTag => this.searchTagLabel(nestedTag)).join(' OR ')})`;
    }
    const selectionGroupPredicate = parseSelectionGroupSearchTag(tag);
    if(!selectionGroupPredicate) {
      return tag;
    }
    const groupName = this.selectionGroups.groups()
      .find(group => group.id === selectionGroupPredicate.groupID)?.name
      ?? 'Deleted selection group';
    return `${selectionGroupPredicate.excluded ? 'NOT ' : ''}Selection group: ${groupName}`;
  }

  setSort(sortType: HydrusSortType, sortAsc: boolean) {
    this.setSortInfo({sortType, sortAsc});
  }
  resetSort() {
    this.setSortInfo(defaultSort);
  }

  async tagServiceDialog() {
    const serviceDialog = ServiceSelectDialogComponent.open(this.dialog, {serviceFilter: (services) => getTagServices(services)})
    const service = await firstValueFrom(serviceDialog.afterClosed())
    if(!service) {
      return;
    }
    this.tagServiceKey$.next(service.service_key);
    this.browseState.refreshIfStarted();
  }

  async fileServiceDialog() {
    const serviceDialog = ServiceSelectDialogComponent.open(this.dialog, {serviceFilter: (services) => services.filter(isNonDeletedFileService)})
    const service = await firstValueFrom(serviceDialog.afterClosed())
    if(!service) {
      return;
    }
    this.fileServiceKey$.next(service.service_key);
    this.browseState.refreshIfStarted();
  }

}
