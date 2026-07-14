"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import * as THREE from "three";

type CellType = "floor" | "rack" | "wall" | "start" | "packing";
type Cell = { type: CellType; location?: string };
type OrderLine = { orderId: string; sku: string; quantity: number; location: string };
type Result = { batch: number; orderIds: string; units: number; picks: number; distance: number; seconds: number; resource: string };

const ROWS = 12, COLS = 18;
const key = (r:number,c:number) => `${r},${c}`;
const makeLayout = () => Array.from({length:ROWS},(_,r)=>Array.from({length:COLS},(_,c):Cell=> {
  if(r===10&&c===1) return {type:"start"};
  if(r===10&&c===16) return {type:"packing"};
  const rack = r>=2&&r<=8&&[3,4,7,8,11,12,15].includes(c);
  return rack ? {type:"rack", location:`R-${String(r*20+c).padStart(3,"0")}`} : {type:"floor"};
}));

function bfs(layout:Cell[][], from:[number,number], target:[number,number]) {
  const targets = layout[target[0]][target[1]].type === "rack"
    ? [[target[0]-1,target[1]],[target[0]+1,target[1]],[target[0],target[1]-1],[target[0],target[1]+1]].filter(([r,c])=>r>=0&&c>=0&&r<ROWS&&c<COLS&&layout[r][c].type!=="rack"&&layout[r][c].type!=="wall") as [number,number][]
    : [target];
  const q:[number,number][]=[from], prev=new Map<string,string|null>([[key(...from),null]]); let end:string|undefined;
  while(q.length){ const p=q.shift()!; if(targets.some(t=>t[0]===p[0]&&t[1]===p[1])){end=key(...p);break}
    for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const n:[number,number]=[p[0]+dr,p[1]+dc]; if(n[0]<0||n[1]<0||n[0]>=ROWS||n[1]>=COLS)continue; const cell=layout[n[0]][n[1]]; const k=key(...n); if(!prev.has(k)&&cell.type!=="rack"&&cell.type!=="wall"){prev.set(k,key(...p));q.push(n)}}}
  if(!end)return [from]; const out:[number,number][]=[]; for(let cur:string|null=end;cur;cur=prev.get(cur)??null){const [r,c]=cur.split(",").map(Number);out.push([r,c])} return out.reverse();
}

function Scene({layout, paths, mode}:{layout:Cell[][];paths:[number,number][][];mode:"cart"|"amr"}){
  const mount=useRef<HTMLDivElement>(null);
  useEffect(()=>{ if(!mount.current)return; const host=mount.current, scene=new THREE.Scene(); scene.background=new THREE.Color(0x07111f);
    const camera=new THREE.PerspectiveCamera(48,host.clientWidth/host.clientHeight,.1,1000); camera.position.set(16,19,23);camera.lookAt(COLS/2,0,ROWS/2);
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(host.clientWidth,host.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.replaceChildren(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xb9e6ff,0x142030,2.2)); const dl=new THREE.DirectionalLight(0xffffff,2);dl.position.set(5,14,8);scene.add(dl);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(COLS,.12,ROWS),new THREE.MeshStandardMaterial({color:0x172638,roughness:.85}));floor.position.set(COLS/2-.5,-.1,ROWS/2-.5);scene.add(floor);
    layout.forEach((row,r)=>row.forEach((cell,c)=>{if(cell.type==="floor")return; const colors:any={rack:0xf4b860,wall:0x526279,start:0x38d996,packing:0x9b87f5};const h=cell.type==="rack"?1.6:.35;const mesh=new THREE.Mesh(new THREE.BoxGeometry(.82,h,.82),new THREE.MeshStandardMaterial({color:colors[cell.type],roughness:.55}));mesh.position.set(c,h/2,r);scene.add(mesh)}));
    const agents=paths.map((_,i)=>{const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.22,.5,4,8),new THREE.MeshStandardMaterial({color:mode==="cart"?0x46c7ff:0xff6b75}));body.position.y=.48;g.add(body);if(mode==="amr"){const amr=new THREE.Mesh(new THREE.BoxGeometry(.62,.22,.75),new THREE.MeshStandardMaterial({color:0x4cd6a8}));amr.position.set(.5,.16,0);g.add(amr)}scene.add(g);return g});
    let raf=0,start=performance.now(); const animate=(now:number)=>{paths.forEach((path,i)=>{if(!path.length)return;const t=((now-start)/650+i*.35);const idx=Math.floor(t)%path.length,nxt=(idx+1)%path.length,f=t-Math.floor(t);agents[i].position.set(THREE.MathUtils.lerp(path[idx][1],path[nxt][1],f),0,THREE.MathUtils.lerp(path[idx][0],path[nxt][0],f))});renderer.render(scene,camera);raf=requestAnimationFrame(animate)};raf=requestAnimationFrame(animate);
    const resize=()=>{camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight)};addEventListener("resize",resize);return()=>{cancelAnimationFrame(raf);removeEventListener("resize",resize);renderer.dispose()}
  },[layout,paths,mode]); return <div className="scene" ref={mount}/>;
}

