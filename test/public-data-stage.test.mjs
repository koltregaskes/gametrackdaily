import assert from 'node:assert/strict';
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stagePublicData } from '../scripts/public-data-contract.mjs';
import { runCli } from '../scripts/stage-public-data.mjs';

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
  await Promise.all([
    writeFile(path.join(outputDir, 'games-news.json'), 'old-news\n'),
    writeFile(path.join(outputDir, 'release-calendar.json'), 'old-calendar\n'),
  ]);

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
  const { root, outputDir } = await createWorkspace(t);
  const newsInput = path.join(outputDir, 'games-news.json');
  const calendarSourceDir = path.join(root, 'calendar-source');
  const calendarInput = path.join(calendarSourceDir, 'release-calendar.json');
  await mkdir(calendarSourceDir, { recursive: true });
  await Promise.all([
    writeFile(newsInput, `${JSON.stringify(newsFixture(), null, 2)}\n`),
    writeFile(calendarInput, `${JSON.stringify(calendarFixture(), null, 2)}\n`),
  ]);

  await assert.rejects(
    stagePublicData({
      newsInput,
      calendarInput,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: true,
    }),
    /news input and public output resolve to the same file/,
  );
});

test('inputs staged elsewhere inside the public checkout are rejected', async (t) => {
  const { root, outputDir } = await createWorkspace(t);
  const checkoutStaging = path.join(root, 'public', 'staging');
  await mkdir(checkoutStaging, { recursive: true });
  const inputs = await writeSources(checkoutStaging);

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /news input must be staged outside the public checkout/,
  );
});

test('secret-shaped and machine-local values are rejected', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const secretNews = newsFixture();
  secretNews.metadata = { clientSecret: 'top-secret-value' };
  let inputs = await writeSources(sourceDir, { news: secretNews });

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /clientSecret is not allowed in public data/,
  );

  const pathNews = newsFixture();
  pathNews.metadata = { evidencePath: '/home/alice/private/evidence.json' };
  inputs = await writeSources(sourceDir, { news: pathNews });

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /contains a machine-local path/,
  );

  const credentialNews = newsFixture();
  credentialNews.feeds[0].items[0].url = 'https://user:password@example.com/private';
  inputs = await writeSources(sourceDir, { news: credentialNews });

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /must not contain URL credentials/,
  );

  const localhostNews = newsFixture();
  localhostNews.feeds[0].items[0].url = 'http://127.0.0.1:3456/private';
  inputs = await writeSources(sourceDir, { news: localhostNews });

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /must not target a local or private host/,
  );

  for (const privateUrl of [
    'http://localhost.:3000/private',
    'http://service.local./private',
    'http://nas/private',
    'http://[ff02::1]/private',
    'http://[fec0::1]/private',
  ]) {
    const privateHostNews = newsFixture();
    privateHostNews.feeds[0].items[0].url = privateUrl;
    inputs = await writeSources(sourceDir, { news: privateHostNews });

    await assert.rejects(
      stagePublicData({
        ...inputs,
        outputDir,
        now: NOW,
        maxSourceAgeHours: 72,
        write: false,
      }),
      /must not target a local or private host/,
    );
  }

  for (const [unsafeValue, expectedError] of [
    ['  C:\\Users\\alice\\secret.json', /contains a machine-local path/],
    ['\n/home/alice/secret.json', /contains a machine-local path/],
    ['/data/private.json', /contains a machine-local path/],
    ['/app/.env', /contains a machine-local path/],
    ['/usr/local/secrets', /contains a machine-local path/],
    ['/run/credentials', /contains a machine-local path/],
    ['/proc/self/environ', /contains a machine-local path/],
    [' https://user:pass@example.com/private', /must not contain URL credentials/],
    ['\thttp://localhost/private', /must not target a local or private host/],
  ]) {
    const whitespaceNews = newsFixture();
    whitespaceNews.metadata = { evidence: unsafeValue };
    inputs = await writeSources(sourceDir, { news: whitespaceNews });

    await assert.rejects(
      stagePublicData({
        ...inputs,
        outputDir,
        now: NOW,
        maxSourceAgeHours: 72,
        write: false,
      }),
      expectedError,
    );
  }

  for (const unsafeKey of [
    'api-key',
    'api.key',
    'api key',
    'apikey',
    'private-key',
    'database-url',
    'connection-string',
    'authorization',
    'cookie',
    'session',
  ]) {
    const unsafeKeyNews = newsFixture();
    unsafeKeyNews.metadata = { [unsafeKey]: 'must-not-publish' };
    inputs = await writeSources(sourceDir, { news: unsafeKeyNews });

    await assert.rejects(
      stagePublicData({
        ...inputs,
        outputDir,
        now: NOW,
        maxSourceAgeHours: 72,
        write: false,
      }),
      /is not allowed in public data/,
    );
  }
});

