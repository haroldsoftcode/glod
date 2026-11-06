const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const g=require('../lib/glod');
const maxJson=4*1024*1024;
function passwordValid(p){const value=process.env.GLOD_ADMIN_PASSWORD_SCRYPT||'';const [salt,expected]=value.split(':');if(!salt||!expected)return false;const actual=crypto.scryptSync(p,salt,64).toString('hex');return expected.length===actual.length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(actual))}
function cookie(res,value,maxAge=0){res.setHeader('Set-Cookie','glod_admin='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge)}
function normalize(v,type){const now=new Date().toISOString();const out={...v,actualizado:now};delete out._row;if(type==='Modelos'){out.codigo=String(v.codigo||'').trim().toUpperCase();out.nombre=String(v.nombre||'').trim();out.id=String(v.id||crypto.randomUUID());out.activo=String(v.activo??true);out.orden=String(v.orden??0);out.descripcion=String(v.descripcion||'').trim();if(!g.validCode(out.codigo)||!out.nombre)throw Object.assign(new Error('Código y nombre de modelo son obligatorios'),{status:400})}else{out.modelo=String(v.modelo||'').trim().toUpperCase();out.sku=String(v.sku||'').trim().toUpperCase();out.nombre=String(v.nombre||'').trim();out.color=String(v.color||'').trim();out.hex=String(v.hex||'#777777');out.id=String(v.id||crypto.randomUUID());out.activo=String(v.activo??true);out.detal=String(v.detal??'');out.mayor=String(v.mayor??'');out.imagen=String(v.imagen||'');out.imagen_original=String(v.imagen_original||'');out.drive_id=String(v.drive_id||'');if(!g.validCode(out.modelo)||!g.validCode(out.sku)||!out.color||!/^#[0-9a-f]{6}$/i.test(out.hex)||![out.detal,out.mayor].every(x=>x===''||Number.isFinite(Number(x))&&Number(x)>=0))throw Object.assign(new Error('Verifica SKU, modelo, color, HEX y precios'),{status:400})}return out}
async function seed(){await g.ensureTabs();const models=await g.records('Modelos'), variants=await g.records('Variantes');if(models.length||variants.length)throw Object.assign(new Error('La hoja ya contiene productos. La importación inicial solo funciona en una hoja vacía.'),{status:409});const html=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');const match=html.match(/<script type="application\/json" id="data">([\s\S]*?)<\/script>/);if(!match)throw new Error('Catálogo original no encontrado');const list=JSON.parse(match[1]);const unique=[...new Map(list.map(x=>[x.modelo,x])).values()];for(let i=0;i<unique.length;i+=70)await g.append('Modelos',[...unique.slice(i,i+70)].map((x,j)=>[crypto.randomUUID(),x.modelo,x.nombre,'','true',String(i+j+1),new Date().toISOString()]));for(let i=0;i<list.length;i+=70)await g.append('Variantes',list.slice(i,i+70).map(x=>[crypto.randomUUID(),x.modelo,x.sku,x.nombre,x.color,x.hex||'#777777',x.detal??'',x.mayor??'','true',x.imagen_web||x.imagen,'',x.imagen,new Date().toISOString()]));return {models:unique.length,variants:list.length}}
async function upload(v){const folder=process.env.GLOD_DRIVE_FOLDER_ID;if(!folder)throw Object.assign(new Error('Configura GLOD_DRIVE_FOLDER_ID'),{status:503});const data=String(v.data||'');const m=data.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);if(!m)throw Object.assign(new Error('Formato permitido: JPEG, PNG o WebP'),{status:400});const bytes=Buffer.from(m[2],'base64');if(bytes.length>3*1024*1024)throw Object.assign(new Error('Imagen demasiado grande (máximo 3 MB)'),{status:413});const type=m[1];const filename=String(v.filename||'cartera').replace(/[^a-z0-9._-]/gi,'_').slice(0,90);const bound='glod'+crypto.randomBytes(12).toString('hex');const metadata={name:Date.now()+'-'+filename,parents:[folder]};const start=Buffer.from('--'+bound+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+bound+'\r\nContent-Type: '+type+'\r\n\r\n');const end=Buffer.from('\r\n--'+bound+'--');const token=await g.googleToken();const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'multipart/related; boundary='+bound},body:Buffer.concat([start,bytes,end])});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error?.message||'Error subiendo foto'),{status:502});return {id:result.id,url:'/api/image?id='+encodeURIComponent(result.id)}}
module.exports=async(req,res)=>{try{
if(req.method==='OPTIONS')return res.status(405).end();
if(!g.safeOrigin(req))return g.json(res,403,{error:'Origen no permitido'});
const action=String(req.query.action||'');
if(action==='login'&&req.method==='POST'){const user=String(req.body?.username||''),pw=String(req.body?.password||'');if(!process.env.GLOD_ADMIN_USERNAME||!process.env.GLOD_ADMIN_PASSWORD_SCRYPT||!process.env.GLOD_SESSION_SECRET)return g.json(res,503,{error:'Administración no configurada en Vercel'});if(user!==process.env.GLOD_ADMIN_USERNAME||!passwordValid(pw))return g.json(res,401,{error:'Credenciales incorrectas'});const payload=g.b64(JSON.stringify({u:user,exp:Date.now()+8*3600000}));cookie(res,payload+'.'+g.sign(payload),28800);return g.json(res,200,{ok:true})}
if(action==='logout'&&req.method==='POST'){cookie(res,'',0);return g.json(res,200,{ok:true})}
if(!g.auth(req))return g.json(res,401,{error:'Inicia sesión para continuar'});
if(action==='session'&&req.method==='GET')return g.json(res,200,{ok:true,user:process.env.GLOD_ADMIN_USERNAME});
if(action==='list'&&req.method==='GET'){await g.ensureTabs();const [models,variants]=await Promise.all([g.records('Modelos'),g.records('Variantes')]);return g.json(res,200,{models,variants})}
if(req.method!=='POST')return g.json(res,405,{error:'Método no permitido'});
if(action==='seed')return g.json(res,200,{ok:true,...await seed()});
if(action==='upload')return g.json(res,200,{ok:true,...await upload(req.body||{})});
if(action==='save'||action==='toggle'||action==='archive'){
const type=req.body?.type==='Modelos'?'Modelos':req.body?.type==='Variantes'?'Variantes':null;if(!type)return g.json(res,400,{error:'Tipo inválido'});
let rows=await g.records(type),input=req.body?.record||{},id=String(input.id||req.body?.id||'');let existing=rows.find(r=>r.id===id),item;
if(action==='save'){item=normalize({...existing,...input},type);if(rows.some(x=>x.id!==item.id&&(type==='Modelos'?x.codigo===item.codigo:x.sku===item.sku)))return g.json(res,409,{error:'El código ya existe'});if(type==='Variantes'){const mods=await g.records('Modelos');if(!mods.some(m=>m.codigo===item.modelo))return g.json(res,400,{error:'El modelo seleccionado no existe'})}}
else{if(!existing)return g.json(res,404,{error:'Producto no encontrado'});item={...existing,activo:action==='archive'?'archivado':g.active(existing.activo)?'false':'true',actualizado:new Date().toISOString()};delete item._row}
await g.writeRecord(type,item,existing?existing._row:null);
if(type==='Modelos'&&action==='save'&&existing&&existing.codigo!==item.codigo){
 const linked=await g.records('Variantes');
 for(const variant of linked.filter(v=>v.modelo===existing.codigo)){
  await g.writeRecord('Variantes',{...variant,modelo:item.codigo,actualizado:new Date().toISOString()},variant._row);
 }
}
return g.json(res,200,{ok:true,item})
}
return g.json(res,404,{error:'Acción desconocida'})
}catch(e){g.fail(res,e)}};
