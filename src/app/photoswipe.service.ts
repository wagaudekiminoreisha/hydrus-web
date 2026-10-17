import { ApplicationRef, EnvironmentInjector, Injectable, createComponent } from '@angular/core';
import { HydrusBasicFile, FileCategory } from './hydrus-file';
import PhotoSwipe, { PhotoSwipeOptions, SlideData } from 'photoswipe';
import { Platform } from '@angular/cdk/platform';
import Content from 'photoswipe/dist/types/slide/content';
import Slide from 'photoswipe/dist/types/slide/slide';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { FileInfoSheetComponent } from './file-info-sheet/file-info-sheet.component';
import { Location } from '@angular/common';
import { HydrusFileDownloadService } from './hydrus-file-download.service';
import { Observable, take } from 'rxjs';
import { canOpenInPhotopea, getPhotopeaUrlForFile } from './photopea';
import { SettingsService } from './settings.service';
import { MatButton } from '@angular/material/button';
import { ThemeService } from './theme/theme.service';
import { HydrusViewsService } from './hydrus-views.service';
import { GalleryContextMenuService } from './gallery-context-menu/gallery-context-menu.service';


function isContentType(content: Content | Slide, type: string) {
  return (content && content.data && content.data.type === type);
}

export interface GallerySelectionController {
  isSelected: (fileID: number) => boolean;
  toggle: (file: HydrusBasicFile) => void;
  selectedCount: () => number;
  openActions: () => void;
  activeColor?: () => string;
  activeGroupName?: () => string;
  memberships?: (fileID: number) => Array<{id: string; name: string; color: string}>;
  changes?: Observable<unknown>;
}

export const GALLERY_SLIDER_OPTIONS = {
  arrowPrev: true,
  arrowNext: true,
  arrowPrevTitle: 'Previous file',
  arrowNextTitle: 'Next file'
} satisfies Pick<PhotoSwipeOptions, 'arrowPrev' | 'arrowNext' | 'arrowPrevTitle' | 'arrowNextTitle'>;

@Injectable({
  providedIn: 'root'
})
export class PhotoswipeService {

  constructor(
    public platform: Platform,
    private bottomSheet: MatBottomSheet,
    private location: Location,
    private downloadService: HydrusFileDownloadService,
    private settingsService: SettingsService,
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector,
    private themeService: ThemeService,
    private viewsService: HydrusViewsService,
    private galleryContextMenu: GalleryContextMenuService
  ) { }

  private processedFiles = new Map<string, SlideData>();

