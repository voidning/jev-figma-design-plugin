import {AckQueue,collectSpeech,isStopPhrase} from './voice-queue';

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const command=$<HTMLTextAreaElement>('command');
const mic=$<HTMLButtonElement>('mic');
const execute=$<HTMLButtonElement>('jevExecute');
const undo=$<HTMLButtonElement>('undo');
const keyInput=$<HTMLInputElement>('apiKey');
const status=$<HTMLDivElement>('status');
const steps=$<HTMLOListElement>('voiceSteps');
const interim=$<HTMLDivElement>('interim');
const settings=$<HTMLButtonElement>('settingsToggle');
const connection=$<HTMLElement>('connection');
const anchor=$<HTMLButtonElement>('anchor');
const history=$<HTMLElement>('history');
const post=(type:string,data:Record<string,unknown>={})=>parent.postMessage({pluginMessage:{type,...data}},'*');
const stepStatus=new Map<number,HTMLElement>();
let stepId=0;
const queue=new AckQueue<{id:number;text:string}>(next=>post('auto',{text:next.text,stepId:next.id}));

function message(text:string,kind=''){
  history.hidden=false;
  status.textContent=text;
  status.className='status '+kind;
}
function showConnection(show:boolean){
  connection.hidden=!show;
  settings.setAttribute('aria-expanded',String(show));
  settings.setAttribute('aria-label',show?'关闭 Jev 连接设置':'打开 Jev 连接设置');
  if(show)keyInput.focus();
  else settings.focus();
}
settings.addEventListener('click',()=>showConnection(connection.hidden));
function connected(ready:boolean,serviceOnline=true){
  $('connectionStatus').textContent=ready?'本机 Jev 已配置':serviceOnline?'输入 TypeSafe API Key':'先启动本机 Jev 服务';
  settings.classList.toggle('ready',ready);
  settings.classList.toggle('offline',!ready&&!serviceOnline);
  settings.title=ready?'Jev 已连接，点击可修改 Key':serviceOnline?'配置 TypeSafe API Key':'本机 Jev 服务未连接';
  execute.disabled=!ready;
  mic.disabled=!ready||!Speech;
  mic.classList.toggle('available',ready&&!!Speech);
  if(ready&&!connection.hidden)showConnection(false);
}
async function refreshConnection(){
  try{
    const response=await fetch('http://localhost:8788/health');
    const health=await response.json() as {ready?:boolean};
    connected(response.ok&&health.ready===true);
  }catch{connected(false,false);}
}

// The key crosses the plugin UI once, directly to localhost. It is never sent to Figma's main plugin code.
$<HTMLFormElement>('keyForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const key=keyInput.value.trim();
  if(!key){message('请输入 TypeSafe API Key。','error');keyInput.focus();return;}
  const save=$<HTMLButtonElement>('saveKey');
  save.disabled=true;
  try{
    const response=await fetch('http://localhost:8788/config',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})
    });
    const result=await response.json() as {error?:string};
    if(!response.ok)throw Error(result.error||'连接失败。');
    keyInput.value='';
    connected(true);
    message('Key 已提交到本机服务；发送指令时会验证。','success');
  }catch(error){
    message(error instanceof TypeError?'无法连接本机服务；请先运行 npm run jev。':
      error instanceof Error?error.message:'连接失败。','error');
  }finally{save.disabled=false;}
});
void refreshConnection();

anchor.addEventListener('click',()=>message('按住左侧定位图标，拖出插件窗口并放到画布空白处。'));
anchor.addEventListener('dragend',event=>{
  const drag=event as DragEvent;
  // Figma's pluginDrop protocol uses dragend only after the cursor leaves the UI.
  // A drag released inside the plugin has view.length === 0 (Figma's documented guard).
  if(drag.view?.length===0){message('请把创建位置拖出插件窗口，再放到画布空白处。');return;}
  parent.postMessage({pluginDrop:{clientX:drag.clientX,clientY:drag.clientY,
    items:[{type:'text/plain',data:'creation-anchor'}],
    dropMetadata:{kind:'creation-anchor'}}},'*');
  message('正在等待 Figma 确认画布位置…');
});

window.addEventListener('message',async event=>{
  const request=event.data?.pluginMessage;
  if(request?.type!=='jevRequest')return;
  try{
    const response=await fetch('http://localhost:8788/interpret',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:request.text,context:request.context}),
      signal:AbortSignal.timeout(45000)
    });
    let payload:unknown;
    try{payload=await response.json();}
    catch{payload={error:`Jev 服务返回了无效响应（HTTP ${response.status}）。`};}
    if(response.status===503)void refreshConnection();
    post('jevReply',{id:request.id,ok:response.ok,status:response.status,payload});
  }catch{
    connected(false,false);
    post('jevReply',{id:request.id,networkError:true});
  }
});

