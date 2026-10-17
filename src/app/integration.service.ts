import {Injectable, signal} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';

export interface IntegrationAsset {id:string;source:string;name:string;hash?:string;mime?:string;timestamp?:number;metadata?:any;tags?:string[];depth?:number;thumbnail?:string;prompts?:{positive:string[];negative:string[]};}
export interface IntegrationPage {entries:IntegrationAsset[];nextCursor?:string|null;hasMore?:boolean;prefixes?:any[];warnings?:string[];}
@Injectable({providedIn:'root'})
export class IntegrationService {
  readonly managed=signal(false);
  readonly enabled=signal(localStorage.getItem('hydrus-web-integration-enabled')==='true');
  url=localStorage.getItem('hydrus-web-integration-url')||'http://127.0.0.1:47838';
  token=localStorage.getItem('hydrus-web-integration-token')||'';
  private desktopUrl='';
  readonly ready:Promise<void>;
  constructor(private http:HttpClient) {
    this.ready=location.port==='47837'?firstValueFrom(this.http.get<{url?:string;token?:string}>('/__integration/bootstrap')).then(connection=>{if(!connection.url||!connection.token)return;this.desktopUrl=connection.url;if(!localStorage.getItem('hydrus-web-integration-url')||localStorage.getItem('hydrus-web-integration-desktop')==='true'){this.url=connection.url;this.token=connection.token;if(this.enabled())this.saveConnection(this.url,this.token);}}).catch(()=>{}):this.discoverManaged();
  }
  private async discoverManaged() {
    // Credentials remain in the server process. This endpoint is a guarded,
    // same-origin local proxy, and cannot be used from a remote/LAN page.
    try {
      const health=await firstValueFrom(this.http.get<{ok:boolean}>('/__integration/api/health',{headers:{'ngsw-bypass':''}}));
      if(!health.ok)return;
      this.url=location.origin+'/__integration/api';this.token='';this.managed.set(true);this.enabled.set(true);
    } catch { /* Static deployments and authenticated remote bridges keep their saved connection. */ }
  }
  saveConnection(url:string,token:string) {this.url=url.replace(/\/$/,'');this.token=token;localStorage.setItem('hydrus-web-integration-desktop',String(this.url===this.desktopUrl));localStorage.setItem('hydrus-web-integration-url',this.url);localStorage.setItem('hydrus-web-integration-token',token);localStorage.setItem('hydrus-web-integration-enabled','true');this.enabled.set(true);}
  disable() {localStorage.removeItem('hydrus-web-integration-enabled');this.enabled.set(false);}
  private headers() {return new HttpHeaders(this.managed()?{'ngsw-bypass':''}:{Authorization:'Bearer '+this.token,'ngsw-bypass':''});}
  request<T=any>(path:string,body?:unknown,method?:string):Promise<T> {return firstValueFrom(this.http.request<T>(method||(body===undefined?'GET':'POST'),this.url+path,{headers:this.headers(),body}));}
  async media(asset:IntegrationAsset,thumbnail=false) {const {ticket}=await this.request<{ticket:string}>('/ticket',{id:asset.id,thumbnail});return this.url+'/media/'+encodeURIComponent(asset.id)+'?ticket='+encodeURIComponent(ticket)+(thumbnail?'&thumbnail=1':'');}
}
