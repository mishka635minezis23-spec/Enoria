export interface LivretData {
  faithfulName: string;
  birthText: string;
  parentsText: string;
  communityText: string;
  sacraments: { label: string; date: string; reference: string }[];
  marriages: { label: string; date: string; spouse: string }[];
}

function wrapCanvasText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,lineHeight:number):number{
  const words=text.split(/\s+/);
  let line="";
  for(const word of words){
    const candidate=line?line+" "+word:word;
    if(ctx.measureText(candidate).width>maxWidth&&line){
      ctx.fillText(line,x,y);
      y+=lineHeight;
      line=word;
    }else line=candidate;
  }
  if(line)ctx.fillText(line,x,y);
  return y+lineHeight;
}

function makePageCanvas(heading:string,lines:string[]):HTMLCanvasElement{
  const canvas=document.createElement("canvas");
  canvas.width=640;
  canvas.height=820;
  const ctx=canvas.getContext("2d");
  if(!ctx)return canvas;
  ctx.fillStyle="#fbf8ef";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle="#d9d0bd";
  ctx.lineWidth=3;
  ctx.strokeRect(18,18,canvas.width-36,canvas.height-36);
  ctx.fillStyle="#174c3d";
  ctx.font="bold 34px Georgia, serif";
  ctx.fillText(heading,48,76);
  ctx.strokeStyle="#c7b995";
  ctx.beginPath();
  ctx.moveTo(48,100);
  ctx.lineTo(canvas.width-48,100);
  ctx.stroke();
  ctx.fillStyle="#303833";
  ctx.font="24px Georgia, serif";
  let y=150;
  for(const line of lines){
    y=wrapCanvasText(ctx,line,48,y,canvas.width-96,38)+12;
    if(y>canvas.height-80)break;
  }
  return canvas;
}

