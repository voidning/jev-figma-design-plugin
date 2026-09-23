import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridge} from './jev.mjs';

test('plugin config keeps the API key in local server memory and never returns it',async()=>{
  const server=createBridge('');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  const url=`http://127.0.0.1:${address.port}`;
  try{
    const before=await (await fetch(url+'/health')).json();
    assert.deepEqual(before,{model:'jev-latest',ready:false});
    const saved=await fetch(url+'/config',{method:'POST',headers:{'Content-Type':'application/json',Origin:'null'},
      body:JSON.stringify({key:'local-test-secret'})});
    assert.equal(saved.status,200);
    assert.equal(saved.headers.get('access-control-allow-origin'),'null');
    assert.deepEqual(await saved.json(),{ready:true});
    const health=await (await fetch(url+'/health')).text();
    assert.equal(JSON.parse(health).ready,true);
    assert.equal(health.includes('local-test-secret'),false);
    const refused=await fetch(url+'/config',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},
      body:JSON.stringify({key:'wrong'})});
    assert.equal(refused.status,403);
    const invalid=await fetch(url+'/config',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:''})});
    assert.equal(invalid.status,422);
    assert.equal((await (await fetch(url+'/health')).json()).ready,true);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
