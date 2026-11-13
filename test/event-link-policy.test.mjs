import test from 'node:test';import assert from 'node:assert/strict';
import {normaliseGameEvent} from '../scripts/event-link-policy.mjs';
test('known retired event URLs are corrected before calendar generation',()=>{
 const old={id:'sgf',watchUrl:'https://www.summergamefest.com/events/wholesome-direct',officialUrl:'https://www.summergamefest.com/events/wholesome-direct',notes:'Original note.',sourceCheck:{status:'http_404',httpCode:404}};
 const fixed=normaliseGameEvent(old);assert.equal(fixed.watchUrl,'https://www.summergamefest.com/');assert.equal(fixed.watchLabel,'Official festival site');assert.deepEqual(fixed.sourceCheck,old.sourceCheck);assert.equal(old.watchUrl.includes('/events/'),true);assert.deepEqual(normaliseGameEvent(fixed),fixed);
});
test('unrelated or future official events are not redirected',()=>{
 for(const watchUrl of ['https://thegameawards.com/','https://www.summergamefest.com/events/new-showcase','https://example.org/events/wholesome-direct']){const event={watchUrl};assert.equal(normaliseGameEvent(event),event)}
});
