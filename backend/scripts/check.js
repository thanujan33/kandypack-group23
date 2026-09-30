import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function walk(dir) {
  for (const e of await readdir(dir,{withFileTypes:true})) {
    const p=`${dir}/${e.name}`;
    if(e.isDirectory()) await walk(p);
    else if(p.endsWith('.js')) {
      const result=spawnSync(process.execPath,['--check',p],{stdio:'inherit'});
      if(result.status) process.exit(result.status);
    }
  }
}
await walk('src'); await walk('scripts'); await walk('test');
console.log('JavaScript syntax checked');
