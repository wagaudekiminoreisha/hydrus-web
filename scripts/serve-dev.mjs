import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {startManagedBridge} from './managed-bridge.mjs';

const bridge=await startManagedBridge();
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/@angular/cli/bin/ng.js',import.meta.url)),'serve',...process.argv.slice(2)],{stdio:'inherit'});
const stop=()=>{child.kill();bridge?.close();};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
child.once('error',error=>{console.error(error.message);bridge?.close();process.exitCode=1;});
child.once('exit',code=>{bridge?.close();process.exitCode=code??0;});
