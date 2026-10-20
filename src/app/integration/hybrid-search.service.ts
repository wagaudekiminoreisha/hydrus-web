import {Injectable,signal} from '@angular/core';
import {Observable,firstValueFrom,timeout} from 'rxjs';
import {IntegrationService,IntegrationAsset} from '../integration.service';
import {HydrusApiService} from '../hydrus-api.service';
import {HydrusSearchTags,HydrusSearchTag} from '../hydrus-tags';
import {NativeGalleryService} from './native-gallery.service';
import {actualTags,normalizeTag,relationIndex,relatedSets,metadataOf} from './media-relations';
import {HydrusBasicFile} from '../hydrus-file';
import {HydrusFilesService} from '../hydrus-files.service';
import {parseSelectionGroupSearchTag,SelectionGroupsService} from '../selection-groups.service';
import {HybridBrowserService} from './hybrid-browser.service';

export const hasPrefixClause=(tag:HydrusSearchTag):boolean=>typeof tag==='string'?tag.replace(/^-/,'').startsWith('@'):tag.some(hasPrefixClause);
/** A search provider for the existing Browse menu, not a second search UI. */
@Injectable({providedIn:'root'})
export class HybridSearchService {
  readonly enabled=signal(localStorage.getItem('hydrus-web-browse-hybrid')==='true');
  readonly loading=signal(false);readonly warning=signal('');
  readonly related=signal<IntegrationAsset|undefined>(undefined);
  scopeLineage=true;scopeSnapshot=false;scopePrefix=false;
  private generation=0;
  constructor(private gallery:IntegrationService,private api:HydrusApiService,private native:NativeGalleryService,private browser:HybridBrowserService,private files:HydrusFilesService,private selections:SelectionGroupsService){}
  setEnabled(enabled:boolean){if(!enabled)this.related.set(undefined);this.enabled.set(enabled);localStorage.setItem('hydrus-web-browse-hybrid',String(enabled));}
  async findRelated(file:HydrusBasicFile){const full=file.gallery_local?this.files.getGalleryFile(file.hash,file.file_id):await firstValueFrom(this.files.getFileByHash(file.hash).pipe(timeout(15000)));this.related.set({id:file.gallery_path||'related:'+file.hash,source:file.gallery_local||file.gallery_path?'comfy':'hydrus',name:file.gallery_name||file.hash.slice(0,12),hash:file.hash,metadata:{...metadataOf({notes:full?.notes}),...file.gallery_metadata}});this.scopeLineage=true;this.scopeSnapshot=false;this.scopePrefix=false;this.setEnabled(true);}
  search(tags:HydrusSearchTags,remote:(tags:HydrusSearchTags)=>Promise<number[]>):Observable<number[]>{
    return new Observable(subscriber=>{
      const generation=++this.generation;let cancelled=false,emitted=false;this.loading.set(true);this.warning.set('');
      const prefixSearch=tags.some(hasPrefixClause)||!!this.related(),base=tags.filter(tag=>!hasPrefixClause(tag));
      let ids:number[]=[],library:any,hydrusWarning='',localWarning='',predicateWarning='';
      let publishedIDs:number[]|undefined;
      const local:IntegrationAsset[]=[],remoteRows:IntegrationAsset[]=[];
      const copyIDs=new Map<string,number>();
      const current=()=>!cancelled&&generation===this.generation;
      const warn=()=>{if(current())this.warning.set([hydrusWarning,localWarning,predicateWarning].filter(Boolean).join(' '));};
      // Serialize publications so a slow adapter cannot overwrite a newer union.
      let publications=Promise.resolve();
      const publish=()=>publications=publications.then(async()=>{
        if(!current())return;
        if(prefixSearch&&!library)return;
        const index=relationIndex([...local,...remoteRows],library||{prefixes:[]});
        const remoteIDSet=new Set(ids);
        const hashIDs=new Map([...copyIDs].filter(([,id])=>remoteIDSet.has(id)));
        const matches=(row:IntegrationAsset,clause:HydrusSearchTag):boolean=>{
          if(Array.isArray(clause))return clause.some(part=>matches(row,part));
          const group=parseSelectionGroupSearchTag(clause);
          if(group){const id=hashIDs.get(row.hash!)||this.native.idFor(row),member=this.selections.groups().find(item=>item.id===group.groupID)?.fileIDs.has(id)||false;return group.excluded?!member:member;}
          const negative=clause.startsWith('-'),value=negative?clause.slice(1):clause;
          let matched=false;
          if(value.startsWith('@'))matched=[...(index.get(row.id)?.prefixes||[])].some(id=>library?.prefixes.find((prefix:any)=>prefix.id===id)?.name.toLowerCase()===value.slice(1).toLowerCase());
          else if(value==='system:everything'||/^system:limit\s*(?:=\s*)?\d+$/i.test(value))matched=true;
          else if(value.startsWith('system:')){predicateWarning='Hydrus system predicates apply to Hydrus files. ComfyUI files are excluded when those predicates cannot be evaluated locally.';warn();return false;}
          else matched=actualTags(row).includes(normalizeTag(value));
          return negative?!matched:matched;
        };
        const relations=this.related()?relatedSets([...local,...remoteRows],this.related()!,library):undefined;
        const relatedMatch=(row:IntegrationAsset)=>!relations||(this.scopeLineage&&relations.lineage.has(row.id))||(this.scopeSnapshot&&relations.snapshots.has(row.id))||(this.scopePrefix&&relations.prefixes.has(row.id));
        const remoteMatches=prefixSearch?remoteRows.filter(row=>tags.filter(hasPrefixClause).every(tag=>matches(row,tag))&&relatedMatch(row)):[];
        const uniqueLocal=new Map<string,IntegrationAsset>();for(const row of local)if(!uniqueLocal.has(row.hash!))uniqueLocal.set(row.hash!,row);
        const matching=[...uniqueLocal.values()].filter(row=>tags.every(tag=>matches(row,tag))&&relatedMatch(row)&&!hashIDs.has(row.hash!));
        let files:HydrusBasicFile[]=[];
        try{files=await this.native.adapt(matching);}catch(error){localWarning='ComfyUI media unavailable: '+(error as Error).message;warn();}
        if(!current())return;
        const remoteIDs=prefixSearch?remoteMatches.map(row=>row.hydrus_id!).filter(id=>id!==undefined):ids;
        const limits=tags.filter((tag):tag is string=>typeof tag==='string').map(tag=>/^system:limit\s*(?:=\s*)?(\d+)$/i.exec(tag)).filter(Boolean).map(match=>Number(match![1]));
        const nextIDs=[...new Set([...remoteIDs,...files.map(file=>file.file_id)])].slice(0,limits.length?Math.min(...limits):undefined);
        if(publishedIDs?.length===nextIDs.length&&publishedIDs.every((id,index)=>id===nextIDs[index]))return;
        publishedIDs=nextIDs;emitted=true;subscriber.next(nextIDs);
      });
      const libraryReady=this.gallery.request<any>('/library').then(result=>{library=result.library;});
      const searchLocal=async()=>{
        try{
          await libraryReady;
          let offset:number|null=0,catalogueId:string|undefined;
          while(offset!==null&&current()){
            const page=await this.gallery.request<any>('/catalogue',{offset,catalogueId,limit:100});
            if(!current())return;
            catalogueId=page.catalogueId;offset=page.nextOffset??null;
            const hashes=page.entries.map((row:IntegrationAsset)=>row.hash);
            let copies:any[]=[];
            if(hashes.length)try{copies=(await firstValueFrom(this.api.getFileMetadata({hashes,include_notes:true}).pipe(timeout(15000)))).metadata;}catch{/* Local copies remain usable if metadata lookup fails. */}
            if(!current())return;
            for(const copy of copies)if(copy.hash)copyIDs.set(copy.hash,copy.file_id);
            for(const row of page.entries){const copy=copies.find(file=>file.hash===row.hash);if(copy)row.tags=Object.values(copy.tags||{}).flatMap((service:any)=>service.display_tags?.['0']||[]);local.push(row);}
            await publish();
          }
        }catch(error){localWarning='ComfyUI search unavailable: '+((error as any).error?.error||(error as any).message||'connection failed');warn();}
      };
      const searchRemote=async()=>{
        try{ids=await remote(base);}catch(error){const status=(error as any).status;hydrusWarning='Hydrus search failed'+(status?' (HTTP '+status+')':': connection unavailable')+'. ComfyUI results are still available.';warn();}
        if(!current())return;
        if(prefixSearch){
          try{await libraryReady;for(let at=0;at<ids.length&&current();at+=100)remoteRows.push(...await this.browser.records(ids.slice(at,at+100)));}
          catch{localWarning='Prefix/provenance metadata unavailable; ordinary Hydrus searches remain available.';warn();}
        }
        await publish();
      };
      // Neither provider waits for the other. A slow Hydrus query is never discarded
      // merely because the local catalogue has already returned results.
      void Promise.allSettled([searchLocal(),searchRemote()]).then(async()=>{
        try{await publications;}catch(error){localWarning=(error as Error).message;warn();}
        if(!current())return;
        if(!emitted)subscriber.next([]);
        this.loading.set(false);subscriber.complete();
      });
      return ()=>{cancelled=true;if(generation===this.generation)this.loading.set(false);};
    });
  }
}
