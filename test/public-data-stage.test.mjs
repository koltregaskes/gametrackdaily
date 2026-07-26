import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stagePublicData } from '../scripts/public-data-contract.mjs';

const NOW = new Date('2026-07-26T10:00:00.000Z');

function newsFixture(generated = '2026-07-26T08:00:00.000Z') {
  return {
    generated,
    feeds: [
      {
        id: 'gaming',
        title: 'Gaming News',
        generatedAt: generated,
        items: [
          {
            title: 'A current public story',
            source: 'Official Games Desk',
            url: 'https://example.com/current-story',
            summary: 'Public-safe fixture.',
            publishedAt: '2026-07-26T07:30:00.000Z',
            tag: 'News',
            _example: false,
          },
        ],
      },
    ],
  };
}

function calendarFixture(updatedAt = '2026-07-26T08:30:00.000Z') {
  return {
    title: 'GameTrackDaily // Release Calendar',
    updatedAt,
    status: 'live-shared-calendar',
    releases: [
      {
        id: 'release-one',
        title: 'Release One',
        date: '2026-08-01',
        platforms: ['Windows PC'],
        source: 'Official Store',
        trackingState: 'live-api',
      },
    ],
    events: [
      {
        id: 'event-one',
        title: 'Event One',
        date: '2026-08-02',
        officialUrl: 'https://example.com/official-event',
      },
    ],
  };
}

async function createWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gametrackdaily-public-stage-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, 'source');
  const outputDir = path.join(root, 'public', 'data');
  await Promise.all([
    writeFile(path.join(root, '.keep-source'), ''),
    writeFile(path.join(root, '.keep-output'), ''),
  ]);
  await Promise.all([
    mkdir(sourceDir, { recursive: true }),
    mkdir(outputDir, { recursive: true }),
  ]);
  return { root, sourceDir, outputDir };
}

async function writeSources(sourceDir, {
  news = newsFixture(),
  calendar = calendarFixture(),
} = {}) {
  const newsInput = path.join(sourceDir, 'games-news.json');
  const calendarInput = path.join(sourceDir, 'release-calendar.json');
  await Promise.all([
    writeFile(newsInput, `${JSON.stringify(news, null, 2)}\n`),
    writeFile(calendarInput, `${JSON.stringify(calendar, null, 2)}\n`),
  ]);
  return { newsInput, calendarInput };
}

test('dry-run reports exact consumed paths without changing public outputs', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const inputs = await writeSources(sourceDir);

  const result = await stagePublicData({
    ...inputs,
    outputDir,
    now: NOW,
    maxSourceAgeHours: 72,
    write: false,
  });

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.consumedInputs.news.path, path.resolve(inputs.newsInput));
  assert.equal(result.consumedInputs.calendar.path, path.resolve(inputs.calendarInput));
  assert.equal(result.consumedInputs.news.itemCount, 1);
  assert.equal(result.consumedInputs.calendar.releaseCount, 1);
  await assert.rejects(readFile(path.join(outputDir, 'games-news.json')));
  await assert.rejects(readFile(path.join(outputDir, 'release-calendar.json')));
});

test('write mode proves public outputs match the consumed inputs', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const inputs = await writeSources(sourceDir);

  const result = await stagePublicData({
    ...inputs,
    outputDir,
    now: NOW,
    maxSourceAgeHours: 72,
    write: true,
  });

  const [sourceNews, publicNews, sourceCalendar, publicCalendar] = await Promise.all([
    readFile(inputs.newsInput),
    readFile(path.join(outputDir, 'games-news.json')),
    readFile(inputs.calendarInput),
    readFile(path.join(outputDir, 'release-calendar.json')),
  ]);
  assert.equal(result.mode, 'write');
  assert.deepEqual(publicNews, sourceNews);
  assert.deepEqual(publicCalendar, sourceCalendar);
  assert.equal(result.publicOutputs.news.sha256, result.consumedInputs.news.sha256);
  assert.equal(result.publicOutputs.calendar.sha256, result.consumedInputs.calendar.sha256);
});

test('stale source data fails before either public output changes', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const inputs = await writeSources(sourceDir, {
    news: newsFixture('2026-07-20T08:00:00.000Z'),
  });
  const newsOutput = path.join(outputDir, 'games-news.json');
  const calendarOutput = path.join(outputDir, 'release-calendar.json');
  await Promise.all([
    writeFile(newsOutput, 'preserve-news\n'),
    writeFile(calendarOutput, 'preserve-calendar\n'),
  ]);

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: true,
    }),
    /news\.generated is stale/,
  );

  assert.equal(await readFile(newsOutput, 'utf8'), 'preserve-news\n');
  assert.equal(await readFile(calendarOutput, 'utf8'), 'preserve-calendar\n');
});

test('input and public output cannot be the same file', async (t) => {
  const { sourceDir } = await createWorkspace(t);
  const inputs = await writeSources(sourceDir);

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir: sourceDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: true,
    }),
    /news input and public output resolve to the same file/,
  );
});