test('example-marked release and event rows are rejected', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const exampleRelease = calendarFixture();
  exampleRelease.releases[0]._example = true;
  let inputs = await writeSources(sourceDir, { calendar: exampleRelease });

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /calendar\.releases\[0\]\._example is marked as example data/,
  );

  const exampleEvent = calendarFixture();
  exampleEvent.events[0]._example = true;
  inputs = await writeSources(sourceDir, { calendar: exampleEvent });

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /calendar\.events\[0\]\._example is marked as example data/,
  );
});

test('a second output replacement failure rolls the first output back', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const inputs = await writeSources(sourceDir);
  const newsOutput = path.join(outputDir, 'games-news.json');
  const calendarOutput = path.join(outputDir, 'release-calendar.json');
  await Promise.all([
    writeFile(newsOutput, 'preserve-news\n'),
    writeFile(calendarOutput, 'preserve-calendar\n'),
  ]);

  const failCalendarReplace = async (source, target) => {
    if (target === calendarOutput) throw new Error('simulated calendar lock');
    await rename(source, target);
  };

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: true,
    }, {
      replaceFile: failCalendarReplace,
    }),
    /Any replaced public output was rolled back/,
  );

  assert.equal(await readFile(newsOutput, 'utf8'), 'preserve-news\n');
  assert.equal(await readFile(calendarOutput, 'utf8'), 'preserve-calendar\n');
});

test('the operational CLI cannot override its clock or freshness ceiling', async () => {
  await assert.rejects(
    runCli([
      '--news-input',
      'news.json',
      '--calendar-input',
      'calendar.json',
      '--now',
      '2025-01-01T10:00:00.000Z',
    ]),
    /Unknown argument: --now/,
  );
  await assert.rejects(
    runCli([
      '--news-input',
      'news.json',
      '--calendar-input',
      'calendar.json',
      '--max-source-age-hours',
      '10000',
    ]),
    /Unknown argument: --max-source-age-hours/,
  );
});

test('impossible release and event dates are rejected rather than normalised', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const invalidRelease = calendarFixture();
  invalidRelease.releases[0].date = '2026-02-31';
  let inputs = await writeSources(sourceDir, { calendar: invalidRelease });

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /calendar\.releases\[0\]\.date is not a valid calendar date/,
  );

  const invalidEvent = calendarFixture();
  invalidEvent.events[0].date = '2026-13-01';
  inputs = await writeSources(sourceDir, { calendar: invalidEvent });

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /calendar\.events\[0\]\.date is not a valid calendar date/,
  );
});

test('an external hard link to a public output is rejected', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const publicNews = path.join(outputDir, 'games-news.json');
  const externalNews = path.join(sourceDir, 'games-news.json');
  const calendarInput = path.join(sourceDir, 'release-calendar.json');
  await writeFile(publicNews, `${JSON.stringify(newsFixture(), null, 2)}\n`);
  await link(publicNews, externalNews);
  await writeFile(calendarInput, `${JSON.stringify(calendarFixture(), null, 2)}\n`);

  await assert.rejects(
    stagePublicData({
      newsInput: externalNews,
      calendarInput,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /news input and news public output resolve to the same filesystem object/,
  );
});

test('an input hard-linked to the other public output is rejected', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const publicCalendar = path.join(outputDir, 'release-calendar.json');
  const externalNews = path.join(sourceDir, 'games-news.json');
  const calendarInput = path.join(sourceDir, 'release-calendar.json');
  await writeFile(publicCalendar, `${JSON.stringify(calendarFixture(), null, 2)}\n`);
  await link(publicCalendar, externalNews);
  await writeFile(calendarInput, `${JSON.stringify(calendarFixture(), null, 2)}\n`);

  await assert.rejects(
    stagePublicData({
      newsInput: externalNews,
      calendarInput,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /news input and calendar public output resolve to the same filesystem object/,
  );
});

test('news and calendar inputs cannot be hard links to one source object', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const newsInput = path.join(sourceDir, 'games-news.json');
  const calendarInput = path.join(sourceDir, 'release-calendar.json');
  await writeFile(newsInput, `${JSON.stringify(newsFixture(), null, 2)}\n`);
  await link(newsInput, calendarInput);

  await assert.rejects(
    stagePublicData({
      newsInput,
      calendarInput,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: false,
    }),
    /news and calendar inputs resolve to the same filesystem object/,
  );
});

test('malformed and future news timestamps are rejected', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);

  for (const [publishedAt, expectedError] of [
    ['1', /must use an ISO UTC timestamp with milliseconds/],
    ['2026-02-31T07:00:00.000Z', /is not a valid timestamp/],
    ['2099-01-01T00:00:00.000Z', /is more than five minutes in the future/],
  ]) {
    const invalidNews = newsFixture();
    invalidNews.feeds[0].items[0].publishedAt = publishedAt;
    const inputs = await writeSources(sourceDir, { news: invalidNews });

    await assert.rejects(
      stagePublicData({
        ...inputs,
        outputDir,
        now: NOW,
        maxSourceAgeHours: 72,
        write: false,
      }),
      expectedError,
    );
  }
});