export default function Home(){
  const [layout,setLayout]=useState<Cell[][]>(makeLayout); const [tool,setTool]=useState<CellType>("rack"); const [orders,setOrders]=useState<OrderLine[]>([]); const [mode,setMode]=useState<"cart"|"amr">("cart");
  const [workers,setWorkers]=useState(3),[resources,setResources]=useState(3),[capacity,setCapacity]=useState(24); const [running,setRunning]=useState(false),[paths,setPaths]=useState<[number,number][][]>([]),[results,setResults]=useState<Result[]>([]); const [speed,setSpeed]=useState(1);
  const locations=useMemo(()=>new Map(layout.flatMap((row,r)=>row.map((c,col)=>c.type==="rack"&&c.location?[c.location,[r,col] as [number,number]]:null).filter(Boolean) as [string,[number,number]][])),[layout]);
  const invalid=orders.filter(o=>!locations.has(o.location)); const totalUnits=orders.reduce((a,o)=>a+o.quantity,0);
  const paint=(r:number,c:number)=>setLayout(old=>old.map((row,rr)=>row.map((cell,cc)=>rr===r&&cc===c?{type:tool,...(tool==="rack"?{location:cell.location||`R-${String(r*20+c).padStart(3,"0")}`}:{})}:cell)));
  const loadExcel=async(file:File)=>{const wb=XLSX.read(await file.arrayBuffer());const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]]);setOrders(rows.map(x=>({orderId:String(x.Order_ID??""),sku:String(x.SKU??""),quantity:Number(x.Quantity??0),location:String(x.Location??"")})).filter(x=>x.orderId&&x.sku&&x.quantity>0&&x.location));};
  const run=()=>{if(!orders.length||invalid.length)return; setRunning(true); const start=layout.flatMap((row,r)=>row.map((c,col)=>c.type==="start"?[r,col] as [number,number]:null)).find(Boolean) || [0,0] as [number,number];const pack=layout.flatMap((row,r)=>row.map((c,col)=>c.type==="packing"?[r,col] as [number,number]:null)).find(Boolean)||start;
    const byOrder=new Map<string,OrderLine[]>();orders.forEach(o=>byOrder.set(o.orderId,[...(byOrder.get(o.orderId)||[]),o]));const batches:OrderLine[][]=[];let cur:OrderLine[]=[];let load=0;for(const lines of byOrder.values()){const units=lines.reduce((a,b)=>a+b.quantity,0);if(cur.length&&load+units>capacity){batches.push(cur);cur=[];load=0}cur.push(...lines);load+=units}if(cur.length)batches.push(cur);
    const agentPaths:Array<[number,number][]> = Array.from({length:Math.min(resources,batches.length)},()=>[]);const out:Result[]=[];batches.forEach((batch,i)=>{let pos=start as [number,number], full:[number,number][]= [pos];const unique=[...new Set(batch.map(x=>x.location))];for(const loc of unique){const p=bfs(layout,pos,locations.get(loc)!);full.push(...p.slice(1));pos=p[p.length-1]}const back=bfs(layout,pos,pack as [number,number]);full.push(...back.slice(1));agentPaths[i%agentPaths.length].push(...full);const distance=Math.max(0,full.length-1);const pickSeconds=batch.reduce((a,b)=>a+b.quantity*6,0);const travel=distance/(mode==="cart"?1.15:1.65);const coordination=mode==="amr"?unique.length*4:0;out.push({batch:i+1,orderIds:[...new Set(batch.map(x=>x.orderId))].join(", "),units:batch.reduce((a,b)=>a+b.quantity,0),picks:unique.length,distance,seconds:Math.round((travel+pickSeconds+coordination)/speed),resource:`${mode==="cart"?"CART":"AMR"}-${(i%resources)+1}`})});setPaths(agentPaths);setResults(out);setTimeout(()=>setRunning(false),700);};
  const save=(kind:"json"|"xlsx")=>{const summary={mode,workers,resources,capacity,totalOrders:new Set(orders.map(o=>o.orderId)).size,totalUnits,totalSeconds:Math.max(0,...results.map(r=>r.seconds)),results};let blob:Blob,name:string;if(kind==="json"){blob=new Blob([JSON.stringify({generatedAt:new Date().toISOString(),layout,orders,summary},null,2)],{type:"application/json"});name="picking_simulation_result.json"}else{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(results),"Batch Results");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([summary]),"Summary");XLSX.writeFile(wb,"picking_simulation_result.xlsx");return}const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)};
  const saveLayout=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(layout,null,2)],{type:"application/json"}));a.download="warehouse_layout.json";a.click()};
  const makesample=()=>{const loc=[...locations.keys()].slice(0,8);const rows=Array.from({length:16},(_,i)=>({Order_ID:`ORD-${String(Math.floor(i/2)+1).padStart(4,"0")}`,SKU:`SKU-${String(i+1).padStart(4,"0")}`,Quantity:(i%3)+1,Location:loc[i%Math.max(1,loc.length)]||"R-043"}));const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet(rows);ws["!cols"]=[{wch:16},{wch:16},{wch:12},{wch:14}];XLSX.utils.book_append_sheet(wb,ws,"Orders");XLSX.writeFile(wb,"picking_order_template.xlsx")};
  const kpi={orders:new Set(orders.map(o=>o.orderId)).size,batches:results.length,distance:results.reduce((a,b)=>a+b.distance,0),seconds:results.length?Math.max(...results.map(r=>r.seconds)):0};
  return <main><header><div><span className="eyebrow">FULFILLMENT LAB / SIMULATOR</span><h1>FlowPick <b>3D</b></h1></div><div className="status"><i className={orders.length&&!invalid.length?"ok":""}/>{orders.length?`${orders.length}개 피킹 라인 · 오류 ${invalid.length}건`:"오더 파일 대기 중"}</div></header>
    <div className="workspace"><aside className="panel left"><section><h2>01 운영 모드</h2><div className="seg"><button className={mode==="cart"?"active":""} onClick={()=>setMode("cart")}>카트 수작업</button><button className={mode==="amr"?"active":""} onClick={()=>setMode("amr")}>AMR 협업</button></div></section>
      <section><h2>02 운영 변수</h2><label>작업자 수 <strong>{workers}</strong><input type="range" min="1" max="20" value={workers} onChange={e=>setWorkers(+e.target.value)}/></label><label>{mode==="cart"?"카트":"AMR"} 수 <strong>{resources}</strong><input type="range" min="1" max="20" value={resources} onChange={e=>setResources(+e.target.value)}/></label><label>대당 적재량 <strong>{capacity}개</strong><input type="range" min="1" max="100" value={capacity} onChange={e=>setCapacity(+e.target.value)}/></label><label>시뮬레이션 속도 <strong>{speed}×</strong><input type="range" min="1" max="8" value={speed} onChange={e=>setSpeed(+e.target.value)}/></label></section>
      <section><h2>03 레이아웃 도구</h2><div className="tools">{(["floor","rack","wall","start","packing"] as CellType[]).map(t=><button key={t} className={tool===t?"active":""} onClick={()=>setTool(t)}><i className={t}/>{{floor:"통로",rack:"랙",wall:"벽",start:"출발",packing:"완료"}[t]}</button>)}</div><button className="ghost" onClick={saveLayout}>레이아웃 JSON 저장</button></section></aside>
      <section className="stage panel"><div className="stagehead"><div><span>{results.length?"LIVE DIGITAL TWIN":"LAYOUT EDITOR"}</span><h2>{results.length ? `${mode==="cart"?"카트":"AMR"} 배치 피킹 시뮬레이션` : "센터 레이아웃을 설계하세요"}</h2></div><div className="legend"><i className="rack"/>랙 <i className="start"/>출발 <i className="packing"/>완료</div></div>
        {results.length?<Scene layout={layout} paths={paths} mode={mode}/>:<div className="grid" style={{gridTemplateColumns:`repeat(${COLS},1fr)`}}>{layout.map((row,r)=>row.map((cell,c)=><button key={key(r,c)} className={`cell ${cell.type}`} title={cell.location||cell.type} onClick={()=>paint(r,c)}><span>{cell.type==="rack"?cell.location?.replace("R-",""):cell.type==="start"?"S":cell.type==="packing"?"P":""}</span></button>))}</div>}
        <div className="stagebar"><span>{results.length?"3D 이동 경로 재생 중":"셀을 클릭해 선택한 요소를 배치합니다"}</span><button className="run" disabled={running||!orders.length||!!invalid.length} onClick={run}>{running?"계산 중…":"▶ 시뮬레이션 시작"}</button></div></section>
      <aside className="panel right"><section><h2>04 오더 데이터</h2><button className="template" onClick={makesample}>↓ 엑셀 템플릿 받기</button><label className="upload"><input type="file" accept=".xlsx,.xls" onChange={e=>e.target.files?.[0]&&loadExcel(e.target.files[0])}/><b>엑셀 오더파일 업로드</b><span>Order_ID · SKU · Quantity · Location</span></label>{invalid.length>0&&<p className="error">레이아웃에 없는 로케이션 {invalid.length}건</p>}</section>
        <section><h2>SIMULATION KPI</h2><div className="kpis"><div><span>주문</span><b>{kpi.orders}</b><small>orders</small></div><div><span>배치</span><b>{kpi.batches}</b><small>batches</small></div><div><span>이동거리</span><b>{kpi.distance}</b><small>cells</small></div><div><span>완료시간</span><b>{kpi.seconds}</b><small>sec</small></div></div></section>
        <section><h2>결과 저장</h2><div className="save"><button disabled={!results.length} onClick={()=>save("json")}>JSON</button><button disabled={!results.length} onClick={()=>save("xlsx")}>EXCEL</button></div><p className="note">결과에는 운영 변수, 배치별 주문·수량·이동거리·완료시간이 포함됩니다.</p></section></aside></div>
    <footer><span>FLOWPICK ENGINE 1.0</span><span>격자 1칸 = 1 m · 피킹 1개 = 6 sec</span><span>{mode==="amr"?"AMR은 이동만 수행 · 작업자 도착 후 피킹":"작업자가 카트와 함께 이동"}</span></footer></main>
}
