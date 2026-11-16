import { ElementRef } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatAutocompleteSelectedEvent, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { HydrusFilesService } from '../hydrus-files.service';
import { HydrusRatingsService } from '../hydrus-ratings.service';
import { HydrusTagsService } from '../hydrus-tags.service';
import { SettingsService } from '../settings.service';
import { TagInputDialogComponent } from '../tag-input-dialog/tag-input-dialog.component';
import { TagInputComponent } from './tag-input.component';
import {
  parseSelectionGroupSearchTag,
  selectionGroupSearchTag,
  SelectionGroupsService
} from '../selection-groups.service';

describe('TagInputComponent', () => {
  let component: TagInputComponent;
  let inputElement: HTMLInputElement;
  let autocompleteTrigger: jasmine.SpyObj<MatAutocompleteTrigger>;
  let tagsService: jasmine.SpyObj<HydrusTagsService>;
  let selectionGroups: SelectionGroupsService;

  beforeEach(() => {
    tagsService = jasmine.createSpyObj<HydrusTagsService>(
      'HydrusTagsService',
      ['searchTags'],
      {canGetSiblingsParents$: of(false)}
    );
    tagsService.searchTags.and.returnValue(of([{value: 'series:test', count: 1}]));
    const settingsService = {appSettings: {favoriteTags: []}} as SettingsService;
    selectionGroups = {
      groups: () => [{
        id: 'selection-group-1',
        name: 'Later downloads',
        color: '#e91e63',
        downloadDirectory: '',
        fileIDs: new Set([10, 20])
      }]
    } as unknown as SelectionGroupsService;

    component = TestBed.runInInjectionContext(() => new TagInputComponent(
      null,
      {} as HydrusFilesService,
      tagsService,
      jasmine.createSpyObj<MatDialog>('MatDialog', ['open']),
      settingsService,
      {} as HydrusRatingsService,
      jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']),
      selectionGroups
    ));

    inputElement = document.createElement('input');
    component.tagInput = new ElementRef(inputElement);
    autocompleteTrigger = jasmine.createSpyObj<MatAutocompleteTrigger>('MatAutocompleteTrigger', ['openPanel']);
    component.matAutocompleteTrigger = autocompleteTrigger;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('clears the incomplete text after accepting an OR autocomplete suggestion', fakeAsync(() => {
    component.multiSelectAutocomplete = true;
    const searchSubscription = component.filteredTagsFromAPI$.subscribe();
    component.tagCtrl.setValue('series:');
    component.tagCtrl.setValue({value: 'series:test'});

    const deselect = jasmine.createSpy('deselect');
    component.selected({
      option: {value: {value: 'series:test'}, deselect}
    } as unknown as MatAutocompleteSelectedEvent);
    tick();

    expect(component.searchTags.length).toBe(1);
    expect(component.searchTags[0] as string).toBe('series:test');
    expect(component.tagCtrl.value).toBeNull();
    expect(inputElement.value).toBe('');
    expect(autocompleteTrigger.openPanel).not.toHaveBeenCalled();
    expect(deselect).toHaveBeenCalled();
    searchSubscription.unsubscribe();
  }));

  it('strips a leading minus only for autocomplete and keeps it in the search tag', () => {
    const searchSubscription = component.filteredTagsFromAPI$.subscribe();
    component.tagCtrl.setValue('-character:ali');
    component.tagCtrl.setValue({value: 'character:alice'});

    component.selected({
      option: {value: {value: 'character:alice'}}
    } as unknown as MatAutocompleteSelectedEvent);

    expect(tagsService.searchTags).toHaveBeenCalledWith('character:ali', 'display');
    expect(component.searchTags[0] as string).toBe('-character:alice');
    searchSubscription.unsubscribe();
  });

  it('recovers suggestions after an autocomplete request fails', () => {
    component.autocompleteMinLength = 2;
    tagsService.searchTags.and.returnValues(
      throwError(() => new Error('temporary failure')),
      of([{value: 'series:test', count: 1}])
    );
    const results: string[][] = [];
    const searchSubscription = component.filteredTagsFromAPI$.subscribe(tags => {
      results.push(tags.map(tag => tag.value));
    });

    component.tagCtrl.setValue('se');
    expect(component.autocompleteError).toBeTrue();
    component.tagCtrl.setValue('ser');

    expect(tagsService.searchTags).toHaveBeenCalledWith('se', 'display');
    expect(tagsService.searchTags).toHaveBeenCalledWith('ser', 'display');
    expect(component.autocompleteError).toBeFalse();
    expect(results).toEqual([[], ['series:test']]);
    searchSubscription.unsubscribe();
  });

  it('suggests selection groups by name when enabled', () => {
    component.enableSelectionGroups = true;
    const results: string[][] = [];
    const subscription = component.filteredSelectionGroups$.subscribe(groups => {
      results.push(groups.map(group => group.selectionGroupName));
    });

    component.tagCtrl.setValue('later');

    expect(results).toEqual([['Later downloads']]);
    subscription.unsubscribe();
  });

  it('adds an excluded selection group predicate from a minus search', () => {
    component.enableSelectionGroups = true;
    const value = selectionGroupSearchTag('selection-group-1');
    component.tagCtrl.setValue('-later');

    component.selected({
      option: {value: {value, selectionGroupID: 'selection-group-1'}}
    } as unknown as MatAutocompleteSelectedEvent);

    expect(parseSelectionGroupSearchTag(component.searchTags[0] as string)).toEqual({
      groupID: 'selection-group-1',
      excluded: true
    });
  });

  it('adds every unselected autocomplete result from Add all shown', fakeAsync(() => {
    component.multiSelectAutocomplete = true;
    component.searchTags = ['series:one'];
    component.tagCtrl.setValue('series:');
    const deselect = jasmine.createSpy('deselect');

    component.selected({
      option: {
        value: {
          value: '',
          selectAllTags: [
            {value: 'series:one'},
            {value: 'series:two'},
            {value: 'series:three'}
          ]
        },
        deselect
      }
    } as unknown as MatAutocompleteSelectedEvent);
    tick();

    expect(component.searchTags as string[]).toEqual([
      'series:one',
      'series:two',
      'series:three'
    ]);
    expect(component.tagCtrl.value).toBeNull();
    expect(deselect).toHaveBeenCalled();
    expect(autocompleteTrigger.openPanel).not.toHaveBeenCalled();
  }));

  it('preserves a leading minus on manually entered tags', () => {
    component.addSearchTag('-Character:Alice');

    expect(component.searchTags[0] as string).toBe('-character:alice');
  });

  it('enables multi-select autocomplete for the OR search dialog', () => {
    const dialogRef = {afterClosed: () => of(null)};
    const open = spyOn(TagInputDialogComponent, 'open').and.returnValue(dialogRef as any);

    component.orSearchButton();

    expect(open.calls.mostRecent().args[1].multiSelectAutocomplete).toBeTrue();
  });

  it('replaces a search tag in place after it is double-clicked', fakeAsync(() => {
    component.searchTags = ['old:tag', 'keep:tag'];
    const event = jasmine.createSpyObj<MouseEvent>('MouseEvent', ['preventDefault', 'stopPropagation']);

    component.editSearchTag(event, 0, 'old:tag');
    tick();
    component.addSearchTag('new:tag');

    expect(component.searchTags as string[]).toEqual(['new:tag', 'keep:tag']);
    expect(inputElement.focus).toBeDefined();
    expect(autocompleteTrigger.openPanel).toHaveBeenCalled();
  }));
});
