import { HydrusBasicFile } from '../hydrus-file';
import { ImageListComponent } from './image-list.component';

describe('ImageListComponent', () => {
  let component: ImageListComponent;
  const file = {file_id: 123} as HydrusBasicFile;

  beforeEach(() => {
    component = Object.create(ImageListComponent.prototype);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('toggles a file on an ordinary left click while selection mode is active', () => {
    (component as any).selectionActive = () => true;
    const selectToggle = spyOn(component, 'selectToggle');
    const viewFile = spyOn(component, 'viewFile');

    component.fileClick(new MouseEvent('click'), file);

    expect(selectToggle).toHaveBeenCalledOnceWith(file);
    expect(viewFile).not.toHaveBeenCalled();
  });

  it('opens a file on an ordinary left click when nothing is selected', () => {
    (component as any).selectionActive = () => false;
    const selectToggle = spyOn(component, 'selectToggle');
    const viewFile = spyOn(component, 'viewFile');

    component.fileClick(new MouseEvent('click'), file);

    expect(selectToggle).not.toHaveBeenCalled();
    expect(viewFile).toHaveBeenCalledOnceWith(file);
  });

  it('shares the browse selection controller with gallery mode', () => {
    const selected = new Set<number>();
    const openPhotoSwipe = jasmine.createSpy('openPhotoSwipe');
    const selectionActionsEmit = jasmine.createSpy('selectionActionsEmit');
    (component as any).files = () => [file];
    (component as any).requestMore=()=>undefined;
    (component as any).hasMoreFiles=()=>undefined;
    (component as any).selected = () => selected;
    (component as any).photoswipe = {openPhotoSwipe};
    (component as any).selectionActions = {emit: selectionActionsEmit};
    (component as any).activeSelectionColor = () => '#e91e63';
    (component as any).activeSelectionGroupName = () => 'Group 2';
    (component as any).showSelectionGroups = () => true;
    (component as any).activeSelectionGroupID = () => 'selection-group-2';
    (component as any).selectionGroups = () => [];
    spyOn(component, 'selectToggle').and.callFake(selectedFile => {
      if(selected.has(selectedFile.file_id)) {
        selected.delete(selectedFile.file_id);
      } else {
        selected.add(selectedFile.file_id);
      }
    });

    component.viewFile(file);

    const controller = openPhotoSwipe.calls.mostRecent().args[2];
    expect(controller.isSelected(file.file_id)).toBeFalse();
    controller.toggle(file);
    expect(controller.isSelected(file.file_id)).toBeTrue();
    controller.openActions();
    expect(selectionActionsEmit).toHaveBeenCalled();
    expect(controller.activeColor()).toBe('#e91e63');
    expect(controller.activeGroupName()).toBe('Group 2');
    expect(controller.memberships(file.file_id)).toEqual([]);
  });

  it('shows every named group membership, including the active group, only when enabled', () => {
    const generalSelection = {
      id: 'selection-general',
      name: 'General selection',
      color: '#607d8b',
      downloadDirectory: '',
      fileIDs: new Set([file.file_id])
    };
    const activeGroup = {
      id: 'selection-group-1',
      name: 'Group 1',
      color: '#3f51b5',
      downloadDirectory: '',
      fileIDs: new Set([file.file_id])
    };
    const otherGroup = {
      id: 'selection-group-2',
      name: 'Later',
      color: '#e91e63',
      downloadDirectory: 'later',
      fileIDs: new Set([file.file_id])
    };
    (component as any).selectionGroups = () => [generalSelection, activeGroup, otherGroup];
    (component as any).showSelectionGroups = () => true;

    expect(component.fileGroupMemberships(file.file_id)).toEqual([activeGroup, otherGroup]);

    (component as any).showSelectionGroups = () => false;
    expect(component.fileGroupMemberships(file.file_id)).toEqual([]);
  });

  it('opens a preview on double click without changing the file selection', () => {
    const selected = new Set([file.file_id]);
    (component as any).selectionActive = () => true;
    (component as any).selected = () => selected;
    spyOn(component, 'selectToggle').and.callFake(selectedFile => {
      if(selected.has(selectedFile.file_id)) {
        selected.delete(selectedFile.file_id);
      } else {
        selected.add(selectedFile.file_id);
      }
    });
    const viewFile = spyOn(component, 'viewFile');

    component.fileClick(new MouseEvent('click', {detail: 1}), file);
    component.fileClick(new MouseEvent('click', {detail: 2}), file);
    component.fileDoubleClick(new MouseEvent('dblclick'), file);

    expect(selected.has(file.file_id)).toBeTrue();
    expect(viewFile).toHaveBeenCalledOnceWith(file);
  });

  it('selects the full ordered range when a diagonal drag skips thumbnails', () => {
    const intermediateFiles = [
      {file_id: 234},
      {file_id: 345}
    ] as HydrusBasicFile[];
    const endFile = {file_id: 456} as HydrusBasicFile;
    const files = [file, ...intermediateFiles, endFile];
    let selected = new Set<number>();
    (component as any).selectionActive = () => true;
    (component as any).files = () => files;
    (component as any).selected = Object.assign(
      () => selected,
      {set: (value: Set<number>) => selected = value}
    );
    const pointerDown = {
      button: 0,
      buttons: 1,
      pointerId: 7,
      pointerType: 'mouse',
      ctrlKey: false,
      shiftKey: false
    } as PointerEvent;
    const pointerEnter = {
      ...pointerDown,
      preventDefault: jasmine.createSpy('preventDefault')
    } as unknown as PointerEvent;

    component.selectionPointerDown(pointerDown, file);
    component.selectionPointerEnter(pointerEnter, endFile);

    expect(selected).toEqual(new Set(files.map(item => item.file_id)));
  });

  it('deselects the full ordered range when a selection drag starts selected', () => {
    const intermediateFile = {file_id: 345} as HydrusBasicFile;
    const endFile = {file_id: 456} as HydrusBasicFile;
    const files = [file, intermediateFile, endFile];
    let selected = new Set(files.map(item => item.file_id));
    (component as any).selectionActive = () => true;
    (component as any).files = () => files;
    (component as any).selected = Object.assign(
      () => selected,
      {set: (value: Set<number>) => selected = value}
    );
    const pointerDown = {
      button: 0,
      buttons: 1,
      pointerId: 8,
      pointerType: 'mouse',
      ctrlKey: false,
      shiftKey: false
    } as PointerEvent;
    const pointerEnter = {
      ...pointerDown,
      preventDefault: jasmine.createSpy('preventDefault')
    } as unknown as PointerEvent;

    component.selectionPointerDown(pointerDown, file);
    component.selectionPointerEnter(pointerEnter, endFile);

    expect(selected.size).toBe(0);
  });
});
