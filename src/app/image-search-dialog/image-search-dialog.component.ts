import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { HydrusApiService } from '../hydrus-api.service';
import { HydrusBasicFile, HydrusFileFromAPI } from '../hydrus-file';
import { HydrusSearchTags } from '../hydrus-tags';
import { BrowseStateService } from '../browse/browse-state.service';
import { anyImageSearch, imageDomains, imageImportSearch, imageImportTime, imageTags } from '../image-search';

@Component({
  selector: 'app-image-search-dialog',
  templateUrl: './image-search-dialog.component.html',
  styleUrls: ['./image-search-dialog.component.scss']
})
export class ImageSearchDialogComponent implements OnInit {
  references: HydrusFileFromAPI[] = [];
  selectedHashes = new Set<string>();
  busy = false;
  error = '';
  referenceError = '';
  identity: 'none' | 'visual' | 'hash' = 'none';
  distance = 4;
  importMode: 'none' | 'day' | 'near' = 'none';
  minutes = 30;
  selectedTags: string[] = [];
  tagMatch: 'any' | 'all' = 'any';
  selectedDomains: string[] = [];
  sameDimensions = false;
  sameFiletype = false;
  sameSize = false;
  combine: 'all' | 'any' = 'all';
  extraTags: HydrusSearchTags = [];
  keepCurrent = false;
  readonly currentTags = this.browse.tags$.value;
  readonly fileServiceKey = this.browse.fileServiceKey$.value;
  readonly tagServiceKey = this.browse.tagServiceKey$.value;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: {file: HydrusBasicFile},
    private dialogRef: MatDialogRef<ImageSearchDialogComponent, HydrusSearchTags>,
    private api: HydrusApiService,
    private browse: BrowseStateService
  ) {}

  async ngOnInit() {
    this.busy = true;
    try {
      const response = await firstValueFrom(this.api.getFileMetadata({file_ids: [this.data.file.file_id], only_return_identifiers: false, only_return_basic_information: false}));
      if (!response.metadata?.length) throw new Error('No file metadata returned.');
      this.references = response.metadata;
      this.selectedHashes.add(this.data.file.hash);
      this.importMode = this.importTimes.length ? 'day' : 'none';
    } catch {
      this.error = 'Could not load this file’s metadata. Check the Hydrus connection and Search Files permission.';
    } finally { this.busy = false; }
  }

  get selectedReferences() { return this.references.filter(file => this.selectedHashes.has(file.hash)); }
  get availableTags() { return imageTags(this.selectedReferences); }
  get availableDomains() { return imageDomains(this.selectedReferences); }
  get importTimes() { return this.selectedReferences.map(file => imageImportTime(file, this.fileServiceKey)).filter(time => time !== undefined); }
  get importDaySummary() { return [...new Set(this.importTimes.map(time => new Date(time * 1000).toLocaleDateString()))].join(', '); }
  importTime(file: HydrusFileFromAPI) {
    const time = imageImportTime(file, this.fileServiceKey);
    return time === undefined ? 'Import time unavailable' : new Date(time * 1000).toLocaleString();
  }
  toggleReference(hash: string, checked: boolean) {
    checked ? this.selectedHashes.add(hash) : this.selectedHashes.delete(hash);
    this.selectedTags = this.selectedTags.filter(tag => this.availableTags.includes(tag));
    this.selectedDomains = this.selectedDomains.filter(domain => this.availableDomains.includes(domain));
  }

  async loadReferences(kind: 'duplicates' | 'visual') {
    this.busy = true;
    this.referenceError = '';
    try {
      let files: HydrusFileFromAPI[];
      if (kind === 'duplicates') {
        const response = await firstValueFrom(this.api.getFileRelationships(this.data.file.file_id, this.fileServiceKey));
        const relationships = response.file_relationships?.[this.data.file.hash];
        const hashes = [...new Set([this.data.file.hash, ...(relationships?.['8'] ?? [])])];
        if (hashes.length > 256) throw new Error('More than 256 duplicate references. Narrow the file domain first.');
        files = (await firstValueFrom(this.api.getFileMetadata({hashes, only_return_identifiers: false, only_return_basic_information: false}))).metadata;
      } else {
        this.validateDistance();
        const response = await firstValueFrom(this.api.searchFiles([`system:similar to ${this.data.file.hash} distance ${this.distance}`], {
          return_file_ids: true, file_service_key: this.fileServiceKey, tag_service_key: this.tagServiceKey
        }));
        if (response.file_ids.length > 256) throw new Error('More than 256 similar references. Reduce the distance or narrow the file domain.');
        files = response.file_ids.length ? (await firstValueFrom(this.api.getFileMetadata({file_ids: response.file_ids, only_return_identifiers: false, only_return_basic_information: false}))).metadata : [];
      }
      const byHash = new Map(this.references.map(file => [file.hash, file]));
      files.forEach(file => byHash.set(file.hash, file));
      this.references = [...byHash.values()];
      // Newly discovered files are offered as references; the user chooses which imports/tags to use.
      if (!files.some(file => file.hash !== this.data.file.hash)) this.referenceError = 'No additional references found in the current file domain.';
    } catch (error) {
      this.referenceError = error instanceof Error ? error.message : kind === 'duplicates'
        ? 'Could not load duplicates. This requires Manage File Relationships and unrestricted Search Files permission on a compatible Hydrus version.'
        : 'Could not load visually similar files. Check the Hydrus connection and Search Files permission.';
    } finally { this.busy = false; }
  }

  private validateDistance() {
    if (!Number.isInteger(this.distance) || this.distance < 0 || this.distance > 64) throw new Error('Similarity distance must be an integer from 0 to 64.');
  }

  buildSearch(): HydrusSearchTags {
    const references = this.selectedReferences;
    if (!references.length) throw new Error('Select at least one reference file.');
    const scopes: HydrusSearchTags[] = [];
    if (this.identity === 'visual') {
      this.validateDistance();
      scopes.push([`system:similar to ${references.map(file => file.hash).join(', ')} distance ${this.distance}`]);
    } else if (this.identity === 'hash') scopes.push([`system:hash = ${references.map(file => file.hash).join(', ')} sha256`]);
    if (this.importMode !== 'none') scopes.push(imageImportSearch(this.importTimes, this.importMode, this.minutes));
    if (this.selectedTags.length) scopes.push(this.tagMatch === 'all' ? [...this.selectedTags] : [[...this.selectedTags]]);
    if (this.selectedDomains.length) scopes.push([this.selectedDomains.map(domain => `system:has url with domain ${domain}`)]);
    if (this.sameDimensions) {
      const valid = references.filter(file => file.width > 0 && file.height > 0);
      if (!valid.length) throw new Error('The selected references have no dimensions.');
      scopes.push(anyImageSearch(valid.map(file => [`system:width = ${file.width}`, `system:height = ${file.height}`])));
    }
    if (this.sameFiletype) scopes.push([references.map(file => `system:filetype = ${file.mime}`)]);
    if (this.sameSize) scopes.push([references.map(file => `system:filesize = ${file.size} B`)]);
    const generated = this.combine === 'all' ? scopes.flat() : anyImageSearch(scopes);
    const search = [...generated, ...(this.keepCurrent ? this.currentTags : []), ...this.extraTags];
    if (!search.length) throw new Error('Choose a property or add a tag or system predicate.');
    return search;
  }

  get preview() {
    try { return JSON.stringify(this.buildSearch()); } catch { return ''; }
  }

  submit() {
    try { this.error = ''; this.dialogRef.close(this.buildSearch()); }
    catch (error) { this.error = error instanceof Error ? error.message : 'Could not build this search.'; }
  }
}
