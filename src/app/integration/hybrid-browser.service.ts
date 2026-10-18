import {Injectable} from '@angular/core';
import {firstValueFrom,timeout} from 'rxjs';
import {HydrusApiService} from '../hydrus-api.service';
import {IntegrationService,IntegrationAsset} from '../integration.service';
import {metadataOf} from './media-relations';

@Injectable({providedIn:'root'})
export class HybridBrowserService {
  constructor(private hydrus:HydrusApiService,private gallery:IntegrationService){}
  async ids(tags:string[]):Promise<number[]> {
    const result=await firstValueFrom(this.hydrus.searchFiles(tags,{return_file_ids:true,return_hashes:false}).pipe(timeout(15000)));
    return result.file_ids;
  }
  async records(ids:number[]):Promise<IntegrationAsset[]> {
    if(!ids.length)return [];
    const result=await firstValueFrom(this.hydrus.getFileMetadata({file_ids:ids,include_notes:true}).pipe(timeout(15000)));
    return (result.metadata as any[]).filter(row=>row.hash&&!row.is_deleted&&!row.is_trashed&&!row.is_in_trash).map(row=>({
      id:'hydrus:'+row.hash,source:'hydrus',name:row.known_urls?.[0]?.split('/').pop()||row.hash.slice(0,12),hash:row.hash,mime:row.mime,
      timestamp:Math.max(0,...Object.values(row.file_services?.current||{}).map((service:any)=>Number(service.time_imported)||0))||row.time_modified||0,
      metadata:metadataOf(row),tags:Object.values(row.tags||{}).flatMap((service:any)=>service.display_tags?.['0']||service.storage_tags?.['0']||[])
    }));
  }
  media(asset:IntegrationAsset,thumbnail=false):Promise<string> {
    return asset.source==='hydrus'?Promise.resolve(thumbnail?this.hydrus.getThumbnailURLFromHash(asset.hash!):this.hydrus.getFileURLFromHash(asset.hash!)):this.gallery.media(asset,thumbnail);
  }
}