test('a second writer is rejected while the first writer holds the lock', async (t) => {
  const { root, sourceDir, outputDir } = await createWorkspace(t);
  const firstInputs = await writeSources(sourceDir);
  const secondSourceDir = path.join(root, 'source-second');
  await mkdir(secondSourceDir, { recursive: true });
  const secondNews = newsFixture();
  secondNews.feeds[0].items[0].title = 'Second writer story';
  const secondCalendar = calendarFixture();
  secondCalendar.releases[0].title = 'Second writer release';
  const secondInputs = await writeSources(secondSourceDir, {
    news: secondNews,
    calendar: secondCalendar,
  });

  let releaseFirstWriter;
  const firstWriterCanContinue = new Promise((resolve) => {
    releaseFirstWriter = resolve;
  });
  let announceFirstWriter;
  const firstWriterHasLock = new Promise((resolve) => {
    announceFirstWriter = resolve;
  });
  let held = false;
  const holdFirstReplacement = async (source, target) => {
    if (!held) {
      held = true;
      announceFirstWriter();
      await firstWriterCanContinue;
    }
    await rename(source, target);
  };

  const firstWrite = stagePublicData({
    ...firstInputs,
    outputDir,
    now: NOW,
    maxSourceAgeHours: 72,
    write: true,
  }, {
    replaceFile: holdFirstReplacement,
  });
  await firstWriterHasLock;

  await assert.rejects(
    stagePublicData({
      ...secondInputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: true,
    }),
    /Public-data staging lock is already held/,
  );

  releaseFirstWriter();
  await firstWrite;
  const publicNews = JSON.parse(await readFile(path.join(outputDir, 'games-news.json'), 'utf8'));
  const publicCalendar = JSON.parse(
    await readFile(path.join(outputDir, 'release-calendar.json'), 'utf8'),
  );
  assert.equal(publicNews.feeds[0].items[0].title, 'A current public story');
  assert.equal(publicCalendar.releases[0].title, 'Release One');
});

test('readback verification failure rolls both public outputs back', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const inputs = await writeSources(sourceDir);
  const newsOutput = path.join(outputDir, 'games-news.json');
  const calendarOutput = path.join(outputDir, 'release-calendar.json');
  await Promise.all([
    writeFile(newsOutput, 'preserve-news\n'),
    writeFile(calendarOutput, 'preserve-calendar\n'),
  ]);

  const corruptAfterPairReplacement = async (source, target) => {
    await rename(source, target);
    if (target === calendarOutput) {
      await writeFile(newsOutput, 'corrupt-after-write\n');
    }
  };

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: true,
    }, {
      replaceFile: corruptAfterPairReplacement,
    }),
    /Any replaced public output was rolled back/,
  );

  assert.equal(await readFile(newsOutput, 'utf8'), 'preserve-news\n');
  assert.equal(await readFile(calendarOutput, 'utf8'), 'preserve-calendar\n');
});

test('a linked public data directory cannot redirect outputs outside the checkout', async (t) => {
  const { root, sourceDir, outputDir } = await createWorkspace(t);
  const inputs = await writeSources(sourceDir);
  const externalOutput = path.join(root, 'external-public-data');
  await rm(outputDir, { recursive: true });
  await mkdir(externalOutput, { recursive: true });
  await symlink(
    externalOutput,
    outputDir,
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: true,
    }),
    /public output directory must be a real data directory inside this checkout/,
  );
  await assert.rejects(readFile(path.join(externalOutput, 'games-news.json')));
  await assert.rejects(readFile(path.join(externalOutput, 'release-calendar.json')));
});

test('staging cannot move public source timestamps backwards', async (t) => {
  const { sourceDir, outputDir } = await createWorkspace(t);
  const inputs = await writeSources(sourceDir);
  const currentNews = newsFixture('2026-07-26T09:00:00.000Z');
  currentNews.feeds[0].items[0].publishedAt = '2026-07-26T08:45:00.000Z';
  const currentCalendar = calendarFixture('2026-07-26T09:00:00.000Z');
  await Promise.all([
    writeFile(
      path.join(outputDir, 'games-news.json'),
      `${JSON.stringify(currentNews, null, 2)}\n`,
    ),
    writeFile(
      path.join(outputDir, 'release-calendar.json'),
      `${JSON.stringify(currentCalendar, null, 2)}\n`,
    ),
  ]);

  await assert.rejects(
    stagePublicData({
      ...inputs,
      outputDir,
      now: NOW,
      maxSourceAgeHours: 72,
      write: true,
    }),
    /news source timestamp is older than the current public news timestamp/,
  );

  const publicNews = JSON.parse(await readFile(path.join(outputDir, 'games-news.json'), 'utf8'));
  const publicCalendar = JSON.parse(
    await readFile(path.join(outputDir, 'release-calendar.json'), 'utf8'),
  );
  assert.equal(publicNews.generated, '2026-07-26T09:00:00.000Z');
  assert.equal(publicCalendar.updatedAt, '2026-07-26T09:00:00.000Z');
});
