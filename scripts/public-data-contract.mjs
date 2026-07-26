import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
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

function requireHttpUrl(value, label) {
  const url = new URL(requireString(value, label));
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    fail(`${label} must use http or https`);
  }
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
      )
    ) {
      fail(`${keyPath} contains a machine-local path`);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (/^(password|secret|token|accessToken|apiKey|databaseUrl|connectionString)$/i.test(key)) {
      fail(`${keyPath}.${key} is not allowed in public data`);
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
      if (item._example === true) {
        fail(`${itemLabel} is marked as example data`);
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
    const date = requireString(release.date, `${releaseLabel}.date`);
    if (!Number.isFinite(Date.parse(date))) fail(`${releaseLabel}.date is not a valid date`);
    if (requireArray(release.platforms, `${releaseLabel}.platforms`).length === 0) {
      fail(`${releaseLabel}.platforms must contain at least one platform`);
    }
  });

  events.forEach((event, index) => {
    const eventLabel = `calendar.events[${index}]`;
    if (!isObject(event)) fail(`${eventLabel} must be an object`);
    requireString(event.id, `${eventLabel}.id`);
    requireString(event.title, `${eventLabel}.title`);
    const date = requireString(event.date, `${eventLabel}.date`);
    if (!Number.isFinite(Date.parse(date))) fail(`${eventLabel}.date is not a valid date`);
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

function assertInputOutsideOutputDirectory(inputPath, outputDir, label) {
  const relative = path.relative(outputDir, inputPath);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    fail(`${label} input must be staged outside the public output directory`);
  }
}

async function writeAtomically(outputPath, buffer) {
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporaryPath, buffer);
  await rename(temporaryPath, outputPath);
}

export async function stagePublicData({
  newsInput,
  calendarInput,
  outputDir,
  maxSourceAgeHours = DEFAULT_MAX_SOURCE_AGE_HOURS,
  now = new Date(),
  write = false,
}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('now must be a valid Date');
  }
  if (!Number.isFinite(maxSourceAgeHours) || maxSourceAgeHours <= 0) {
    fail('maxSourceAgeHours must be a positive number');
  }

  const resolvedNewsInput = path.resolve(requireString(newsInput, 'newsInput'));
  const resolvedCalendarInput = path.resolve(requireString(calendarInput, 'calendarInput'));
  const resolvedOutputDir = path.resolve(requireString(outputDir, 'outputDir'));
  const newsOutput = path.join(resolvedOutputDir, PUBLIC_DATA_FILES.news);
  const calendarOutput = path.join(resolvedOutputDir, PUBLIC_DATA_FILES.calendar);

  assertDistinctInputAndOutput(resolvedNewsInput, newsOutput, 'news');
  assertDistinctInputAndOutput(resolvedCalendarInput, calendarOutput, 'calendar');
  assertInputOutsideOutputDirectory(resolvedNewsInput, resolvedOutputDir, 'news');
  assertInputOutsideOutputDirectory(resolvedCalendarInput, resolvedOutputDir, 'calendar');

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
  await Promise.all([
    writeAtomically(newsOutput, newsSource.buffer),
    writeAtomically(calendarOutput, calendarSource.buffer),
  ]);

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
