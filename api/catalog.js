'use strict';
// Public catalog endpoint. Server-only environment variables; no credentials in source.
module.exports = async function catalog(req,res) {
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Método no permitido'});
 const url=process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!url||!/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(url)||!key||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)){
  res.setHeader('Cache-Control','no-store');
  return res.status(503).json({error:'Catálogo temporalmente no disponible'});
 }
 const base=url.replace(/\/$/,'');
 try{
  const headers={apikey:key,Accept:'application/json'};
  const endpoints=[
   '/rest/v1/glod_models?select=codigo,nombre,descripcion&activo=eq.true',
   '/rest/v1/glod_variants?select=modelo,sku,nombre,color,hex,detal,mayor,imagen,imagen_original,storage_path&activo=eq.true&order=sku.asc'
  ];
  const responses=await Promise.all(endpoints.map(path=>fetch(base+path,{
   headers,signal:AbortSignal.timeout(12000),cache:'no-store'
  })));
  if(responses.some(r=>!r.ok))throw Error('Upstream error');
  const [models,variants]=await Promise.all(responses.map(r=>r.json()));
  const map=new Map(models.map(x=>[x.codigo,x]));
  const items=variants.filter(x=>map.has(x.modelo)).map(x=>({
   ...x,nombre:x.nombre||map.get(x.modelo).nombre,
   imagen_web:x.storage_path?.startsWith('products/')
    ?base+'/storage/v1/object/public/glod-catalog/'+encodeURI(x.storage_path)
    :(x.imagen||'')
  }));
  res.setHeader('Cache-Control','public,s-maxage=30,stale-while-revalidate=120');
  return res.status(200).json({items,source:'supabase'});
 }catch{
  res.setHeader('Cache-Control','no-store');
  return res.status(503).json({error:'Catálogo temporalmente no disponible'});
 }
};
