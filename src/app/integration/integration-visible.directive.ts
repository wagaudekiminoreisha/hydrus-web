import {AfterViewInit, Directive, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output} from '@angular/core';

@Directive({selector:'[integrationVisible]',standalone:true})
export class IntegrationVisibleDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input() integrationVisibleEnabled=true;
  @Input() integrationVisibleOnce=true;
  @Output() visible=new EventEmitter<void>();
  private observer?:IntersectionObserver;
  private ready=false;
  private fired=false;
  constructor(private element:ElementRef<HTMLElement>,private zone:NgZone) {}
  ngAfterViewInit() {this.ready=true;this.observe();}
  ngOnChanges() {if(this.ready)this.observe();}
  private observe() {
    this.observer?.disconnect();
    if(!this.integrationVisibleEnabled||(this.integrationVisibleOnce&&this.fired))return;
    if(typeof IntersectionObserver==='undefined') {
      // A manual Load more button remains available on browsers without observers.
      if(this.integrationVisibleOnce){this.fired=true;this.visible.emit();}
      return;
    }
    this.observer=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting))return;
      if(this.integrationVisibleOnce){this.fired=true;this.observer?.disconnect();}
      this.zone.run(()=>this.visible.emit());
    },{root:this.element.nativeElement.closest('mat-sidenav-content'),rootMargin:'300px 0px'});
    this.observer.observe(this.element.nativeElement);
  }
  ngOnDestroy() {this.observer?.disconnect();}
}
