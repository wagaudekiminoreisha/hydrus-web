import {Component, OnDestroy, ViewChild, ElementRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {IntegrationAsset, IntegrationService} from '../integration.service';
import {HydrusApiSettingsService} from '../hydrus-api-settings.service';
import {SettingsService} from '../settings.service';

@Component({selector:'app-integration',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./integration.component.html',styleUrls:['./integration.component.scss']})
export class IntegrationComponent implements OnDestroy {
  bridgeUrl=this.integration.url;token=this.integration.token;connected=false;busy=false;status='';
  config:any={comfyUrl:'',hydrusUrl:this.api.hydrusApiUrl()||'http://127.0.0.1:45869',hydrusApiKey:this.api.hydrusApiKey()||'',tagServiceKey:''};
  folders:any[]=[];prefixes:any[]=[];services:any[]=[];assets:IntegrationAsset[]=[];selected=new Set<string>();
  source='both';query='';prefixId='';order='date';inherit=true;extraTags='';relationships:any;relationshipTag='';tagOperation='add';replacement='';
  folder:any={path:'',enabled:true,recursive:true,inheritPrompts:true,tags:'',tagPrefix:'',prefixId:'',intervalSeconds:60,archive:false};
  viewing?:IntegrationAsset;viewURL='';playing=false;private timer?:ReturnType<typeof setTimeout>;private revision=0;private thumbnails=new Set<string>();
  @ViewChild('media') media?:ElementRef<HTMLMediaElement>;
  constructor(public integration:IntegrationService,private api:HydrusApiSettingsService,public settings:SettingsService) {void integration.ready.then(()=>{this.bridgeUrl=integration.url;this.token=integration.token;});}
  private async run(action:()=>Promise<void>) {if(this.busy)return;this.busy=true;this.status='';try{await action();}catch(error:any){this.status=error.error?.error||error.message||String(error);}finally{this.busy=false;}}
  connect() {return this.run(async()=>{this.integration.url=this.bridgeUrl.replace(/\/$/,'');this.integration.token=this.token;await this.integration.request('/health');this.integration.saveConnection(this.bridgeUrl,this.token);const config=await this.integration.request('/config');this.config={...config,hydrusApiKey:this.config.hydrusApiKey};this.folders=config.folders;this.connected=true;this.status='Bridge connected. Save server addresses and tag service before importing.';await this.loadServices();});}
  async loadServices() {try{const response=await this.integration.request('/tags',{operation:'services'});this.services=Object.values(response.services||response).flatMap((value:any)=>Array.isArray(value)?value:[value]).filter((service:any)=>[0,5].includes(service.type));}catch{/* A new bridge may not have its Hydrus key yet. */}}
  configure() {return this.run(async()=>{const {folders,...config}=this.config;const saved=await this.integration.request('/config',config);this.config={...saved,hydrusApiKey:''};await this.loadServices();this.status='Integration settings saved.';});}
  search() {return this.run(async()=>{this.closeViewer();this.releaseThumbnails();const result=this.source==='folder'?await this.integration.request('/local'):await this.integration.request('/search',{source:this.source,tags:this.split(this.query),prefixId:this.prefixId});this.assets=result.entries;this.prefixes=result.prefixes||this.prefixes;this.selected.clear();this.status=(result.warnings||[]).join(' · ')||`${this.assets.length} files`;this.sort();const revision=++this.revision;void (async()=>{for(const asset of this.assets){try{if(asset.source==='folder'&&!this.isImage(asset))continue;const url=await this.integration.media(asset,true);if(revision!==this.revision){URL.revokeObjectURL(url);return;}asset.thumbnail=url;this.thumbnails.add(url);}catch{/* The media can still be opened when no thumbnail is available. */}}})();});}
  split(text:string) {return text.split(/[,\n]/).map(tag=>tag.trim()).filter(Boolean);}
  sort() {if(this.order==='random')this.assets=[...this.assets].map(asset=>({asset,key:Math.random()})).sort((a,b)=>a.key-b.key).map(item=>item.asset);else this.assets=[...this.assets].sort((a,b)=>this.order==='name'?a.name.localeCompare(b.name):(b.timestamp||0)-(a.timestamp||0));}
  toggle(asset:IntegrationAsset) {this.selected.has(asset.id)?this.selected.delete(asset.id):this.selected.add(asset.id);}
  isVideo(asset:IntegrationAsset) {return !!asset.mime?.startsWith('video/')||/\.(mp4|webm|mov|mkv)$/i.test(asset.name)||['.mp4','.webm','.mov','.mkv'].includes(asset.mime||'');}
  isImage(asset:IntegrationAsset) {return !this.isVideo(asset)&&!asset.mime?.startsWith('audio/')&&!/\.(mp3|wav|flac)$/i.test(asset.name);}
  async open(asset:IntegrationAsset) {this.clearTimer();const version=++this.revision;this.viewing=asset;this.viewURL='';try{const url=await this.integration.media(asset);if(version!==this.revision){URL.revokeObjectURL(url);return;}this.viewURL=url;}catch(error:any){this.status=error.error?.error||error.message;}}
  loaded() {if(this.viewURL&&this.playing&&this.viewing&&this.isImage(this.viewing))this.timer=setTimeout(()=>this.next(),Math.max(1,Number(this.settings.appSettings.slideshowIntervalSeconds)||5)*1000);}
  startPlayback() {this.playing=!this.playing;this.clearTimer();if(this.media?.nativeElement){this.media.nativeElement.loop=!this.playing&&this.settings.appSettings.mediaLoop;if(this.playing)this.media.nativeElement.play().catch(()=>{this.status='Tap Play on the media to start playback.';});}else this.loaded();}
  ended() {if(this.playing)this.next();}
  next(step=1) {const index=this.assets.findIndex(asset=>asset.id===this.viewing?.id),next=this.assets[index+step];if(next){if(this.viewURL)URL.revokeObjectURL(this.viewURL);void this.open(next);}else{this.playing=false;this.clearTimer();}}
  closeViewer() {this.revision++;this.clearTimer();this.media?.nativeElement.pause();if(this.viewURL)URL.revokeObjectURL(this.viewURL);this.viewURL='';this.viewing=undefined;this.playing=false;}
  private clearTimer() {clearTimeout(this.timer);this.timer=undefined;}
  selectedAssets() {return this.assets.filter(asset=>this.selected.has(asset.id));}
  transfer(action:'export'|'import') {return this.run(async()=>{const targets=this.selectedAssets().filter(asset=>action==='import'?asset.source==='hydrus':asset.source!=='hydrus');if(!targets.length)throw new Error('Select files from the appropriate source first.');for(const asset of targets)await this.integration.request('/'+action,{id:asset.id,inherit:this.inherit,tags:this.split(this.extraTags)});this.status=`${targets.length} files ${action==='import'?'copied to ComfyUI input':'exported to Hydrus'}.`;});}
  syncMetadata() {return this.run(async()=>{const targets=this.selectedAssets();for(const asset of targets){const result=await this.integration.request('/sync',{id:asset.id,inherit:this.inherit,tags:this.split(this.extraTags)});asset.metadata=result.metadata;asset.prompts=result.prompts;asset.tags=[...new Set([...(asset.tags||[]),...result.tags])];}this.status=`Metadata synced for ${targets.length} files.`;});}
  syncTags() {return this.run(async()=>{const hashes=this.selectedAssets().filter(asset=>asset.source==='hydrus').map(asset=>asset.hash);await this.integration.request('/tags',{hashes,tags:this.split(this.extraTags),operation:this.tagOperation,newTag:this.replacement});this.status='Tags updated in Hydrus. Refresh the search to see them.';});}
  lookupRelationships() {return this.run(async()=>{this.relationships=undefined;const response=await this.integration.request('/tags',{operation:'relationships',tag:this.relationshipTag.trim()});this.relationships=Object.entries(response.tags?.[this.relationshipTag.trim()]||{}).map(([key,data])=>({service:response.services?.[key]?.name||'Tag service',...(data as object)}));});}
  addFolder() {return this.run(async()=>{await this.integration.request('/folders',{...this.folder,tags:this.split(this.folder.tags)});this.folders=await this.integration.request('/folders');this.status='Import folder saved. Files are imported after two stable scans; originals are retained.';});}
  scan() {return this.run(async()=>{const result=await this.integration.request('/scan',{});this.folders=result.folders;this.status='Scan complete. New files need a second stable scan before import.';});}
  setFolder(rule:any) {return this.run(async()=>{this.folders=await this.integration.request('/folders/update',{id:rule.id,enabled:!rule.enabled});});}
  removeFolder(rule:any) {return this.run(async()=>{this.folders=await this.integration.request('/folders/'+encodeURIComponent(rule.id),undefined,'DELETE');});}
  private releaseThumbnails() {this.thumbnails.forEach(url=>URL.revokeObjectURL(url));this.thumbnails.clear();}
  ngOnDestroy() {this.closeViewer();this.releaseThumbnails();}
}
