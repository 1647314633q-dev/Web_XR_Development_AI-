import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
export function openLocalDatabase(filename=':memory:'){
 if(filename!==':memory:')mkdirSync('.local-data',{recursive:true});
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
 for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())if(!sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(name)){sqlite.exec(readFileSync(`drizzle/${name}`,'utf8'));sqlite.prepare('INSERT INTO local_migrations VALUES (?)').run(name);}
 return {sqlite,prepare(sql){return {bind(...args){const stmt=sqlite.prepare(sql);return {async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){const result=stmt.run(...args);return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}};}};}};
}
