import {Injectable} from '@angular/core';
import {firstValueFrom} from 'rxjs';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex,utf8ToBytes} from '@noble/hashes/utils.js';
import {HydrusServiceType} from '../hydrus-services';
import {HydrusBasicFile,HydrusFile,getFileCategory} from '../hydrus-file';
import {filetypeFromMime} from '../hydrus-file-mimes';
import {HydrusFilesService} from '../hydrus-files.service';
import {IntegrationService,IntegrationAsset} from '../integration.service';
import {actualTags} from './media-relations';

/** Adapt Gallery files to the same grid, selection, metadata and PhotoSwipe viewer. */
@Injectable({providedIn:'root'})
export class NativeGalleryService {
  private local=new Map<string,HydrusFile>();
  constructor(private integration:IntegrationService,private files:HydrusFilesService){}
  idFor(asset:IntegrationAsset){return -(parseInt(bytesToHex(sha256(utf8ToBytes(this.integration.url+':'+asset.id+':'+(asset.hash||'')))).slice(0,13),16)+1);}
  async adapt(assets:IntegrationAsset[]):Promise<HydrusBasicFile[]>{
    const remote=assets.filter(row=>row.source==='hydrus'||row.locations?.includes('hydrus'));
    let hydrus:HydrusBasicFile[]=[];
    if(remote.length)try{hydrus=await firstValueFrom(this.files.getBasicFilesByHash(remote.map(row=>row.hash!)));}catch{/* Local copies remain usable during Hydrus downtime. */}
    const byHash=new Map(hydrus.map(file=>[file.hash,file]));
    const result:HydrusBasicFile[]=[];
    // Bound ticket requests when a large result page is adapted.
    for(let at=0;at<assets.length;at+=8)result.push(...await Promise.all(assets.slice(at,at+8).map(async asset=>{
      if(byHash.has(asset.hash!)){const copy=byHash.get(asset.hash!)!;if(asset.source==='comfy'||asset.locations?.includes('comfy')){copy.gallery_path=asset.id;copy.gallery_metadata=asset.metadata||{};}return copy;}
      if(asset.source==='hydrus')throw new Error('Hydrus media metadata is unavailable.');
      const key=this.integration.url+':'+asset.id+':'+(asset.hash||'');
      let file=this.local.get(key);
      if(!file){
        const hash=asset.hash||bytesToHex(sha256(utf8ToBytes(key))),type=filetypeFromMime(asset.mime||'image/png');
        let expires=0,identity='';
        file={file_id:this.idFor(asset),hash,size:asset.size||0,mime:asset.mime||'image/png',ext:'.'+asset.name.split('.').pop(),width:asset.width||1024,height:asset.height||768,
          has_audio:asset.mime?.startsWith('video/')||false,file_url:'',thumbnail_url:'',file_type:type,filetype_enum:type,file_category:getFileCategory(type),file_type_string:asset.mime||'',has_thumbnail:true,
          gallery_local:true,gallery_path:asset.id,gallery_metadata:asset.metadata||{},gallery_name:asset.name,known_urls:[],file_services:{current:{},deleted:{}},time_modified:asset.timestamp||0,is_inbox:false,is_local:false,is_trashed:false,file_viewing_statistics:[],
          tags:{gallery:{name:'ComfyUI prompt tags',type:HydrusServiceType.COMBINED_TAG,type_pretty:'Read-only prompt tags',storage_tags:{},display_tags:{'0':actualTags(asset)}}},
          notes:{'ComfyUI Gallery generation metadata':JSON.stringify(asset.metadata||{})}};
        const target=file;
        target.resolve_media=async()=>{if(Date.now()<expires&&identity===this.integration.mediaConnectionID())return;const [original,thumbnail]=await Promise.all([this.integration.media(asset),this.integration.media(asset,true)]);target.file_url=original;target.thumbnail_url=thumbnail;expires=Date.now()+240000;identity=this.integration.mediaConnectionID();};
        this.local.set(key,file);
      }
      file.gallery_metadata=asset.metadata||{};file.tags.gallery.display_tags['0']=actualTags(asset);file.notes={'ComfyUI Gallery generation metadata':JSON.stringify(asset.metadata||{})};
      await file.resolve_media!();this.files.registerGalleryFile(file);return file;
    })));
    return result;
  }
}
