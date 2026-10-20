import {spawn} from 'node:child_process';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {rootCertificates} from 'node:tls';
import {listAppTables,quote,tlsDatabaseUrl} from './database-tables.mjs';
const command=process.argv[2]||'backup';
const url=new URL(process.env.DATABASE_URL||'postgresql://invalid');
const key=Buffer.from(process.env.BACKUP_ENCRYPTION_KEY||'','base64');
if(key.length!==32||!url.password)throw new Error('Configure DATABASE_URL and a 32-byte base64 BACKUP_ENCRYPTION_KEY outside Git.');
const folder=resolve(process.env.BACKUP_DIRECTORY||join(process.env.LOCALAPPDATA||'.','TryggPulse','backups'));
const workspace=resolve(fileURLToPath(new URL('../',import.meta.url)));
if(folder===workspace||folder.startsWith(workspace+'\\')||folder.startsWith(workspace+'/'))throw new Error('Backups must be outside the repository.');
const bin=process.env.PGTOOLS_BIN||join(process.env.LOCALAPPDATA||'.','TryggPulse','tools','postgresql18','pgsql','bin');
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1),PGSSLMODE:url.hostname==='localhost'||url.hostname==='127.0.0.1'?'disable':'verify-full',PGSSLROOTCERT:process.env.PGSSLROOTCERT||join(folder,'trusted-postgres-roots.pem')};
const binary=name=>join(bin,name+(process.platform==='win32'?'.exe':''));
await mkdir(folder,{recursive:true});
// Portable Windows libpq has no CA bundle. Use Node's bundled trusted roots;
// certificate and hostname verification stay enabled on every remote connection.
if(!process.env.PGSSLROOTCERT)await writeFile(env.PGSSLROOTCERT,rootCertificates.join('\n'));
const header=Buffer.from('TPBACKUP1'),iv=randomBytes(12);
if(command==='backup'){
  const target=join(folder,'tryggpulse-'+new Date().toISOString().replaceAll(':','-')+'.dump.enc');
  const cipher=createCipheriv('aes-256-gcm',key,iv),file=createWriteStream(target,{flags:'wx',mode:0o600});
  file.write(Buffer.concat([header,iv]));
  const pool=new pg.Pool({connectionString:tlsDatabaseUrl(url.toString())});
  let tables;try{tables=await listAppTables(pool);}finally{await pool.end();}
  const child=spawn(binary('pg_dump'),['--format=custom','--no-owner','--no-acl',...tables.map(name=>'--table=public.'+name)],{env,stdio:['ignore','pipe','pipe']});
  let diagnostic='';child.stderr.on('data',data=>{diagnostic+=data.toString();});
  const ended=new Promise((ok,bad)=>{child.on('error',bad);child.on('close',code=>{
    const safe=diagnostic.replaceAll(env.PGPASSWORD,'[redacted]').replaceAll(url.toString(),'[connection redacted]').slice(0,1200);
    code===0?ok():bad(new Error('pg_dump failed; archive is incomplete. '+safe));
  });});
  await Promise.all([pipeline(child.stdout,cipher,file),ended]);
  const handle=await open(target,'a');try{await handle.write(cipher.getAuthTag());}finally{await handle.close();}
  // A separate, non-sensitive marker makes failed or stale scheduled runs detectable.
  await writeFile(join(folder,'last-success.json'),JSON.stringify({at:new Date().toISOString(),archive:target},null,2));
  console.log('Encrypted database backup completed: '+target);
}else if(command==='verify'||command==='restore'){
  const archive=resolve(process.argv[3]||''),data=await readFile(archive);
  if(!data.subarray(0,9).equals(header))throw new Error('Invalid backup format.');
  const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(9,21));decipher.setAuthTag(data.subarray(-16));
  const plain=Buffer.concat([decipher.update(data.subarray(21,-16)),decipher.final()]);
  if(plain.subarray(0,5).toString()!=='PGDMP')throw new Error('Archive is not a PostgreSQL custom dump.');
  console.log('Backup integrity and encryption verified.');
  if(command==='restore'){
    if(!process.env.RESTORE_DATABASE_URL)throw new Error('Set an explicit RESTORE_DATABASE_URL for the empty target.');
    const target=new URL(process.env.RESTORE_DATABASE_URL);
    if(target.toString()===url.toString())throw new Error('Restore target must differ from the source.');
    const pool=new pg.Pool({connectionString:tlsDatabaseUrl(target.toString())});
    try{
      const existing=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
      const {appTables}=await import('./database-tables.mjs');
      if(existing.some(row=>appTables.has(row.tablename)))throw new Error('Target contains app tables. Refusing to overwrite them.');
      const roles=(await pool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')")).rows;
      for(const {rolname} of roles)await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${quote(rolname)}`);
      await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC');
      const restoreEnv={...env,PGHOST:target.hostname,PGPORT:target.port||'5432',PGUSER:decodeURIComponent(target.username),PGPASSWORD:decodeURIComponent(target.password),PGDATABASE:target.pathname.slice(1),PGSSLMODE:['localhost','127.0.0.1'].includes(target.hostname)?'disable':'verify-full'};
      const child=spawn(binary('pg_restore'),['--dbname='+restoreEnv.PGDATABASE,'--single-transaction','--exit-on-error','--no-owner','--no-acl'],{env:restoreEnv,stdio:['pipe','ignore','pipe']});
      child.stderr.resume();
      const ended=new Promise((ok,bad)=>{child.on('error',bad);child.on('close',code=>code===0?ok():bad(new Error('Restore failed; transaction rolled back.')));});
      child.stdin.on('error',()=>{});child.stdin.end(plain);await ended;
      for(const name of await listAppTables(pool)){
        await pool.query(`ALTER TABLE public.${quote(name)} ENABLE ROW LEVEL SECURITY`);
        await pool.query(`REVOKE ALL ON public.${quote(name)} FROM PUBLIC`);
        for(const {rolname} of roles)await pool.query(`REVOKE ALL ON public.${quote(name)} FROM ${quote(rolname)}`);
      }
      console.log('App tables restored privately. Platform tables preserved. Run database-compare before cutover.');
    }finally{await pool.end();}
  }
}else throw new Error('Use backup, verify <encrypted-file>, or restore <encrypted-file>.');
