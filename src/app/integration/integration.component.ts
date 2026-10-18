import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {Component, Input, OnDestroy, ViewChild, ElementRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {IntegrationAsset, IntegrationService} from '../integration.service';
import {IntegrationVisibleDirective} from './integration-visible.directive';
import {HydrusApiSettingsService} from '../hydrus-api-settings.service';
import {HybridBrowserService} from './hybrid-browser.service';
import {actualTags, normalizeTag, links, relationIndex, relatedSets, mergeCopies} from './media-relations';
import {SettingsService} from '../settings.service';

@Component({selector:'app-integration',standalone:true,imports:[CommonModule,FormsModule,RouterLink,IntegrationVisibleDirective],templateUrl:'./integration.component.html',styleUrls:['./integration.component.scss']})
export class IntegrationComponent implements OnDestroy {
  @Input() settingsOnly=false;
  get comfyBrowser(){return !this.settingsOnly;}
  get connectionSummary(){return this.busy?(this.connected?'Loading output folder…':'Connecting to ComfyUI…'):this.connected?'Connected directly to ComfyUI Gallery':!this.integration.url?'ComfyUI address is not configured':'ComfyUI is not connected';}
  comfyUrl=this.integration.url;
  connected=false;busy=false;connectionError='';
  status=this.integration.url?'':'No ComfyUI address is saved. Open Settings → ComfyUI, enter its address, then choose Save & connect.';
  outputFolder='';outputFolders:{name:string;path:string}[]=[];outputOffset:number|null=null;outputTotal=0;
  assets:IntegrationAsset[]=[];order='date';hasMore=false;loadingMore=false;pageError='';searched=false;
  mode='folder';query='';prefixId='';snapshotId='';library:any={prefixes:[],snapshots:{}};
  associationPrefixId='';libraryRevision='';selected=new Set<string>();related?:IntegrationAsset;scopeLineage=true;scopeSnapshot=false;scopePrefix=false;
  private raw:IntegrationAsset[]=[];private catalogueId='';private localOffset:number|null=0;private hydrusIds:number[]=[];private hydrusOffset=0;
  private warnings:string[]=[];
  get snapshots():any[]{return (Object.values(this.library.snapshots||{}) as any[]).filter(row=>!this.prefixId||row.prefix_id===this.prefixId);}
  viewing?:IntegrationAsset;viewURL='';playing=false;
  private timer?:ReturnType<typeof setTimeout>;private revision=0;private searchRevision=0;private destroyed=false;
  private thumbnailCache=new Map<string,string>();private thumbnails=new Set<string>();private thumbnailRequests=new Set<string>();
  private handshakeTimer?:ReturnType<typeof setInterval>;
  @ViewChild('media') media?:ElementRef<HTMLMediaElement>;
  constructor(public integration:IntegrationService, private api:HydrusApiSettingsService,public settings:SettingsService,private hybrid:HybridBrowserService){
    if(integration.url)void this.connect(false,false);
    this.handshakeTimer=setInterval(()=>{if(!this.connected&&!this.busy&&this.integration.url&&this.api.hydrusApiKey()&&!this.integration.replacement())void this.connect(false,false);},15000);
  }
  private async run(action:()=>Promise<void>){
    if(this.busy)return;this.busy=true;this.status='';
    try{await action();}catch(error:any){this.status=error.error?.error||error.message||String(error);if(!this.connected)this.connectionError=this.status;}finally{this.busy=false;}
  }
  async connect(confirmReplacement=false,save=true){
    await this.run(async()=>{
      this.connected=false;if(save)this.integration.setAddress(this.comfyUrl);
      await this.integration.connect(confirmReplacement);
      if(this.destroyed)return;
      this.connected=true;this.connectionError='';this.status='Connected directly. No separate bridge process is required.';
    });
    if(this.connected&&this.comfyBrowser)await this.search();
  }
  search() {if(this.mode!=='folder')return this.searchHybrid();return this.run(async()=>{
    const revision=++this.searchRevision;
    this.closeViewer();this.releaseThumbnails();this.thumbnailRequests.clear();
    this.assets=[];this.hasMore=false;this.loadingMore=false;this.pageError='';this.searched=false;
    const result=await this.integration.request<any>('/output',{folder:this.outputFolder,offset:0,order:this.order,limit:48});
    if(this.destroyed||revision!==this.searchRevision)return;
    this.outputFolders=result.folders||[];this.outputOffset=result.nextOffset??null;this.outputTotal=result.total||0;
    this.assets=result.entries;this.hasMore=this.outputOffset!==null;this.searched=true;this.status=`${this.outputTotal} items`;
  });}
  loadMore():Promise<boolean>{return this.mode==='folder'?this.loadMoreOutput():this.loadMoreHybrid();}
  async browseFolder(folder:string){this.outputFolder=folder;return this.search();}
  parentFolder(){return this.outputFolder.split('/').slice(0,-1).join('/');}
  private async loadMoreOutput():Promise<boolean>{
    if(this.loadingMore||this.outputOffset===null||this.busy)return false;
    const revision=this.searchRevision;this.loadingMore=true;this.pageError='';
    try{const result=await this.integration.request<any>('/output',{folder:this.outputFolder,offset:this.outputOffset,order:this.order,limit:48});if(revision!==this.searchRevision)return false;this.assets=[...this.assets,...result.entries];this.outputFolders=[...this.outputFolders,...result.folders];this.outputOffset=result.nextOffset??null;this.hasMore=this.outputOffset!==null;return true;}
    catch(error:any){if(revision===this.searchRevision)this.pageError=error.error?.error||error.message;return false;}
    finally{if(revision===this.searchRevision)this.loadingMore=false;}
  }
  async loadThumbnail(asset:IntegrationAsset) {
    if(asset.thumbnail||this.thumbnailRequests.has(asset.id)||(asset.source==='folder'&&!this.isImage(asset)))return;
    this.thumbnailRequests.add(asset.id);const revision=this.searchRevision;
    try {const url=await this.hybrid.media(asset,true);if(this.destroyed||revision!==this.searchRevision){URL.revokeObjectURL(url);return;}asset.thumbnail=url;this.thumbnailCache.set(asset.id,url);const current=this.assets.find(row=>row.id===asset.id);if(current)current.thumbnail=url;this.thumbnails.add(url);}
    catch{/* Opening the full media remains available when a thumbnail fails. */}
  }
  async changeMode(){this.selected.clear();this.related=undefined;this.prefixId='';this.snapshotId='';return this.search();}
  toggle(asset:IntegrationAsset){this.selected.has(asset.id)?this.selected.delete(asset.id):this.selected.add(asset.id);}
  acceptDrop(event:DragEvent){if(event.dataTransfer?.types.includes('Files'))event.preventDefault();}
  async dropImage(event:DragEvent){if(!event.dataTransfer?.files.length)return;event.preventDefault();const file=event.dataTransfer.files[0];await this.searchImage(file);}
  async pickImage(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(file)await this.searchImage(file);}
  async searchImage(file:File){
    if(this.busy)return;
    try{const digest=sha256.create(),reader=file.stream().getReader();try{for(;;){const chunk=await reader.read();if(chunk.done)break;digest.update(chunk.value);}}finally{reader.releaseLock();}
      const hash=bytesToHex(digest.digest());await this.findRelated({id:'image:'+hash,hash,source:'external',name:file.name,metadata:{}});
    }catch(error){this.status=this.errorText(error);}
  }
  async findRelated(asset:IntegrationAsset){this.related=asset;this.scopeLineage=true;this.scopeSnapshot=false;this.scopePrefix=false;this.query='';this.prefixId='';this.snapshotId='';this.mode='both';await this.search();}
  clearRelated(){this.related=undefined;this.applyFilters();}
  labels(asset:IntegrationAsset){return links(asset,this.library);}
  prefixName(id:string){return this.library.prefixes?.find((row:any)=>row.id===id)?.name||id;}
  async copyTags(asset:IntegrationAsset){try{await navigator.clipboard.writeText(actualTags(asset).join(', '));this.status='Tags copied.';}catch{this.status='Clipboard is unavailable in this browser.';}}
  tags(asset:IntegrationAsset){return actualTags(asset);}
  associate(action:'associate'|'dissociate',asset?:IntegrationAsset){return this.run(async()=>{
    const items=asset?[asset]:this.assets.filter(row=>this.selected.has(row.id));
    if(!items.length)throw new Error('Select images first.');
    const result=await this.integration.request<any>('/association',{action,items:items.map(row=>({id:row.id,source:row.source,hash:row.hash})),prefix_id:this.associationPrefixId,revision:this.libraryRevision});
    this.library=result.library;this.libraryRevision=result.revision;this.applyFilters();this.status=action==='associate'?'Prefix pairing saved. Existing snapshots and generation history are retained.':'Direct prefix pairing removed. Existing snapshots and generation history are retained.';
  });}
  private async searchHybrid(){return this.run(async()=>{
    const revision=++this.searchRevision;this.closeViewer();this.releaseThumbnails();this.thumbnailRequests.clear();
    this.catalogueId='';this.raw=[];this.assets=[];this.selected.clear();this.localOffset=this.mode==='hydrus'?null:0;this.hydrusIds=[];this.hydrusOffset=0;this.warnings=[];this.pageError='';this.loadingMore=false;this.hasMore=false;this.searched=false;
    const sources=await Promise.allSettled([
      this.integration.url?this.integration.request<any>('/library'):Promise.resolve({library:{prefixes:[],snapshots:{}}}),
      this.mode==='local'?Promise.resolve([]):this.hybrid.ids(this.split(this.query).filter(tag=>!tag.startsWith('@')))
    ]);
    if(this.destroyed||revision!==this.searchRevision)return;
    if(sources[0].status==='fulfilled'){this.library=sources[0].value.library;this.libraryRevision=sources[0].value.revision;}
    else this.warnings.push('Gallery prefix library unavailable. '+this.errorText(sources[0].reason));
    if(sources[1].status==='fulfilled')this.hydrusIds=sources[1].value;
    else this.warnings.push('Hydrus unavailable. '+this.errorText(sources[1].reason));
    await this.fetchHybridPage(revision);this.searched=true;
  });}
  private errorText(error:any){return error.error?.error||error.message||String(error);}
  private async fetchHybridPage(revision:number){
    const offset=this.localOffset,remote=this.hydrusOffset;
    const pages=await Promise.allSettled([
      offset===null?Promise.resolve(null):this.integration.request<any>('/catalogue',{offset,limit:100,order:this.order,catalogueId:this.catalogueId||undefined}),
      this.hybrid.records(this.hydrusIds.slice(remote,remote+100))
    ]);
    if(this.destroyed||revision!==this.searchRevision)return;
    if(pages[0].status==='fulfilled'&&pages[0].value){this.catalogueId=pages[0].value.catalogueId;this.raw.push(...pages[0].value.entries);this.localOffset=pages[0].value.nextOffset??null;}
    else if(pages[0].status==='rejected'){this.localOffset=null;this.warnings.push('Local media unavailable. '+this.errorText(pages[0].reason));}
    if(pages[1].status==='fulfilled'){this.raw.push(...pages[1].value);this.hydrusOffset=Math.min(remote+100,this.hydrusIds.length);}
    else {this.pageError='Hydrus page failed. '+this.errorText(pages[1].reason);}
    this.hasMore=this.localOffset!==null||this.hydrusOffset<this.hydrusIds.length;this.applyFilters();
  }
  async loadMoreHybrid():Promise<boolean>{
    if(this.busy||this.loadingMore||!this.hasMore)return false;
    const revision=this.searchRevision;this.loadingMore=true;this.pageError='';
    try{await this.fetchHybridPage(revision);return true;}finally{if(revision===this.searchRevision)this.loadingMore=false;}
  }
  applyFilters(){
    const merged=mergeCopies(this.raw) as IntegrationAsset[],index=relationIndex(merged,this.library);
    for(const asset of merged)asset.thumbnail=this.thumbnailCache.get(asset.id);
    const tokens=this.split(this.query),required=tokens.filter(tag=>!tag.startsWith('@')),prefixTokens=tokens.filter(tag=>tag.startsWith('@')).map(tag=>tag.slice(1).toLowerCase());
    const related=this.related?relatedSets(merged,this.related,this.library):undefined;
    this.assets=merged.filter(row=>{
      const relation=index.get(row.id)!,tags=new Set(actualTags(row));
      if(!required.every(tag=>tag.startsWith('-')?!tags.has(normalizeTag(tag.slice(1))):tags.has(normalizeTag(tag))))return false;
      if(this.prefixId&&!relation.prefixes.has(this.prefixId))return false;
      if(this.snapshotId&&!relation.snapshots.has(this.snapshotId))return false;
      if(!prefixTokens.every(token=>[...relation.prefixes].some(id=>this.prefixName(id).toLowerCase()===token)))return false;
      return !related||(this.scopeLineage&&related.lineage.has(row.id))||(this.scopeSnapshot&&related.snapshots.has(row.id))||(this.scopePrefix&&related.prefixes.has(row.id));
    }).sort((a,b)=>this.order==='name'?a.name.localeCompare(b.name):(b.timestamp||0)-(a.timestamp||0));
    const ids=new Set(this.assets.map(row=>row.id));this.selected.forEach(id=>{if(!ids.has(id))this.selected.delete(id);});
    this.status=[`${this.assets.length} matches · ${merged.length} unique files loaded${this.hasMore?' · more results load as you scroll':''}`, ...this.warnings].join(' · ');
  }
  trackAsset(_index:number,asset:IntegrationAsset) {return asset.id;}
  split(text:string) {return text.split(/[,\n]/).map(tag=>tag.trim()).filter(Boolean);}
  sort() {return this.search();}
  isVideo(asset:IntegrationAsset) {return !!asset.mime?.startsWith('video/')||/\.(mp4|webm|mov|mkv)$/i.test(asset.name)||['.mp4','.webm','.mov','.mkv'].includes(asset.mime||'');}
  isImage(asset:IntegrationAsset) {return !this.isVideo(asset)&&!asset.mime?.startsWith('audio/')&&!/\.(mp3|wav|flac)$/i.test(asset.name);}
  async open(asset:IntegrationAsset) {this.clearTimer();const version=++this.revision;this.viewing=asset;this.viewURL='';try{const url=await this.hybrid.media(asset);if(version!==this.revision){URL.revokeObjectURL(url);return;}this.viewURL=url;}catch(error:any){this.status=error.error?.error||error.message;}}
  loaded() {if(this.viewURL&&this.playing&&this.viewing&&this.isImage(this.viewing))this.timer=setTimeout(()=>this.next(),Math.max(1,Number(this.settings.appSettings.slideshowIntervalSeconds)||5)*1000);}
  startPlayback() {this.playing=!this.playing;this.clearTimer();if(this.media?.nativeElement){this.media.nativeElement.loop=!this.playing&&this.settings.appSettings.mediaLoop;if(this.playing)this.media.nativeElement.play().catch(()=>{this.status='Tap Play on the media to start playback.';});}else this.loaded();}
  ended() {if(this.playing)this.next();}
  async next(step=1) {
    const revision=this.revision,id=this.viewing?.id;if(!id)return;
    const index=this.assets.findIndex(asset=>asset.id===id);
    if(step>0&&!this.assets[index+step]&&this.hasMore)await this.loadMore();
    if(revision!==this.revision||this.destroyed)return;
    const next=this.assets[index+step];
    if(next){if(this.viewURL)URL.revokeObjectURL(this.viewURL);void this.open(next);}else{this.playing=false;this.clearTimer();}
  }
  closeViewer() {this.revision++;this.clearTimer();this.media?.nativeElement.pause();if(this.viewURL)URL.revokeObjectURL(this.viewURL);this.viewURL='';this.viewing=undefined;this.playing=false;}
  private clearTimer() {clearTimeout(this.timer);this.timer=undefined;}
  private releaseThumbnails(){this.thumbnails.forEach(url=>URL.revokeObjectURL(url));this.thumbnails.clear();this.thumbnailCache.clear();}
  ngOnDestroy(){this.destroyed=true;clearInterval(this.handshakeTimer);this.searchRevision++;this.closeViewer();this.releaseThumbnails();}
}
