import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {interpretWithJev} from './interpret.mjs';

const allowedOrigins=new Set(['null','https://www.figma.com','https://figma.com']);

/** The key is held by this local process only, never written to a file or returned to the plugin. */
export function createBridge(initialKey=process.env.TYPESAFE_API_KEY||''){
  let apiKey=initialKey;
  return http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    if(origin&&allowedOrigins.has(origin))res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    if(origin&&!allowedOrigins.has(origin)){res.writeHead(403).end();return;}
    if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
    if(req.method==='GET'&&req.url==='/health'){
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'})
        .end(JSON.stringify({model:'jev-latest',ready:!!apiKey}));return;
    }
    if(req.method!=='POST'||!['/config','/interpret'].includes(req.url)){res.writeHead(404).end();return;}
    if(req.headers['content-type']?.split(';')[0]!=='application/json'){res.writeHead(415).end();return;}
    try{
      let body='';
      for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error('请求过长。');}
      const payload=JSON.parse(body);
      if(req.url==='/config'){
        if(typeof payload.key!=='string'||!payload.key.trim()||payload.key.length>512)
          throw Error('请输入有效的 TypeSafe API Key。');
        apiKey=payload.key.trim();
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'})
          .end(JSON.stringify({ready:true}));return;
      }
      const result=await interpretWithJev(payload.text,apiKey,payload.context);
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(result));
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      const status=message.includes('TYPESAFE_API_KEY')?503:422;
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({error:message}));
    }
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  createBridge().listen(8788,'localhost',()=>console.log('Jev bridge listening on http://localhost:8788'));
}