  openPhotoSwipe(items: HydrusBasicFile[], id: number, selection?: GallerySelectionController) {
    let viewStartTimestamp = Date.now();
    let lastFile: HydrusBasicFile | undefined;
    let activeFileHash: string | undefined;

    const handleView = (file?: HydrusBasicFile) => {
      if(!this.settingsService.appSettings.sendViews) {
        return;
      }
      if(lastFile && lastFile.hash !== file?.hash) {
        const currentTimestamp = Date.now();
        this.viewsService.submitView(lastFile, viewStartTimestamp, currentTimestamp);
        viewStartTimestamp = currentTimestamp;
      }
      lastFile = file;
    }

    this.themeService.addBlackThemeColorMetaTag();

    const imgindex = items.findIndex(e => e.file_id === id);

    const options: PhotoSwipeOptions = {
      index: imgindex,
      bgOpacity: 1,
      clickToCloseNonZoomable: false,
      showHideAnimationType: 'none',
      ...GALLERY_SLIDER_OPTIONS,
      zoom: false,
      close: false,
      //secondaryZoomLevel: 1,
      maxZoomLevel: 2,
      //tapAction: null,
      errorMsg: 'The file cannot be loaded',
      trapFocus: false
    }

    const pswp = new PhotoSwipe(options);
    let playNext = this.settingsService.appSettings.mediaPlayNext;
    let slideshowTimer: ReturnType<typeof setTimeout> | undefined;
    let slideshowButton: HTMLElement | undefined;
    const clearSlideshow = () => { clearTimeout(slideshowTimer); slideshowTimer = undefined; };
    const advance = () => { if (!playNext || document.hidden) return; if (this.bottomSheet._openedBottomSheetRef) { slideshowTimer = setTimeout(advance, 1000); return; } if (pswp.currIndex >= items.length - 1) { playNext = false; updateSlideshowButton(); return; } pswp.next(); };
    const updateSlideshowButton = () => { if(slideshowButton) { slideshowButton.innerText = playNext ? 'Pause' : 'Play next'; slideshowButton.setAttribute('aria-pressed', String(playNext)); } };
    const scheduleSlideshow = () => {
      clearSlideshow();
      const content = pswp.currSlide?.content;
      if (!playNext || document.hidden || !content) return;
      const media = content.element?.querySelector<HTMLMediaElement>('.pswp-media');
      if(media) { media.loop = !playNext && this.settingsService.appSettings.mediaLoop; return; }
      if(content.isImageContent() && content.state === 'loaded') slideshowTimer = setTimeout(advance, Math.max(1, Number(this.settingsService.appSettings.slideshowIntervalSeconds) || 5) * 1000);
    };
    const visibility = () => {
      if(document.hidden) {
        clearSlideshow();
        if(this.platform.ANDROID || this.platform.IOS) {
          pswp.currSlide?.content.element?.querySelector<HTMLMediaElement>('.pswp-media')?.pause();
        }
      } else scheduleSlideshow();
    };
    document.addEventListener('visibilitychange', visibility);
    pswp.on('loadComplete', scheduleSlideshow);

    let selectionButton: HTMLElement | undefined;
    let selectionActionsButton: HTMLElement | undefined;
    let selectionStatus: HTMLElement | undefined;
    let groupSelectionStatus: HTMLElement | undefined;

    const currentFile = () => pswp.currSlide?.data.file as HydrusBasicFile | undefined;

    const updateSelectionUI = (activeFile = currentFile()) => {
      const file = activeFile;
      const currentSelected = !!(file && selection?.isSelected(file.file_id));
      const selectedCount = selection?.selectedCount() ?? 0;
      const groupColor = selection?.activeColor?.() ?? '#3f51b5';
      const groupName = selection?.activeGroupName?.() ?? 'selection';
      const groupMemberships = file ? selection?.memberships?.(file.file_id) ?? [] : [];

      if(selectionButton) {
        selectionButton.style.setProperty('--selection-group-color', groupColor);
        const icon = selectionButton.querySelector<HTMLElement>('.material-icons');
        if(icon) {
          icon.innerText = currentSelected ? 'check_box' : 'check_box_outline_blank';
        }
        const label = currentSelected ? 'Deselect current file' : 'Select current file';
        selectionButton.title = `${label} (S)`;
        selectionButton.setAttribute('aria-label', label);
        selectionButton.setAttribute('aria-pressed', String(currentSelected));
      }

      if(selectionActionsButton) {
        selectionActionsButton.style.setProperty('--selection-group-color', groupColor);
        const count = selectionActionsButton.querySelector<HTMLElement>('.pswp__selection-count');
        if(count) {
          count.innerText = String(selectedCount);
        }
        selectionActionsButton.hidden = selectedCount === 0;
        selectionActionsButton.title = `${groupName} options (${selectedCount})`;
        selectionActionsButton.setAttribute('aria-label', `${groupName} options for ${selectedCount} files`);
      }

      if(selectionStatus) {
        selectionStatus.style.setProperty('--selection-group-color', groupColor);
        selectionStatus.hidden = !currentSelected;
      }

      if(groupSelectionStatus) {
        groupSelectionStatus.hidden = groupMemberships.length === 0;
        groupSelectionStatus.style.top = currentSelected ? '108px' : '68px';
        const membershipList = groupSelectionStatus.querySelector<HTMLElement>('.pswp__selection-membership-list');
        if(membershipList) {
          membershipList.replaceChildren(...groupMemberships.map(group => {
            const membership = document.createElement('span');
            membership.className = 'pswp__selection-membership';
            membership.style.setProperty('--membership-color', group.color);
            membership.title = `Selected in ${group.name}`;

            const swatch = document.createElement('span');
            swatch.className = 'pswp__selection-membership-swatch';
            const name = document.createElement('span');
            name.textContent = group.name;
            membership.append(swatch, name);
            return membership;
          }));
        }
      }
    };

    const toggleCurrentSelection = () => {
      const file = currentFile();
      if(file && selection) {
        selection.toggle(file);
        updateSelectionUI();
      }
    };

    const selectionSubscription = selection?.changes?.subscribe(() => updateSelectionUI());

    pswp.addFilter('numItems', numItems => {
      return items.length;
    })

    pswp.addFilter('itemData', (itemData, index) => {
      const file = items[index];
      if(this.processedFiles.has(file.hash)) {
        return this.processedFiles.get(file.hash);
      }
      return this.getPhotoSwipeItem(items[index]);
    });

/*     pswp.addFilter('useContentPlaceholder', (useContentPlaceholder, content) => {
      if(isContentType(content, 'video')) {
        //return true;
      }
      return useContentPlaceholder;
    }); */

/*     const _getVerticalDragRatio = (panY) => {
      return (panY - pswp.currSlide.bounds.center.y)
              / (pswp.viewportSize.y / 3);
    } */

/*     pswp.on('verticalDrag', (e) => {
      // triggered when using vertical drag to close gesture
      // can be default prevented
      console.log('verticalDrag', e.panY);
      //pswp.element.classList.add('pswp--ui-visible')
      const drag = 1 - Math.abs(_getVerticalDragRatio(e.panY));
      console.log(drag);
      if(pswp.element.classList.contains('pswp--ui-visible') && drag < 0.95) {
        pswp.element.classList.remove('pswp--ui-visible')
      } else if (!pswp.element.classList.contains('pswp--ui-visible') && drag >= 0.95) {
        pswp.element.classList.add('pswp--ui-visible')
      }
    }); */


    pswp.on('wheel', (e) => {
      const event = e.originalEvent;
      if(event.ctrlKey) {
        return;
      }
      e.preventDefault();
      if (event.deltaY < 0) { // wheel up
        pswp.prev();
      } else if (event.deltaY > 0) { // wheel down
        pswp.next();
      }
    });

    pswp.on('tapAction', (e) => {
      if(!pswp.currSlide.content.isImageContent()) {
        e.preventDefault();
      }
    });

    pswp.on('bindEvents', () => {
      pswp.scrollWrap.onauxclick = (event: MouseEvent) => {
        if (event.button === 1) {
          pswp.close();
        }
      };

      pswp.scrollWrap.oncontextmenu = (event: MouseEvent) => {
        event.preventDefault();
        const file = pswp.currSlide?.data.file as HydrusBasicFile | undefined;
        if(file) {
          this.galleryContextMenu.open(
            file,
            event.clientX,
            event.clientY,
            () => pswp.close(),
            selection ? {
              isSelected: () => selection.isSelected(file.file_id),
              toggle: () => {
                selection.toggle(file);
                updateSelectionUI();
              },
              selectedCount: selection.selectedCount,
              openActions: selection.openActions
            } : undefined
          );
        }
      };

    });

    pswp.on('change', () => {
      scheduleSlideshow();
      this.galleryContextMenu.close();
      updateSelectionUI();
    });

    pswp.on('keydown', (e) => {
      if (this.bottomSheet._openedBottomSheetRef) {
        e.preventDefault();
        return;
      }
      const keyboardEvent = e.originalEvent;
      if(
        selection
        && keyboardEvent.key.toLowerCase() === 's'
        && !keyboardEvent.ctrlKey
        && !keyboardEvent.altKey
        && !keyboardEvent.metaKey
      ) {
        e.preventDefault();
        toggleCurrentSelection();
      }
    });

    pswp.on('uiRegister', () => {
      pswp.ui.registerElement({name:'slideshow',order:10,isButton:true,html:playNext?'Pause':'Play next',title:'Play next / slideshow',onInit:element=>{slideshowButton=element;updateSlideshowButton();},onClick:()=>{playNext=!playNext;updateSlideshowButton();const media=pswp.currSlide?.content.element?.querySelector<HTMLMediaElement>('.pswp-media');if(media){media.loop=!playNext&&this.settingsService.appSettings.mediaLoop;if(playNext)media.play().catch(()=>{});}scheduleSlideshow();}});
      if(selection) {
        pswp.ui.registerElement({
          name: 'select-current',
          order: 11,
          isButton: true,
          tagName: 'button',
          html: '<span class="mat-icon material-icons">check_box_outline_blank</span>',
          onInit: el => {
            selectionButton = el;
            updateSelectionUI();
          },
          onClick: () => toggleCurrentSelection()
        });

        pswp.ui.registerElement({
          name: 'selection-actions',
          order: 12,
          isButton: true,
          tagName: 'button',
          html: '<span class="mat-icon material-icons">playlist_add_check</span><span class="pswp__selection-count">0</span>',
          onInit: el => {
            selectionActionsButton = el;
            updateSelectionUI();
          },
          onClick: () => selection.openActions()
        });

        pswp.ui.registerElement({
          name: 'selection-status',
          appendTo: 'root',
          className: 'pswp__selection-status',
          html: '<span class="mat-icon material-icons">check_circle</span><span>Selected</span>',
          onInit: el => {
            selectionStatus = el;
            updateSelectionUI();
          }
        });

        pswp.ui.registerElement({
          name: 'group-selection-status',
          appendTo: 'root',
          className: 'pswp__group-selection-status',
          html: '<span class="pswp__group-selection-label">Groups</span><span class="pswp__selection-membership-list"></span>',
          onInit: el => {
            groupSelectionStatus = el;
            updateSelectionUI();
          }
        });
      }

      pswp.ui.registerElement({
        name: 'info',
        order: 15,
        isButton: true,
        tagName: 'button',
        html: '<span class="mat-icon material-icons">info_outlined</span>',
        onClick: (event, el, pswp) => {
          const file = pswp.currSlide.data.file as HydrusBasicFile;
          FileInfoSheetComponent.open(this.bottomSheet, file)
            .afterDismissed()
            .pipe(take(1))
            .subscribe(res => {
              if(res) {
                pswp.close();
              }
            });
        }
      });

      pswp.ui.registerElement({
        name: 'custom-close',
        order: 20,
        isButton: true,
        tagName: 'button',
        html: '<span class="mat-icon material-icons">close</span>',
        onClick: 'close'
      });

      pswp.ui.registerElement({
        name: 'download',
        order: 13,
        isButton: true,
        tagName: 'button',
        html: '<span class="mat-icon material-icons">get_app</span>',
        onClick: (event, el, pswp) => {
          const file = pswp.currSlide.data.file as HydrusBasicFile;
          this.downloadService.saveFile(file);
        }
      });

      if(this.downloadService.canShare) {
        pswp.ui.registerElement({
          name: 'share',
          order: 14,
          isButton: true,
          tagName: 'button',
          html: '<span class="mat-icon material-icons">share</span>',
          onClick: (event, el, pswp) => {
            const file = pswp.currSlide.data.file as HydrusBasicFile;
            this.downloadService.shareFile(file);
          }
        });
      }

      pswp.ui.registerElement({
        name: 'zoom-level-indicator',
        order: 6,
        className: 'pswp__zoom-level',
        onInit: (el, pswp) => {
          pswp.on('zoomPanUpdate', (e) => {
            if (e.slide === pswp.currSlide) {
              if(pswp.currSlide.isZoomable()) {
                el.innerText = `${Math.round(pswp.currSlide.currZoomLevel * (window.devicePixelRatio ?? 1) * 100)}%`;
              } else {
                el.innerText = '';
              }
            }
          });
        }
      });
    });

    pswp.addFilter('uiElement', (element, data) => {
      return element;
    });



    pswp.on('contentLoad', (e) => {
      const { content, isLazy } = e;
      const file = content.data.file as HydrusBasicFile;

       if(isContentType(content, 'video')) {
        e.preventDefault();

        content.state = 'loading';

        content.element = document.createElement('div');
        content.element.className = 'pswp-video-container';
        const img = document.createElement('img');
        img.src = file.thumbnail_url;
        img.className = 'pswp-video-placeholder'
        content.element.append(img);
      } else if(isContentType(content, 'audio')) {
        e.preventDefault();

        content.state = 'loading';

        content.element = document.createElement('div');
        content.element.className = 'pswp-audio-container';
      } else if (isContentType(content, 'renderable')) {
        e.preventDefault();
        content.element = document.createElement('div');
        content.element.className = 'pswp__content pswp__error-msg-container';

        const errorMsgEl = document.createElement('div');
        errorMsgEl.className = 'pswp__error-msg';
        content.element.appendChild(errorMsgEl);

        const img = document.createElement('img');
        img.src = file.thumbnail_url;
        img.className = 'pswp-error-thumb';
        errorMsgEl.appendChild(img);

        const errorMsgText = document.createElement('div');
        errorMsgText.innerText = `Unsupported Filetype (${file.file_type_string})`;
        errorMsgText.className = 'pswp-error-text';
        errorMsgEl.appendChild(errorMsgText);

        this.addRenderButton(file, errorMsgEl, pswp, content);

        this.addPhotopeaButton(file, errorMsgEl);


      } else if (isContentType(content, 'unsupported')) {
        e.preventDefault();
        content.element = document.createElement('div');
        content.element.className = 'pswp__content pswp__error-msg-container';

        const errorMsgEl = document.createElement('div');
        errorMsgEl.className = 'pswp__error-msg';
        content.element.appendChild(errorMsgEl);

        const img = document.createElement('img');
        img.src = file.thumbnail_url;
        img.className = 'pswp-error-thumb';
        errorMsgEl.appendChild(img);

        const errorMsgText = document.createElement('div');
        errorMsgText.innerText = `Unsupported Filetype (${file.file_type_string})`;
        errorMsgText.className = 'pswp-error-text';
        errorMsgEl.appendChild(errorMsgText);

        this.addPhotopeaButton(file, errorMsgEl);

      }

    });

    pswp.on('contentActivate', ({content}) => {
      this.galleryContextMenu.close();
      const activeFile = content.data.file as HydrusBasicFile;
      updateSelectionUI(activeFile);
      if(activeFileHash && activeFileHash !== activeFile.hash && this.bottomSheet._openedBottomSheetRef) {
        this.bottomSheet.dismiss();
      }
      activeFileHash = activeFile.hash;
      scheduleSlideshow();
      handleView(activeFile);
      if (isContentType(content, 'video') && content.element) {
        const file = content.data.file as HydrusBasicFile;
        const vid = document.createElement('video');
        vid.src = file.file_url;
        vid.autoplay = playNext || this.settingsService.appSettings.mediaAutoplay;
        vid.controls = !this.platform.FIREFOX;
        vid.poster = file.thumbnail_url;
        vid.loop = !playNext && this.settingsService.appSettings.mediaLoop;
        vid.playsInline = true;
        vid.setAttribute('webkit-playsinline', '');
        vid.onended = advance;
        vid.muted = this.settingsService.appSettings.mediaDefaultMuted;
        vid.className = 'pswp-video pswp-media';
        vid.onloadeddata = (e) => {
          content.onLoaded();
        }
        vid.onerror = (e) => {
          content.onError();
        }
        content.element.prepend(vid);
      } else if (isContentType(content, 'audio') && content.element) {
        const file = content.data.file as HydrusBasicFile;
        const audio = document.createElement('audio');
        audio.src = file.file_url;
        audio.autoplay = playNext || this.settingsService.appSettings.mediaAutoplay;
        audio.loop = !playNext && this.settingsService.appSettings.mediaLoop;
        audio.onended = advance;
        audio.muted = this.settingsService.appSettings.mediaDefaultMuted;
        audio.controls = true;
        audio.className = 'pswp-audio pswp-media';
        audio.onloadeddata = (e) => {
          content.onLoaded();
        }
        audio.onerror = (e) => {
          content.onError();
        }
        content.element.prepend(audio);
      }
    });

    pswp.addFilter('contentErrorElement', (contentErrorElement, content) => {

      const file = content.data.file as HydrusBasicFile;

      const errorMsgEl = document.createElement('div');
      errorMsgEl.className = 'pswp__error-msg';
      content.element.appendChild(errorMsgEl);

      const img = document.createElement('img');
      img.src = file.thumbnail_url;
      img.className = 'pswp-error-thumb';
      errorMsgEl.appendChild(img);

      const errorMsgText = document.createElement('div');
      errorMsgText.innerText = `The file cannot be loaded (${file.file_type_string})`;
      errorMsgText.className = 'pswp-error-text';
      errorMsgEl.appendChild(errorMsgText);

      if(file.render_url) {
        this.addRenderButton(file, errorMsgEl, pswp, content);
      }

      return errorMsgEl;
    });

    pswp.on('appendHeavy', (e) => {

    });

    pswp.on('contentAppend', (e) => {

    });

    const handleDestroyMedia = (content: Content) => {
      if ((isContentType(content, 'video') || isContentType(content, 'audio')) && content.element) {
        content.element.querySelectorAll<HTMLMediaElement>('.pswp-media').forEach(media => {
          media.pause();
          media.removeAttribute('src');
          media.load();
          media.remove();
        })
      }
    }

    pswp.on('contentDeactivate', ({content}) => {
      handleDestroyMedia(content);
    });

    pswp.on('contentRemove', ({content}) => {
      handleDestroyMedia(content);
    });

    /* pswp.on('contentDestroy', ({content}) => {

    }); */

    const locSub = this.location.subscribe(e => {
      pswp.close();
    });

    pswp.on('close', () => {
      clearSlideshow(); document.removeEventListener('visibilitychange', visibility);
      this.galleryContextMenu.close();
      selectionSubscription?.unsubscribe();
      handleView();
      handleDestroyMedia(pswp.currSlide.content);
      this.themeService.removeBlackThemeColorMetaTag();
      locSub.unsubscribe();
      if(window.history.state.pswp) {
        window.history.back();
      }
    });

    /* pswp.on('destroy', () => {

    }); */

    //this.location.go(this.location.path() + '#pswp');
    window.history.pushState({pswp: true}, '');

    pswp.init();
  }



