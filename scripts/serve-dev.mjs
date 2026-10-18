import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/@angular/cli/bin/ng.js',import.meta.url)),'serve',...process.argv.slice(2)],{stdio:'inherit',env:process.env});
const stop=()=>{child.kill();};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??0;});
