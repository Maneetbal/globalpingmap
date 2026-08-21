const CHECK_HOST_BASE="https://api.check-host.cc";
const PUBLISH_API="https://globalpingmap.balmaneet10.workers.dev/api";

function pmEscape(value){
  return String(value ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));
}

function pmMessage(html,error=false){
  const box=document.getElementById("form-message");
  if(!box)return;
  box.innerHTML=html;
  box.classList.remove("hidden");
  box.style.color=error?"#ff9e9e":"";
  box.style.background=error?"rgba(255,110,110,.08)":"";
}

function pmRows(report){
  const rows=[];
  const data=report?.data||{};
  Object.entries(data).forEach(([location,node])=>{
    const check=Array.isArray(node?.checks)?node.checks[0]:node?.checks;
    const online=Number(check?.status)===1;
    const latency=online && Number.isFinite(Number(check?.connectiontime)) ? `${check.connectiontime} ms` : "N/A";
    rows.push({
      location,
      country:node?.country||"Unknown",
      city:node?.city||"Unknown",
      online,
      latency
    });
  });
  return rows.sort((a,b)=>`${a.country} ${a.city}`.localeCompare(`${b.country} ${b.city}`));
}

function pmChart(rows){
  const onlineCount=rows.filter(r=>r.online).length;
  const total=rows.length;
  return `
    <div style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px">
        <strong style="font-size:14px">Check-Host ICMP verification</strong>
        <span style="font-size:11px;color:${onlineCount?"#39e6a2":"#ff9e9e"}">${onlineCount}/${total} nodes responded</span>
      </div>
      <div style="max-height:360px;overflow:auto;border:1px solid #20333e;border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="position:sticky;top:0;background:#0c181f">
            <th style="text-align:left;padding:9px;border-bottom:1px solid #20333e">Country</th>
            <th style="text-align:left;padding:9px;border-bottom:1px solid #20333e">City</th>
            <th style="text-align:left;padding:9px;border-bottom:1px solid #20333e">Online</th>
            <th style="text-align:right;padding:9px;border-bottom:1px solid #20333e">Latency</th>
          </tr></thead>
          <tbody>
            ${rows.map(r=>`<tr>
              <td style="padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.04)">${pmEscape(r.country)}</td>
              <td style="padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.04)">${pmEscape(r.city)}</td>
              <td style="padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.04);font-weight:700;color:${r.online?"#39e6a2":"#ff9e9e"}">${r.online?"True":"False"}</td>
              <td style="padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.04);text-align:right;color:#aab9bf">${pmEscape(r.latency)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function pmJson(url,options={}){
  const response=await fetch(url,options);
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body?.error||body?.message||`HTTP ${response.status}`);
  return body;
}

async function runCheckHost(ip){
  const dispatch=await pmJson(`${CHECK_HOST_BASE}/ping`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({target:ip})
  });
  if(!dispatch?.uuid)throw new Error("Check-Host did not return a verification UUID.");

  let report=null;
  for(let attempt=0;attempt<30;attempt++){
    report=await pmJson(`${CHECK_HOST_BASE}/report/${encodeURIComponent(dispatch.uuid)}`);
    const count=Object.keys(report?.data||{}).length;
    if(count>0){
      const rows=pmRows(report);
      if(rows.length>0){
        pmMessage(pmChart(rows)+`<div style="margin-top:10px;color:#8ca0aa;font-size:11px">${rows.filter(r=>r.online).length>0?"At least one node responded to ICMP, so this IP is considered responsive.":"No monitoring node has responded to ICMP yet."}</div>`);
      }
      if(rows.some(r=>r.online))return {responsive:true,uuid:dispatch.uuid,rows};
    }
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const rows=pmRows(report||{});
  if(rows.length)pmMessage(pmChart(rows)+"<div style=\"margin-top:10px;color:#ff9e9e;font-size:11px\">No node responded to ICMP.</div>",true);
  return {responsive:false,uuid:dispatch.uuid,rows};
}

async function publishVerified(ip){
  const g={
    country_name:document.getElementById("country-name-input")?.value||"",
    region_name:document.getElementById("region-input")?.value||"",
    city_name:document.getElementById("city-input")?.value||"",
    organization:document.getElementById("organization-input")?.value||"",
    usage_type:document.getElementById("proxy-input")?.value||""
  };
  const response=await fetch(`${PUBLISH_API}/submit`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ip,...g,verified_by:"check-host"})
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body?.error||body?.message||`Publishing gateway HTTP ${response.status}`);
  return body;
}

async function pollPublication(statusUrl){
  for(let i=0;i<50;i++){
    const status=await pmJson(statusUrl);
    if(status.status==="added")return status;
    if(status.status==="rejected"||status.status==="failed")throw new Error(status.message||"The submission was rejected.");
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw new Error("Publishing is still processing. The IP passed Check-Host, but the GitHub publishing step has not finished yet.");
}

const form=document.getElementById("submit-form");
form?.addEventListener("submit",async event=>{
  event.preventDefault();
  event.stopImmediatePropagation();
  const button=document.getElementById("submit-button");
  const ip=(document.getElementById("edited-ip-input")?.value||"").trim();
  if(!ip){pmMessage("Enter an IP address first.",true);return;}
  if(button){button.disabled=true;button.textContent="Checking globally…";}
  try{
    pmMessage("<strong>Checking the IP from global ICMP monitoring nodes…</strong>");
    const result=await runCheckHost(ip);
    if(!result.responsive){
      if(button){button.disabled=false;button.textContent="Verify & Add IP";}
      return;
    }
    if(button)button.textContent="Adding to PingMap…";
    try{
      const created=await publishVerified(ip);
      const statusUrl=created.status_url?.startsWith("http")?created.status_url:`${PUBLISH_API.replace(/\/$/,"")}${created.status_url||""}`;
      const final=await pollPublication(statusUrl);
      pmMessage(pmChart(result.rows)+`<div style="margin-top:12px;color:#39e6a2;font-weight:700">✓ Verified and added to PingMap.</div><div style="margin-top:4px;color:#8ca0aa;font-size:11px">${pmEscape(final.message||"The directory update was completed.")}</div>`);
      if(button){button.textContent="Added ✓";button.disabled=true;}
    }catch(error){
      pmMessage(pmChart(result.rows)+`<div style="margin-top:12px;color:#39e6a2;font-weight:700">✓ Check-Host verified this IP as responsive.</div><div style="margin-top:6px;color:#ff9e9e;font-size:11px">Publishing failed: ${pmEscape(error.message||"Unable to reach the publishing gateway.")}</div><div style="margin-top:6px;color:#8ca0aa;font-size:11px">The verification itself succeeded; no IP is added until the publishing step completes.</div>`,true);
      if(button){button.disabled=false;button.textContent="Verify & Add IP";}
    }
  }catch(error){
    pmMessage(`<strong>Verification failed:</strong> ${pmEscape(error.message||"Unable to contact Check-Host.")}`,true);
    if(button){button.disabled=false;button.textContent="Verify & Add IP";}
  }
},true);
