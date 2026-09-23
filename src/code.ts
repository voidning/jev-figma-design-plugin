import {parse, type Intent} from './parser';
import {interpret,type JevReply} from './jev';
import {conversationContext,executeLive,undoLive} from './live-edit';
import {anchorLabel,applyWorkflow,hasWorkflowUndo,isWorkflow,previewWorkflow,recordDrop,undoWorkflow,type WorkflowPreview} from './workflow';

type Plan = {intent:Intent; ids:string[]; rows:string[]; key:string;workflow?:WorkflowPreview};
let pending:Plan|null=null;
let canUndo=false;
const undoOrder:('workflow'|'regular'|'live')[]=[];
const processedVoiceSteps=new Set<number>();
figma.showUI(__html__,{width:400,height:260,themeColors:true});
const send=(type:string,data:Record<string,unknown>={})=>figma.ui.postMessage({type,...data});
const selected=()=>figma.currentPage.selection;
const path=(n:SceneNode)=>{const names:string[]=[n.name];let p=n.parent;while(p&&p.type!=='PAGE'&&p.type!=='DOCUMENT'){names.unshift(p.name);p=p.parent;}return names.join(' / ');};
const label=(n:SceneNode)=>`${n.name} · ${n.type}`;
const isAuto=(n:SceneNode):n is FrameNode|ComponentNode|InstanceNode=>('layoutMode' in n && n.layoutMode!=='NONE' && n.layoutMode!=='GRID');
const isSized=(n:SceneNode):n is SceneNode & LayoutMixin => 'resize' in n && 'width' in n;
const siblings=(nodes:readonly SceneNode[])=>nodes.length>0 && nodes.every(n=>n.parent===nodes[0].parent);
function context(){
  const nodes=selected();
  send('context',{items:nodes.map(n=>({id:n.id,name:n.name,path:path(n),type:n.type,parent:n.parent?.type==='PAGE'?'Page':n.parent?.name,layout:'layoutMode' in n?n.layoutMode:undefined,size:'width' in n?`${Math.round(n.width)} × ${Math.round(n.height)}`:undefined,variant:n.type==='INSTANCE'?n.variantProperties:undefined})),count:nodes.length,anchor:anchorLabel(),canUndo:undoOrder.length>0});
}
figma.on('selectionchange',()=>{pending=null;send('clearPlan');context();});
figma.on('drop',event=>{if(event.dropMetadata?.kind==='creation-anchor'&&event.node.type!=='PAGE'){send('error',{message:'请把创建位置拖到当前页面的空白画布。'});return false;}if(recordDrop(event)){undoOrder.push('workflow');pending=null;send('clearPlan');context();send('done',{message:`创建位置已设为 ${anchorLabel()}。现在可以说“在这里加一个圆”。`,canUndo:true});return false;}return true;});
// The UI owns localhost access: it is the same connection used to save the Key.
let jevRequestId=0;
const jevPending=new Map<number,{resolve:(reply:JevReply)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
function requestJev(text:string,context:Awaited<ReturnType<typeof conversationContext>>):Promise<JevReply>{
  return new Promise((resolve,reject)=>{
    const id=++jevRequestId;
    const timer=setTimeout(()=>{jevPending.delete(id);reject(Error('本机 Jev 服务响应超时，本步未执行。'));},50000);
    jevPending.set(id,{resolve,reject,timer});
    send('jevRequest',{id,text,context});
  });
}
context();
async function plan(intent:Intent,nodes:readonly SceneNode[]):Promise<string[]>{
  if(!nodes.length) throw Error('请先在画布中选择目标图层。');
  const rows:string[]=[];
  if(intent.kind==='align' && nodes.length>1){
    if(!siblings(nodes)) throw Error('多选对齐需要同一父级下的图层。');
    if(nodes.some(n=>n.parent && 'layoutMode' in n.parent && n.parent.layoutMode!=='NONE')) throw Error('Auto Layout 子层请调整父级对齐。');
    rows.push(`${nodes.length} 个图层${intent.axis==='horizontal'?'水平':'垂直'}${intent.value==='MIN'?'起点对齐':intent.value==='MAX'?'终点对齐':'居中对齐'}`);return rows;
  }
  if(intent.kind==='distribute'){
    if(nodes.length<3||!siblings(nodes)) throw Error('等距分布需要选中同一父级下至少 3 个图层。');
    if(nodes.some(n=>n.parent && 'layoutMode' in n.parent && n.parent.layoutMode!=='NONE')) throw Error('Auto Layout 子层由布局管理；请调整父级间距。');
    if(nodes.some(n=>!isSized(n))) throw Error('选区包含不可定位的节点。');
    rows.push(`${nodes.length} 个图层沿${intent.value==='horizontal'?'水平':'垂直'}方向等距分布，保持首尾位置`);
    return rows;
  }
  if(intent.kind==='rename' && nodes.length>1 && !intent.pattern.includes('{n}')) throw Error('批量重命名请在名称中加入 {n} 序号，例如“按钮 {n}”。');
  const styles=intent.kind==='style' ? await Promise.all([figma.getLocalTextStylesAsync(),figma.getLocalPaintStylesAsync()]):null;
  const vars=intent.kind==='variable' ? await figma.variables.getLocalVariablesAsync():null;
  for(let i=0;i<nodes.length;i++){
    const n=nodes[i];
    switch(intent.kind){
      case 'direction': if(!('layoutMode' in n)) throw Error(`${label(n)} 不支持 Auto Layout。`); rows.push(`${label(n)}：布局方向 → ${intent.value==='HORIZONTAL'?'横向':'纵向'}`);break;
      case 'gap': case 'padding': if(!isAuto(n)) throw Error(`${label(n)} 不是已启用的 Auto Layout。`); rows.push(`${label(n)}：${intent.kind==='gap'?'间距':'四边内边距'} → ${intent.value} px`);break;
      case 'width':case 'height': if(!isSized(n)||n.type==='INSTANCE') throw Error(`${label(n)} 不支持直接改尺寸；实例请使用组件变体。`); rows.push(`${label(n)}：${intent.kind==='width'?'宽度':'高度'} → ${intent.value} px`);break;
      case 'align': if(isAuto(n)) rows.push(`${label(n)}：${intent.axis==='horizontal'?'水平':'垂直'}子项对齐 → ${intent.value}`); else throw Error(`${label(n)} 不是 Auto Layout；请选中父级容器。`);break;
      case 'style':{
        const matches=[...styles![0],...styles![1]].filter(s=>s.name.toLowerCase()===intent.name.toLowerCase());
        if(matches.length!==1) throw Error(`本地样式“${intent.name}”${matches.length?'有重名':'未找到'}。`);
        const s=matches[0]; if(s.type==='TEXT'&&n.type!=='TEXT') throw Error(`${label(n)} 不是文字图层。`);
        if(s.type==='PAINT'&&!('fills' in n)) throw Error(`${label(n)} 不支持填充样式。`);
        rows.push(`${label(n)}：应用本地${s.type==='TEXT'?'文字':'填充'}样式 ${s.name}`);break;
      }
      case 'variable':{
        const matches=vars!.filter(v=>v.name.toLowerCase()===intent.name.toLowerCase());
        if(matches.length!==1) throw Error(`本地数值变量“${intent.name}”${matches.length?'有重名':'未找到'}。`);
        if(matches[0].resolvedType==='FLOAT' && !isAuto(n)) throw Error(`${label(n)} 需为 Auto Layout，才能绑定数值变量。`);
        if(matches[0].resolvedType==='COLOR'){if(!('fills' in n)) throw Error(`${label(n)} 不支持填充颜色。`);const fills=n.fills;if(fills===figma.mixed||!fills.some(p=>p.type==='SOLID')) throw Error(`${label(n)} 没有可绑定的纯色填充。`);}
        if(!['FLOAT','COLOR'].includes(matches[0].resolvedType)) throw Error('目前仅支持数值和颜色变量。');
        rows.push(`${label(n)}：${matches[0].resolvedType==='COLOR'?'填充颜色':'间距'}绑定到本地变量 ${matches[0].name}`);break;
      }
      case 'sizing':{if(!('layoutSizingHorizontal' in n)) throw Error(`${label(n)} 不支持 Hug/Fill。`);if(intent.value==='FILL'&&(!n.parent||!('layoutMode' in n.parent)||n.parent.layoutMode==='NONE'||n.parent.layoutMode==='GRID')) throw Error(`${label(n)} 的 Fill 需要 Auto Layout 父级。`);if(intent.value==='HUG'&&!isAuto(n)&&n.type!=='TEXT') throw Error(`${label(n)} 的 Hug 需要 Auto Layout 容器或文字。`);rows.push(`${label(n)}：${intent.axis==='horizontal'?'宽度':'高度'} → ${intent.value}`);break;}
      case 'variant':{if(n.type!=='INSTANCE') throw Error(`${label(n)} 不是组件实例。`);const target=await namedVariant(n,intent.value);if(!target) throw Error(`${label(n)} 找不到匹配的 ${intent.value} 变体。`);rows.push(`${label(n)}：切换到 ${target.name}`);break;}
      case 'rename': rows.push(`${label(n)} → ${intent.pattern.replaceAll('{n}',String(i+1))}`);break;
      case 'smaller':{const d=await smallerDecision(n);rows.push(`${d.preview} · 来源：${d.source}`);break;}
    }
  }
  return rows;
}
async function namedVariant(n:InstanceNode,value:string):Promise<ComponentNode|null>{
  const main=await n.getMainComponentAsync();if(!main||main.parent?.type!=='COMPONENT_SET') return null;
  const props=n.variantProperties||{};
  const aliases:Record<string,string>={小号:'small',中号:'medium',大号:'large',次要:'secondary',主要:'primary'};
  const wanted=(aliases[value.toLowerCase()]||value).toLowerCase();
  return main.parent.children.find(c=>c.type==='COMPONENT' && Object.entries(c.variantProperties||{}).some(([k,v])=>v.toLowerCase()===wanted && Object.entries(props).every(([other,old])=>other===k||c.variantProperties?.[other]===old))) as ComponentNode|undefined||null;
}
function similarName(name:string){return name.toLowerCase().replace(/\b(?:small|medium|large|sm|md|lg)\b|小号|中号|大号|[0-9]+/g,'').replace(/[\s_\-]+/g,'').trim();}
function filePadding(n:FrameNode|ComponentNode|InstanceNode):{value:number;example:string}|null{
  if(n.layoutSizingVertical!=='HUG'||!n.parent||!('children' in n.parent)) return null;
  const peers=n.parent.children.filter(p=>p!==n&&p.type===n.type&&'layoutMode' in p&&p.layoutMode===n.layoutMode&&similarName(p.name)===similarName(n.name)) as typeof n[];
  const shorter=peers.filter(p=>p.height<n.height&&p.height>=n.height*.75&&p.paddingTop<=n.paddingTop&&p.paddingBottom<=n.paddingBottom).sort((a,b)=>b.height-a.height)[0];
  if(!shorter)return null;
  return {value:Math.max(0,n.paddingTop-(n.height-shorter.height)/2),example:shorter.name};
}
async function smallerDecision(n:SceneNode):Promise<{mode:'variant'|'padding'|'resize';target?:ComponentNode;value?:number;source:string;preview:string}>{
  if(n.type==='INSTANCE') {const target=await smallVariant(n);if(target){const main=await n.getMainComponentAsync();return {mode:'variant',target,source:'组件尺寸变体',preview:`${label(n)}：${main?.name||'当前变体'} → ${target.name}`};}}
  if(isAuto(n)&&n.type!=='INSTANCE'){
    const fromFile=filePadding(n);
    if(fromFile)return {mode:'padding',value:fromFile.value,source:`参考当前文件：${fromFile.example}`,preview:`${label(n)}：上/下内边距 ${n.paddingTop}/${n.paddingBottom} → ${fromFile.value}/${Math.max(0,n.paddingBottom-(n.paddingTop-fromFile.value))} px`};
    if(n.paddingTop===0&&n.paddingRight===0&&n.paddingBottom===0&&n.paddingLeft===0)throw Error(`${label(n)} 已无内边距可缩小；请指定宽度/高度或选择较小变体。`);
    return {mode:'padding',value:Math.max(0,n.paddingTop-2),source:'插件建议值',preview:`${label(n)}：四边内边距各减少 2 px（下限 0）`};
  }
  if(isSized(n)&&n.type!=='TEXT')return {mode:'resize',source:'插件建议值',preview:`${label(n)}：${Math.round(n.width)}×${Math.round(n.height)} → ${Math.max(1,Math.round(n.width*.9))}×${Math.max(1,Math.round(n.height*.9))} px`};
  throw Error(`${label(n)} 无法安全判断缩小方式；可指定宽高，或选择较小组件变体。`);
}
function measure(n:SceneNode,intent:Intent):string{
  if(intent.kind==='direction'&&'layoutMode' in n)return n.layoutMode;
  if(intent.kind==='distribute')return `x=${Math.round(n.x)}, y=${Math.round(n.y)}`;
  if(intent.kind==='gap'&&'itemSpacing' in n)return `${n.itemSpacing} px`;
  if(intent.kind==='padding'&&'paddingTop' in n)return `${n.paddingTop}/${n.paddingRight}/${n.paddingBottom}/${n.paddingLeft} px`;
  if(intent.kind==='align'&&!isAuto(n))return `x=${Math.round(n.x)}, y=${Math.round(n.y)}`;
  if(intent.kind==='align'&&isAuto(n)){const isCross=(n.layoutMode==='HORIZONTAL'&&intent.axis==='vertical')||(n.layoutMode==='VERTICAL'&&intent.axis==='horizontal');return isCross?n.counterAxisAlignItems:n.primaryAxisAlignItems;}
  if(intent.kind==='sizing'&&'layoutSizingHorizontal' in n)return intent.axis==='horizontal'?n.layoutSizingHorizontal:n.layoutSizingVertical;
  if(intent.kind==='rename')return n.name;
  if(intent.kind==='style'){if(n.type==='TEXT')return `文字样式 ${String(n.textStyleId)}`;if('fillStyleId' in n)return `填充样式 ${String(n.fillStyleId)}`;}
  if(intent.kind==='variable'){if('boundVariables' in n){const v=n.boundVariables;if(v?.itemSpacing)return `间距变量 ${v.itemSpacing.id}`;}if('fills' in n&&n.fills!==figma.mixed){const paint=n.fills.find(p=>p.type==='SOLID') as SolidPaint|undefined;const id=paint?.boundVariables?.color?.id;if(id)return `颜色变量 ${id}`;}return '未绑定';}
  if(intent.kind==='variant'&&n.type==='INSTANCE')return JSON.stringify(n.variantProperties);
  return `${Math.round(n.width)}×${Math.round(n.height)} px`;
}
async function smallVariant(n:InstanceNode):Promise<ComponentNode|null>{
  const main=await n.getMainComponentAsync();
  if(!main||main.parent?.type!=='COMPONENT_SET') return null;
  const props=n.variantProperties||{};
  const sizeKey=Object.keys(props).find(k=>/^(size|尺寸)$/i.test(k));
  if(!sizeKey||/^(small|sm)$/i.test(props[sizeKey]||'')) return null;
  return main.parent.children.find(c=>c.type==='COMPONENT' && c.variantProperties?.[sizeKey]?.toLowerCase()==='small' && Object.entries(props).every(([k,v])=>k===sizeKey||c.variantProperties?.[k]===v)) as ComponentNode|undefined || null;
}
async function apply(intent:Intent,nodes:readonly SceneNode[]){
  if(intent.kind==='align' && nodes.length>1){
    const axis=intent.axis==='horizontal'?'x':'y', size=intent.axis==='horizontal'?'width':'height';
    const start=Math.min(...nodes.map(n=>n[axis]));const end=Math.max(...nodes.map(n=>n[axis]+n[size]));const center=(start+end)/2;
    for(const n of nodes)n[axis]=intent.value==='MIN'?start:intent.value==='MAX'?end-n[size]:center-n[size]/2;
    return;
  }
  if(intent.kind==='distribute'){
    const axis=intent.value==='horizontal'?'x':'y', size=intent.value==='horizontal'?'width':'height';
    const ordered=[...nodes].sort((a,b)=>(a as any)[axis]-(b as any)[axis]);
    const first=ordered[0] as SceneNode & LayoutMixin, last=ordered[ordered.length-1] as SceneNode & LayoutMixin;
    const total=(last as any)[axis]+(last as any)[size]-(first as any)[axis];
    const widths=ordered.reduce((s,n)=>s+(n as any)[size],0);
    const gap=(total-widths)/(ordered.length-1);
    if(gap<0) throw Error('图层重叠过多，无法保持首尾位置并等距分布。');
    let pos=(first as any)[axis];
    for(const n of ordered){(n as any)[axis]=pos;pos+=(n as any)[size]+gap;}
    return;
  }
  const styles=intent.kind==='style'?await Promise.all([figma.getLocalTextStylesAsync(),figma.getLocalPaintStylesAsync()]):null;
  const variable=intent.kind==='variable'?(await figma.variables.getLocalVariablesAsync()).find(v=>v.name.toLowerCase()===intent.name.toLowerCase()):null;
  for(let i=0;i<nodes.length;i++){
    const n=nodes[i];
    switch(intent.kind){
      case 'direction': (n as FrameNode).layoutMode=intent.value;break;
      case 'gap': (n as FrameNode).itemSpacing=intent.value;break;
      case 'padding':{const a=n as FrameNode;a.paddingTop=a.paddingRight=a.paddingBottom=a.paddingLeft=intent.value;break;}
      case 'width':{const a=n as SceneNode & LayoutMixin;if('layoutSizingHorizontal' in a && a.layoutSizingHorizontal!=='FIXED') a.layoutSizingHorizontal='FIXED';a.resize(intent.value,a.height);break;}
      case 'height':{const a=n as SceneNode & LayoutMixin;if('layoutSizingVertical' in a && a.layoutSizingVertical!=='FIXED') a.layoutSizingVertical='FIXED';a.resize(a.width,intent.value);break;}
      case 'align':{const a=n as FrameNode;const isCross=(a.layoutMode==='HORIZONTAL'&&intent.axis==='vertical')||(a.layoutMode==='VERTICAL'&&intent.axis==='horizontal');if(isCross)a.counterAxisAlignItems=intent.value;else a.primaryAxisAlignItems=intent.value;break;}
      case 'style':{
        const s=[...styles![0],...styles![1]].find(x=>x.name.toLowerCase()===intent.name.toLowerCase())!;
        if(s.type==='TEXT') await (n as TextNode).setTextStyleIdAsync(s.id);
        else await (n as GeometryMixin).setFillStyleIdAsync(s.id);break;
      }
      case 'variable':{if(variable!.resolvedType==='FLOAT')(n as FrameNode).setBoundVariable('itemSpacing',variable!);else {const a=n as SceneNode & GeometryMixin;const fills=a.fills;if(fills===figma.mixed) throw Error('混合填充无法绑定颜色变量。');const index=fills.findIndex(p=>p.type==='SOLID');if(index<0) throw Error('目标没有可绑定的纯色填充。');const copy=[...fills];copy[index]=figma.variables.setBoundVariableForPaint(copy[index] as SolidPaint,'color',variable!);a.fills=copy;}break;}
      case 'sizing':{const a=n as FrameNode;if(intent.axis==='horizontal')a.layoutSizingHorizontal=intent.value;else a.layoutSizingVertical=intent.value;break;}
      case 'variant':(n as InstanceNode).swapComponent((await namedVariant(n as InstanceNode,intent.value))!);break;
      case 'rename':n.name=intent.pattern.replaceAll('{n}',String(i+1));break;
      case 'smaller':{
        const d=await smallerDecision(n);
        if(d.mode==='variant') (n as InstanceNode).swapComponent(d.target!);
        else if(d.mode==='padding'){
          const a=n as FrameNode;
          if(d.source.startsWith('参考当前文件')){const delta=a.paddingTop-d.value!;a.paddingTop=d.value!;a.paddingBottom=Math.max(0,a.paddingBottom-delta);}
          else {a.paddingTop=Math.max(0,a.paddingTop-2);a.paddingRight=Math.max(0,a.paddingRight-2);a.paddingBottom=Math.max(0,a.paddingBottom-2);a.paddingLeft=Math.max(0,a.paddingLeft-2);}
        }else {const a=n as SceneNode & LayoutMixin;a.resize(Math.max(1,Math.round(a.width*.9)),Math.max(1,Math.round(a.height*.9)));}
        break;
      }
    }
  }
}
figma.ui.onmessage=async msg=>{
  try{
    if(msg.type==='resizeUI'){
      if(Number.isInteger(msg.height)&&msg.height>=220&&msg.height<=640)figma.ui.resize(400,msg.height);
      return;
    }
    if(msg.type==='refresh'){context();return;}
    if(msg.type==='jevReply'){
      const pending=jevPending.get(msg.id);
      if(!pending)return;
      jevPending.delete(msg.id);clearTimeout(pending.timer);
      if(msg.networkError)pending.reject(Error('插件无法访问本机 Jev 服务。请确认 npm run jev 正在运行，然后重新连接。'));
      else pending.resolve({ok:msg.ok===true,status:msg.status,payload:msg.payload});
      return;
    }
    if(msg.type==='undo'){
      const kind=undoOrder.pop();
      if(!kind) throw Error('当前没有可撤销的插件操作。');
      const message=kind==='live'?undoLive():kind==='workflow'&&hasWorkflowUndo()?undoWorkflow():(figma.triggerUndo(),'已撤销最近一次插件操作。');
      canUndo=undoOrder.length>0;pending=null;send('done',{message,canUndo});context();return;
    }
    if(msg.type==='auto'){
      if(typeof msg.stepId==='number'){
        if(processedVoiceSteps.has(msg.stepId)) throw Error('重复语音片段已忽略。');
        processedVoiceSteps.add(msg.stepId);
      }
      const text=String(msg.text||'');
      const interpreted=await interpret(text,await conversationContext(),requestJev);
      // A correction consumes the preceding edit; it is not a new edit.
      const reversesPrevious=interpreted.command.kind==='undo'||
        interpreted.command.kind==='modify'&&interpreted.command.mode==='restore';
      if(reversesPrevious){
        if(undoOrder[undoOrder.length-1]!=='live') throw Error('上一句不是可撤回的语音编辑。');
      }
      const detail=await executeLive(interpreted.command);
      if(reversesPrevious) undoOrder.pop();
      else undoOrder.push('live');
      pending=null;
      send('done',{message:`Jev 判断（置信度 ${Math.round(interpreted.confidence*100)}%）已执行：${detail}`,canUndo:undoOrder.length>0,stepId:msg.stepId});
      context();return;
    }
    if(msg.type==='preview'){
      const result=parse(String(msg.text||'')); if(!result.intent) throw Error(result.error);
      if(isWorkflow(result.intent)){
        const workflow=await previewWorkflow(result.intent,typeof msg.candidateId==='string'?msg.candidateId:undefined);
        pending=workflow.choices?null:{intent:result.intent,ids:[],rows:workflow.rows,key:String(msg.text),workflow};
        send('plan',{rows:workflow.rows,command:String(msg.text),count:workflow.rows.length,choices:workflow.choices});return;
      }
      const nodes=selected();const rows=await plan(result.intent,nodes);
      const source=result.intent.kind==='gap'||result.intent.kind==='padding'||result.intent.kind==='width'||result.intent.kind==='height'?'用户指定':result.intent.kind==='style'||result.intent.kind==='variable'?'当前文件设计资源':result.intent.kind==='smaller'?'':result.intent.kind==='variant'?'组件变体':'指令';
      pending={intent:result.intent,ids:nodes.map(n=>n.id),rows:source?rows.map(r=>`${r} · 来源：${source}`):rows,key:String(msg.text)};
      send('plan',{rows:pending.rows,command:String(msg.text),count:nodes.length});return;
    }
    if(msg.type==='apply'){
      if(!pending) throw Error('请先预览指令。');
      if(pending.workflow){
        const detail=await applyWorkflow(pending.workflow);
        undoOrder.push('workflow');pending=null;
        send('done',{message:`已执行：${detail}`,canUndo:true});context();return;
      }
      if(pending.ids.join('|')!==selected().map(n=>n.id).join('|')) throw Error('选区已变化，请重新预览。');
      const nodes=selected(); await plan(pending.intent,nodes);
      const before=nodes.map(n=>measure(n,pending!.intent));
      const details=pending.rows;await apply(pending.intent,nodes);figma.commitUndo();canUndo=true;undoOrder.push('regular');
      const actual=nodes.map((n,i)=>`${n.name}：${before[i]} → ${measure(n,pending!.intent)}`);
      send('done',{message:`已修改 ${nodes.length} 个图层。实际值：${actual.join('；')}。预览依据：${details.join('；')}`,canUndo:true});pending=null;context();return;
    }
  }catch(e){send('error',{message:e instanceof Error?e.message:String(e),stepId:msg.stepId});}
};
