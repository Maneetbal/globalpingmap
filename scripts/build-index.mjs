import fs from "node:fs";
import path from "node:path";

const root=path.resolve("data/countries");
const out=[];
function walk(dir){
  for(const name of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,name.name);
    if(name.isDirectory()) walk(p);
    else if(name.isFile()&&name.name==="ips.json"){
      try{
        const d=JSON.parse(fs.readFileSync(p,"utf8"));
        const entries=Array.isArray(d)?d:(d.entries||[]);
        for(const e of entries) out.push(e);
      }catch(e){console.error(`Skipping ${p}: ${e.message}`)}
    }
  }
}
if(fs.existsSync(root)) walk(root);
out.sort((a,b)=>String(b.submitted_at||"").localeCompare(String(a.submitted_at||"")));
fs.writeFileSync("data/index.json",JSON.stringify({generated_at:new Date().toISOString(),entries:out},null,2)+"\n");
console.log(`Indexed ${out.length} IPs`);