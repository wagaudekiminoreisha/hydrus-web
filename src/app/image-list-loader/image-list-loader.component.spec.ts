import { MatMenuTrigger } from '@angular/material/menu';
import { of } from 'rxjs';
import { HydrusBasicFile } from '../hydrus-file';
import { ImageListLoaderComponent } from './image-list-loader.component';

describe('ImageListLoaderComponent', () => {
  let component: ImageListLoaderComponent;
  let event: MouseEvent;
  let stopPropagation: jasmine.Spy;
  let menuTrigger: MatMenuTrigger;
  let openMenu: jasmine.Spy;
  let setSelectionMode: jasmine.Spy;

  beforeEach(() => {
    component = Object.create(ImageListLoaderComponent.prototype);
    stopPropagation = jasmine.createSpy('stopPropagation');
    event = {stopPropagation} as unknown as MouseEvent;
    openMenu = jasmine.createSpy('openMenu');
    menuTrigger = {openMenu} as unknown as MatMenuTrigger;
    setSelectionMode = jasmine.createSpy('setSelectionMode');
    (component as any).selectionMode = {set: setSelectionMode};
    (component as any).selectionGroups = {
      setActiveFiles: jasmine.createSpy('setActiveFiles'),
      setActiveGroup: jasmine.createSpy('setActiveGroup').and.returnValue(true),
      toggleActiveGroup: jasmine.createSpy('toggleActiveGroup').and.returnValue(true)
    };
  });

  it('enters selection mode without opening the menu on the first button click', () => {
    (component as any).selectionActive = () => false;

    component.selectionButtonClick(event, menuTrigger);

    expect(stopPropagation).toHaveBeenCalled();
    expect(setSelectionMode).toHaveBeenCalledOnceWith(true);
    expect(openMenu).not.toHaveBeenCalled();
  });

  it('opens the selection menu when selection mode is already active', () => {
    (component as any).selectionActive = () => true;

    component.selectionButtonClick(event, menuTrigger);

    expect(stopPropagation).toHaveBeenCalled();
    expect(openMenu).toHaveBeenCalled();
    expect(setSelectionMode).toHaveBeenCalledOnceWith(true);
  });

  it('keeps selection mode active after a child or gallery selection', () => {
    const selected = new Set([123]);

    component.selectionChanged(selected);

    expect((component as any).selectionGroups.setActiveFiles).toHaveBeenCalledOnceWith(selected);
    expect(setSelectionMode).toHaveBeenCalledOnceWith(true);
  });

  it('exits selection mode when the last file is deselected in the gallery', () => {
    component.selectionChanged(new Set());
    expect(setSelectionMode).toHaveBeenCalledOnceWith(false);
  });

  it('enters selection mode when switching the active group', () => {
    component.activateSelectionGroup('selection-group-2');

    expect((component as any).selectionGroups.setActiveGroup).toHaveBeenCalledOnceWith('selection-group-2');
    expect(setSelectionMode).toHaveBeenCalledOnceWith(true);
  });

  it('arms an additional selection group without replacing the active set', () => {
    component.toggleSelectionGroup('selection-group-2');

    expect((component as any).selectionGroups.toggleActiveGroup).toHaveBeenCalledOnceWith('selection-group-2');
    expect(setSelectionMode).toHaveBeenCalledOnceWith(true);
  });

  it('downloads active groups into their configured folders and keeps overlapping files in both', async () => {
    const files = [
      {file_id: 1},
      {file_id: 2},
      {file_id: 3}
    ] as HydrusBasicFile[];
    const root = {name: 'root'} as FileSystemDirectoryHandle;
    const firstDirectory = {name: 'first'} as FileSystemDirectoryHandle;
    const secondDirectory = {name: 'second'} as FileSystemDirectoryHandle;
    const chooseDownloadDirectory = jasmine.createSpy('chooseDownloadDirectory').and.resolveTo(root);
    const resolveDownloadDirectory = jasmine.createSpy('resolveDownloadDirectory').and.callFake(
      (_root: FileSystemDirectoryHandle, prefix: string) => Promise.resolve(prefix === 'first' ? firstDirectory : secondDirectory)
    );
    const saveFiles = jasmine.createSpy('saveFiles').and.resolveTo();
    (component as any).selected = () => new Set([1, 2, 3]);
    (component as any).selectionGroups = {
      activeGroups: () => [
        {id: 'one', name: 'One', color: '#3f51b5', downloadDirectory: 'first', fileIDs: new Set([1, 2])},
        {id: 'two', name: 'Two', color: '#e91e63', downloadDirectory: 'second', fileIDs: new Set([2, 3])}
      ]
    };
    (component as any).filesService = {
      getFileMetadata: jasmine.createSpy('getFileMetadata').and.returnValue(of(files))
    };
    (component as any).downloadService = {chooseDownloadDirectory, resolveDownloadDirectory, saveFiles};
    (component as any).errorService = {handleHydrusError: jasmine.createSpy('handleHydrusError')};

    await component.downloadSelected();

    expect(chooseDownloadDirectory).toHaveBeenCalledTimes(1);
    expect(resolveDownloadDirectory).toHaveBeenCalledWith(root, 'first');
    expect(resolveDownloadDirectory).toHaveBeenCalledWith(root, 'second');
    expect(saveFiles).toHaveBeenCalledWith([files[0], files[1]], firstDirectory);
    expect(saveFiles).toHaveBeenCalledWith([files[1], files[2]], secondDirectory);
  });
});
