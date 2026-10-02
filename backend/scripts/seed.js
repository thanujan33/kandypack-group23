import {admin} from './admin.js';
import bcrypt from 'bcryptjs';
if(process.env.SEED_DEMO!=='YES')throw new Error('Set SEED_DEMO=YES for a new local demonstration database');
if(!process.env.DEMO_PASSWORD||process.env.DEMO_PASSWORD.length<12)
  throw new Error('Set a demo password with at least 12 characters');
const c=await admin();
const insert=async(sql,args=[])=>{const [r]=await c.execute(sql,args);return r.insertId;};
const date=(base,offset)=>new Date(new Date(base+'T00:00:00Z').getTime()+offset*86400000).toISOString().slice(0,10);