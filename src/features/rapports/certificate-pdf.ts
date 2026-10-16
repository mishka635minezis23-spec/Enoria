import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface CertificatePdfData {
  parishName: string;
  dioceseName: string;
  faithfulName: string;
  sacramentLabel: string;
  dateText: string;
  place: string;
  actNumber: string;
  pageNumber: string;
  minister: string;
  duplicateNumber: number;
  emittedDate: string;
}

export async function createCertificatePdf(data:CertificatePdfData):Promise<Uint8Array>{
  const pdf=await PDFDocument.create();
  pdf.setTitle(`Duplicata — ${data.sacramentLabel} — ${data.faithfulName}`);
  pdf.setAuthor(data.parishName);
  pdf.setSubject("Duplicata de certificat paroissial");
  pdf.setCreator("Enoria");
  const page=pdf.addPage([595.28,841.89]);
  const width=page.getWidth();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const green=rgb(0.08,0.28,0.23);
  const ink=rgb(0.13,0.16,0.17);
  const muted=rgb(0.38,0.42,0.43);

  const centered=(text:string,y:number,size:number,font=regular,color=ink)=>{
    const textWidth=font.widthOfTextAtSize(text,size);
    page.drawText(text,{x:(width-textWidth)/2,y,size,font,color});
  };
  const paragraph=(text:string,x:number,y:number,maxWidth:number,size:number,font=regular,color=ink):number=>{
    const words=text.split(/\s+/);
    let line="";
    const lines:string[]=[];
    for(const word of words){
      const candidate=line?line+" "+word:word;
      if(font.widthOfTextAtSize(candidate,size)>maxWidth&&line){
        lines.push(line);
        line=word;
      }else line=candidate;
    }
    if(line)lines.push(line);
    for(const item of lines){
      page.drawText(item,{x,y,size,font,color});
      y-=size+6;
    }
    return y;
  };

  page.drawRectangle({x:34,y:34,width:width-68,height:page.getHeight()-68,borderColor:green,borderWidth:1.2});
  centered(data.parishName,770,18,bold,green);
  if(data.dioceseName)centered(data.dioceseName,748,10,regular,muted);
  page.drawLine({start:{x:68,y:727},end:{x:width-68,y:727},thickness:1,color:green});
  centered("DUPLICATA DE CERTIFICAT",680,17,bold,green);
  centered(data.sacramentLabel.toLocaleUpperCase("fr-CD"),650,12,bold,ink);

  let y=595;
  y=paragraph("Nous attestons que l'inscription ci-dessous figure dans le registre sacramentel de la paroisse :",76,y,width-152,11);
  y-=22;
  centered(data.faithfulName, y, 16, bold, ink);
  y-=38;
  const fields=[
    ["Date inscrite",data.dateText],
    ["Lieu",data.place||"Non renseigné"],
    ["Numéro d'acte",data.actNumber],
    ["Page du registre",data.pageNumber],
    ["Ministre",data.minister||"Non renseigné"],
    ["Numéro du duplicata",String(data.duplicateNumber)],
    ["Date d'émission",data.emittedDate]
  ];
  for(const [label,value] of fields){
    page.drawText(label,{x:92,y,size:10,font:bold,color:muted});
    page.drawText(value,{x:235,y,size:10,font:regular,color:ink,maxWidth:270});
    y-=31;
  }
  y-=16;
  y=paragraph("Le présent duplicata est délivré après validation du curé. Il complète le registre papier et ne le remplace pas ; le registre original demeure la référence paroissiale.",76,y,width-152,9,regular,muted);
  page.drawLine({start:{x:355,y:155},end:{x:505,y:155},thickness:0.8,color:muted});
  page.drawText("Le curé",{x:405,y:137,size:10,font:bold,color:ink});
  centered(data.parishName,68,8,regular,muted);
  centered("Document généré à partir des données structurées du registre numérique.",54,7,regular,muted);

  return pdf.save();
}

export function downloadCertificatePdf(bytes:Uint8Array,fileName:string):void{
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob=new Blob([buffer],{type:"application/pdf"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=fileName;
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
