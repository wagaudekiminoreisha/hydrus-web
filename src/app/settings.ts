import { HydrusSearchTags } from "./hydrus-tags";
import { SettingsThemeVariant } from "./theme/theme";

export interface AppSettingsV1 {
  version: 1;
  browseSearchOnLoad: boolean;
  browseSearchWhenEmpty: boolean;
  browseDefaultSearchTags: HydrusSearchTags;
  favoriteTags: HydrusSearchTags;
  hyshareUrl: string;
  saucenaoApiKey: string;
  saucenaoSearchProxy: string;
  ipfsMultihashUrlPrefix: string;
  photopeaIntegration: boolean;
  sendDefaultPage: string;
  sendResetFormAfterSend: boolean;
  sendFixDiscordUrls: boolean;
  uploadFilenameTagService: string;
  mediaAutoplay: boolean;
  mediaLoop: boolean;
  mediaPlayNext: boolean;
  slideshowIntervalSeconds: number;
  mediaDefaultMuted: boolean;
  themeEnabled: boolean;
  themeColor: string;
  themeVariant: SettingsThemeVariant;
  sendViews: boolean;
  showSelectionShelf: boolean;
  showSelectionFab: boolean;
  showThumbnailSelectionGlyph: boolean;
  showThumbnailGroups: boolean;
  viewerShowCounter: boolean;
  viewerShowZoom: boolean;
  viewerShowSlideshow: boolean;
  viewerShowSelect: boolean;
  viewerShowSelectionActions: boolean;
  viewerShowDownload: boolean;
  viewerShowShare: boolean;
  viewerShowInfo: boolean;
  viewerShowKeyboardHelp: boolean;
  viewerShowSelectedStatus: boolean;
  viewerShowGroups: boolean;

}

export type AppSettingsStorage = AppSettingsV1;
export type AppSettings = Omit<AppSettingsStorage, "version">;

export const defaultAppSettings: AppSettings = {
  browseSearchOnLoad: true,
  browseSearchWhenEmpty: true,
  browseDefaultSearchTags: [],
  favoriteTags: [],
  hyshareUrl: '',
  saucenaoApiKey: '',
  saucenaoSearchProxy: '/__saucenao-search',
  ipfsMultihashUrlPrefix: 'https://ipfs.io/ipfs/',
  photopeaIntegration: false,
  sendDefaultPage: '',
  sendResetFormAfterSend: true,
  sendFixDiscordUrls: false,
  uploadFilenameTagService: '',
  mediaAutoplay: true,
  mediaLoop: true,
  mediaPlayNext: false,
  slideshowIntervalSeconds: 5,
  mediaDefaultMuted: false,
  themeEnabled: false,
  themeColor: '#3f51b5',
  themeVariant: SettingsThemeVariant.DEFAULT,
  sendViews: true,
  showSelectionShelf: true,
  showSelectionFab: true,
  showThumbnailSelectionGlyph: true,
  showThumbnailGroups: true,
  viewerShowCounter: true,
  viewerShowZoom: true,
  viewerShowSlideshow: true,
  viewerShowSelect: true,
  viewerShowSelectionActions: true,
  viewerShowDownload: true,
  viewerShowShare: true,
  viewerShowInfo: true,
  viewerShowKeyboardHelp: true,
  viewerShowSelectedStatus: true,
  viewerShowGroups: true,

}
