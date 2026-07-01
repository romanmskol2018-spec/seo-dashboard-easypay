// Безопасный дедуп: метим «Повтор» (UC_6HZFO0) ТОЛЬКО где совпадают И мобильный
// клиента (9xx), И имя (один человек написал несколько раз). По 1 «главному» оставляем.
// Городские/офисные линии, разные люди на одном номере, CONVERTED/закрытые — не трогаем.
//   npx tsx scripts/bitrix-dedup-repeat.ts            # сухой прогон
//   npx tsx scripts/bitrix-dedup-repeat.ts --write
const BASE=(process.env.BITRIX_WEBHOOK_URL||"").trim().replace(/\/+$/,"");
const WRITE=process.argv.includes("--write");
const REPEAT="UC_6HZFO0";
const KEEP=new Set(["CONVERTED","1","2","3","4","5","6","11","JUNK","UC_SBSH6Z","UC_6HZFO0","UC_CARDSALE"]);
async function api(m:string,p:any={}){const r=await fetch(`${BASE}/${m}.json`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)});return (await r.json());}
async function batch(c:Record<string,string>){const r=await fetch(`${BASE}/batch.json`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({halt:0,cmd:c})});return (await r.json()).result?.result||{};}
function mob(arr:any){for(const p of arr||[]){let d=String(p.VALUE||"").replace(/\D/g,"");if(d.length===11&&(d[0]==="7"||d[0]==="8"))d=d.slice(1);if(d.length===10&&d[0]==="9")return d;}return null;}
function nm(l:any){const base=l.LAST_NAME?`${l.LAST_NAME} ${l.NAME||""}`:String(l.TITLE||"").replace(/ - Открытая линия.*/i,"");return base.replace(/[^a-zа-яё ]/gi,"").trim().toLowerCase().split(/\s+/).filter(Boolean).sort().join(" ");}
function rank(s:string){if(s==="CONVERTED")return 3;if(s==="JUNK")return 0;if(s==="NEW")return 1;return 2;}
async function pull(){const all:any[]=[];let s=0;for(let r=0;r<400;r++){const c:Record<string,string>={};for(let i=0;i<50;i++)c["c"+i]=`crm.lead.list?order[ID]=ASC&start=${s+i*50}&select[0]=ID&select[1]=PHONE&select[2]=STATUS_ID&select[3]=TITLE&select[4]=NAME&select[5]=LAST_NAME`;const res:any=await batch(c);let g=0;for(let i=0;i<50;i++){const rows=res["c"+i]||[];if(Array.isArray(rows)){all.push(...rows);g+=rows.length;}}process.stdout.write(`\r  ${all.length}…`);s+=2500;if(g<2500)break;}console.log("");return all;}
(async()=>{
  const leads=await pull();
  // группировка по мобильный+имя
  const key=(l:any)=>{const m=mob(l.PHONE);const n=nm(l);return m&&n?m+"|"+n:null;};
  const byKey=new Map<string,any[]>();
  for(const l of leads){const k=key(l);if(k)(byKey.get(k)||byKey.set(k,[]).get(k)!).push(l);}
  const toMove:string[]=[];let groups=0,skip=0;
  for(const [,g] of byKey){
    if(g.length<2)continue; groups++;
    const keeper=[...g].sort((a,b)=>rank(b.STATUS_ID)-rank(a.STATUS_ID)||Number(a.ID)-Number(b.ID))[0];
    for(const l of g){ if(l.ID===keeper.ID)continue; if(KEEP.has(l.STATUS_ID)){skip++;continue;} toMove.push(l.ID); }
  }
  console.log(`\nГрупп «один человек, повтор» (mobile+name, ≥2): ${groups}`);
  console.log(`Лидов → «Повтор»: ${toMove.length} · защищено (CONVERTED/закрытые): ${skip}`);
  if(!WRITE){console.log("\n💡 Сухой прогон — без записи. Запись: --write");return;}
  // запись ОДИНОЧНЫМИ вызовами с проверкой result===true
  let ok=0,fail=0;
  for(const id of toMove){const u:any=await api("crm.lead.update",{id,fields:{STATUS_ID:REPEAT}});if(u.result===true)ok++;else fail++;process.stdout.write(`\r  ok:${ok} fail:${fail}`);}
  console.log(`\nГотово: в «Повтор» ${ok}, ошибок ${fail}`);
})().catch(e=>{console.error("ERR",(e as Error).message);process.exit(1)});