function escapeHtml(value:string):string{
  const map:Record<string,string>={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
  return value.replace(/[&<>"']/g,(c)=>map[c]??c);
}

function renderFallback(container:HTMLElement,data:LivretData):void{
  container.innerHTML=`
    <div class="grid gap-4 md:grid-cols-2">
      <article class="rounded-xl border border-amber-200 bg-[#fbf8ef] p-6 shadow-sm"><p class="text-xs uppercase tracking-widest text-emerald-800">Livret paroissial · 2D</p><h2 class="mt-3 font-serif text-xl font-semibold text-slate-900">${escapeHtml(data.faithfulName)}</h2><div class="mt-5 space-y-3 text-sm text-slate-700"><p><strong>Naissance :</strong> ${escapeHtml(data.birthText)}</p><p><strong>Parents :</strong> ${escapeHtml(data.parentsText)}</p><p><strong>Communauté :</strong> ${escapeHtml(data.communityText)}</p></div></article>
      <article class="rounded-xl border border-amber-200 bg-[#fbf8ef] p-6 shadow-sm"><p class="text-xs uppercase tracking-widest text-emerald-800">Parcours sacramentel</p><div class="mt-4 space-y-3">${data.sacraments.map((item)=>`<div class="border-b border-amber-200 pb-3"><p class="font-serif font-semibold text-slate-900">${escapeHtml(item.label)}</p><p class="mt-1 text-xs text-slate-600">${escapeHtml(item.date)} · ${escapeHtml(item.reference)}</p></div>`).join("")||'<p class="text-sm text-slate-500">Aucun sacrement accessible.</p>'}${data.marriages.map((item)=>`<div class="border-b border-amber-200 pb-3"><p class="font-serif font-semibold text-slate-900">${escapeHtml(item.label)}</p><p class="mt-1 text-xs text-slate-600">${escapeHtml(item.date)} · Conjoint : ${escapeHtml(item.spouse)}</p></div>`).join("")}</div></article>
    </div>`;
}

export async function mountLivret3D(container:HTMLElement,data:LivretData):Promise<()=>void>{
  let renderer:import("three").WebGLRenderer|null=null;
  let resizeObserver:ResizeObserver|null=null;
  let onResize:(()=>void)|null=null;
  let onPointerDown:((event:PointerEvent)=>void)|null=null;
  let onPointerMove:((event:PointerEvent)=>void)|null=null;
  let onPointerUp:(()=>void)|null=null;
  let canvasElement:HTMLCanvasElement|null=null;
  let bookGroup:import("three").Group|null=null;
  let scene:import("three").Scene|null=null;

  try{
    const THREE=await import("three");
    container.innerHTML='<div class="overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><div id="livret-3d-stage" class="h-[360px] w-full touch-none sm:h-[460px]"></div><p class="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">Fais glisser le livre pour le tourner. Le contenu est généré depuis les données du registre, sans scan.</p></div>';
    const stage=container.querySelector<HTMLElement>("#livret-3d-stage")!;
    scene=new THREE.Scene();
    scene.background=new THREE.Color("#edf2ef");
    const camera=new THREE.PerspectiveCamera(36,1,0.1,100);
    camera.position.set(0,4.7,6.4);
    camera.lookAt(0,0,0);
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.setClearColor("#edf2ef");
    renderer.domElement.style.width="100%";
    renderer.domElement.style.height="100%";
    renderer.domElement.style.display="block";
    renderer.domElement.style.touchAction="none";
    stage.append(renderer.domElement);
    canvasElement=renderer.domElement;

    scene.add(new THREE.HemisphereLight("#ffffff","#9aa69c",2.1));
    const keyLight=new THREE.DirectionalLight("#ffffff",2.2);
    keyLight.position.set(-3,6,4);
    scene.add(keyLight);
    const fillLight=new THREE.DirectionalLight("#d6e3dc",0.8);
    fillLight.position.set(4,3,-2);
    scene.add(fillLight);

    const book=new THREE.Group();
    bookGroup=book;
    scene.add(book);
    const coverMaterial=new THREE.MeshStandardMaterial({color:"#174c3d",roughness:0.78,metalness:0.05});
    const pageMaterial=new THREE.MeshStandardMaterial({color:"#f5efdf",roughness:1});
    const pageBlock=new THREE.Mesh(new THREE.BoxGeometry(3.9,0.13,2.75),pageMaterial);
    pageBlock.position.y=-0.01;
    book.add(pageBlock);
    const leftCover=new THREE.Mesh(new THREE.BoxGeometry(1.98,0.08,2.85),coverMaterial);
    leftCover.position.set(-0.99,-0.13,0);
    book.add(leftCover);
    const rightCover=new THREE.Mesh(new THREE.BoxGeometry(1.98,0.08,2.85),coverMaterial);
    rightCover.position.set(0.99,-0.13,0);
    book.add(rightCover);
    const spine=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.24,2.86),coverMaterial);
    spine.position.set(0,-0.07,0);
    book.add(spine);

    const leftLines=[
      `Naissance : ${escapeHtml(data.birthText)}`,
      `Parents : ${escapeHtml(data.parentsText)}`,
      `Communauté : ${escapeHtml(data.communityText)}`,
      "Ce livret est une représentation numérique du registre paroissial.",
      "Les références du registre papier demeurent la source officielle."
    ];
    const rightLines=[
      ...data.sacraments.map((item)=>`${escapeHtml(item.label)} — ${escapeHtml(item.date)} — ${escapeHtml(item.reference)}`),
      ...data.marriages.map((item)=>`${escapeHtml(item.label)} — ${escapeHtml(item.date)} — ${escapeHtml(item.spouse)}`)
    ];
    const leftTexture=new THREE.CanvasTexture(makePageCanvas(data.faithfulName,leftLines));
    leftTexture.colorSpace=THREE.SRGBColorSpace;
    const rightTexture=new THREE.CanvasTexture(makePageCanvas("Parcours sacramentel",rightLines.length?rightLines:["Aucun sacrement accessible."]));
    rightTexture.colorSpace=THREE.SRGBColorSpace;
    const leftPage=new THREE.Mesh(new THREE.PlaneGeometry(1.88,2.65),new THREE.MeshStandardMaterial({map:leftTexture,side:THREE.DoubleSide,roughness:1}));
    leftPage.rotation.x=-Math.PI/2;
    leftPage.position.set(-0.98,0.065,0);
    book.add(leftPage);
    const rightPage=new THREE.Mesh(new THREE.PlaneGeometry(1.88,2.65),new THREE.MeshStandardMaterial({map:rightTexture,side:THREE.DoubleSide,roughness:1}));
    rightPage.rotation.x=-Math.PI/2;
    rightPage.position.set(0.98,0.065,0);
    book.add(rightPage);
    book.rotation.x=-0.12;
    book.rotation.y=0.12;

    const render=()=>{
      const width=Math.max(1,stage.clientWidth);
      const height=Math.max(1,stage.clientHeight);
      camera.aspect=width/height;
      camera.updateProjectionMatrix();
      renderer!.setSize(width,height,false);
      renderer!.render(scene!,camera);
    };
    onResize=render;
    resizeObserver=new ResizeObserver(render);
    resizeObserver.observe(stage);
    render();

    let dragging=false;
    let previousX=0;
    let previousY=0;
    onPointerDown=(event)=>{
      dragging=true;
      previousX=event.clientX;
      previousY=event.clientY;
      canvasElement!.setPointerCapture(event.pointerId);
    };
    onPointerMove=(event)=>{
      if(!dragging||!bookGroup)return;
      const dx=event.clientX-previousX;
      const dy=event.clientY-previousY;
      previousX=event.clientX;
      previousY=event.clientY;
      bookGroup.rotation.y+=dx*0.008;
      bookGroup.rotation.x=Math.max(-0.45,Math.min(0.35,bookGroup.rotation.x+dy*0.004));
      render();
    };
    onPointerUp=()=>{dragging=false;};
    canvasElement.addEventListener("pointerdown",onPointerDown);
    canvasElement.addEventListener("pointermove",onPointerMove);
    canvasElement.addEventListener("pointerup",onPointerUp);
    canvasElement.addEventListener("pointercancel",onPointerUp);
    window.addEventListener("resize",render);

    return ()=>{
      if(canvasElement&&onPointerDown)canvasElement.removeEventListener("pointerdown",onPointerDown);
      if(canvasElement&&onPointerMove)canvasElement.removeEventListener("pointermove",onPointerMove);
      if(canvasElement&&onPointerUp){
        canvasElement.removeEventListener("pointerup",onPointerUp);
        canvasElement.removeEventListener("pointercancel",onPointerUp);
      }
      if(onResize)window.removeEventListener("resize",onResize);
      resizeObserver?.disconnect();
      scene?.traverse((object)=>{
        const mesh=object as import("three").Mesh;
        if(mesh.geometry)mesh.geometry.dispose();
        if(mesh.material){
          const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
          for(const material of materials){
            const mapped=material as import("three").Material&{map?:import("three").Texture|null};
            mapped.map?.dispose();
            material.dispose();
          }
        }
      });
      renderer?.dispose();
      container.innerHTML="";
    };
  }catch{
    renderFallback(container,data);
    return ()=>{container.innerHTML="";};
  }
}
