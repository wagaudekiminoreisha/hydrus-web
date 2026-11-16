import { MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { BrowseStateService } from '../browse/browse-state.service';
import { HydrusApiService } from '../hydrus-api.service';
import { HydrusBasicFile, HydrusFileFromAPI } from '../hydrus-file';
import { HydrusSearchTags } from '../hydrus-tags';
import { ImageSearchDialogComponent } from './image-search-dialog.component';

describe('ImageSearchDialogComponent', () => {
  let component: ImageSearchDialogComponent;
  let api: jasmine.SpyObj<HydrusApiService>;
  let close: jasmine.Spy;
  const first = {file_id: 1, hash: '1'.repeat(64), mime: 'image/png', width: 100, height: 200, size: 1000,
    file_services: {current: {domain: {time_imported: 1700000000}}}, tags: {}, known_urls: []} as unknown as HydrusFileFromAPI;
  const second = {...first, file_id: 2, hash: '2'.repeat(64), width: 300, height: 400};

  beforeEach(() => {
    close = jasmine.createSpy('close');
    api = jasmine.createSpyObj('HydrusApiService', ['getFileMetadata', 'getFileRelationships', 'searchFiles']);
    api.getFileMetadata.and.returnValue(of({metadata: [first]}));
    const browse = {tags$: new BehaviorSubject(['keep:tag']), fileServiceKey$: new BehaviorSubject('domain'), tagServiceKey$: new BehaviorSubject('tags')} as unknown as BrowseStateService;
    component = new ImageSearchDialogComponent({file: first as unknown as HydrusBasicFile}, {close} as unknown as MatDialogRef<ImageSearchDialogComponent, HydrusSearchTags>, api, browse);
  });

  it('builds a property search without accidentally restricting it to visual matches', async () => {
    await component.ngOnInit();
    component.sameDimensions = true;
    component.selectedTags = ['batch:patreon'];
    component.keepCurrent = true;
    component.extraTags = [['artist:alice', 'artist:bob'], 'system:inbox'];
    const search: unknown[] = component.buildSearch();
    expect(search).toContain('system:width = 100');
    expect(search).toContain('system:height = 200');
    expect(search).toContain('keep:tag');
    expect(search).toContain(['artist:alice', 'artist:bob']);
    expect(search).toContain('system:inbox');
    expect(JSON.stringify(search)).not.toContain('similar to');
  });

  it('keeps additional constraints outside the OR of selected properties', async () => {
    await component.ngOnInit();
    component.sameDimensions = true;
    component.sameSize = true;
    component.combine = 'any';
    component.extraTags = ['system:archive'];
    expect(component.buildSearch() as unknown[]).toEqual([
      ['system:width = 100', 'system:filesize = 1000 B'],
      ['system:height = 200', 'system:filesize = 1000 B'],
      'system:archive'
    ]);
  });

  it('offers known duplicates as additional references and lets the user choose them', async () => {
    await component.ngOnInit();
    api.getFileRelationships.and.returnValue(of({file_relationships: {[first.hash]: {'8': [second.hash]}}}));
    api.getFileMetadata.and.returnValue(of({metadata: [first, second]}));
    await component.loadReferences('duplicates');
    expect(api.getFileRelationships).toHaveBeenCalledWith(1, 'domain');
    expect(component.selectedReferences).toEqual([first]);
    component.toggleReference(second.hash, true);
    expect(component.selectedReferences).toEqual([first, second]);
  });

  it('keeps the original reference usable when duplicate permissions are missing', async () => {
    await component.ngOnInit();
    api.getFileRelationships.and.returnValue(throwError(() => ({status: 403})));
    await component.loadReferences('duplicates');
    expect(component.referenceError).toContain('Manage File Relationships');
    expect(component.selectedReferences).toEqual([first]);
    expect(component.busy).toBeFalse();
  });

  it('does not submit an empty search or invalid similarity distance', async () => {
    await component.ngOnInit();
    component.submit();
    expect(close).not.toHaveBeenCalled();
    component.identity = 'visual';
    component.distance = NaN;
    component.submit();
    expect(close).not.toHaveBeenCalled();
    expect(component.error).toContain('Similarity distance');
  });
});
