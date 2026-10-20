import pg from 'pg';
import {createFamilyService} from '../family.mjs';
import {createBankIdAuth} from '../bankid-auth.mjs';
import {createPublicZoneService} from '../public-zones.mjs';
import {createAdminMapItemsService} from '../admin-map-items.mjs';
import {migrate} from '../migrations.mjs';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required; migrations never use an in-memory fallback.');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:10_000});
try{const family=createFamilyService({pool});await family.init();await createBankIdAuth({familyService:family,query:family.query}).init();await migrate(pool);await createPublicZoneService({pool}).init();await createAdminMapItemsService({pool}).init();console.log('Database migrations completed.');}finally{await pool.end();}