  getPhotoSwipeItem(file: HydrusBasicFile): SlideData {

    switch(file.file_category) {
      case FileCategory.Image: {
        return {
          src: file.file_url,
          msrc: file.thumbnail_url,
          width: file.width,
          height: file.height,
          file
        };
      }
      case FileCategory.Video: {
        return {
          file,
          type: 'video',
        };
      }
      case FileCategory.Audio: {
        return {
          file,
          type: 'audio'
        };
      }
      case FileCategory.Renderable: {
        return {
          file,
          type: 'renderable',
          width: file.width,
          height: file.height
        };
      }
      default: {
        return {
          type: 'unsupported',
          file
        };
      }
    }
  }

  private addPhotopeaButton(file: HydrusBasicFile, element: HTMLElement) {
    if(canOpenInPhotopea(file) && this.settingsService.appSettings.photopeaIntegration) {
      const photopeaButton = document.createElement('a');
      photopeaButton.setAttribute('mat-stroked-button', '');
      photopeaButton.target = '_blank';
      photopeaButton.href = getPhotopeaUrlForFile(file);

      const photopeaButtonComponent = createComponent(MatButton, {
        environmentInjector: this.injector,
        hostElement: photopeaButton,
        projectableNodes: [
          [document.createTextNode('Open file in Photopea')]
        ]
      })

      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'pswp-error-text';
      element.appendChild(buttonContainer);
      buttonContainer.appendChild(photopeaButton);

      this.appRef.attachView(photopeaButtonComponent.hostView);
    }
  }

  private addRenderButton(file: HydrusBasicFile, element: HTMLElement, pswp: PhotoSwipe, content: Content) {
    const renderButton = document.createElement('button');
      renderButton.setAttribute('mat-stroked-button', '');
      const psdButtonComponent = createComponent(MatButton, {
        environmentInjector: this.injector,
        hostElement: renderButton,
        projectableNodes: [
          [document.createTextNode('Load render from Hydrus')]
        ]
      })

      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'pswp-error-text';
      element.appendChild(buttonContainer);
      buttonContainer.appendChild(renderButton);
      this.appRef.attachView(psdButtonComponent.hostView);

      renderButton.addEventListener('click', async (ev) => {
        psdButtonComponent.setInput('disabled', true);
        const data = {
          type: 'image',
          src: file.render_url,
          msrc: file.thumbnail_url,
          width: file.width,
          height: file.height,
          file
        }
        this.processedFiles.set(file.hash, data);
        pswp.refreshSlideContent(content.index);
      })
  }

}
