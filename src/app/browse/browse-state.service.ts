import {HybridSearchService} from '../integration/hybrid-search.service';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, timeout, catchError, filter, forkJoin, map, of, ReplaySubject, shareReplay, switchMap, tap, withLatestFrom } from 'rxjs';
import { ErrorService } from '../error.service';
import { ALL_KNOWN_TAGS_SERVICE_KEY, ALL_MY_FILES_SERVICE_KEY } from '../hydrus-services';
import { defaultSort, HydrusSortType, SortInfo } from '../hydrus-sort';
import { HydrusSearchTag, HydrusSearchTags } from '../hydrus-tags';
import { SearchService } from '../search.service';
import { SettingsService } from '../settings.service';
import { LocalStorageService } from 'ngx-localstorage';
import { parseSelectionGroupSearchTag, SelectionGroupsService } from '../selection-groups.service';

const SEARCH_HISTORY_STORAGE_KEY = 'browseSearchHistoryV1';
const MAX_SEARCH_HISTORY_ENTRIES = 20;

export interface BrowseSearchHistoryEntry {
  tags: HydrusSearchTags;
  sort: SortInfo;
  tagServiceKey: string;
  fileServiceKey: string;
  searchedAt: number;
}

function cloneSearchTags(tags: HydrusSearchTags): HydrusSearchTags {
  return tags.map(tag => typeof tag === 'string' ? tag : cloneSearchTags(tag));
}

function containsSelectionGroupPredicate(searchTag: HydrusSearchTag): boolean {
  return typeof searchTag === 'string'
    ? parseSelectionGroupSearchTag(searchTag) !== undefined
    : searchTag.some(containsSelectionGroupPredicate);
}

function flattenSearchAlternatives(searchTag: HydrusSearchTag): string[] {
  return typeof searchTag === 'string'
    ? [searchTag]
    : searchTag.flatMap(flattenSearchAlternatives);
}

function isSearchTags(value: unknown): value is HydrusSearchTags {
  return Array.isArray(value) && value.every(tag => typeof tag === 'string' || isSearchTags(tag));
}

function isSearchHistoryEntry(value: unknown): value is BrowseSearchHistoryEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as BrowseSearchHistoryEntry;
  return isSearchTags(entry.tags)
    && !!entry.sort
    && typeof entry.sort.sortType === 'number'
    && HydrusSortType[entry.sort.sortType] !== undefined
    && typeof entry.sort.sortAsc === 'boolean'
    && typeof entry.tagServiceKey === 'string'
    && typeof entry.fileServiceKey === 'string'
    && typeof entry.searchedAt === 'number';
}

@Injectable({
  providedIn: 'root'
})
export class BrowseStateService {

  readonly tags$ = new BehaviorSubject<HydrusSearchTags>(this.settingsService.appSettings.browseDefaultSearchTags);
  readonly sort$ = new BehaviorSubject<SortInfo>(defaultSort);
  readonly searching$ = new BehaviorSubject(false);
  readonly tagServiceKey$ = new BehaviorSubject(ALL_KNOWN_TAGS_SERVICE_KEY);
  readonly fileServiceKey$ = new BehaviorSubject(ALL_MY_FILES_SERVICE_KEY);
  readonly searchHistory$ = new BehaviorSubject<BrowseSearchHistoryEntry[]>(this.loadSearchHistory());

  private readonly refreshTrigger$ = new ReplaySubject<void>(1);
  private searchStarted = false;

  readonly currentSearch$ = this.refreshTrigger$.pipe(
    withLatestFrom(this.tags$, this.sort$, this.tagServiceKey$, this.fileServiceKey$),
    filter(([, searchTags]) => this.settingsService.appSettings.browseSearchWhenEmpty || searchTags.length > 0),
    tap(([, tags, sort, tagServiceKey, fileServiceKey]) => {
      this.searching$.next(true);
      this.recordSearch({tags, sort, tagServiceKey, fileServiceKey});
    }),
    switchMap(([, searchTags, sort, tagService, fileService]) => this.searchFiles(
      searchTags,
      {
        file_sort_type: sort.sortType,
        file_sort_asc: sort.sortAsc,
        tag_service_key: tagService,
        file_service_key: fileService
      }
    ).pipe(
      catchError(error => {
        this.errorService.handleHydrusError(error, 'Error searching');
        return of([]);
      })
    )),
    tap(() => this.searching$.next(false)),
    // Keep the last result and the search subscription alive while Browse is not routed.
    shareReplay({bufferSize: 1, refCount: false})
  );

  readonly searchTotal$ = this.currentSearch$.pipe(
    map(search => search.length)
  );

