import {decodeTR,parseTR,parsePDFPages,validate,money} from './validator.mjs';
const $=id=>document.getElementById(id);let loadedPDF=null,result=null,generation=0,pdfLibrary=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(s,error=false){$('progress').hidden=!s;$('progress').textContent=s;$('progress').classList.toggle('error',error);}
function invalidate(){generation++;result=null;$('results').hidden=true;}
async function readPDF(file,onPage=()=>{}){
 if(file.size>25*1024*1024)throw new Error('El PDF supera 25 MB. Elegí el adjunto bancario generado por el sistema.');
 pdfLibrary??=await import('./vendor/pdf.mjs');pdfLibrary.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
 const doc=await pdfLibrary.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true}).promise;
 try{if(doc.numPages>200)throw new Error('El PDF supera las 200 páginas admitidas por esta versión.');const pages=[];for(let i=1;i<=doc.numPages;i++){onPage(i,doc.numPages);pages.push((await(await doc.getPage(i)).getTextContent()).items)}return parsePDFPages(pages)}finally{await doc.destroy()}
}
for(const kind of ['tr','pdf']){
 const input=$(kind+'-file'),drop=$(kind+'-drop');
 input.addEventListener('change',async()=>{
  invalidate();message('');const f=input.files[0];$(kind+'-label').textContent=f?f.name:kind==='tr'?'Elegí el archivo que ya modificaste':'Elegí el detalle de pagos';drop.classList.toggle('loaded',!!f);
  if(kind==='pdf'){
   loadedPDF=null;if(!f)return;const id=generation;$('run').disabled=true;
   try{const pdf=await readPDF(f,(i,n)=>{if(id===generation)message(`Leyendo PDF · página ${i} de ${n}…`)});if(input.files[0]!==f)return;loadedPDF={file:f,pdf};
    if(pdf.date){const [d,m,y]=pdf.date.split('/');$('month').value=`${y}-${m}`;$('month-note').textContent=`Detectado en el PDF · ${pdf.date}`;}
    message(pdf.problems.length?'PDF leído con dificultades. El control mostrará los detalles.':`PDF leído · ${pdf.records.length} pagos · ${money(pdf.total)}`,pdf.problems.length>0);
   }catch(e){if(input.files[0]===f)message('No se pudo leer el PDF. '+e.message,true)}finally{$('run').disabled=false;}
  }
 });
 for(const ev of ['dragenter','dragover'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')});
 for(const ev of ['dragleave','drop'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')});
 drop.addEventListener('drop',e=>{if(e.dataTransfer.files.length===1){input.files=e.dataTransfer.files;input.dispatchEvent(new Event('change'))}});
}
for(const id of ['month','date','article','business-day'])$(id).addEventListener('change',()=>{invalidate();if(id==='date')$('business-day').checked=false;});
$('control-form').addEventListener('submit',async e=>{
 e.preventDefault();invalidate();const id=generation,tf=$('tr-file').files[0],pf=$('pdf-file').files[0];if(!tf||!pf)return;
 $('run').disabled=true;message('Controlando documentos…');
 try{
  if(tf.size>5*1024*1024)throw new Error('El TR supera 5 MB. Revisá que hayas seleccionado el archivo correcto.');
  const tr=parseTR(decodeTR(await tf.arrayBuffer()));const pdf=loadedPDF?.file===pf?loadedPDF.pdf:await readPDF(pf,(i,n)=>message(`Leyendo PDF · página ${i} de ${n}…`));
  if(id!==generation)return;
  result=validate(tr,pdf,{date:$('date').value,article:$('article').value,month:$('month').value,filename:tf.name});result.files={tr:tf.name,pdf:pf.name};result.date=$('date').value;result.article=$('article').value;result.created=new Date().toLocaleString('es-AR');
  render();message('');$('results').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){if(id===generation)message('Control incompleto. '+e.message,true)}finally{$('run').disabled=false;}
});
function render(){
 $('results').hidden=false;const r=result,b=$('result-banner');b.className='result-banner'+(r.incomplete?' incomplete':r.ok?'':' error');
 b.innerHTML=r.incomplete?'<strong>Control incompleto</strong><p>No se pudo verificar todo el PDF. Revisá los detalles; este resultado no confirma que el TR esté correcto.</p>':r.ok?'<strong>✓ Sin diferencias en los controles realizados</strong><p>Los pagos y totales coinciden. El TR cumple las reglas de formato configuradas. La fecha hábil fue confirmada por vos.</p>':`<strong>Hay ${r.issues.length} observaciones para revisar</strong><p>Encontrá cada diferencia por línea y persona. Corregí el archivo y volvé a cargarlo para repetir el control.</p>`;
 $('stats').innerHTML=[['PAGOS EN EL TR',r.trCount,`${r.trCount+2} registros esperados con encabezado y cierre`],['PAGOS EN EL PDF',r.pdfCount,'Leídos del adjunto bancario'],['TOTAL DEL TR',money(r.trTotal),'Suma de los importes individuales'],['TOTAL DEL PDF',money(r.pdfTotal),'Suma de los importes leídos']].map(([a,b,c])=>`<div class="stat"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join('');
 $('search').value='';$('filters').hidden=r.ok;renderRows();
}
function renderRows(){if(!result)return;const q=$('search').value.toLocaleLowerCase('es');const rows=result.issues.filter(r=>[r.line,r.name,r.type,r.detail].join(' ').toLocaleLowerCase('es').includes(q));$('issue-count').textContent=`${rows.length} de ${result.issues.length} observaciones`;
 $('table-wrap').innerHTML=result.ok?'<div class="empty">Todos los controles configurados finalizaron correctamente.<br>Podés descargar el informe de esta revisión.</div>':!rows.length?'<div class="empty">No hay coincidencias con esa búsqueda.</div>':`<table><thead><tr><th>LÍNEA TR</th><th>PERSONA / REGISTRO</th><th>OBSERVACIÓN</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.line??'—'}</td><td>${esc(r.name)}</td><td><span class="badge">${esc(r.type)}</span><p>${esc(r.detail)}</p></td></tr>`).join('')}</tbody></table>`;
}
$('search').addEventListener('input',renderRows);
$('download').addEventListener('click',()=>{if(!result)return;const r=result;const lines=['DCAS · INFORME DE CONTROL',r.created,`TR: ${r.files.tr}`,`PDF: ${r.files.pdf}`,`Artículo: ${r.article} | Fecha prevista: ${r.date}`,`Resultado: ${r.incomplete?'CONTROL INCOMPLETO':r.ok?'SIN DIFERENCIAS EN LOS CONTROLES REALIZADOS':'CON OBSERVACIONES'}`,`Pagos TR: ${r.trCount} | Pagos PDF: ${r.pdfCount}`,`Total TR: ${money(r.trTotal)} | Total PDF: ${money(r.pdfTotal)}`,'',...r.issues.map(i=>`Línea TR ${i.line??'—'} | ${i.name} | ${i.type}\n${i.detail}\n`),'Fecha hábil confirmada manualmente por el usuario. No se verifica titularidad del CBU ni aceptación por el banco.'];const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='DCAS_Control_'+r.date+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
