const crypto=require('node:crypto');
const SHEET=process.env.GLOD_SHEET_ID;
const EMAIL=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const KEY=(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||'').replace(/\\n/g,'\n');
const headersModels=['id','codigo','nombre','descripcion','activo','orden','actualizado'];
const headersVariants=['id','modelo','sku','nombre','color','hex','detal','mayor','activo','imagen','drive_id','imagen_original','actualizado'];
function cfg(){if(!SHEET||!EMAIL||!KEY)throw Object.assign(new Error('Configura GLOD_SHEET_ID y credenciales Google en Vercel'),{status:503})}
function b64(x){return Buffer.from(x).toString('base64url')}
async function googleToken(){cfg();let now=Math.floor(Date.now()/1000);const head=b64(JSON.stringify({alg:'RS256',typ:'JWT'}));const body=b64(JSON.stringify({iss:EMAIL,scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500}));let raw=head+'.'+body;let signature=crypto.sign('RSA-SHA256',Buffer.from(raw),KEY).toString('base64url');let resp=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:raw+'.'+signature})});let j=await resp.json();if(!resp.ok)throw Object.assign(new Error('Google OAuth: '+(j.error_description||j.error||resp.status)),{status:502});return j.access_token}
async function api(url,method='GET',data,token){let h={authorization:'Bearer '+(token||await googleToken())};if(data!==undefined)h['content-type']='application/json';let r=await fetch(url,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});let t=await r.text();let j;try{j=JSON.parse(t)}catch{j={error:{message:t.slice(0,400)}}}if(!r.ok)throw Object.assign(new Error(j.error?.message||'Google API '+r.status),{status:r.status===404?404:502});return j}
function range(name,part='A1:O1000'){return encodeURIComponent("'"+name+"'!"+part)}
function baseUrl(){return 'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(SHEET)}
async function values(name){const j=await api(baseUrl()+'/values/'+range(name));return j.values||[]}
async function writeRange(name,a1,rows){return api(baseUrl()+'/values/'+range(name,a1)+'?valueInputOption=RAW','PUT',{values:rows})}
async function append(name,rows){return api(baseUrl()+'/values/'+range(name,'A1:O1000')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',{values:rows})}
async function ensureTabs(){cfg();const meta=await api(baseUrl()+'?fields=sheets.properties.title');const existing=new Set((meta.sheets||[]).map(s=>s.properties.title));const missing=['Modelos','Variantes'].filter(x=>!existing.has(x));if(missing.length)await api(baseUrl()+':batchUpdate','POST',{requests:missing.map(title=>({addSheet:{properties:{title}}}))});for(const [name,columns] of [['Modelos',headersModels],['Variantes',headersVariants]]){const data=await values(name);if(!data.length)await writeRange(name,'A1:'+String.fromCharCode(64+columns.length)+'1',[columns])}}
function obj(row,cols){let x={};cols.forEach((c,i)=>{x[c]=row[i]??''});return x}
async function records(name){const rows=await values(name);const cols=name==='Modelos'?headersModels:headersVariants;return rows.slice(1).map((r,i)=>({...obj(r,cols),_row:i+2})).filter(x=>x.id)}
async function writeRecord(name,record,row){const cols=name==='Modelos'?headersModels:headersVariants;let arr=cols.map(c=>record[c]??'');if(row)await writeRange(name,'A'+row+':'+String.fromCharCode(64+cols.length)+row,[arr]);else await append(name,[arr])}
function active(x){return ['true','1','activo','si','sí'].includes(String(x).toLowerCase())}
function publicItems(models,variants){const map=new Map(models.filter(x=>active(x.activo)).map(x=>[x.codigo,x]));return variants.filter(x=>active(x.activo)&&map.has(x.modelo)).map(x=>{const m=map.get(x.modelo);return {modelo:x.modelo,nombre:x.nombre||m.nombre,sku:x.sku,color:x.color,hex:x.hex||'#777777',detal:x.detal===''?null:Number(x.detal),mayor:x.mayor===''?null:Number(x.mayor),imagen:x.imagen_original||x.imagen,imagen_web:x.imagen||x.imagen_original}})}
function validCode(x){return /^[A-Z0-9_-]{2,32}$/.test(String(x||''))}
function sign(v){return crypto.createHmac('sha256',process.env.GLOD_SESSION_SECRET||'').update(v).digest('base64url')}
function auth(req){const secret=process.env.GLOD_SESSION_SECRET;if(!secret)return false;let v=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(x=>x.startsWith('glod_admin='))?.slice(11);if(!v)return false;const k=v.lastIndexOf('.');if(k<0)return false;let payload=v.slice(0,k),mac=v.slice(k+1);const expected=sign(payload);if(mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return false;try{let j=JSON.parse(Buffer.from(payload,'base64url').toString());return j.u===process.env.GLOD_ADMIN_USERNAME&&Date.now()<j.exp}catch{return false}}
function safeOrigin(req){const o=req.headers.origin;if(!o)return true;try{return new URL(o).host===req.headers.host}catch{return false}}
function json(res,status,data){res.status(status).setHeader('cache-control','no-store').json(data)}
function fail(res,e){json(res,e.status||500,{error:e.message||'Error interno'})}
module.exports={SHEET,EMAIL,KEY,headersModels,headersVariants,b64,googleToken,api,values,writeRange,append,ensureTabs,records,writeRecord,active,publicItems,validCode,sign,auth,safeOrigin,json,fail};
