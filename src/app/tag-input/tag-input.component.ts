import { HydrusFilesService } from './../hydrus-files.service';
import { Component, OnInit, Output, EventEmitter, ViewChild, ElementRef, Input, Optional, Self, input } from '@angular/core';
import {COMMA, ENTER} from '@angular/cdk/keycodes';
import { MatChipInputEvent } from '@angular/material/chips';
import { ControlValueAccessor, FormControl, NgControl, UntypedFormControl } from '@angular/forms';
import { catchError, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';
import { MatAutocompleteSelectedEvent, MatAutocomplete, MatAutocompleteTrigger, MatOption } from '@angular/material/autocomplete';
import { Observable, combineLatest, firstValueFrom, of } from 'rxjs';
import { HydrusTagsService } from '../hydrus-tags.service';
import { HydrusSearchTag, HydrusSearchTags, HydrusTagSearchTag, TagDisplayType, isSingleTag } from '../hydrus-tags';
import { MatDialog } from '@angular/material/dialog';
import { allSystemPredicates, predicateGroups, SystemPredicate, systemTagsForSearch } from '../hydrus-system-predicates';
import { SystemPredicateDialogComponent } from '../system-predicate-dialog/system-predicate-dialog.component';
import { TagInputDialogComponent } from '../tag-input-dialog/tag-input-dialog.component';
import { SettingsService } from '../settings.service';
import { SystemPredicateRatingsDialogComponent } from '../system-predicate-ratings-dialog/system-predicate-ratings-dialog.component';
import { HydrusService } from '../hydrus-services';
import { formatTagCase, getNamespace, searchTagsContainsSystemPredicate } from '../utils/tag-utils';
import { HydrusRatingsService } from '../hydrus-ratings.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TagSiblingsParentsDialogComponent } from '../tag-siblings-parents-dialog/tag-siblings-parents-dialog.component';
import {
  isSelectionGroupSearchTag,
  parseSelectionGroupSearchTag,
  selectionGroupSearchTag,
  SelectionGroupsService
} from '../selection-groups.service';

function convertPredicate(p: SystemPredicate): ConvertedPredicate {
  const pred = allSystemPredicates[p];
  return {
    predicate: p,
    name: pred.name,
  }
}

interface ConvertedPredicate {
  predicate: SystemPredicate,
  name: string
}

interface ConvertedPredicateGroup {
  name: string;
  predicates: ConvertedPredicate[]
}

export interface HydrusTagSearchTagUI {
  value: string,
  count?: number,
  systemPredicate?: SystemPredicate,
  selectionGroupID?: string,
  selectionGroupName?: string,
  selectionGroupColor?: string,
  selectAllTags?: HydrusTagSearchTagUI[]
}

@Component({
  selector: 'app-tag-input',
  templateUrl: './tag-input.component.html',
  styleUrls: ['./tag-input.component.scss']
})
export class TagInputComponent implements OnInit, ControlValueAccessor {

  isSingleTag = isSingleTag;

  searchTags: HydrusSearchTags = [];
  readonly separatorKeysCodes: number[] = [ENTER, COMMA];

  //inputControl = new FormControl("", this.validators)

  @Input() enableOrSearch = true;

  @Input() enableSystemPredicates = true;

  @Input() enableFavorites = true;

  @Input() placeholder: string;

  @Input() defaultTags: HydrusSearchTags;

  @Input() displayType: TagDisplayType = 'display';

  @Input() enableSiblingParentsDialog = true;

  @Input() multiSelectAutocomplete = false;

  @Input() autocompleteMinLength = 3;

  @Input() enableSelectionGroups = false;

  showSystemPredicateAutocompleteByDefault = input()


  tagCtrl = new FormControl<string | HydrusTagSearchTagUI>('');
  private autocompleteSearch = '';
  private editingTagIndex: number | null = null;
  autocompleteError = false;

  filteredTagsFromAPI$: Observable<HydrusTagSearchTagUI[]> = this.tagCtrl.valueChanges.pipe(
    map(search => this.captureAutocompleteSearch(search)),
    switchMap(search => {
      const tagSearch = search.startsWith('-') ? search.substring(1) : search;
      if(tagSearch.length < this.autocompleteMinLength) {
        this.autocompleteError = false;
        return of([]);
      }
      this.autocompleteError = false;
      return this.tagsService.searchTags(tagSearch, this.displayType).pipe(
        catchError(() => {
          this.autocompleteError = true;
          return of([]);
        })
      );
    })
  );

  filteredSystemPredicates$: Observable<HydrusTagSearchTagUI[]> = this.tagCtrl.valueChanges.pipe(
    map(input => this.captureAutocompleteSearch(input)),
    map((input) => input ? systemTagsForSearch.filter(p => p.value.startsWith(input)) : []),
  );

  filteredSelectionGroups$: Observable<HydrusTagSearchTagUI[]> = this.tagCtrl.valueChanges.pipe(
    map(input => this.captureAutocompleteSearch(input)),
    map(input => {
      if(!this.enableSelectionGroups) {
        return [];
      }
      const filterValue = (input.startsWith('-') ? input.substring(1) : input).trim().toLowerCase();
      return this.selectionGroups.groups()
        .filter(group => group.name.toLowerCase().includes(filterValue))
        .map(group => ({
          value: selectionGroupSearchTag(group.id),
          count: group.fileIDs.size,
          selectionGroupID: group.id,
          selectionGroupName: group.name,
          selectionGroupColor: group.color
        }));
    })
  );

  filteredTagsAndSelectionGroups$: Observable<HydrusTagSearchTagUI[]> = combineLatest([
    this.filteredTagsFromAPI$,
    this.filteredSelectionGroups$
  ]).pipe(
    map(([api, selectionGroups]) => [...selectionGroups, ...api])
  );

  filteredTags$: Observable<HydrusTagSearchTagUI[]> = combineLatest([
    this.filteredTagsAndSelectionGroups$,
    this.filteredSystemPredicates$
  ]).pipe(
    map(([tagsAndSelectionGroups, predicates]) => [...tagsAndSelectionGroups, ...predicates]),
  )

  @Output()
  tags = new EventEmitter<HydrusSearchTags>();

  @ViewChild('tagInput') tagInput: ElementRef<HTMLInputElement>;
  @ViewChild('auto') matAutocomplete: MatAutocomplete;
  @ViewChild(MatAutocompleteTrigger) matAutocompleteTrigger: MatAutocompleteTrigger;

  constructor(
    @Optional() @Self() private controlDir: NgControl,
    public filesService: HydrusFilesService,
    public tagsService: HydrusTagsService,
    public dialog: MatDialog,
    public settingsService: SettingsService,
    private ratingsService: HydrusRatingsService,
    private snackbar: MatSnackBar,
    public selectionGroups: SelectionGroupsService
  ) {
    if (this.controlDir) {
      this.controlDir.valueAccessor = this
    }
  }

  favoriteTags = this.settingsService.appSettings.favoriteTags;

  canGetSiblingsParents$ = this.tagsService.canGetSiblingsParents$;


  writeValue(obj: string[]): void {
    if(!obj) {
      return;
    }
    this.searchTags = [...obj];
  }

  registerOnChange(fn: any): void {
    //throw new Error('Method not implemented.');
    this.tags.subscribe(fn);
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }

  onTouched() {}

  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.tagCtrl.disable() : this.tagCtrl.enable()
  }

  ngOnInit() {
    if(this.defaultTags) {
      this.searchTags = [...this.defaultTags];
    }
    if(!this.enableSystemPredicates && this.enableFavorites) {
      this.favoriteTags =  this.settingsService.appSettings.favoriteTags.filter(tags => !searchTagsContainsSystemPredicate(tags));
    }
  }

  chipInputEvent(event: MatChipInputEvent): void {
    if(this.matAutocomplete.isOpen && this.matAutocomplete.options.some(x => x.active)) {
      return;
    }

    const input = event.chipInput.inputElement;

    this.addSearchTag(event.value);

    // Reset the input value
    if (input) {
      input.value = '';
    }

    this.tagCtrl.setValue(null);
  }

  addSearchTag(tag: string) {
    const value = formatTagCase(tag);
    if ((value || '').trim()) {
      if(this.editingTagIndex === null) {
        this.searchTags.push(value);
      } else {
        this.searchTags.splice(this.editingTagIndex, 1, value);
        this.editingTagIndex = null;
      }
    }

    this.tags.emit(this.searchTags);
  }

  addSearchTags(tags: HydrusSearchTags) {
    if(tags.length > 0) {
      this.searchTags.push(...tags);
      this.tags.emit(this.searchTags);
    }
  }


  setSearchTags(tags: string[]) {
    this.searchTags = [...tags];
    this.tags.emit(this.searchTags);
  }



  removeSearchTag(index: number): void {
    //const index = this.searchTags.indexOf(tag);

    //if (index >= 0) {
    this.searchTags.splice(index, 1);
    if(this.editingTagIndex === index) this.cancelSearchTagEdit(new Event('cancel'));
    else if(this.editingTagIndex !== null && index < this.editingTagIndex) this.editingTagIndex--;
    //}

    this.tags.emit(this.searchTags);
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    const option: MatOption<HydrusTagSearchTagUI> = event.option
    if(!this.autocompleteSearch && typeof this.tagCtrl.value === 'string') {
      this.autocompleteSearch = this.tagCtrl.value;
    }
    if(option.value.selectAllTags) {
      this.addAllAutocompleteTags(option.value.selectAllTags);
    } else if(option.value.systemPredicate !== undefined) {
      this.systemPredicateButton(option.value.systemPredicate)
    } else {
      const negated = this.autocompleteSearch.startsWith('-');
      this.addSearchTag((negated ? '-' : '') + option.value.value);
    }

    // Each accepted suggestion completes the current input, including OR searches.
    this.autocompleteSearch = '';
    this.tagCtrl.setValue(null);
    this.tagInput.nativeElement.value = '';
    option.deselect?.();
  }

  editSearchTag(event: MouseEvent, index: number, tag: string) {
    event.preventDefault();
    event.stopPropagation();
    this.editingTagIndex = index;
    this.tagCtrl.setValue(tag);
    this.tagInput.nativeElement.value = tag;
    setTimeout(() => {
      this.tagInput.nativeElement.focus();
      this.tagInput.nativeElement.select();
      this.matAutocompleteTrigger.openPanel();
    });
  }

  editOrSearchTag(event: MouseEvent, index: number, tags: HydrusSearchTags) {
    event.preventDefault();
    event.stopPropagation();
    const dialogRef = TagInputDialogComponent.open(this.dialog, {
      displayType: this.displayType,
      enableOrSearch: false,
      multiSelectAutocomplete: true,
      enableSelectionGroups: this.enableSelectionGroups,
      initialTags: tags,
      title: 'Edit OR Search',
      submitButtonText: 'Save'
    });
    dialogRef.afterClosed().subscribe(result => {
      if(result?.length) {
        this.searchTags.splice(index, 1, result);
        this.tags.emit(this.searchTags);
      }
    });
  }

  cancelSearchTagEdit(event: Event) {
    if(this.editingTagIndex === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.editingTagIndex = null;
    this.autocompleteSearch = '';
    this.tagCtrl.setValue(null);
    this.tagInput.nativeElement.value = '';
  }

  private captureAutocompleteSearch(search: string | HydrusTagSearchTagUI | null) {
    if (typeof search === 'string') {
      this.autocompleteSearch = search;
    } else if (search === null) {
      this.autocompleteSearch = '';
    }
    return this.autocompleteSearch;
  }

  isAutocompleteTagSelected(tag: string) {
    return this.multiSelectAutocomplete && this.searchTags.some(searchTag =>
      isSingleTag(searchTag) && searchTag.replace(/^-/, '') === tag
    );
  }

  isSelectionGroupSearchTag(tag: string) {
    return isSelectionGroupSearchTag(tag);
  }

  selectionGroupSearchLabel(tag: string) {
    const predicate = parseSelectionGroupSearchTag(tag);
    if(!predicate) {
      return tag;
    }
    const name = this.selectionGroups.groups().find(group => group.id === predicate.groupID)?.name
      ?? 'Deleted selection group';
    return predicate.excluded ? `NOT ${name}` : name;
  }

  selectionGroupSearchColor(tag: string) {
    const predicate = parseSelectionGroupSearchTag(tag);
    return this.selectionGroups.groups().find(group => group.id === predicate?.groupID)?.color ?? '#607d8b';
  }

  searchTagLabel(tag: HydrusSearchTag) {
    return typeof tag === 'string'
      ? this.selectionGroupSearchLabel(tag)
      : tag.map(nestedTag => this.searchTagLabel(nestedTag)).join(' OR ');
  }

  autocompleteTagsForBulkSelection(tags: HydrusTagSearchTagUI[]) {
    return tags.filter(tag =>
      tag.systemPredicate === undefined && !this.isAutocompleteTagSelected(tag.value)
    );
  }

  private addAllAutocompleteTags(tags: HydrusTagSearchTagUI[]) {
    const negated = this.autocompleteSearch.startsWith('-');
    const prefix = negated ? '-' : '';
    const additions = this.autocompleteTagsForBulkSelection(tags)
      .map(tag => prefix + tag.value);
    this.addSearchTags(additions);
  }


  // private _filter(value: string): string[] {
  //   let filterValue = value ? value.toLowerCase() : '';
  //   const isNegated = filterValue.startsWith('-');
  //   if (isNegated) {
  //     filterValue = filterValue.substring(1);
  //   }

  //   let results = Array.from(this.filesService.getKnownTags())
  //     .filter(tag => tag.toLowerCase().indexOf(filterValue) !== -1)
  //     .filter(tag => !this.searchTags.includes(tag)).slice(0, 25);

  //   if (isNegated) {
  //     results = results.map(t => `-${t}`);
  //   }

  //   return results;
  // }

  orSearchButton() {
    const dialogRef = TagInputDialogComponent.open(this.dialog, {
      displayType: 'display',
      enableOrSearch: false,
      multiSelectAutocomplete: true,
      enableSelectionGroups: this.enableSelectionGroups,
      title: 'Add OR Search',
      submitButtonText: 'Add'
    });

    dialogRef.afterClosed().subscribe(result => {
      if(result) {
        this.addSearchTags([result]);
      }
    });

  }

  isConvertedPredicateSingle(p: ConvertedPredicate | ConvertedPredicateGroup): p is ConvertedPredicate {
    return 'predicate' in p;
  }

  async systemPredicateButton(pred: SystemPredicate) {
    if(pred === SystemPredicate.RATING_GENERAL) {
      const result = await this.ratingPredicateDialog();
      if(result) {
        this.addSearchTag(result);
      }
      return;
    }
    const predicate = allSystemPredicates[pred];
    if(pred === SystemPredicate.HAS_RATING || pred === SystemPredicate.NO_RATING) {
      const ratingServices = await firstValueFrom(this.ratingsService.ratingServices$);
      if(ratingServices.length === 0) {
        this.noRatingServiceSnackbar();
        return;
      } else if(ratingServices.length === 1) {
        this.addSearchTag(`system:${predicate.name} ${ratingServices[0].name}`);
        return;
      }
    }
    if(!predicate.operator && !predicate.units && !predicate.value) {
      this.addSearchTag(`system:${predicate.name}`);
    } else {
      const result = await this.predicateDialog(pred);
      if(result) {
        this.addSearchTag(result);
      }
    }
  }

  async predicateDialog(pred: SystemPredicate) {
    const dialogRef = this.dialog.open<SystemPredicateDialogComponent, {predicate: SystemPredicate}, string>(
      SystemPredicateDialogComponent,
      {
        //width: '80vw',
        data: {predicate: pred},
      }
    )
    return firstValueFrom(dialogRef.afterClosed());
  }


  async ratingPredicateDialog() {
    const service = await this.ratingsService.getRatingServiceDialog();
    if(!service) {
      this.noRatingServiceSnackbar();
      return;
    }
    const dialogRef = this.dialog.open<SystemPredicateRatingsDialogComponent, {service: HydrusService}, string>(
      SystemPredicateRatingsDialogComponent,
      {
        data: {
          service
        },
        // maxWidth: '648px',
        // width: '90vw',
      }
    );
    return firstValueFrom(dialogRef.afterClosed());
  }

  noRatingServiceSnackbar() {
    this.snackbar.open('There are no rating services', undefined, {
      duration: 2000
    });
  }


  predicateButtons: (ConvertedPredicateGroup | ConvertedPredicate)[] = predicateGroups.map(p => {
    const isGroup = 'predicates' in p;
    if(!isGroup) {
      return convertPredicate(p.predicate);
    } else {
      return {
        ...p,
        predicates: p.predicates.map(p => convertPredicate(p))
      }
    }
  })

  async tagSiblingsParentsDialog(tag: string) {
    const dialog = TagSiblingsParentsDialogComponent.open(this.dialog, {
      tag,
      allowSearchTag: true,
      allowAddTagToSearch: true,
      allowNewSiblingParentDialog: true
    });
    const dialogResult = await firstValueFrom(dialog.afterClosed());
    if (dialogResult) {
      switch (dialogResult.action) {
        case 'searchTag':
          return this.setSearchTags([dialogResult.tag])
        case 'addSearchTag':
          return this.addSearchTags([dialogResult.tag]);
        case 'newSiblingParentDialog':
          return this.tagSiblingsParentsDialog(dialogResult.tag)
      }
    }
  }


}
