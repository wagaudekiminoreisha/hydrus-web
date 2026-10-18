import {Component,Inject} from '@angular/core';
import {MAT_DIALOG_DATA,MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
@Component({selector:'app-comfy-generation-dialog',standalone:true,imports:[MatDialogModule,MatButtonModule],
  template:`<h2 mat-dialog-title>ComfyUI generation details</h2><mat-dialog-content><pre>{{json}}</pre></mat-dialog-content><mat-dialog-actions align="end"><button mat-button mat-dialog-close>Close</button></mat-dialog-actions>`,
  styles:[`pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-width:75vw;} mat-dialog-content{max-height:70vh;}`]})
export class ComfyGenerationDialogComponent {
  readonly json:string;
  constructor(@Inject(MAT_DIALOG_DATA) data:unknown){this.json=JSON.stringify(data,null,2);}
}
