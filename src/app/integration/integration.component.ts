import {Component, Input, OnDestroy, ViewChild, ElementRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {IntegrationAsset, IntegrationPage, IntegrationService} from '../integration.service';
import {IntegrationVisibleDirective} from './integration-visible.directive';
import {HydrusApiSettingsService} from '../hydrus-api-settings.service';
import {SettingsService} from '../settings.service';

@Component({selector:'app-integration',standalone:true,imports:[CommonModule,FormsModule,RouterLink,IntegrationVisibleDirective],templateUrl:'./integration.component.html',styleUrls:['./integration.component.scss']})
export class IntegrationComponent implements OnDestroy {
  @Input() settingsOnly=false;
  get comfyBrowser() {return !this.settingsOnly;}
  get connectionSummary() {
    if(!this.connected)return this.busy?'Checking connection…':'Connection unavailable';
    if(!this.config.comfyUrl)return 'ComfyUI is not configured';
    if(!this.diagnostics)return 'ComfyUI connection has not been verified';
    const checks=this.diagnostics.checks;
    return checks?.length&&checks.every(check=>check.ok)?'Connected to ComfyUI Gallery':'ComfyUI connection needs attention';
  }
  bridgeUrl=this.integration.url;token=this.integration.token;connected=false;busy=false;status='';
  config:any={comfyUrl:'',hydrusUrl:this.api.hydrusApiUrl()||'http://127.0.0.1:45869',hydrusApiKey:this.api.hydrusApiKey()||'',tagServiceKey:''};
  diagnostics?:{checks:{name:string;ok:boolean;message:string}[];instanceId?:string;pairedInstanceId?:string};
  private handshakeTimer?:ReturnType<typeof setInterval>;
  private handshaking=false;
  folders:any[]=[];prefixes:any[]=[];services:any[]=[];assets:IntegrationAsset[]=[];selected=new Set<string>();
  source=this.comfyBrowser?'comfy':'both';query='';prefixId='';order='date';inherit=true;extraTags='';relationships:any;relationshipTag='';tagOperation='add';replacement='';
  folder:any={path:'',enabled:true,recursive:true,inheritPrompts:true,tags:'',tagPrefix:'',prefixId:'',intervalSeconds:60,archive:false};
  viewing?:IntegrationAsset;viewURL='';playing=false;private timer?:ReturnType<typeof setTimeout>;private revision=0;private thumbnails=new Set<string>();
  hasMore=false;loadingMore=false;pageError='';searched=false;
  private cursor:string|null=null;
  private endpoint='/search';
  private searchRevision=0;
  private destroyed=false;
  private pagePromise?:Promise<boolean>;
  private thumbnailRequests=new Set<string>();
  private warnings:string[]=[];
  @ViewChild('media') media?:ElementRef<HTMLMediaElement>;
  constructor(public integration:IntegrationService,private api:HydrusApiSettingsService,public settings:SettingsService) {
    void integration.ready.then(()=>{if(this.destroyed)return;this.bridgeUrl=integration.url;this.token=integration.token;if(integration.managed()||this.token)void this.connect();});
    this.handshakeTimer=setInterval(()=>{if(this.connected&&this.config.comfyUrl&&!this.config.comfyInstanceId&&!this.busy&&!this.handshaking)void this.retryHandshake();},15000);
  }
  private async retryHandshake() {
    this.handshaking=true;
    try{const saved=await this.integration.request('/handshake',{});if(this.destroyed)return;this.config={...saved,hydrusApiKey:''};await this.checkConnection();this.status='Gallery connected automatically using the saved Hydrus connection.';if(this.comfyBrowser)await this.search();}
    catch{/* The visible diagnostics explain initial setup; saving Gallery's connection is picked up on the next attempt. */}
    finally{this.handshaking=false;}
  }
  private async run(action:()=>Promise<void>) {if(this.busy)return;this.busy=true;this.status='';try{await action();}catch(error:any){this.status=error.error?.error||error.message||String(error);}finally{this.busy=false;}}
  async connect() {await this.run(async()=>{this.integration.url=this.bridgeUrl.replace(/\/$/,'');this.integration.token=this.token;this.connected=false;await this.integration.request('/health');let config=await this.integration.request('/config');if(this.integration.managed()&&!config.hasHydrusKey&&this.api.hydrusApiKey())config=await this.integration.request('/config',{hydrusUrl:new URL(this.api.hydrusApiUrl()||'http://127.0.0.1:45869',location.origin).href,hydrusApiKey:this.api.hydrusApiKey()});if(!this.integration.managed())this.integration.saveConnection(this.bridgeUrl,this.token);this.config={...config,hydrusApiKey:config.hasHydrusKey?'':this.config.hydrusApiKey};this.folders=config.folders||[];this.connected=true;if(config.comfyUrl)await this.checkConnection();this.status=config.comfyUrl?'Connection loaded. Check the verification results in Settings.':'Enter your ComfyUI address in Settings to connect.';if(!this.comfyBrowser)await this.loadServices();});if(this.comfyBrowser&&this.connected){if(this.config.comfyUrl)await this.search();else this.status='Open Settings > ComfyUI to configure the connection.';}}
  async checkConnection() {
    try { const diagnostics=await this.integration.request('/diagnostics');if(this.destroyed)return;this.diagnostics=diagnostics;if(diagnostics.pairedInstanceId)this.config.comfyInstanceId=diagnostics.pairedInstanceId; }
    catch(error:any){this.diagnostics={checks:[{name:'Connection diagnostics',ok:false,message:error.error?.error||error.message}]};}
  }
  pairInstance() {return this.run(async()=>{
    if(!this.diagnostics?.instanceId)throw new Error('Check the connection first.');
    const saved=await this.integration.request('/config',{comfyInstanceId:this.diagnostics.instanceId});
    this.config={...saved,hydrusApiKey:''};await this.checkConnection();this.status='Gallery instance paired. Refresh the search before transferring files.';
    this.assets=[];this.selected.clear();this.hasMore=false;this.cursor=null;
  });}
  async loadServices() {
    try{const response=await this.integration.request('/tags',{operation:'services'});this.services=Object.values(response.services||response).flatMap((value:any)=>Array.isArray(value)?value:[value]).filter((service:any)=>[0,5].includes(service.type));}catch{/* A new connection may not have its Hydrus key yet. */}
    if(!this.comfyBrowser&&this.config.comfyUrl)try{const page=await this.integration.request<IntegrationPage>('/search',{source:'comfy',limit:1});if(!this.destroyed)this.prefixes=page.prefixes||[];}catch{/* Folder setup remains available while Gallery is offline. */}
  }
  configure() {return this.run(async()=>{const {folders,...config}=this.config;const saved=await this.integration.request('/config',config);this.config={...saved,hydrusApiKey:''};await this.loadServices();await this.checkConnection();this.status=this.config.comfyInstanceId?'Gallery connection established.':'Settings saved. Complete the Hydrus connection in Gallery; the handshake retries automatically.';});}
  search() {return this.run(async()=>{
    const revision=++this.searchRevision;
    this.closeViewer();this.releaseThumbnails();this.thumbnailRequests.clear();
    this.assets=[];this.selected.clear();this.cursor=null;this.hasMore=false;this.loadingMore=false;this.pagePromise=undefined;this.pageError='';this.warnings=[];this.searched=false;
    this.endpoint=this.source==='folder'?'/local':'/search';
    const result=await this.integration.request<IntegrationPage>(this.endpoint,{source:this.source,tags:this.split(this.query),prefixId:this.prefixId,order:this.order,limit:48});
    if(this.destroyed||revision!==this.searchRevision)return;
    this.appendPage(result);this.searched=true;
  });}
  private appendPage(result:IntegrationPage) {
    const known=new Set(this.assets.map(asset=>asset.id));
    this.assets=[...this.assets,...result.entries.filter(asset=>{if(known.has(asset.id))return false;known.add(asset.id);return true;})];
    this.prefixes=result.prefixes||this.prefixes;
    this.cursor=result.nextCursor||null;this.hasMore=!!this.cursor;
    this.warnings=[...new Set([...this.warnings,...(result.warnings||[])])];
    this.status=[`${this.assets.length} files loaded`,...this.warnings].join(' · ');
  }
  loadMore():Promise<boolean> {
    if(this.pagePromise)return this.pagePromise;
    if(!this.cursor||this.busy||this.destroyed)return Promise.resolve(false);
    const revision=this.searchRevision,cursor=this.cursor,endpoint=this.endpoint;
    this.loadingMore=true;this.pageError='';
    const task=(async()=>{
      try {
        const result=await this.integration.request<IntegrationPage>(endpoint,{cursor});
        if(this.destroyed||revision!==this.searchRevision)return false;
        this.appendPage(result);return true;
      }catch(error:any){if(revision===this.searchRevision)this.pageError=error.error?.error||error.message||String(error);return false;}
      finally {if(revision===this.searchRevision){this.loadingMore=false;this.pagePromise=undefined;}}
    })();
    this.pagePromise=task;return task;
  }
  async loadThumbnail(asset:IntegrationAsset) {
    if(asset.thumbnail||this.thumbnailRequests.has(asset.id)||(asset.source==='folder'&&!this.isImage(asset)))return;
    this.thumbnailRequests.add(asset.id);const revision=this.searchRevision;
    try {const url=await this.integration.media(asset,true);if(this.destroyed||revision!==this.searchRevision){URL.revokeObjectURL(url);return;}asset.thumbnail=url;this.thumbnails.add(url);}
    catch{/* Opening the full media remains available when a thumbnail fails. */}
  }
  trackAsset(_index:number,asset:IntegrationAsset) {return asset.id;}
  split(text:string) {return text.split(/[,\n]/).map(tag=>tag.trim()).filter(Boolean);}
  sort() {return this.search();}
  toggle(asset:IntegrationAsset) {this.selected.has(asset.id)?this.selected.delete(asset.id):this.selected.add(asset.id);}
  isVideo(asset:IntegrationAsset) {return !!asset.mime?.startsWith('video/')||/\.(mp4|webm|mov|mkv)$/i.test(asset.name)||['.mp4','.webm','.mov','.mkv'].includes(asset.mime||'');}
  isImage(asset:IntegrationAsset) {return !this.isVideo(asset)&&!asset.mime?.startsWith('audio/')&&!/\.(mp3|wav|flac)$/i.test(asset.name);}
  async open(asset:IntegrationAsset) {this.clearTimer();const version=++this.revision;this.viewing=asset;this.viewURL='';try{const url=await this.integration.media(asset);if(version!==this.revision){URL.revokeObjectURL(url);return;}this.viewURL=url;}catch(error:any){this.status=error.error?.error||error.message;}}
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
  selectedAssets() {return this.assets.filter(asset=>this.selected.has(asset.id));}
  transfer(action:'export'|'import') {return this.run(async()=>{const targets=this.selectedAssets().filter(asset=>action==='import'?asset.source==='hydrus':asset.source!=='hydrus');if(!targets.length)throw new Error('Select files from the appropriate source first.');for(const asset of targets)await this.integration.request('/'+action,{id:asset.id,inherit:this.inherit,tags:this.split(this.extraTags)});this.status=`${targets.length} files ${action==='import'?'copied to ComfyUI input':'exported to Hydrus'}.`;});}
  syncMetadata() {return this.run(async()=>{const targets=this.selectedAssets();for(const asset of targets){const result=await this.integration.request('/sync',{id:asset.id,inherit:this.inherit,tags:this.split(this.extraTags)});asset.metadata=result.metadata;asset.prompts=result.prompts;asset.tags=[...new Set([...(asset.tags||[]),...result.tags])];}this.status=`Metadata synced for ${targets.length} files.`;});}
  syncTags() {return this.run(async()=>{const hashes=this.selectedAssets().filter(asset=>asset.source==='hydrus'&&asset.hash).map(asset=>asset.hash);if(!hashes.length)throw new Error('Select Hydrus files first.');for(let at=0;at<hashes.length;at+=200)await this.integration.request('/tags',{hashes:hashes.slice(at,at+200),tags:this.split(this.extraTags),operation:this.tagOperation,newTag:this.replacement});this.status='Tags updated in Hydrus. Refresh the search to see them.';});}
  lookupRelationships() {return this.run(async()=>{this.relationships=undefined;const response=await this.integration.request('/tags',{operation:'relationships',tag:this.relationshipTag.trim()});this.relationships=Object.entries(response.tags?.[this.relationshipTag.trim()]||{}).map(([key,data])=>({service:response.services?.[key]?.name||'Tag service',...(data as object)}));});}
  addFolder() {return this.run(async()=>{await this.integration.request('/folders',{...this.folder,tags:this.split(this.folder.tags)});this.folders=await this.integration.request('/folders');this.status='Import folder saved. Files are imported after two stable scans; originals are retained.';});}
  scan() {return this.run(async()=>{const result=await this.integration.request('/scan',{});this.folders=result.folders;this.status='Scan complete. New files need a second stable scan before import.';});}
  setFolder(rule:any) {return this.run(async()=>{this.folders=await this.integration.request('/folders/update',{id:rule.id,enabled:!rule.enabled});});}
  removeFolder(rule:any) {return this.run(async()=>{this.folders=await this.integration.request('/folders/'+encodeURIComponent(rule.id),undefined,'DELETE');});}
  private releaseThumbnails() {this.thumbnails.forEach(url=>URL.revokeObjectURL(url));this.thumbnails.clear();}
  ngOnDestroy() {this.destroyed=true;clearInterval(this.handshakeTimer);this.searchRevision++;this.closeViewer();this.releaseThumbnails();}
}
