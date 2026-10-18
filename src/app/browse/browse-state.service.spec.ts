import {HybridSearchService} from '../integration/hybrid-search.service';
import { of } from 'rxjs';
import { ErrorService } from '../error.service';
import { SearchService } from '../search.service';
import { defaultAppSettings } from '../settings';
import { SettingsService } from '../settings.service';
import { BrowseSearchHistoryEntry, BrowseStateService } from './browse-state.service';
import { LocalStorageService } from 'ngx-localstorage';
import { HydrusSortType } from '../hydrus-sort';
import { selectionGroupSearchTag, SelectionGroupsService } from '../selection-groups.service';

describe('BrowseStateService', () => {
  let searchFiles: jasmine.Spy;
  let state: BrowseStateService;
  let localStorage: jasmine.SpyObj<LocalStorageService>;
  let selectionGroups: SelectionGroupsService;

  beforeEach(() => {
    searchFiles = jasmine.createSpy('searchFiles').and.returnValue(of([10, 20]));
    const searchService = {searchFiles} as unknown as SearchService;

    const settingsService = {
      appSettings: {
        ...defaultAppSettings,
        browseSearchOnLoad: true
      }
    } as SettingsService;
    const errorService = jasmine.createSpyObj<ErrorService>('ErrorService', ['handleHydrusError']);
    localStorage = jasmine.createSpyObj<LocalStorageService>('LocalStorageService', ['get', 'set', 'remove']);
    localStorage.get.and.returnValue(null);
    selectionGroups = {
      groups: () => [{
        id: 'selection-group-1',
        name: 'Group 1',
        color: '#3f51b5',
        downloadDirectory: '',
        fileIDs: new Set([20])
      }]
    } as unknown as SelectionGroupsService;

    state = new BrowseStateService(searchService, settingsService, errorService, localStorage, selectionGroups, {enabled:()=>false} as unknown as HybridSearchService);
  });

  it('replays a completed search without running it again when Browse resubscribes', () => {
    const firstResults: number[][] = [];
    const firstSubscription = state.currentSearch$.subscribe(result => firstResults.push(result));

    state.ensureInitialSearch();
    firstSubscription.unsubscribe();

    const returnedResults: number[][] = [];
    state.currentSearch$.subscribe(result => returnedResults.push(result));

    expect(searchFiles).toHaveBeenCalledTimes(1);
    expect(firstResults).toEqual([[10, 20]]);
    expect(returnedResults).toEqual([[10, 20]]);
  });

  it('does not lose a submitted search before the Browse view subscribes', () => {
    state.tags$.next(['series:test']);
    state.refresh();

    state.currentSearch$.subscribe();

    expect(searchFiles).toHaveBeenCalledTimes(1);
    expect(searchFiles.calls.mostRecent().args[0]).toEqual(['series:test']);
  });

  it('waits for an explicit refresh after tags are edited', () => {
    const subscription = state.currentSearch$.subscribe();
    state.ensureInitialSearch();
    subscription.unsubscribe();

    state.tags$.next(['series:test']);

    expect(searchFiles).toHaveBeenCalledTimes(1);

    state.refresh();

    expect(searchFiles).toHaveBeenCalledTimes(2);
    expect(searchFiles.calls.mostRecent().args[0]).toEqual(['series:test']);
  });

  it('persists recent searches and deduplicates repeated searches', () => {
    state.currentSearch$.subscribe();
    state.ensureInitialSearch();
    state.tags$.next(['series:test']);
    state.refresh();

    expect(state.searchHistory$.value.length).toBe(2);
    expect(state.searchHistory$.value[0].tags[0] as string).toBe('series:test');
    expect(localStorage.set).toHaveBeenCalled();
  });

  it('restores a complete history entry with one new search', () => {
    state.currentSearch$.subscribe();
    state.ensureInitialSearch();
    searchFiles.calls.reset();
    const entry: BrowseSearchHistoryEntry = {
      tags: [['character:alice', 'character:bob']],
      sort: {sortType: HydrusSortType.FileSize, sortAsc: true},
      tagServiceKey: 'tag-service',
      fileServiceKey: 'file-service',
      searchedAt: 123
    };

    state.restoreSearch(entry);

    expect(searchFiles).toHaveBeenCalledTimes(1);
    expect(state.tags$.value).toEqual(entry.tags);
    expect(state.sort$.value).toEqual(entry.sort);
    expect(state.tagServiceKey$.value).toBe('tag-service');
    expect(state.fileServiceKey$.value).toBe('file-service');
  });

  it('clears persisted search history', () => {
    state.currentSearch$.subscribe();
    state.ensureInitialSearch();

    state.clearSearchHistory();

    expect(state.searchHistory$.value).toEqual([]);
    expect(localStorage.remove).toHaveBeenCalledWith('browseSearchHistoryV1');
  });

  it('filters Hydrus results by a selection group without sending the predicate to the API', () => {
    searchFiles.and.returnValue(of([10, 20, 30]));
    const results: number[][] = [];
    state.currentSearch$.subscribe(result => results.push(result));
    state.tags$.next([selectionGroupSearchTag('selection-group-1')]);

    state.refresh();

    expect(searchFiles).toHaveBeenCalledOnceWith([], jasmine.any(Object));
    expect(results).toEqual([[20]]);
  });

  it('supports a tag or selection-group OR clause', () => {
    searchFiles.and.returnValues(of([10, 20, 30]), of([10]));
    const results: number[][] = [];
    state.currentSearch$.subscribe(result => results.push(result));
    state.tags$.next([[selectionGroupSearchTag('selection-group-1'), 'series:test']]);

    state.refresh();

    expect(searchFiles.calls.argsFor(0)[0]).toEqual([]);
    expect(searchFiles.calls.argsFor(1)[0]).toEqual(['series:test']);
    expect(results).toEqual([[10, 20]]);
  });

  it('supports excluding a selection group with a minus predicate', () => {
    searchFiles.and.returnValue(of([10, 20, 30]));
    const results: number[][] = [];
    state.currentSearch$.subscribe(result => results.push(result));
    state.tags$.next(['-' + selectionGroupSearchTag('selection-group-1')]);

    state.refresh();

    expect(results).toEqual([[10, 30]]);
  });
});
