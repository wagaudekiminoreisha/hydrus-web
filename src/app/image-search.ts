import { HydrusFileFromAPI } from './hydrus-file';
import { HydrusSearchTags } from './hydrus-tags';
import { ALL_MY_FILES_SERVICE_KEY } from './hydrus-services';

// Hydrus represents a search as AND clauses, with arrays representing OR clauses.
function flattenClause(tags: HydrusSearchTags): string[] {
  return tags.flatMap(tag => typeof tag === 'string' ? [tag] : flattenClause(tag));
}

export function anyImageSearch(searches: HydrusSearchTags[]): HydrusSearchTags {
  if (!searches.length) return [];
  let clauses: string[][] = [[]];
  for (const search of searches) {
    if (!search.length) return [];
    const alternatives = search.map(tag => typeof tag === 'string' ? [tag] : flattenClause(tag));
    if (clauses.length * alternatives.length > 4096) throw new Error('Too many property combinations. Select fewer references or use All selected properties.');
    const expanded = clauses.flatMap(clause => alternatives.map(other => [...new Set([...clause, ...other])]));
    clauses = expanded.filter((clause, index) => !expanded.some((other, otherIndex) =>
      (other.length < clause.length || otherIndex < index) && other.every(term => clause.includes(term))
    ));
    if (clauses.length > 128) throw new Error('Too many separate reference ranges. Select fewer references or use All selected properties.');
  }
  return clauses.map(clause => clause.length === 1 ? clause[0] : clause);
}

export function imageImportTime(file: HydrusFileFromAPI, serviceKey: string): number | undefined {
  const services = file.file_services?.current ?? {};
  const preferred = services[serviceKey]?.time_imported ?? services[ALL_MY_FILES_SERVICE_KEY]?.time_imported;
  const times = Object.values(services).map(service => service.time_imported).filter(time => Number.isFinite(time));
  return preferred ?? (times.length ? Math.min(...times) : undefined);
}

export function imageTags(files: HydrusFileFromAPI[]): string[] {
  return [...new Set(files.flatMap(file => {
    const services = Object.values(file.tags ?? {}).map(service => service.display_tags);
    const legacy = Object.values(file.service_names_to_statuses_to_display_tags ?? file.service_names_to_statuses_to_tags ?? {});
    return [...services, ...legacy].flatMap(statuses => statuses?.[0] ?? []);
  }))].sort((a, b) => a.localeCompare(b));
}

export function imageDomains(files: HydrusFileFromAPI[]): string[] {
  return [...new Set(files.flatMap(file => (file.known_urls ?? []).flatMap(url => {
    try { return [new URL(url).hostname]; } catch { return []; }
  })))].sort();
}

export function imageImportSearch(times: number[], mode: 'day' | 'near', minutes: number): HydrusSearchTags {
  const valid = [...new Set(times.filter(time => Number.isFinite(time)))];
  if (!valid.length) throw new Error('The selected references have no import time in their metadata.');
  if (mode === 'day') {
    const dates = [...new Set(valid.map(time => {
      const date = new Date(time * 1000);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }))];
    return [dates.map(date => `system:import time = ${date}`)];
  }
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10080) throw new Error('Choose an import window from 1 to 10080 minutes.');
  // Merge overlapping windows before converting their union to Hydrus clauses.
  const ranges: Array<[number, number]> = [];
  for (const time of valid.sort((a, b) => a - b)) {
    const start = time - minutes * 60, end = time + minutes * 60;
    const previous = ranges[ranges.length - 1];
    if (previous && previous[1] >= start) previous[1] = Math.max(previous[1], end);
    else ranges.push([start, end]);
  }
  const stamp = (time: number) => new Date(time * 1000).toISOString().replace('T', ' ').replace('.000Z', ' +0000');
  return anyImageSearch(ranges.map(([start, end]) => [
    `system:import time > ${stamp(start - 1)}`,
    `system:import time < ${stamp(end + 1)}`
  ]));
}