  constructor(
    private searchService: SearchService,
    private settingsService: SettingsService,
    private errorService: ErrorService,
    private localStorage: LocalStorageService,
    private selectionGroups: SelectionGroupsService,
    private hybrid:HybridSearchService
  ) { }

  refresh() {
    this.searchStarted = true;
    this.refreshTrigger$.next();
  }

  refreshIfStarted() {
    if (this.searchStarted) {
      this.refreshTrigger$.next();
    }
  }

  ensureInitialSearch() {
    if (!this.searchStarted && this.settingsService.appSettings.browseSearchOnLoad) {
      this.refresh();
    }
  }

  restoreSearch(entry: BrowseSearchHistoryEntry) {
    this.tags$.next(cloneSearchTags(entry.tags));
    this.sort$.next({...entry.sort});
    this.tagServiceKey$.next(entry.tagServiceKey);
    this.fileServiceKey$.next(entry.fileServiceKey);
    this.refresh();
  }

  clearSearchHistory() {
    this.searchHistory$.next([]);
    this.localStorage.remove(SEARCH_HISTORY_STORAGE_KEY);
  }

  private searchFiles(searchTags:HydrusSearchTags,options:Parameters<SearchService['searchFiles']>[1]){
    return this.hybrid.enabled()?this.hybrid.search(searchTags,tags=>firstValueFrom(this.searchHydrusFiles(tags,options).pipe(timeout(15000)))):this.searchHydrusFiles(searchTags,options);
  }
  private searchHydrusFiles(
    searchTags: HydrusSearchTags,
    options: Parameters<SearchService['searchFiles']>[1]
  ) {
    const selectionClauses = searchTags.filter(containsSelectionGroupPredicate);
    if(selectionClauses.length === 0) {
      return this.searchService.searchFiles(searchTags, options);
    }

    const remoteBaseTags = searchTags.filter(searchTag => !containsSelectionGroupPredicate(searchTag));
    return this.searchService.searchFiles(remoteBaseTags, options).pipe(
      switchMap(baseFileIDs => {
        const groupsByID = new Map(this.selectionGroups.groups().map(group => [group.id, group]));
        const clauseMatches = selectionClauses.map(clause => {
          const alternatives = flattenSearchAlternatives(clause);
          const localPredicates = alternatives
            .map(parseSelectionGroupSearchTag)
            .filter(predicate => predicate !== undefined);
          const remoteAlternatives = alternatives
            .filter(alternative => parseSelectionGroupSearchTag(alternative) === undefined);
          const localMatches = new Set(baseFileIDs.filter(fileID => localPredicates.some(predicate => {
            const isMember = groupsByID.get(predicate.groupID)?.fileIDs.has(fileID) ?? false;
            return predicate.excluded ? !isMember : isMember;
          })));

          if(remoteAlternatives.length === 0) {
            return of(localMatches);
          }

          const remoteClause: HydrusSearchTag = remoteAlternatives.length === 1
            ? remoteAlternatives[0]
            : remoteAlternatives;
          return this.searchService.searchFiles([...remoteBaseTags, remoteClause], options).pipe(
            map(remoteMatches => new Set([...localMatches, ...remoteMatches]))
          );
        });

        return forkJoin(clauseMatches).pipe(
          map(matches => baseFileIDs.filter(fileID => matches.every(clause => clause.has(fileID))))
        );
      })
    );
  }

  private loadSearchHistory() {
    const stored = this.localStorage.get(SEARCH_HISTORY_STORAGE_KEY);
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored.filter(isSearchHistoryEntry).slice(0, MAX_SEARCH_HISTORY_ENTRIES);
  }

  private recordSearch(search: Omit<BrowseSearchHistoryEntry, 'searchedAt'>) {
    const entry: BrowseSearchHistoryEntry = {
      tags: cloneSearchTags(search.tags),
      sort: {...search.sort},
      tagServiceKey: search.tagServiceKey,
      fileServiceKey: search.fileServiceKey,
      searchedAt: Date.now()
    };
    const entryKey = this.searchHistoryEntryKey(entry);
    const history = [
      entry,
      ...this.searchHistory$.value.filter(existing => this.searchHistoryEntryKey(existing) !== entryKey)
    ].slice(0, MAX_SEARCH_HISTORY_ENTRIES);

    this.searchHistory$.next(history);
    this.localStorage.set(SEARCH_HISTORY_STORAGE_KEY, history);
  }

  private searchHistoryEntryKey(entry: BrowseSearchHistoryEntry) {
    return JSON.stringify({
      tags: entry.tags,
      sort: entry.sort,
      tagServiceKey: entry.tagServiceKey,
      fileServiceKey: entry.fileServiceKey
    });
  }
}
