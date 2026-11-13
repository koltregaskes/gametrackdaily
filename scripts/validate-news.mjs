import fs from 'node:fs';
import {validateNewsData,DEFAULT_MAX_SOURCE_AGE_HOURS} from './public-data-contract.mjs';
const summary=validateNewsData(JSON.parse(fs.readFileSync('data/games-news.json','utf8')),{now:new Date(),maxSourceAgeHours:DEFAULT_MAX_SOURCE_AGE_HOURS});
console.log(`News contract passed: ${summary.feedCount} rails, ${summary.itemCount} public items.`);
