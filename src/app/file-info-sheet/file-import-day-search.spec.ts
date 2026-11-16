import { BehaviorSubject, of, throwError } from 'rxjs';
import { FileInfoSheetComponent } from './file-info-sheet.component';

describe('Find files imported on the same day', () => {
  let component: FileInfoSheetComponent;
  let search: jasmine.Spy;
  let getFileById: jasmine.Spy;
  let snackbar: jasmine.Spy;
  let error: jasmine.Spy;

  beforeEach(() => {
    component = Object.create(FileInfoSheetComponent.prototype);
    search = jasmine.createSpy('searchTags');
    getFileById = jasmine.createSpy('getFileById').and.returnValue(of({file_services: {current: {domain: {time_imported: 1700000000}}}}));
    snackbar = jasmine.createSpy('open');
    error = jasmine.createSpy('handleHydrusError');
    Object.assign(component, {
      data: {file: {file_id: 123}}, filesService: {getFileById},
      browseState: {fileServiceKey$: new BehaviorSubject('domain')},
      searchTags: search, snackbar: {open: snackbar}, errorService: {handleHydrusError: error}
    });
  });

  it('opens a date search directly from the selected file without asking for predicates', async () => {
    await component.searchImportDay();
    expect(getFileById).toHaveBeenCalledOnceWith(123);
    expect(search).toHaveBeenCalled();
    expect(JSON.stringify(search.calls.mostRecent().args[0])).toContain('system:import time = ');
  });

  it('does not open an unfiltered search if no timestamp exists', async () => {
    getFileById.and.returnValue(of({file_services: {current: {}}}));
    await component.searchImportDay();
    expect(search).not.toHaveBeenCalled();
    expect(snackbar).toHaveBeenCalled();
  });

  it('keeps the current search intact if fetching metadata fails', async () => {
    getFileById.and.returnValue(throwError(() => new Error('offline')));
    await component.searchImportDay();
    expect(search).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
