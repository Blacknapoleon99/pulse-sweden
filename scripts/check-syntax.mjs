import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),files=[];
for(const directory of ['', 'scripts/'])for(const name of await readdir(new URL(directory,root)))if(/\.(mjs|js)$/.test(name))files.push(directory+name);
files.push('mobile/app.config.js');
for(const name of files){const result=spawnSync(process.execPath,['--check',name],{cwd:fileURLToPath(root),stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log(`Syntax checked ${files.length} backend, web, operations and app configuration modules.`);
