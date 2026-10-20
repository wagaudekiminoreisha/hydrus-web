import {of,lastValueFrom} from 'rxjs';
import {HybridSearchService} from './hybrid-search.service';

describe('regular Browse hybrid provider',()=>{
  const hash='a'.repeat(64);
  const local={id:'local.png',source:'comfy',name:'local.png',hash,metadata:{positive_prompt:'blue eyes'}};
  let gallery:any,api:any,native:any,service:HybridSearchService;
  beforeEach(()=>{
    gallery={request:jasmine.createSpy('request').and.callFake(async(path:string)=>path==='/library'?{library:{prefixes:[]}}:{entries:[local],nextOffset:null})};
    api={getFileMetadata:jasmine.createSpy('metadata').and.returnValue(of({metadata:[]}))};
    native={adapt:jasmine.createSpy('adapt').and.callFake(async rows=>rows.map(()=>({file_id:-1}))),idFor:()=>-1};
    service=new HybridSearchService(gallery,api,native,{} as any,{} as any,{groups:()=>[]} as any);
  });
  it('deduplicates a local copy already returned by the selected Hydrus query',async()=>{
    api.getFileMetadata.and.returnValue(of({metadata:[{hash,file_id:10,tags:{}}]}));
    expect(await lastValueFrom(service.search([],async()=>[10]))).toEqual([10]);
  });
  it('keeps Hydrus results when Gallery is unavailable',async()=>{
    gallery.request.and.rejectWith(new Error('Gallery offline'));
    expect(await lastValueFrom(service.search([],async()=>[10]))).toEqual([10]);
    expect(service.warning()).toContain('Gallery offline');expect(service.loading()).toBeFalse();
  });
  it('shows local results while Hydrus is pending, then merges late Hydrus results',async()=>{
    let finishRemote!:(ids:number[])=>void;
    const remote=new Promise<number[]>(resolve=>finishRemote=resolve);
    const results:number[][]=[];
    await new Promise<void>(resolve=>{
      service.search([],()=>remote).subscribe({next:ids=>{
        results.push(ids);
        if(ids.includes(-1)&&!ids.includes(10))finishRemote([10]);
      },complete:resolve});
    });
    expect(results.some(ids=>ids.includes(-1)&&!ids.includes(10))).toBeTrue();
    expect(results[results.length-1]).toEqual([10,-1]);
    expect(service.warning()).toBe('');
  });
  it('shows Hydrus results without waiting for the local catalogue',async()=>{
    let finishCatalogue!:(page:any)=>void;
    gallery.request.and.callFake(async(path:string)=>path==='/library'?{library:{prefixes:[]}}:new Promise(resolve=>finishCatalogue=resolve));
    const results:number[][]=[];
    await new Promise<void>(resolve=>service.search([],async()=>[10]).subscribe({next:ids=>{
      results.push(ids);
      if(ids.length===1&&ids[0]===10)finishCatalogue({entries:[local],nextOffset:null});
    },complete:resolve}));
    expect(results[0]).toEqual([10]);expect(results[results.length-1]).toEqual([10,-1]);
  });
  it('replaces a provisional local copy when its Hydrus match arrives later',async()=>{
    api.getFileMetadata.and.returnValue(of({metadata:[{hash,file_id:10,tags:{}}]}));
    let finishRemote!:(ids:number[])=>void;const remote=new Promise<number[]>(resolve=>finishRemote=resolve);
    const result=await new Promise<number[]>(resolve=>{let latest:number[]=[];service.search([],()=>remote).subscribe({next:ids=>{latest=ids;if(ids.includes(-1))finishRemote([10]);},complete:()=>resolve(latest)});});
    expect(result).toEqual([10]);
  });
  it('preserves Hydrus results if adapting ComfyUI media fails',async()=>{
    native.adapt.and.callFake(async rows=>{if(rows.length)throw new Error('ticket failed');return [];});
    expect(await lastValueFrom(service.search([],async()=>[10]))).toEqual([10]);
    expect(service.warning()).toContain('ticket failed');
  });
  it('finishes an unavailable prefix search with an empty result instead of leaving Browse searching',async()=>{
    gallery.request.and.rejectWith(new Error('Gallery offline'));
    expect(await lastValueFrom(service.search(['@Portrait'],async()=>[10]))).toEqual([]);
    expect(service.loading()).toBeFalse();
  });
  it('stops requesting more catalogue pages when a search is cancelled',async()=>{
    gallery.request.and.callFake(async(path:string)=>path==='/library'?{library:{prefixes:[]}}:{entries:[local],nextOffset:100});
    await new Promise<void>(resolve=>{
      const subscription=service.search([],async()=>[10]).subscribe(ids=>{if(ids.includes(-1)){subscription.unsubscribe();resolve();}});
    });
    expect(gallery.request.calls.allArgs().filter(args=>args[0]==='/catalogue').length).toBe(1);
    expect(service.loading()).toBeFalse();
  });
});
