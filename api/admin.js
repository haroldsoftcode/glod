'use strict';
// GLOD server-only administration API. Required env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.
// Uses the signed-in user's JWT and existing RLS; no service-role/secret key.
const {randomUUID}=require('node:crypto');
const AT='__Host-glod_at',RT='__Host-glod_rt';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIMES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
function problem(status,message){const e=new Error(message);e.status=status;throw e}
function readEnv(names) {
 return names.map(name => {
  const raw=process.env[name];
  if(typeof raw!=='string')return '';
  let value=raw.trim();
  if(value.length>1&&((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))))value=value.slice(1,-1).trim();
  return value;
 }).filter(Boolean);
}
function validProjectUrl(value) {
 try {
  const url=new URL(value);
  return url.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)&&
    (url.pathname==='/'||!url.pathname)&&!url.search&&!url.hash;
 } catch {return false}
}
function validReadKey(value) {
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(value))return true;
 try {
  const parts=value.split('.');
  if(parts.length!==3)return false;
  const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  return payload.role==='anon'&&payload.iss==='supabase';
 } catch {return false}
}
const URL_ENV=['SUPABASE_URL','SUPABASE_PROJECT_URL','NEXT_PUBLIC_SUPABASE_URL','VITE_SUPABASE_URL'];
const KEY_ENV=['SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','SUPABASE_PUBLIC_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY','VITE_SUPABASE_ANON_KEY'];
function setup(){
 const urls=readEnv(URL_ENV), keys=readEnv(KEY_ENV);
 const url=urls.find(validProjectUrl),key=keys.find(validReadKey);
 if(!url)problem(503,urls.length?'La URL de Supabase es inválida. Revisa la URL HTTPS del proyecto en Vercel.':'SUPABASE_URL no está disponible en este despliegue. Verifica Production y realiza Redeploy.');
 if(!key)problem(503,keys.length?'La clave Supabase debe ser de tipo publishable o anon; no secret ni service_role.':'SUPABASE_PUBLISHABLE_KEY no está disponible en este despliegue. Verifica Production y realiza Redeploy.');
 return {url:url.replace(/\/$/,''),key};
}
function cookies(req){
 const c={};String(req.headers.cookie||'').split(';').forEach(part=>{
  const i=part.indexOf('=');if(i<0)return;
  try{c[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim())}catch{}
 });return c;
}
function makeCookie(name,value,age){return name+'='+encodeURIComponent(value)+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+age}
function setSession(res,token){
 if(!token.access_token||!token.refresh_token)problem(502,'La sesión no pudo establecerse.');
 const age=Math.max(60,Math.min(3600,Number(token.expires_in||3600)-20));
 res.setHeader('Set-Cookie',[makeCookie(AT,token.access_token,age),makeCookie(RT,token.refresh_token,604800)]);
}
function eraseSession(res){res.setHeader('Set-Cookie',[makeCookie(AT,'',0),makeCookie(RT,'',0)])}
function sameOrigin(req){
 if(!req.headers.origin||!req.headers.host)return false;
 try{
  const origin=new URL(req.headers.origin),site=req.headers['sec-fetch-site'];
  return origin.protocol==='https:'&&origin.host.toLowerCase()===req.headers.host.toLowerCase()&&(!site||site==='same-origin'||site==='none');
 }catch{return false}
}
function input(req){
 if(Number(req.headers['content-length']||0)>4400000)problem(413,'Solicitud demasiado grande.');
 if(req.headers['content-type']&&!String(req.headers['content-type']).startsWith('application/json'))problem(415,'El cuerpo debe ser JSON.');
 let body=req.body||{};if(typeof body==='string'){try{body=JSON.parse(body)}catch{problem(400,'JSON inválido')}}
 if(!body||typeof body!=='object'||Array.isArray(body))problem(400,'Datos inválidos.');
 return body;
}
async function sb(config,path,opts={}){
 const headers={apikey:config.key,Accept:'application/json'};
 if(opts.token)headers.Authorization='Bearer '+opts.token;
 if(opts.data!==undefined)headers['Content-Type']='application/json';
 if(opts.raw)headers['Content-Type']=opts.mime;
 if(opts.extra)Object.assign(headers,opts.extra);
 let response;
 try{response=await fetch(config.url+path,{
  method:opts.method||'GET',headers,cache:'no-store',
  body:opts.raw|| (opts.data===undefined?undefined:JSON.stringify(opts.data)),
  signal:AbortSignal.timeout(15000)
 })}catch{problem(502,'No se pudo conectar con el servicio.')}
 const value=await response.json().catch(()=>null);
 if(!response.ok){
  if(response.status===401||response.status===403)problem(401,'Sesión expirada o sin permiso.');
  if(value?.code==='23503')problem(409,'El modelo tiene variantes asociadas. Elimínalas antes.');
  if(value?.code==='23505')problem(409,'Ya existe un producto con ese código.');
  if(response.status===400||value?.code==='23502')problem(400,'Revisa los datos del formulario.');
  problem(502,'No se pudo completar la operación.');
 }
 return value;
}
async function verify(config,token){
 if(!token)problem(401,'Inicia sesión.');
 const u=await sb(config,'/auth/v1/user',{token});
 if(!UUID.test(String(u?.id||'')))problem(401,'Sesión inválida.');
 const rows=await sb(config,'/rest/v1/glod_admins?select=user_id&user_id=eq.'+encodeURIComponent(u.id)+'&limit=1',{token});
 if(!Array.isArray(rows)||!rows.some(r=>r.user_id===u.id))problem(403,'Acceso restringido a administradores.');
 return token;
}
async function currentSession(req,res,config){
 const jar=cookies(req);
 try{return await verify(config,jar[AT])}
 catch(err){
  if(err.status===403||!jar[RT]){eraseSession(res);throw err}
  try{
   const renewed=await sb(config,'/auth/v1/token?grant_type=refresh_token',{method:'POST',data:{refresh_token:jar[RT]}});
   await verify(config,renewed.access_token);setSession(res,renewed);return renewed.access_token;
  }catch{eraseSession(res);problem(401,'Inicia sesión nuevamente.')}
 }
}
function typeOf(value){
 if(value==='Modelos')return 'glod_models';
 if(value==='Variantes')return 'glod_variants';
 problem(400,'Tipo de registro inválido.');
}
function text(v,max=180,required=false){
 if(v!=null&&typeof v!=='string'&&typeof v!=='number')problem(400,'Campo de texto inválido.');
 const s=String(v??'').trim();
 if(s.length>max||(required&&!s))problem(400,'Revisa los campos requeridos.');
 return s;
}
function amount(v,nullable=false){
 if(nullable&&(v===''||v==null))return null;
 const n=Number(v);if(!Number.isFinite(n)||n<0||n>1000000)problem(400,'Número fuera de rango.');
 return n;
}
function safeUrl(v){
 const url=text(v,1500);
 if(!url||url.startsWith('/assets/catalogo-web/'))return url;
 try{if(new URL(url).protocol==='https:')return url}catch{}
 problem(400,'Fotografía inválida.');
}
function fields(type,v){
 if(!v||typeof v!=='object'||Array.isArray(v))problem(400,'Datos inválidos.');
 if(type==='glod_models'){
  const codigo=text(v.codigo,24,true).toUpperCase();
  if(!/^[A-Z0-9-]+$/.test(codigo))problem(400,'Código de modelo inválido.');
  return {codigo,nombre:text(v.nombre,160,true),descripcion:text(v.descripcion,3000),
   activo:v.activo!==false&&v.activo!=='false',orden:Math.round(amount(v.orden)),actualizado:new Date().toISOString()};
 }
 const modelo=text(v.modelo,24,true).toUpperCase(),sku=text(v.sku,40,true).toUpperCase();
 const hex=text(v.hex||'#777777',7,true).toUpperCase();
 if(!/^[A-Z0-9-]+$/.test(modelo)||!/^[A-Z0-9-]+$/.test(sku)||!/^#[0-9A-F]{6}$/.test(hex))problem(400,'Código o color inválido.');
 return {modelo,sku,nombre:text(v.nombre,160),color:text(v.color,100,true),hex,
  detal:amount(v.detal,true),mayor:amount(v.mayor,true),
  activo:v.activo!==false&&v.activo!=='false',
  imagen:safeUrl(v.imagen),imagen_original:safeUrl(v.imagen_original),
  storage_path:text(v.drive_id||v.storage_path,500),actualizado:new Date().toISOString()};
}
function validImage(buf,mime){
 if(mime==='image/png')return buf.length>=8&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==='image/jpeg')return buf.length>=3&&buf[0]===255&&buf[1]===216&&buf[2]===255;
 if(mime==='image/webp')return buf.length>=12&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP';
 return false;
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store,max-age=0');
 res.setHeader('Vary','Cookie');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Referrer-Policy','no-referrer');
 const action=typeof req.query?.action==='string'?req.query.action:new URL(req.url,'https://localhost').searchParams.get('action');
 const read=req.method==='GET'&&['list','session'].includes(action);
 const write=req.method==='POST'&&['login','logout','save','toggle','delete','upload'].includes(action);
 if(!read&&!write)return res.status(405).json({error:'Método no permitido.'});
 if(write&&!sameOrigin(req))return res.status(403).json({error:'Origen de solicitud no permitido.'});
 try{
  const cfg=setup(),body=write?input(req):{};
  if(action==='login'){
   const email=text(body.username,254,true).toLowerCase(),password=body.password;
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof password!=='string'||!password||password.length>512)problem(400,'Credenciales inválidas.');
   let login;try{login=await sb(cfg,'/auth/v1/token?grant_type=password',{method:'POST',data:{email,password}})}catch{problem(401,'Credenciales incorrectas o cuenta sin acceso.')}
   try{await verify(cfg,login.access_token)}catch{problem(403,'Cuenta sin permisos de administración.')}
   setSession(res,login);return res.status(200).json({ok:true});
  }
  if(action==='logout'){
   const access=cookies(req)[AT];eraseSession(res);
   if(access)await sb(cfg,'/auth/v1/logout',{method:'POST',token:access}).catch(()=>{});
   return res.status(200).json({ok:true});
  }
  const token=await currentSession(req,res,cfg);
  if(action==='session')return res.status(200).json({ok:true});
  if(action==='list'){
   const [models,variants]=await Promise.all([
    sb(cfg,'/rest/v1/glod_models?select=*&order=orden.asc',{token}),
    sb(cfg,'/rest/v1/glod_variants?select=*&order=sku.asc',{token}),
   ]);
   return res.status(200).json({
    models:models.map(x=>({...x,activo:String(x.activo)})),
    variants:variants.map(x=>({...x,activo:String(x.activo)}))
   });
  }
  if(action==='upload'){
   const match=String(body.data||'').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
   if(!match)problem(400,'Archivo no permitido.');
   const bytes=Buffer.from(match[2],'base64');
   if(!bytes.length||bytes.length>3145728||!validImage(bytes,match[1]))problem(400,'La fotografía debe ser PNG, JPEG o WebP, de máximo 3 MB.');
   const path='products/'+randomUUID()+'.'+MIMES[match[1]];
   await sb(cfg,'/storage/v1/object/glod-catalog/'+path,{method:'POST',token,raw:bytes,mime:match[1],extra:{'x-upsert':'false'}});
   return res.status(200).json({id:path,url:cfg.url+'/storage/v1/object/public/glod-catalog/'+path});
  }
  const type=typeOf(body.type);
  const id=action==='save'?(body.record?.id||''):body.id;
  if(id&&!UUID.test(id))problem(400,'Identificador inválido.');
  if(action!=='save'&&!id)problem(400,'Selecciona un registro.');
  const rows=id?await sb(cfg,'/rest/v1/'+type+'?select=*&id=eq.'+encodeURIComponent(id)+'&limit=1',{token}):[];
  const previous=rows[0]||null;
  if(id&&!previous)problem(404,'Registro no encontrado.');
  if(action==='delete'){
   if(type==='glod_models'){
    const linked=await sb(cfg,'/rest/v1/glod_variants?select=id&modelo=eq.'+encodeURIComponent(previous.codigo)+'&limit=1',{token});
    if(linked.length)problem(409,'La cartera tiene variantes. Elimina primero sus variantes.');
   }
   const removed=await sb(cfg,'/rest/v1/'+type+'?id=eq.'+encodeURIComponent(id),{method:'DELETE',token,extra:{Prefer:'return=representation'}});
   if(!Array.isArray(removed)||!removed.some(x=>x.id===id))problem(409,'No se pudo confirmar la eliminación.');
   return res.status(200).json({ok:true,id});
  }
  const data=action==='save'?fields(type,body.record):{activo:!previous.activo,actualizado:new Date().toISOString()};
  const saved=await sb(cfg,'/rest/v1/'+type+(previous?'?id=eq.'+encodeURIComponent(previous.id):''),{
   method:previous?'PATCH':'POST',token,data,extra:{Prefer:'return=representation'}
  });
  if(!Array.isArray(saved)||saved.length!==1)problem(409,'No se pudo confirmar el guardado.');
  return res.status(200).json({ok:true,item:saved[0]});
 }catch(e){
  const status=Number.isInteger(e.status)?e.status:500;
  res.status(status).json({error:status>=500&&status!==503?'Servicio temporalmente no disponible.':e.message});
 }
};
