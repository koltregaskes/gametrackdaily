import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export const PUBLIC_DATA_FILES = Object.freeze({
  news: 'games-news.json',
  calendar: 'release-calendar.json',
});

export const DEFAULT_MAX_SOURCE_AGE_HOURS = 72;

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }
  return value;
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  return (
    first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224
  );
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const isIpv6 = host.includes(':');
  return (
    host === 'localhost'
    || host === '::'
    || host === '::1'
    || (!host.includes('.') && !isIpv6)
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host.endsWith('.lan')
    || host.endsWith('.test')
    || host.endsWith('.invalid')
    || (isIpv6 && host.startsWith('fc'))
    || (isIpv6 && host.startsWith('fd'))
    || (isIpv6 && /^fe[89ab]/.test(host))
    || (isIpv6 && /^fe[c-f]/.test(host))
    || (isIpv6 && host.startsWith('ff'))
    || (isIpv6 && host.startsWith('::ffff:'))
    || isPrivateIpv4(host)
  );
}

function requireHttpUrl(value, label) {
  const rawUrl = requireString(value, label);
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    fail(`${label} must use http or https`);
  }
  if (url.username || url.password) {
    fail(`${label} must not contain URL credentials`);
  }
  if (isPrivateHostname(url.hostname)) {
    fail(`${label} must not target a local or private host`);
  }
}

