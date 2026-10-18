import {Injectable, signal} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {firstValueFrom, timeout} from 'rxjs';
import {hmac} from '@noble/hashes/hmac.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex, utf8ToBytes} from '@noble/hashes/utils.js';
import {HydrusApiSettingsService} from './hydrus-api-settings.service';

export interface IntegrationAsset {id:string;source:string;name:string;hash?:string;mime?:string;timestamp?:number;metadata?:any;tags?:string[];depth?:number;thumbnail?:string;prompts?:{positive:string[];negative:string[]};}
export interface IntegrationPage {entries:IntegrationAsset[];nextCursor?:string|null;hasMore?:boolean;prefixes?:any[];warnings?:string[];}
const ADDRESS='hydrus-web-comfy-url', PIN='hydrus-web-comfy-instance';
@Injectable({providedIn:'root'})
export class IntegrationService {
  url=localStorage.getItem(ADDRESS)||'';
  readonly enabled=signal(!!this.url);
  readonly replacement=signal('');
  private session='';
  private sessionKey='';
  private revision=0;
  private pending?:Promise<void>;
  private readonly endpoint='/Gallery/hydrus-web';
  constructor(private http:HttpClient, private api:HydrusApiSettingsService) {}
  setAddress(value:string) {
    const parsed=new URL(value.trim());
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('Enter ComfyUI’s HTTP(S) address without credentials, query parameters or a fragment.');
    const address=parsed.href.replace(/\/$/,'');
    if(address!==this.url){this.revision++;this.pending=undefined;this.session='';this.replacement.set('');}
    this.url=address;localStorage.setItem(ADDRESS,address);this.enabled.set(true);
  }
  private headers(auth=true) {
    return new HttpHeaders({'ngsw-bypass':'','X-Hydrus-Web-Origin':location.origin,...(auth?{Authorization:'Bearer '+this.session,'X-Gallery-Instance':localStorage.getItem(PIN)||''}:{})});
  }
  private send<T>(path:string,body?:unknown,auth=true,method?:string):Promise<T> {
    return firstValueFrom(this.http.request<T>(method||(body===undefined?'GET':'POST'),this.url+this.endpoint+path,{headers:this.headers(auth),body}).pipe(timeout(15000)));
  }
  async connect(confirmReplacement=false):Promise<void> {
    if(this.pending)return this.pending;
    const revision=this.revision,address=this.url,key=this.api.hydrusApiKey();
    if(!address)throw new Error('Save your ComfyUI address in Settings → ComfyUI.');
    if(!key)throw new Error('Save the Hydrus API key in API Configuration, and save the same key in Gallery’s Hydrus settings.');
    this.session='';
    const task=(async()=>{
      const health=await this.send<{ok:boolean;version:number;instanceId:string;challenge:string;configured:boolean}>('/health',undefined,false);
      if(!health.ok||health.version!==1||!health.instanceId||!health.challenge)throw new Error('Update ComfyUI-Gallery and restart ComfyUI to enable the direct connection.');
      const pinned=localStorage.getItem(PIN);
      if(pinned&&pinned!==health.instanceId&&!confirmReplacement){this.replacement.set(health.instanceId);throw new Error('This address now points to a different Gallery installation. Confirm the replacement before browsing.');}
      if(confirmReplacement&&this.replacement()!==health.instanceId)throw new Error('Gallery changed again. Check the address before confirming a replacement.');
      if(!health.configured)throw new Error('Save the Hydrus connection in Gallery first. It must use the same Hydrus API key as Hydrus Web.');
      const sign=(role:string,session='')=>bytesToHex(hmac(sha256,utf8ToBytes(key),utf8ToBytes(['hydrus-web-direct-v1',role,health.instanceId,health.challenge,location.origin,session].join('\n'))));
      const result=await this.send<{instanceId:string;session:string;proof:string}>('/handshake',{instanceId:health.instanceId,challenge:health.challenge,proof:sign('client')},false);
      if(result.instanceId!==health.instanceId||!result.session||result.proof!==sign('server',result.session))throw new Error('Gallery did not prove the matching Hydrus connection.');
      if(revision!==this.revision||address!==this.url||key!==this.api.hydrusApiKey())throw new Error('Connection settings changed; reconnect using the current settings.');
      this.session=result.session;this.sessionKey=key;localStorage.setItem(PIN,result.instanceId);this.replacement.set('');
    })();
    this.pending=task;
    try {await task;} catch(error:any) {
      if(error.status===0)throw new Error('Cannot reach ComfyUI. Check its address and restart it after updating Gallery. An HTTPS Hydrus Web page may require an HTTPS ComfyUI address.');
      if(error.status===404)throw new Error('This ComfyUI does not have the direct Gallery endpoint. Update ComfyUI-Gallery and restart ComfyUI.');
      throw error;
    } finally {if(this.pending===task)this.pending=undefined;}
  }
  async request<T=any>(path:string,body?:unknown,method?:string):Promise<T> {
    if(!this.session||this.sessionKey!==this.api.hydrusApiKey())await this.connect();
    try{return await this.send<T>(path,body,true,method);}catch(error:any){
      if(error.status!==401)throw error;
      await this.connect();return this.send<T>(path,body,true,method);
    }
  }
  async media(asset:IntegrationAsset,thumbnail=false) {
    const {ticket}=await this.request<{ticket:string}>('/ticket',{id:asset.id,thumbnail});
    return this.url+this.endpoint+'/media?ticket='+encodeURIComponent(ticket);
  }
}
