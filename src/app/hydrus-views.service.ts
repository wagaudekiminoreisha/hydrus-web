import { Injectable } from '@angular/core';
import { HydrusApiService } from './hydrus-api.service';
import { HydrusVersionService } from './hydrus-version.service';
import { HydrusCanvasType } from './hydrus-api';
import { HydrusClientOptionsService } from './hydrus-client-options.service';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from './settings.service';
import { HydrusBasicFile } from './hydrus-file';

@Injectable({
  providedIn: 'root'
})
export class HydrusViewsService {

  constructor(
    private api: HydrusApiService,
    private hydrusVersion: HydrusVersionService,
    private options: HydrusClientOptionsService
  ) { }

  clientSupportsViews$ = this.hydrusVersion.isAtLeastVersion(607)

  async submitView(file: HydrusBasicFile, viewStartTimestamp: number, viewEndTimestamp: number) {
    if(file.gallery_local)return;

    if(!(await firstValueFrom(this.clientSupportsViews$))) {
      return;
    }

    const options = await firstValueFrom(this.options.clientOptions$);

    if(!options?.options?.booleans?.['file_viewing_statistics_active']) {
      return;
    }

    let viewedTimeMs = viewEndTimestamp - viewStartTimestamp;

    const minMs = options?.options?.noneable_integers?.['file_viewing_statistics_media_min_time_ms']

    if(minMs && viewedTimeMs < minMs) {
      return;
    }

    let maxMs = options?.options?.noneable_integers?.['file_viewing_statistics_media_max_time_ms']

    if(maxMs && file.duration) {
      maxMs = Math.max(maxMs, file.duration * 5);
    }

    if(maxMs && viewedTimeMs > maxMs) {
      viewedTimeMs = maxMs;
    }

    console.log(`Submitting view of ${file.hash} for ${viewedTimeMs}ms`);

    return firstValueFrom(this.api.incrementFileViewtime({
      canvas_type: HydrusCanvasType.CANVAS_CLIENT_API,
      hash: file.hash,
      viewtime: viewedTimeMs / 1000,
      timestamp_ms: viewStartTimestamp
    }));
  }

}
