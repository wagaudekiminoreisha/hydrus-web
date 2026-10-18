import {Component, Input, OnDestroy, ViewChild, ElementRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {IntegrationAsset, IntegrationService} from '../integration.service';
import {IntegrationVisibleDirective} from './integration-visible.directive';
import {HydrusApiSettingsService} from '../hydrus-api-settings.service';
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
  viewing?:IntegrationAsset;viewURL='';playing=false;
  private timer?:ReturnType<typeof setTimeout>;private revision=0;private searchRevision=0;private destroyed=false;
  private thumbnails=new Set<string>();private thumbnailRequests=new Set<string>();
  private handshakeTimer?:ReturnType<typeof setInterval>;
  @ViewChild('media') media?:ElementRef<HTMLMediaElement>;
  constructor(public integration:IntegrationService, private api:HydrusApiSettingsService,public settings:SettingsService){
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
  search() {return this.run(async()=>{
    const revision=++this.searchRevision;
    this.closeViewer();this.releaseThumbnails();this.thumbnailRequests.clear();
    this.assets=[];this.hasMore=false;this.loadingMore=false;this.pageError='';this.searched=false;
    const result=await this.integration.request<any>('/output',{folder:this.outputFolder,offset:0,order:this.order,limit:48});
    if(this.destroyed||revision!==this.searchRevision)return;
    this.outputFolders=result.folders||[];this.outputOffset=result.nextOffset??null;this.outputTotal=result.total||0;
    this.assets=result.entries;this.hasMore=this.outputOffset!==null;this.searched=true;this.status=`${this.outputTotal} items`;
  });}
  loadMore():Promise<boolean>{return this.loadMoreOutput();}
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
    try {const url=await this.integration.media(asset,true);if(this.destroyed||revision!==this.searchRevision){URL.revokeObjectURL(url);return;}asset.thumbnail=url;this.thumbnails.add(url);}
    catch{/* Opening the full media remains available when a thumbnail fails. */}
  }
  trackAsset(_index:number,asset:IntegrationAsset) {return asset.id;}
  split(text:string) {return text.split(/[,\n]/).map(tag=>tag.trim()).filter(Boolean);}
  sort() {return this.search();}
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
  private releaseThumbnails(){this.thumbnails.forEach(url=>URL.revokeObjectURL(url));this.thumbnails.clear();}
  ngOnDestroy(){this.destroyed=true;clearInterval(this.handshakeTimer);this.searchRevision++;this.closeViewer();this.releaseThumbnails();}
}
