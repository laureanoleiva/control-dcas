export const money = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n/100);
const clean = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function validCBU(s){
 if(!/^\d{22}$/.test(s))return false;
 const digit=(part,weights)=>(10-[...part].reduce((a,c,i)=>a+Number(c)*weights[i],0)%10)%10;
 return digit(s.slice(0,7),[7,1,3,9,7,1,3])===Number(s[7]) && digit(s.slice(8,21),[3,9,7,1,3,9,7,1,3,9,7,1,3])===Number(s[21]);
}
export function validCUIL(s){if(!/^\d{11}$/.test(s))return false;return [...s].reduce((a,c,i)=>a+Number(c)*[5,4,3,2,7,6,5,4,3,2,1][i],0)%11===0;}
export function decodeTR(bytes){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return new TextDecoder('windows-1252').decode(bytes)}}
export function parseTR(text){
 const lines=text.split(/\r\n|\n|\r/);if(lines.at(-1)==='')lines.pop();
 const records=[];const issues=[];const add=(line,name,type,detail)=>issues.push({line,name,type,detail,level:'error'});
 if(!text.endsWith('\n'))add(lines.length,'Cierre','Enter final','Falta el salto de línea después del cierre.');
 if(/\r(?!\n)|(?<!\r)\n/.test(text))add(null,'Archivo','Saltos de línea','El ejemplo bancario usa CRLF. Hay saltos de línea de otro tipo.');
 lines.forEach((s,i)=>{
  const line=i+1, name=s[0]==='2'?s.slice(59,99).trim():i===0?'Encabezado':i===lines.length-1?'Cierre':'Registro';
  if(s.length!==100)add(line,name,'Longitud de línea',`Tiene ${s.length} posiciones; se esperan 100.`);
  if(s[99]!=='0')add(line,name,'Alineación','El cero final debe estar en la posición 100.');
  if(/[^\x20-\x7E]/.test(s))add(line,name,'Caracteres no admitidos','Hay Ñ, tildes, tabulaciones u otros caracteres fuera del formato ASCII del TR corregido.');
  if(i===0){if(s[0]!=='1')add(line,name,'Encabezado','La primera línea debe comenzar con 1.');return;}
  if(i===lines.length-1){if(s[0]!=='3')add(line,name,'Cierre','La última línea debe comenzar con 3.');if(s[0]==='3')return;}
  if(s[0]!=='2'){add(line,name,'Tipo de registro','Se esperaba un registro de beneficiario que comience con 2.');return;}
  const cbu=s.slice(1,23),amountText=s.slice(23,33),cuil=s.slice(48,59),rawName=s.slice(59,99), amount=/^\d{10}$/.test(amountText)?Number(amountText):null;
  records.push({line,name,cbu,cuil,amount});
  if(!validCBU(cbu))add(line,name,'CBU inválido','Revisar sus 22 dígitos y los dos dígitos verificadores.');
  if(!validCUIL(cuil))add(line,name,'CUIL inválido','Revisar sus 11 dígitos y el dígito verificador.');
  if(amount===null || amount<=0)add(line,name,'Importe inválido','Debe contener 10 dígitos, con dos decimales implícitos, y ser mayor que cero.');
  if(!name)add(line,'Sin nombre','Nombre faltante','El campo de apellido y nombre está vacío.');
  if(/ {2,}/.test(rawName.trimEnd()))add(line,name,'Espacios dobles','Hay dos o más espacios entre palabras del apellido o los nombres.');
  if(rawName.startsWith(' '))add(line,name,'Nombre desalineado','El apellido debe comenzar en la posición 60, sin espacios iniciales.');
  if(!s.slice(33,48).trim())add(line,name,'Referencia faltante','El campo de referencia está vacío.');
 });
 const total=records.reduce((s,r)=>s+(r.amount??0),0),tail=lines.at(-1)||'';
 if(tail[0]==='3'){
  if(!/^\d{6}$/.test(tail.slice(1,7)) || Number(tail.slice(1,7))!==records.length+2)add(lines.length,'Cierre','Cantidad de registros',`El cierre indica ${tail.slice(1,7)}; se esperan ${records.length+2} (${records.length} pagos + 2).`);
  if(!/^\d{11}$/.test(tail.slice(7,18)) || Number(tail.slice(7,18))!==total)add(lines.length,'Cierre','Total del TR',`El cierre no coincide con la suma de pagos: ${money(total)}.`);
  if(!/^ *$/.test(tail.slice(18,99)))add(lines.length,'Cierre','Relleno del cierre','Las posiciones 19 a 99 deben ser espacios.');
 }
 const header=lines[0]||'';
 if(header.slice(0,58)!=='1MINISTERIO DE   SEGURIDAD PROVINCIAL30648839088SUELDOS   ')add(1,'Encabezado','Datos del emisor','El organismo, CUIT o concepto difiere del encabezado de referencia.');
 const stamp=header.slice(58,64),clock=header.slice(64,68);
 if(!/^\d{6}$/.test(stamp)||Number(stamp.slice(2,4))<1||Number(stamp.slice(2,4))>12||Number(stamp.slice(4,6))<1||Number(stamp.slice(4,6))>31)add(1,'Encabezado','Fecha de generación','La fecha de generación no tiene un formato válido AAMMDD.');
 if(!/^\d{4}$/.test(clock)||Number(clock.slice(0,2))>23||Number(clock.slice(2))>59)add(1,'Encabezado','Hora de generación','La hora de generación no tiene un formato válido HHMM.');
 if(header.slice(74,88)!=='01200000114243')add(1,'Encabezado','Bloque fijo','Las posiciones 75 a 88 deben contener 01200000114243.');
 if(header.slice(88,97)!=='0TR00996X' || header.slice(97,99)!=='  ')add(1,'Encabezado','Código bancario','Se espera 0TR00996X seguido de dos espacios antes del cero final.');
 for(const field of ['cbu','cuil']){const seen=new Map();for(const r of records){if(seen.has(r[field]))add(r.line,r.name,field.toUpperCase()+' duplicado',`También aparece en la línea ${seen.get(r[field])}.`);else seen.set(r[field],r.line);}}
 return {records,issues,total,header,lines:lines.length};
}
// Reconstruct visual rows; the bank PDF wraps the last cent and parts of names.
export function pdfRows(items){
 const rows=[];
 for(const item of items){if(!item.str?.trim())continue;const y=item.transform[5];let row=rows.find(r=>Math.abs(r.y-y)<1.5);if(!row){row={y,items:[]};rows.push(row)}row.items.push({x:item.transform[4],text:item.str});}
 return rows.sort((a,b)=>b.y-a.y).map(r=>({text:r.items.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ').replace(/\s+/g,' ').trim(),items:r.items}));
}
export function parsePDFPages(pages){
 const records=[],problems=[],all=[];let declaredCount=null,declaredTotal=null;const dates=new Set();
 pages.forEach((items,idx)=>{
  const rows=pdfRows(items);all.push(...rows.map(r=>r.text));let current=null, rowCount=0;
  for(const row of rows){
   const t=row.text;
   const date=t.match(/Fecha de pago:\s*(\d{2}\/\d{2}\/\d{4})/i);if(date)dates.add(date[1]);
   const cnt=t.match(/CANTIDAD DE PAGOS\s+(\d+)/);if(cnt)declaredCount=Number(cnt[1]);
   const tot=t.match(/IMPORTE TOTAL DE PAGOS\s+([\d.]+,\d{2})/);if(tot)declaredTotal=Number(tot[1].replaceAll('.','').replace(',',''));
   const m=t.match(/^(\d{8})\s+(\d{14})\s+(\S+)\s+([\d.]+,\d{1,2})\s+(\d{11})\s+(.+)$/);
   if(m){current={page:idx+1,cbu:m[1]+m[2],amountText:m[4],cuil:m[5],name:m[6],amountX:row.items.find(x=>x.text.includes(m[4]))?.x??0};records.push(current);rowCount++;continue;}
   if(/^\d{8}\s/.test(t)){problems.push(`Página ${idx+1}: no se pudo interpretar una fila de pago.`);current=null;continue;}
   if(current){
    const cont=row.items.filter(x=>x.x>=current.amountX-2);
    if(current.amountText.split(',')[1].length===1){const cent=cont.find(x=>Math.abs(x.x-current.amountX)<3&&/^\d$/.test(x.text));if(cent)current.amountText+=cent.text;}
    // Name continuations lie to the right of the CUIL column.
    const names=cont.filter(x=>x.x>current.amountX+100 && /^[A-ZÁÉÍÓÚÜÑ ]+$/i.test(x.text) && !/FIRMA|SELLO|CANTIDAD|IMPORTE|BENEFICIARIO/.test(x.text));
    if(names.length&&!/Fecha|MINISTERIO/.test(t))current.name+=' '+names.map(x=>x.text).join(' ');
   }
  }
  if(rowCount===0)problems.push(`Página ${idx+1}: no se detectaron pagos. PDF escaneado o formato no compatible.`);
 });
 for(const r of records){if(!/^[\d.]+,\d{2}$/.test(r.amountText)){problems.push(`Página ${r.page}: importe incompleto de ${r.name}.`);r.amount=null}else r.amount=Number(r.amountText.replaceAll('.','').replace(',',''));}
 const total=records.reduce((a,r)=>a+(r.amount??0),0);
 if(declaredCount===null)problems.push('No se pudo leer la cantidad total de pagos del PDF.');
 else if(records.length!==declaredCount)problems.push(`Se leyeron ${records.length} pagos, pero el PDF declara ${declaredCount}.`);
 if(declaredTotal===null)problems.push('No se pudo leer el importe total del PDF.');
 else if(total!==declaredTotal)problems.push('La suma de los importes leídos no coincide con el total del PDF.');
 if(dates.size!==1)problems.push('No se pudo identificar una única fecha de liquidación en el PDF.');
 return {records,total,declaredCount,declaredTotal,problems,date:[...dates][0]||null,pages:pages.length};
}
export function validate(tr,pdf,{date,article,filename,month}){
 const issues=[...tr.issues],add=(line,name,type,detail,level='error')=>issues.push({line,name,type,detail,level});
 for(const p of pdf.problems)add(null,'PDF','Lectura incompleta',p,'incomplete');
 const expectedDate=date.slice(2).replaceAll('-','');
 if(pdf.date&&month){const [d,m,y]=pdf.date.split('/');if(month!==`${y}-${m}`)add(null,'Liquidación','Mes diferente al PDF',`El PDF indica ${pdf.date}, pero se seleccionó ${month}.`);}
 if(!date)add(1,'Encabezado','Fecha requerida','Seleccioná la fecha de pago prevista.');
 else if(tr.header.slice(68,74)!==expectedDate)add(1,'Encabezado','Fecha de pago',`El TR indica ${tr.header.slice(68,74)}; se esperaba ${expectedDate} (año, mes, día).`);
 if(date){const d=new Date(date+'T12:00:00Z');if([0,6].includes(d.getUTCDay()))add(1,'Encabezado','Día no hábil','La fecha elegida cae sábado o domingo.');}
 if(month&&date){const [y,m]=month.split('-').map(Number);const next=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);if(date.slice(0,7)!==next)add(1,'Encabezado','Mes de pago',`La fecha debe pertenecer a ${next}, mes siguiente a la liquidación.`);}
 if(!new RegExp('^TR00996X\\('+article+'\\)$','i').test(filename))add(null,'Archivo','Nombre del archivo',`Se esperaba TR00996X(${article}), sin extensión. Recibido: ${filename}.`);
 const byCuil=new Map();for(const r of pdf.records){if(byCuil.has(r.cuil))add(null,r.name,'CUIL duplicado en PDF',`Se repite el CUIL ${r.cuil} en el PDF.`);else byCuil.set(r.cuil,r);}
 const used=new Set();
 for(const r of tr.records){let p=byCuil.get(r.cuil);if(!p){const candidates=pdf.records.filter(p=>p.cbu===r.cbu);if(candidates.length===1){p=candidates[0];add(r.line,r.name,'CUIL diferente',`PDF: ${p.cuil}. TR: ${r.cuil}.`);}}
  if(!p){add(r.line,r.name,'No figura en el PDF','El beneficiario del TR no tiene coincidencia por CUIL o CBU en el PDF.');continue;}used.add(p);
  if(r.cbu!==p.cbu)add(r.line,r.name,'CBU diferente',`PDF: ${p.cbu}. TR: ${r.cbu}. Página ${p.page}.`);
  if(r.amount!==p.amount)add(r.line,r.name,'Importe diferente',`TR: ${money(r.amount??0)}. PDF: ${p.amount===null?'No legible':money(p.amount)}. Página ${p.page}.`);
  if(clean(r.name)!==clean(p.name))add(r.line,r.name,'Nombre diferente',`PDF: ${p.name}. Revisar posibles truncamientos. Página ${p.page}.`);
 }
 for(const p of pdf.records)if(!used.has(p))add(null,p.name,'Falta en el TR',`Figura en la página ${p.page} del PDF. CUIL ${p.cuil}.`);
 if(tr.records.length!==pdf.records.length)add(null,'Totales','Cantidad de pagos',`TR: ${tr.records.length}. PDF: ${pdf.records.length}.`);
 if(tr.total!==pdf.total)add(null,'Totales','Importe total',`TR: ${money(tr.total)}. PDF: ${money(pdf.total)}.`);
 return {issues,trCount:tr.records.length,pdfCount:pdf.records.length,trTotal:tr.total,pdfTotal:pdf.total,incomplete:pdf.problems.length>0,ok:issues.length===0};
}
