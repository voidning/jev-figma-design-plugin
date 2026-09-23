import type {Intent} from './parser';

type WorkflowIntent = Extract<Intent,{kind:'createButton'|'duplicateButtons'|'colorButtons'|'ensurePrimary'|'setButtonTypes'}>;
type Anchor = {x:number;y:number;pageId:string};
type Snapshot = {anchor:Anchor|null;ids:string[]};
type Entry = {before:Snapshot;mutation:boolean};
export type WorkflowPreview = {intent:WorkflowIntent;rows:string[];candidateId?:string;choices?:{id:string;label:string}[];revision:number};

let anchor:Anchor|null=null;
let ids:string[]=[];
let revision=0;
const history:Entry[]=[];
const copy=():Snapshot=>({anchor:anchor&&{...anchor},ids:[...ids]});
const samePage=()=>anchor?.pageId===figma.currentPage.id;
const nameOf=(n:ComponentNode)=>n.parent?.type==='COMPONENT_SET'?n.parent.name+' / '+n.name:n.name;
const isButton=(n:ComponentNode)=>/button|按钮|btn/i.test(nameOf(n));
const node=async(id:string)=>await figma.getNodeByIdAsync(id);

export function isWorkflow(intent:Intent):intent is WorkflowIntent {
  return intent.kind==='createButton'||intent.kind==='duplicateButtons'||intent.kind==='colorButtons'||intent.kind==='ensurePrimary'||intent.kind==='setButtonTypes';
}
export function anchorLabel(){return anchor&&samePage()?(`(${Math.round(anchor.x)}, ${Math.round(anchor.y)})`):null;}
export function currentAnchor(){return anchor&&samePage()?{...anchor}:null;}
export function hasWorkflowUndo(){return history.length>0;}
export function recordDrop(e:DropEvent){
  if(e.dropMetadata?.kind!=='creation-anchor') return false;
  history.push({before:copy(),mutation:false});
  anchor={x:e.absoluteX,y:e.absoluteY,pageId:figma.currentPage.id};
  ids=[];revision++;
  return true;
}
async function buttons(){
  await figma.loadAllPagesAsync();
  return figma.root.findAllWithCriteria({types:['COMPONENT']}).filter(isButton);
}
async function groupNodes(){
  if(!ids.length){
    const selected=figma.currentPage.selection;
    if(selected.length===1&&(selected[0].type==='INSTANCE'||selected[0].type==='FRAME')&&selected[0].parent?.type==='PAGE') return [selected[0]];
    throw Error('请先创建按钮，或明确选中当前页面的一个按钮。');
  }
  const found=await Promise.all(ids.map(node));
  if(found.some(n=>!n||n.type!=='INSTANCE'&&n.type!=='FRAME'||n.parent?.type!=='PAGE'||n.parent.id!==figma.currentPage.id))
    throw Error('按钮组已变化，请重新从创建步骤开始。');
  return found as (InstanceNode|FrameNode)[];
}
const aliases={gray:/gray|grey|neutral|secondary|灰|中性|次要/i,red:/red|danger|error|destructive|红|危险|错误/i};
const roles={primary:/primary|主要|主按钮/i,secondary:/secondary|次要|次级/i,danger:/danger|destructive|危险|破坏/i};
const roleKey=/type|intent|variant|kind|role|style|类型|用途|语义/i;
const colorKey=/color|colour|tone|颜色|色彩/i;
function hasRole(c:ComponentNode,role:keyof typeof roles){
  return Object.entries(c.variantProperties||{}).some(([key,value])=>roleKey.test(key)&&roles[role].test(value)) ||
    (!c.variantProperties||!Object.entries(c.variantProperties).some(([key])=>roleKey.test(key)))&&roles[role].test(c.name);
}
export function semanticVariant(n:InstanceNode,role:keyof typeof roles,main:ComponentNode|null){
  if(!main||main.parent?.type!=='COMPONENT_SET') return null;
  const props=n.variantProperties||{};
  return main.parent.children.find(c=>c.type==='COMPONENT'&&hasRole(c,role)&&
    Object.entries(props).every(([key,value])=>roleKey.test(key)||colorKey.test(key)||c.variantProperties?.[key]===value)) as ComponentNode|undefined||null;
}
function matchingVariant(n:InstanceNode,color:'gray'|'red',main:ComponentNode|null){
  if(!main||main.parent?.type!=='COMPONENT_SET') return null;
  const props=n.variantProperties||{};
  const test=aliases[color];
  return main.parent.children.find(c=>c.type==='COMPONENT'&&
    Object.entries(c.variantProperties||{}).some(([key,value])=>test.test(value)&&/color|colour|tone|intent|style|颜色|色彩|状态/i.test(key))&&
    Object.entries(props).every(([key,value])=>/color|colour|tone|intent|style|颜色|色彩|状态/i.test(key)||c.variantProperties?.[key]===value)) as ComponentNode|undefined||null;
}
type ColorDecision={kind:'variant';component:ComponentNode;source:string}|{kind:'variable';variable:Variable;source:string}|{kind:'suggestion';source:string};
async function colorDecision(n:InstanceNode|FrameNode,color:'gray'|'red'):Promise<ColorDecision>{
  if(n.type==='INSTANCE'){
    const match=matchingVariant(n,color,await n.getMainComponentAsync());
    if(match) return {kind:'variant',component:match,source:`组件变体 ${match.name}`};
  }
  if(n.fills===figma.mixed) throw Error(`${n.name} 的填充为混合值，无法安全改色。`);
  const variables=(await figma.variables.getLocalVariablesAsync()).filter(v=>v.resolvedType==='COLOR'&&aliases[color].test(v.name));
  if(variables.length===1) return {kind:'variable',variable:variables[0],source:`本地颜色变量 ${variables[0].name}`};
  return {kind:'suggestion',source:`插件建议色 ${color==='gray'?'#808080':'#D92D20'}`};
}
export async function previewWorkflow(intent:WorkflowIntent,candidateId?:string):Promise<WorkflowPreview>{
  if(intent.kind==='createButton'){
    if(!anchor||!samePage()) throw Error('请先把“创建位置”拖到当前页面的空画布。');
    const found=(await buttons()).filter(c=>{
      if(intent.role==='primary'&&!hasRole(c,'primary')) return false;
      if(c.parent?.type!=='COMPONENT_SET') return true;
      const primary=c.parent.defaultVariant;
      if(intent.role!=='primary') return c.id===primary.id;
      const defaults=primary.variantProperties||{};
      return Object.entries(defaults).every(([key,value])=>roleKey.test(key)||colorKey.test(key)||c.variantProperties?.[key]===value);
    });
    if(intent.role==='primary'&&!found.length) throw Error('当前文件没有可确认的主要按钮组件；不会猜测创建。');
    const choices=found.map(c=>({id:c.id,label:`${nameOf(c)} · ${c.width}×${c.height} · ${JSON.stringify(c.variantProperties||{})}`}));
    if(found.length>1&&!candidateId) return {intent,rows:[`落点 ${anchorLabel()}；找到 ${found.length} 个按钮组件，请先选择来源。`],choices,revision};
    const chosen=found.find(c=>c.id===(candidateId||found[0]?.id));
    if(found.length&& !chosen) throw Error('所选组件已不存在，请重新预览。');
    return {intent,rows:[chosen?`在 ${anchorLabel()} 创建组件实例；来源：${nameOf(chosen)}；变体：${JSON.stringify(chosen.variantProperties||{})}`:`在 ${anchorLabel()} 创建普通可编辑按钮；来源：插件建议值（蓝色 #0D75E8、按钮文字、内边距）`],candidateId:chosen?.id,revision};
  }
  const group=await groupNodes();
  if(intent.kind==='duplicateButtons'){
    if(group.length!==1) throw Error('当前不是单个起始按钮，不能重复复制为三个。');
    return {intent,rows:[`以 ${group[0].name} 为来源，复制两个并在当前页面并排放置，形成三个按钮；间距建议 12 px。`],revision};
  }
  if(group.length!==3) throw Error('请先把按钮复制为三个。');
  if(intent.kind==='ensurePrimary'){
    const first=group[0];
    if(first.type!=='INSTANCE') throw Error('第一个按钮不是组件实例，无法确认主要语义类型。');
    const main=await first.getMainComponentAsync();
    const target=main&&hasRole(main,'primary')?main:semanticVariant(first,'primary',main);
    if(!target) throw Error('文件中找不到保持尺寸等属性的主要按钮变体。');
    return {intent,rows:[`第一个 ${first.name} → 主要按钮；来源：组件变体 ${nameOf(target)}`],revision};
  }
  if(intent.kind==='setButtonTypes'){
    const rows:string[]=[];
    for(const change of intent.changes){
      const target=group[change.index-1];
      if(target.type!=='INSTANCE') throw Error(`第${change.index}个按钮不是组件实例，无法设置语义类型。`);
      const component=semanticVariant(target,change.role,await target.getMainComponentAsync());
      if(!component) throw Error(`文件中找不到第${change.index}个按钮对应的${change.role==='secondary'?'次要':'危险'}组件变体；不会只改颜色冒充类型。`);
      rows.push(`第${change.index}个 ${target.name} → ${change.role==='secondary'?'灰色次要':'红色危险'}按钮；来源：组件变体 ${nameOf(component)}；属性：${JSON.stringify(component.variantProperties||{})}`);
    }
    return {intent,rows,revision};
  }
  const rows:string[]=[];
  for(const change of intent.changes){
    const target=group[change.index-1];
    const decision=await colorDecision(target,change.color);
    rows.push(`第${change.index}个 ${target.name} → ${change.color==='gray'?'灰色':'红色'}；来源：${decision.source}`);
  }
  return {intent,rows,revision};
}
async function makeFallback(){
  await figma.loadFontAsync({family:'Inter',style:'Regular'});
  const f=figma.createFrame();
  f.name='按钮';
  f.layoutMode='HORIZONTAL';f.primaryAxisSizingMode='AUTO';f.counterAxisSizingMode='AUTO';
  f.primaryAxisAlignItems='CENTER';f.counterAxisAlignItems='CENTER';
  f.paddingLeft=f.paddingRight=16;f.paddingTop=f.paddingBottom=10;
  f.cornerRadius=6;f.fills=[{type:'SOLID',color:{r:13/255,g:117/255,b:232/255}}];
  const text=figma.createText();
  text.fontName={family:'Inter',style:'Regular'};
  text.characters='按钮';text.fontSize=14;
  text.fills=[{type:'SOLID',color:{r:1,g:1,b:1}}];
  f.appendChild(text);
  return f;
}
async function paint(n:InstanceNode|FrameNode,color:'gray'|'red',decision:ColorDecision){
  if(decision.kind==='variant'){(n as InstanceNode).swapComponent(decision.component);return;}
  const old=n.fills;
  if(old===figma.mixed) throw Error(`${n.name} 的填充为混合值，无法安全改色。`);
  const fills=[...old];const index=fills.findIndex(p=>p.type==='SOLID');
  if(decision.kind==='variable'){
    const solid:SolidPaint=index>=0?fills[index] as SolidPaint:{type:'SOLID',color:{r:0,g:0,b:0}};
    const bound=figma.variables.setBoundVariableForPaint(solid,'color',decision.variable);
    if(index>=0) fills[index]=bound;else fills.unshift(bound);
  }else{
    const rgb=color==='gray'?{r:128/255,g:128/255,b:128/255}:{r:217/255,g:45/255,b:32/255};
    const solid:SolidPaint={type:'SOLID',color:rgb};
    if(index>=0) fills[index]=solid;else fills.unshift(solid);
  }
  n.fills=fills;
}
export async function applyWorkflow(preview:WorkflowPreview){
  if(preview.revision!==revision) throw Error('落点或按钮组已变化，请重新预览。');
  const fresh=await previewWorkflow(preview.intent,preview.candidateId);
  if(fresh.choices) throw Error('请先选择一个按钮组件。');
  const before=copy();
  let mutation=true;
  if(preview.intent.kind==='createButton'){
    if(!anchor||!samePage()) throw Error('落点已失效，请重新拖放。');
    const component=preview.candidateId?await node(preview.candidateId):null;
    if(preview.candidateId&&component?.type!=='COMPONENT') throw Error('所选组件已失效。');
    const made=component?.type==='COMPONENT'?component.createInstance():await makeFallback();
    figma.currentPage.appendChild(made);
    made.x=anchor.x;made.y=anchor.y;ids=[made.id];
    figma.currentPage.selection=[made];
  }else if(preview.intent.kind==='duplicateButtons'){
    const [source]=await groupNodes();
    const second=source.clone(),third=source.clone();
    figma.currentPage.appendChild(second);figma.currentPage.appendChild(third);
    second.x=source.x+source.width+12;third.x=second.x+second.width+12;
    second.y=third.y=source.y;
    second.name='按钮 2';third.name='按钮 3';source.name='按钮 1';
    ids=[source.id,second.id,third.id];
    figma.currentPage.selection=[source,second,third];
  }else if(preview.intent.kind==='ensurePrimary'){
    const group=await groupNodes();const first=group[0] as InstanceNode;
    const main=await first.getMainComponentAsync();
    const target=main&&hasRole(main,'primary')?main:semanticVariant(first,'primary',main);
    if(!target) throw Error('主要按钮变体已失效，请重新预览。');
    if(target.id!==main?.id) first.swapComponent(target);else mutation=false;
  }else if(preview.intent.kind==='setButtonTypes'){
    const group=await groupNodes();
    const targets:ComponentNode[]=[];
    for(const change of preview.intent.changes){
      const n=group[change.index-1] as InstanceNode;
      const target=semanticVariant(n,change.role,await n.getMainComponentAsync());
      if(!target) throw Error('目标组件变体已失效，请重新预览。');
      targets.push(target);
    }
    for(let i=0;i<preview.intent.changes.length;i++){
      const n=group[preview.intent.changes[i].index-1] as InstanceNode;n.swapComponent(targets[i]);
      if(!(await n.getMainComponentAsync())) throw Error('按钮实例失去主组件连接。');
    }
  }else{
    const group=await groupNodes();
    const decisions=await Promise.all(preview.intent.changes.map(c=>colorDecision(group[c.index-1],c.color)));
    for(let i=0;i<preview.intent.changes.length;i++){
      const c=preview.intent.changes[i];await paint(group[c.index-1],c.color,decisions[i]);
    }
    for(const n of group) if(n.type==='INSTANCE'&&!(await n.getMainComponentAsync())) throw Error('按钮实例失去主组件连接。');
  }
  if(mutation) figma.commitUndo();
  history.push({before,mutation});revision++;
  return fresh.rows.join('；');
}
export function undoWorkflow(){
  const entry=history.pop();if(!entry) throw Error('当前没有可撤销的步骤。');
  if(entry.mutation) figma.triggerUndo();
  anchor=entry.before.anchor;ids=entry.before.ids;revision++;
  return entry.mutation?'已撤销最近一步设计修改。':'已撤销最近一步状态。';
}
