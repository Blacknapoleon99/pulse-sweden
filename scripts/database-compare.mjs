import pg from 'pg';
import {createHash} from 'node:crypto';
import {listAppTables,quote,tlsDatabaseUrl} from './database-tables.mjs';
if(!process.env.SOURCE_DATABASE_URL||!process.env.TARGET_DATABASE_URL)throw new Error('Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL outside Git.');
const source=new pg.Pool({connectionString:tlsDatabaseUrl(process.env.SOURCE_DATABASE_URL)}),target=new pg.Pool({connectionString:tlsDatabaseUrl(process.env.TARGET_DATABASE_URL)});
try{
  const tables=await listAppTables(source);
  for(const tablename of tables){
    const sql=`SELECT row_to_json(t)::text AS value FROM public.${quote(tablename)} t ORDER BY row_to_json(t)::text COLLATE "C"`;
    const [a,b]=await Promise.all([source.query(sql),target.query(sql)]);
    const digest=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>row.value))).digest('hex');
    if(a.rows.length!==b.rows.length||digest(a.rows)!==digest(b.rows))throw new Error('Migration verification failed for table '+tablename);
    console.log(`${tablename}: ${a.rows.length} rows verified`);
  }
  const exposed=(await target.query("SELECT table_name,grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated')")).rows;
  if(exposed.some(row=>tables.includes(row.table_name)))throw new Error('App tables are accessible to Supabase Data API roles. Revoke these grants before cutover.');
  const unprotected=(await target.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity")).rows;
  if(unprotected.some(row=>tables.includes(row.relname)))throw new Error('Enable RLS on every imported app table before cutover.');
  console.log('All source table contents and private access verified.');
}finally{await source.end();await target.end();}
