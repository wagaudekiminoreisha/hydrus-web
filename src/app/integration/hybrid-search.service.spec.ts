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
