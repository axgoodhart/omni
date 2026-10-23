import * as imessage from './channels/imessage.ts';
import { ALLOWED_HANDLES, HOST, MODEL_LIGHT, MODEL_MAIN, PORT, SKILLS_PATH } from './config.ts';
import { emit, subscribe } from './events/log.ts';
import * as cartridges from './memory/cartridge.ts';
import * as modes from './modes/registry.ts';
import * as scheduler from './scheduler/index.ts';
import { startServer } from './server.ts';
import * as skills from './skills/loader.ts';
import * as deskStore from './desk/store.ts';
import * as observations from './desk/observations.ts';
import * as loopcfg from './desk/loopcfg.ts';
import * as priorities from './desk/priorities.ts';
import * as trust from './desk/trust.ts';
import * as watches from './desk/watches.ts';
import * as interview from './interview/index.ts';
import * as loop from './loop/index.ts';

subscribe((e) => { if (e.id) console.log(new Date(e.ts).toLocaleTimeString(), e.thread ?? '-', e.type, JSON.stringify(e.data).slice(0, 160)); });

const loaded = modes.load();
modes.watch();
const indexed = cartridges.rebuildAll();
const skillCount = skills.load().length;
loopcfg.ensure(); priorities.ensure(); trust.ensure(); watches.ensure(); observations.ensure();
deskStore.watch();
imessage.start();
scheduler.start();
loop.start();
startServer();
emit('daemon.started', null, { modes: loaded, cartridges: indexed, skills: skillCount, skillsPath: SKILLS_PATH || null, models: { main: MODEL_MAIN, light: MODEL_LIGHT }, imessage: ALLOWED_HANDLES.length > 0, url: `http://${HOST}:${PORT}`, interviewNeeded: interview.needed() });

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { emit('daemon.stopping', null, { signal: sig }); process.exit(0); });
