import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_MAX_SOURCE_AGE_HOURS,
  stagePublicData,
} from './public-data-contract.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DATA_DIRECTORY = path.join(REPOSITORY_ROOT, 'data');

function usage() {
  return `Usage:
  node scripts/stage-public-data.mjs \\
    --news-input <path-to-games-news.json> \\
    --calendar-input <path-to-release-calendar.json> \\
    [--output-dir <public-data-directory>] \\
    [--write]

Without --write, the command validates and reports the exact inputs and intended
public outputs without changing files. It never commits, pushes, merges or deploys.`;
}

function parseArguments(argv) {
  const values = {};
  const booleanFlags = new Set(['--write']);
  const valueFlags = new Map([
    ['--news-input', 'newsInput'],
    ['--calendar-input', 'calendarInput'],
    ['--output-dir', 'outputDir'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (booleanFlags.has(argument)) {
      values.write = true;
      continue;
    }
    const key = valueFlags.get(argument);
    if (!key) throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}\n\n${usage()}`);
    }
    if (Object.hasOwn(values, key)) {
      throw new Error(`${argument} was supplied more than once`);
    }
    values[key] = value;
    index += 1;
  }

  if (!values.newsInput || !values.calendarInput) {
    throw new Error(`Both --news-input and --calendar-input are required\n\n${usage()}`);
  }

  const outputDir = path.resolve(values.outputDir || PUBLIC_DATA_DIRECTORY);
  const normalise = (value) => (
    process.platform === 'win32' ? value.toLowerCase() : value
  );
  if (normalise(outputDir) !== normalise(PUBLIC_DATA_DIRECTORY)) {
    throw new Error(
      `--output-dir must resolve to this checkout's public data directory: ${PUBLIC_DATA_DIRECTORY}`,
    );
  }

  return {
    newsInput: values.newsInput,
    calendarInput: values.calendarInput,
    outputDir,
    maxSourceAgeHours: DEFAULT_MAX_SOURCE_AGE_HOURS,
    now: new Date(),
    write: values.write === true,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const result = await stagePublicData(parseArguments(argv));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  runCli().catch((error) => {
    process.stderr.write(`GameTrackDaily public-data staging failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
