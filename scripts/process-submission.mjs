import fs from "node:fs";
import path from "node:path";
import {execSync} from "node:child_process";

const token=process.env.GITHUB_TOKEN;
const repo=process.env.GITHUB_REPOSITORY||"Maneetbal/globalpingmap";
const issue=process.env.ISSUE_NUMBER;
const api=`https://api.github.com/repos/${repo}`;
const headers={Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"PingMap-GitHub-Action"};
const gh=async(p,o={})=>{const r=await fetch(api+p,{...o,headers:{...headers,...(o.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`GitHub API ${r.status}: ${JSON.stringify(d).slice(0,400)}`);return d};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const isIPv4=ip=>/^(25[0-5]|2[0-4]\\d|1?\\d?\\d)(\\.(25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}$/.test(ip);
const isIPv6=ip=>ip.includes(":")&&/^[0-9a-f:]+$/i.test(ip)&&ip.length<=45;
const publicIp=ip=>{if(isIPv4(ip)){const p=ip.split(".").map(Number),n=(((p[0]*256+p[1])*256+p[2])*256+p[3])>>>0;return![[0,0xffffff],[0x0a000000,0x0affffff],[0x64400000,0x647fffff],[0x7f000000,0x7fffffff],[0xa9fe0000,0xa9feffff],[0xac100000,0xac1fffff],[0xc0000000,0xc00000ff],[0xc0000200,0xc00002ff],[0xc0a80000,0xc0a8ffff],[0xe0000000,0xffffffff]].some(([a,b])=>n>=a&&n<=b)}if(!isIPv6(ip))return false;const x=ip.toLowerCase();return x!=="::"&&x!=="::1"&&!/^f[cd]|^fe[89ab]|^ff/i.test(x)};
const clean=v=>String(v??"").trim().slice(0,300);
const part=(v,f="Unknown")=>String(v||f).trim().replace(/[\\\\/:*?"<>|#%]/g,"-").replace(/\\s+/g," ").replace(/^\\.+|\\.+$/g,"").slice(0,120)||f;
async function geolocate(ip){const r=await fetch(`https://api.ip2location.io/?ip=${encodeURIComponent(ip)}&format=json`);if(!r.ok)throw new Error(`IP2Location HTTP ${r.status}`);const d=await r.json();if(!d?.country_code||!d?.city_name)throw new Error("IP2Location could not determine a city");return d}
async function checkHost(ip){
  const r=await fetch("https://api.check-host.cc/ping",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({target:ip})});
  if(!r.ok)throw new Error(`Check-Host HTTP ${r.status}`);
  const created=await r.json();
  if(!created?.uuid)throw new Error("Check-Host did not return a verification UUID.");
  let last=[];
  for(let i=0;i<30;i++){
    const q=await fetch(`https://api.check-host.cc/report/${encodeURIComponent(created.uuid)}`);
    if(q.ok){
      const report=await q.json();
      last=Object.entries(report?.data||{}).map(([location,node])=>{
        const check=Array.isArray(node?.checks)?node.checks[0]:node?.checks;
        const online=Number(check?.status)===1;
        return{location,country:node?.country||"Unknown",city:node?.city||"Unknown",online,latency:online&&Number.isFinite(Number(check?.connectiontime))?Number(check.connectiontime):null};
      });
      if(last.length && last.some(x=>x.online))return{responsive:true,uuid:created.uuid,rows:last};
      if(last.length && i>=8)return{responsive:false,uuid:created.uuid,rows:last};
    }
    await sleep(1000);
  }
  return{responsive:last.some(x=>x.online),uuid:created.uuid,rows:last};
}
async function allIps(){const out=[];function walk(dir){if(!fs.existsSync(dir))return;for(const n of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,n.name);if(n.isDirectory())walk(p);else if(n.isFile()&&n.name==="ips.json"){try{const d=JSON.parse(fs.readFileSync(p,"utf8"));for(const e of(Array.isArray(d)?d:d.entries||[]))out.push({...e,_path:p})}catch{}}}}walk("data/countries");return out}
async function comment(body){await gh(`/issues/${issue}/comments`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({body})})}
async function closeIssue(){await gh(`/issues/${issue}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({state:"closed"})})}
function resultTable(rows){
  const online=rows.filter(r=>r.online).length;
  const lines=rows.sort((a,b)=>`${a.country} ${a.city}`.localeCompare(`${b.country} ${b.city}`)).map(r=>`| ${(r.country||"").replace(/\\|/g," ")} | ${(r.city||"").replace(/\\|/g," ")} | ${r.online?"True":"False"} | ${r.latency===null?"N/A":`${r.latency} ms`} |`);
  return `| Country | City | Online | Latency |\\n| --- | --- | --- | --- |\\n${lines.join("\\n")}\\n\\n**Responsive nodes:** ${online}/${rows.length}`;
}
const data=await gh(`/issues/${issue}`);
const text=`${data.title||""}\n${data.body||""}`;
const m=text.match(/(?:^|\\n)IP:\s*([0-9a-f:.]+)/i)||String(data.title||"").match(/IP submission:\s*([0-9a-f:.]+)/i);
if(!m){console.log("Not an IP submission issue; ignoring.");process.exit(0)}
const ip=m[1].trim().toLowerCase();
try{
  if(!publicIp(ip))throw new Error("Only public IPv4/IPv6 addresses are accepted.");
  const geo=await geolocate(ip);
  const existing=await allIps();
  if(existing.some(e=>String(e.ip).toLowerCase()===ip))throw new Error("That IP is already in PingMap.");
  const result=await checkHost(ip);
  await comment(`### Check-Host ICMP verification\\n\\n${resultTable(result.rows||[])}\\n\\n**Decision:** ${result.responsive?"✅ Responsive — at least one node returned ICMP status 1.":"❌ Not responsive — no node returned ICMP status 1."}\\n\\nCheck-Host UUID: \`${result.uuid}\``);
  if(!result.responsive)throw new Error("The IP did not respond to the Check-Host ICMP check.");
  const onlineLatencies=(result.rows||[]).filter(r=>r.online&&Number.isFinite(r.latency)).map(r=>r.latency).sort((a,b)=>a-b);
  const medianLatency=onlineLatencies.length?onlineLatencies[Math.floor(onlineLatencies.length/2)]:null;
  const e={ip,ip_version:isIPv6(ip)?6:4,country_code:clean(geo.country_code).toUpperCase().slice(0,2),country_name:clean(geo.country_name),region_name:clean(geo.region_name),city_name:clean(geo.city_name),organization:clean(geo.isp||geo.as),isp:clean(geo.isp||geo.as),usage_type:clean(geo.usage_type)||"Not detected",is_proxy:Boolean(geo.is_proxy===true||geo.is_proxy===1||String(geo.is_proxy).toLowerCase()==="true"),is_reachable:true,check_host_uuid:result.uuid,check_host_online_nodes:onlineLatencies.length,check_host_nodes:(result.rows||[]).length,ping_avg_ms:medianLatency,ping_checked_at:new Date().toISOString(),submitted_at:new Date().toISOString(),source:"community"};
  if(!e.country_code||!e.country_name||!e.city_name)throw new Error("Geolocation did not return a usable country/city.");
  const file=`data/countries/${part(e.country_code,"XX")}/regions/${part(e.region_name)}/cities/${part(e.city_name)}/ips.json`;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  let d={country_code:e.country_code,country_name:e.country_name,region:e.region_name,city:e.city_name,entries:[]};
  if(fs.existsSync(file)){try{d=JSON.parse(fs.readFileSync(file,"utf8"));}catch{}}
  if(!Array.isArray(d.entries))d.entries=[];
  d.entries.push(e);d.updated_at=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(d,null,2)+"\\n");
  execSync("node scripts/build-index.mjs");
  execSync("git config user.name PingMap-Bot && git config user.email 41898282+github-actions[bot]@users.noreply.github.com && git add data && git commit -m \"Add IP ${ip}\" && git push",{stdio:"inherit"});
  await comment(`✅ **IP added to PingMap.**\\n\\n- IP: \`${ip}\`\\n- Location: ${e.city_name}, ${e.region_name}, ${e.country_name}\\n- Organization: ${e.organization||"Not detected"}\\n- Check-Host: responsive from ${e.check_host_online_nodes}/${e.check_host_nodes} nodes\\n- Check-Host UUID: \`${e.check_host_uuid}\``);
}catch(err){console.error(err);await comment(`❌ **Submission rejected:** ${err.message}`)}
await closeIssue();
