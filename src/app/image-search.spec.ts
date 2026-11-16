import { HydrusFileFromAPI } from './hydrus-file';
import { anyImageSearch, imageDomains, imageImportSearch, imageImportTime, imageTags } from './image-search';

describe('Search from an image', () => {
  it('represents one import day as an ordinary predicate chip', () => {
    const search = imageImportSearch([1700000000], 'day', 30);
    expect(search.length).toBe(1);
    expect(typeof search[0]).toBe('string');
  });
  it('preserves paired dimensions when matching either reference', () => {
    const search = anyImageSearch([['w=100', 'h=200'], ['w=300', 'h=400']]);
    const matches = (terms: string[]) => search.every(clause => typeof clause === 'string' ? terms.includes(clause) : clause.some(term => terms.includes(term as string)));
    expect(matches(['w=100', 'h=200'])).toBeTrue();
    expect(matches(['w=300', 'h=400'])).toBeTrue();
    expect(matches(['w=100', 'h=400'])).toBeFalse();
    expect(matches(['w=100'])).toBeFalse();
  });

  it('does not turn separate import windows into one continuous range', () => {
    const windows = imageImportSearch([1600000000, 1700000000], 'near', 30);
    expect(windows.length).toBe(4);
    expect((windows.flat() as string[]).some(term => term.endsWith('+0000'))).toBeTrue();
    expect(() => imageImportSearch([1600000000], 'near', NaN)).toThrow();
  });

  it('merges overlapping import windows', () => {
    const windows = imageImportSearch([1600000000, 1600000060], 'near', 30);
    expect(windows.length).toBe(2);
    expect(typeof windows[0]).toBe('string');
  });

  it('uses the current domain’s import timestamp before other services', () => {
    const file = {file_services: {current: {chosen: {time_imported: 20}, other: {time_imported: 10}}}} as unknown as HydrusFileFromAPI;
    expect(imageImportTime(file, 'chosen')).toBe(20);
    expect(imageImportTime(file, 'missing')).toBe(10);
    expect(imageImportTime({file_services: {current: {}}} as HydrusFileFromAPI, 'chosen')).toBeUndefined();
  });

  it('offers current display tags and source domains without inventing import provenance', () => {
    const file = {tags: {one: {display_tags: {0: ['batch:patreon', 'artist:alice'], 2: ['deleted:tag']}}}, known_urls: ['https://danbooru.donmai.us/posts/1', 'bad url']} as unknown as HydrusFileFromAPI;
    expect(imageTags([file, file])).toEqual(['artist:alice', 'batch:patreon']);
    expect(imageDomains([file])).toEqual(['danbooru.donmai.us']);
  });
});