function requireIsoDate(value, label) {
  const date = requireString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail(`${label} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    fail(`${label} is not a valid calendar date`);
  }
  return date;
}

function sourceFreshness(value, label, now, maxSourceAgeHours) {
  const timestamp = requireString(value, label);
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) {
    fail(`${label} is not a valid timestamp`);
  }

  const nowMs = now.getTime();
  const futureAllowanceMs = 5 * 60 * 1000;
  if (timestampMs > nowMs + futureAllowanceMs) {
    fail(`${label} is more than five minutes in the future`);
  }

  const ageHours = (nowMs - timestampMs) / (60 * 60 * 1000);
  if (ageHours > maxSourceAgeHours) {
    fail(
      `${label} is stale at ${ageHours.toFixed(2)} hours old; maximum is ${maxSourceAgeHours} hours`,
    );
  }

  return {
    timestamp: new Date(timestampMs).toISOString(),
    ageHours: Number(Math.max(0, ageHours).toFixed(2)),
  };
}

function assertPublicSafeJson(value, label, keyPath = label) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicSafeJson(item, label, `${keyPath}[${index}]`));
    return;
  }

  if (!isObject(value)) {
    if (
      typeof value === 'string'
      && (
        /^[a-z]:[\\/]/i.test(value)
        || /^\\\\/.test(value)
        || /^file:\/\//i.test(value)
        || /^\/(?:home|users|private|tmp|var|etc|opt|root|mnt|srv|workspaces?)(?:\/|$)/i.test(value)
        || /^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\//i.test(value)
        || /^-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)
        || /^(?:sk-[a-z0-9_-]{16,}|ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|xox[baprs]-[a-z0-9-]{20,})$/i.test(value)
      )
    ) {
      fail(`${keyPath} contains a machine-local path`);
    }
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
      requireHttpUrl(value, keyPath);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalisedKey = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    if (
      /(password|secret|credential|private_key|token|api_key|database_url|connection_string)/
        .test(normalisedKey)
    ) {
      fail(`${keyPath}.${key} is not allowed in public data`);
    }
    if ((normalisedKey === '_example' || normalisedKey === 'example') && child === true) {
      fail(`${keyPath}.${key} is marked as example data`);
    }
    assertPublicSafeJson(child, label, `${keyPath}.${key}`);
  }
}

export function validateNewsData(news, options) {
  if (!isObject(news)) fail('news input must be a JSON object');
  assertPublicSafeJson(news, 'news');

  const freshness = sourceFreshness(
    news.generated,
    'news.generated',
    options.now,
    options.maxSourceAgeHours,
  );
  const feeds = requireArray(news.feeds, 'news.feeds');
  if (feeds.length === 0) fail('news.feeds must contain at least one feed');

  let itemCount = 0;
  feeds.forEach((feed, feedIndex) => {
    if (!isObject(feed)) fail(`news.feeds[${feedIndex}] must be an object`);
    requireString(feed.id, `news.feeds[${feedIndex}].id`);
    requireString(feed.title, `news.feeds[${feedIndex}].title`);
    const items = requireArray(feed.items, `news.feeds[${feedIndex}].items`);

    items.forEach((item, itemIndex) => {
      const itemLabel = `news.feeds[${feedIndex}].items[${itemIndex}]`;
      if (!isObject(item)) fail(`${itemLabel} must be an object`);
      requireString(item.title, `${itemLabel}.title`);
      requireString(item.source, `${itemLabel}.source`);
      requireHttpUrl(item.url, `${itemLabel}.url`);
      requireString(item.publishedAt, `${itemLabel}.publishedAt`);
      if (!Number.isFinite(Date.parse(item.publishedAt))) {
        fail(`${itemLabel}.publishedAt is not a valid timestamp`);
      }
      itemCount += 1;
    });
  });

  if (itemCount === 0) fail('news input has no public news items');
  return { ...freshness, feedCount: feeds.length, itemCount };
}

export function validateCalendarData(calendar, options) {
  if (!isObject(calendar)) fail('calendar input must be a JSON object');
  assertPublicSafeJson(calendar, 'calendar');

  const freshness = sourceFreshness(
    calendar.updatedAt,
    'calendar.updatedAt',
    options.now,
    options.maxSourceAgeHours,
  );
  const releases = requireArray(calendar.releases, 'calendar.releases');
  const events = requireArray(calendar.events, 'calendar.events');

  if (releases.length === 0) fail('calendar.releases must contain at least one release');
  if (events.length === 0) fail('calendar.events must contain at least one event');

  releases.forEach((release, index) => {
    const releaseLabel = `calendar.releases[${index}]`;
    if (!isObject(release)) fail(`${releaseLabel} must be an object`);
    requireString(release.id, `${releaseLabel}.id`);
    requireString(release.title, `${releaseLabel}.title`);
    requireIsoDate(release.date, `${releaseLabel}.date`);
    if (requireArray(release.platforms, `${releaseLabel}.platforms`).length === 0) {
      fail(`${releaseLabel}.platforms must contain at least one platform`);
    }
  });

  events.forEach((event, index) => {
    const eventLabel = `calendar.events[${index}]`;
    if (!isObject(event)) fail(`${eventLabel} must be an object`);
    requireString(event.id, `${eventLabel}.id`);
    requireString(event.title, `${eventLabel}.title`);
    requireIsoDate(event.date, `${eventLabel}.date`);
    requireHttpUrl(event.officialUrl, `${eventLabel}.officialUrl`);
  });

  return {
    ...freshness,
    releaseCount: releases.length,
    eventCount: events.length,
  };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readJsonInput(filePath, label) {
  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch (error) {
    fail(`${label} input could not be read at ${filePath}: ${error.message}`);
  }

  let value;
  try {
    value = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    fail(`${label} input is not valid JSON at ${filePath}: ${error.message}`);
  }

  return { buffer, value, sha256: sha256(buffer) };
}

function normalisedPath(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function assertDistinctInputAndOutput(inputPath, outputPath, label) {
  if (normalisedPath(inputPath) === normalisedPath(outputPath)) {
    fail(`${label} input and public output resolve to the same file`);
  }
}

function assertInputOutsideDirectory(inputPath, directory, label, directoryLabel) {
  const relative = path.relative(directory, inputPath);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    fail(`${label} input must be staged outside the ${directoryLabel}`);
  }
}

async function assertInputPathBoundary(inputPath, outputPath, repositoryRoot, label) {
  assertInputOutsideDirectory(inputPath, repositoryRoot, label, 'public checkout');

  const [canonicalInput, canonicalRepositoryRoot] = await Promise.all([
    realpath(inputPath),
    realpath(repositoryRoot),
  ]);
  assertInputOutsideDirectory(
    canonicalInput,
    canonicalRepositoryRoot,
    label,
    'canonical public checkout',
  );

  try {
    const [inputStats, outputStats] = await Promise.all([
      stat(inputPath),
      stat(outputPath),
    ]);
    if (inputStats.dev === outputStats.dev && inputStats.ino === outputStats.ino) {
      fail(`${label} input and public output resolve to the same filesystem object`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function writeAtomically(outputPath, buffer) {
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, buffer);
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function readOptionalFile(filePath) {
  try {
    return { exists: true, buffer: await readFile(filePath) };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, buffer: null };
    throw error;
  }
}

async function writePublicOutputPair({
  newsOutput,
  calendarOutput,
  newsBuffer,
  calendarBuffer,
  replaceFile,
}) {
  const [originalNews, originalCalendar] = await Promise.all([
    readOptionalFile(newsOutput),
    readOptionalFile(calendarOutput),
  ]);
  const newsTemporary = `${newsOutput}.tmp-${process.pid}-${randomUUID()}`;
  const calendarTemporary = `${calendarOutput}.tmp-${process.pid}-${randomUUID()}`;
  const replaced = [];

  try {
    await Promise.all([
      writeFile(newsTemporary, newsBuffer),
      writeFile(calendarTemporary, calendarBuffer),
    ]);
    await replaceFile(newsTemporary, newsOutput);
    replaced.push({ output: newsOutput, original: originalNews });
    await replaceFile(calendarTemporary, calendarOutput);
    replaced.push({ output: calendarOutput, original: originalCalendar });
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of replaced.reverse()) {
      try {
        if (entry.original.exists) {
          await writeAtomically(entry.output, entry.original.buffer);
        } else {
          await rm(entry.output, { force: true });
        }
      } catch (rollbackError) {
        rollbackErrors.push(`${entry.output}: ${rollbackError.message}`);
      }
    }

    const rollbackSummary = rollbackErrors.length === 0
      ? 'Any replaced public output was rolled back.'
      : `Rollback also failed for ${rollbackErrors.join('; ')}`;
    fail(`Public output pair could not be replaced: ${error.message}. ${rollbackSummary}`);
  } finally {
    await Promise.all([
      rm(newsTemporary, { force: true }),
      rm(calendarTemporary, { force: true }),
    ]);
  }
}

export async function stagePublicData({
  newsInput,
  calendarInput,
  outputDir,
  maxSourceAgeHours = DEFAULT_MAX_SOURCE_AGE_HOURS,
  now = new Date(),
  write = false,
}, {
  replaceFile = rename,
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('now must be a valid Date');
  }
  if (!Number.isFinite(maxSourceAgeHours) || maxSourceAgeHours <= 0) {
    fail('maxSourceAgeHours must be a positive number');
  }
  if (maxSourceAgeHours > DEFAULT_MAX_SOURCE_AGE_HOURS) {
    fail(`maxSourceAgeHours cannot exceed ${DEFAULT_MAX_SOURCE_AGE_HOURS}`);
  }

  const resolvedNewsInput = path.resolve(requireString(newsInput, 'newsInput'));
  const resolvedCalendarInput = path.resolve(requireString(calendarInput, 'calendarInput'));
  const resolvedOutputDir = path.resolve(requireString(outputDir, 'outputDir'));
  const resolvedRepositoryRoot = path.dirname(resolvedOutputDir);
  const newsOutput = path.join(resolvedOutputDir, PUBLIC_DATA_FILES.news);
  const calendarOutput = path.join(resolvedOutputDir, PUBLIC_DATA_FILES.calendar);

  assertDistinctInputAndOutput(resolvedNewsInput, newsOutput, 'news');
  assertDistinctInputAndOutput(resolvedCalendarInput, calendarOutput, 'calendar');
  await Promise.all([
    assertInputPathBoundary(
      resolvedNewsInput,
      newsOutput,
      resolvedRepositoryRoot,
      'news',
    ),
    assertInputPathBoundary(
      resolvedCalendarInput,
      calendarOutput,
      resolvedRepositoryRoot,
      'calendar',
    ),
  ]);

  const [newsSource, calendarSource] = await Promise.all([
    readJsonInput(resolvedNewsInput, 'news'),
    readJsonInput(resolvedCalendarInput, 'calendar'),
  ]);

  const validationOptions = { now, maxSourceAgeHours };
  const newsSummary = validateNewsData(newsSource.value, validationOptions);
  const calendarSummary = validateCalendarData(calendarSource.value, validationOptions);

  const result = {
    mode: write ? 'write' : 'dry-run',
    maxSourceAgeHours,
    checkedAt: now.toISOString(),
    consumedInputs: {
      news: {
        path: resolvedNewsInput,
        sha256: newsSource.sha256,
        ...newsSummary,
      },
      calendar: {
        path: resolvedCalendarInput,
        sha256: calendarSource.sha256,
        ...calendarSummary,
      },
    },
    publicOutputs: {
      news: { path: newsOutput, sha256: newsSource.sha256 },
      calendar: { path: calendarOutput, sha256: calendarSource.sha256 },
    },
  };

  if (!write) return result;

  await mkdir(resolvedOutputDir, { recursive: true });
  await writePublicOutputPair({
    newsOutput,
    calendarOutput,
    newsBuffer: newsSource.buffer,
    calendarBuffer: calendarSource.buffer,
    replaceFile,
  });

  const [writtenNews, writtenCalendar] = await Promise.all([
    readJsonInput(newsOutput, 'written news'),
    readJsonInput(calendarOutput, 'written calendar'),
  ]);

  if (writtenNews.sha256 !== newsSource.sha256) {
    fail('public news output hash does not match the consumed news input');
  }
  if (writtenCalendar.sha256 !== calendarSource.sha256) {
    fail('public calendar output hash does not match the consumed calendar input');
  }

  const writtenNewsSummary = validateNewsData(writtenNews.value, validationOptions);
  const writtenCalendarSummary = validateCalendarData(writtenCalendar.value, validationOptions);
  if (
    writtenNewsSummary.timestamp !== newsSummary.timestamp
    || writtenNewsSummary.itemCount !== newsSummary.itemCount
  ) {
    fail('public news output metadata does not match the consumed news input');
  }
  if (
    writtenCalendarSummary.timestamp !== calendarSummary.timestamp
    || writtenCalendarSummary.releaseCount !== calendarSummary.releaseCount
    || writtenCalendarSummary.eventCount !== calendarSummary.eventCount
  ) {
    fail('public calendar output metadata does not match the consumed calendar input');
  }

  return result;
}
