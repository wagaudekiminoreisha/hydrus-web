import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {VirtualScrollerModule} from '@iharbeck/ngx-virtual-scroller';
import {MatButtonModule} from '@angular/material/button';
import {MatMenuModule} from '@angular/material/menu';
import {MatIconModule} from '@angular/material/icon';
import {MatBadgeModule} from '@angular/material/badge';
import {MatDividerModule} from '@angular/material/divider';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {ImageListComponent} from './image-list/image-list.component';
import {ImageListItemComponent} from './image-list-item/image-list-item.component';
import {ImageListLoaderComponent} from './image-list-loader/image-list-loader.component';
import {FileContextMenuActionsComponent} from './file-context-menu-actions/file-context-menu-actions.component';
import {MatContextMenuTriggerDirective} from './mat-context-menu-trigger';
import {BlurHashColorPipe} from './blurhash';

const components=[ImageListComponent,ImageListItemComponent,ImageListLoaderComponent,FileContextMenuActionsComponent,MatContextMenuTriggerDirective,BlurHashColorPipe];
@NgModule({declarations:components,imports:[CommonModule,VirtualScrollerModule,MatButtonModule,MatMenuModule,MatIconModule,MatBadgeModule,MatDividerModule,MatTooltipModule,MatSlideToggleModule,MatProgressBarModule],exports:components})
export class SharedGalleryModule {}