execute.addEventListener('click',()=>{
  const text=command.value.trim();
  if(!text){message('请先说出或输入指令。','error');command.focus();return;}
  message('Jev 正在判断并执行…');
  post('auto',{text});
});
command.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){
    event.preventDefault();execute.click();
  }
});
undo.addEventListener('click',()=>post('undo'));

window.addEventListener('message',event=>{
  const result=event.data?.pluginMessage;
  if(!result)return;
  if(result.type==='jevStatus'){
    if(result.ready===true)connected(true);
    else void refreshConnection();
  }
  if(result.type==='context'){
    $('selectionStatus').textContent=result.count?`已选 ${result.count} 个对象`:'未选中对象';
    anchor.classList.toggle('placed',!!result.anchor);
    anchor.title=result.anchor?`创建位置 ${result.anchor}；拖动可重设`:'拖到画布空白处，设定“这里”';
    anchor.setAttribute('aria-label',result.anchor?`创建位置 ${result.anchor}，拖动可重设`:'创建位置：拖到 Figma 画布空白处');
    undo.disabled=!result.canUndo;
  }
  if(result.type==='autoPlan'&&typeof result.stepId==='number'){
    stepStatus.get(result.stepId)?.replaceChildren(document.createTextNode(' · 将执行：'+result.rows.join('；')));
  }
  if(result.type==='done'){
    message(result.message,'success');
    undo.disabled=!result.canUndo;
    if(typeof result.stepId==='number')finishStep(result.stepId,' · '+result.message);
  }
  if(result.type==='error'){
    message(result.message,'error');
    if(typeof result.stepId==='number')finishStep(result.stepId,' · 失败：'+result.message);
  }
});
function finishStep(id:number,text:string){
  stepStatus.get(id)?.replaceChildren(document.createTextNode(text));
  queue.finish();
}

type SpeechCtor=new()=>SpeechRecognition;
interface SpeechRecognition {
  lang:string;continuous:boolean;interimResults:boolean;
  onresult:((event:any)=>void)|null;onerror:((event:any)=>void)|null;onend:(()=>void)|null;
  start():void;stop():void;
}
const Speech=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition as SpeechCtor|undefined;
let listening=false,wantListening=false;
let recognition:SpeechRecognition|null=null;
if(!Speech){mic.title='此窗口不支持语音输入，可使用系统听写或文字输入';mic.setAttribute('aria-label',mic.title);mic.disabled=true;}
else{
  mic.title='点击后持续聆听，说“停”结束';
  mic.addEventListener('click',()=>{
    if(listening){wantListening=false;recognition?.stop();message('已停止聆听；已接收的指令会继续执行。');return;}
    try{
      const rec=new Speech();recognition=rec;rec.lang='zh-CN';rec.continuous=true;rec.interimResults=true;
      const seenFinal=new Set<number>();wantListening=true;
      rec.onresult=(event:any)=>{
        if(!wantListening)return;
        const result=collectSpeech(event.results,event.resultIndex,seenFinal);
        for(const transcript of result.final){
          if(isStopPhrase(transcript)){
            wantListening=false;rec.stop();message('已停止聆听；已接收的指令会继续执行。','success');break;
          }
          const id=++stepId;
          const item=document.createElement('li');
          const button=document.createElement('button');button.type='button';button.textContent=transcript;
          button.title='载入这句到输入框';
          button.addEventListener('click',()=>{command.value=transcript;command.focus();});
          const state=document.createElement('span');state.textContent=' · 等待 Jev 判断';
          stepStatus.set(id,state);item.append(button,state);steps.append(item);
          history.hidden=false;
          command.value=transcript;queue.enqueue({id,text:transcript});
        }
        interim.textContent=result.interim?'临时转写：'+result.interim:'';
      };
      rec.onerror=(event:any)=>{
        if(['not-allowed','service-not-allowed','audio-capture'].includes(event.error))wantListening=false;
        message(`语音输入失败：${event.error||'未知错误'}。可改用文字输入。`,'error');
      };
      rec.onend=()=>{
        listening=false;interim.textContent='';mic.classList.remove('active');
        mic.setAttribute('aria-label','开始语音输入');
        if(wantListening){
          try{seenFinal.clear();rec.start();listening=true;mic.classList.add('active');
            mic.setAttribute('aria-label','停止语音输入');}
          catch{wantListening=false;message('语音识别已结束，请重新点击麦克风。','error');}
        }
      };
      rec.start();listening=true;mic.classList.add('active');
      mic.setAttribute('aria-label','停止语音输入');message('正在听，请说出指令…');
    }catch{wantListening=false;message('无法启动麦克风；可使用系统听写或文字输入。','error');mic.disabled=true;mic.classList.remove('available');}
  });
}

// Resize the Figma window when visible content changes, including settings and history.
const app=document.querySelector<HTMLElement>('.app')!;
let lastHeight=0;
const resize=()=>{
  const height=Math.max(220,Math.min(640,Math.ceil(app.getBoundingClientRect().height)));
  if(height!==lastHeight){lastHeight=height;post('resizeUI',{height});}
};
new ResizeObserver(resize).observe(app);
resize();
