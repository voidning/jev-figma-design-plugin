import type {ConversationContext,CreationPosition,EditCommand,LiveCommand,ModifyCommand,Property,Target} from './live-command';
import {adapterFor,adapters,isButtonInstance,requireAction,requireProperty,requireAddable,requireRemovable,type Editable,type PreparedChange} from './object-adapters';
import {currentAnchor,undoWorkflow} from './workflow';

type NodeState={id:string;name:string;x:number;y:number;width:number;height:number;fills:string;strokes:string;strokeWeight:number|null;content:string};
type ChangeRecord={pageId:string;action:LiveCommand['kind'];property?:Property;targetIds:string[];before:NodeState[];after:NodeState[]};
type HistoryEntry={ids:string[];lastChange:ChangeRecord|null;usedWorkflow:boolean;steps?:HistoryEntry[]};
let ids:string[]=[];
let lastChange:ChangeRecord|null=null;
const history:HistoryEntry[]=[];

function snapshot(nodes:readonly Editable[]):NodeState[]{
  return nodes.map(node=>({
    id:node.id,name:node.name,x:node.x,y:node.y,width:node.width,height:node.height,
    fills:'fills' in node?JSON.stringify(node.fills):'',
    strokes:'strokes' in node?JSON.stringify(node.strokes):'',
    strokeWeight:'strokeWeight' in node&&typeof node.strokeWeight==='number'?node.strokeWeight:null
    ,content:node.type==='INSTANCE'||node.type==='FRAME'?
      JSON.stringify({properties:node.type==='INSTANCE'?node.componentProperties:null,
        labels:node.findAllWithCriteria({types:['TEXT']}).map(text=>text.characters)}):
      node.type==='TEXT'?node.characters:''
  }));
}
function describe(states:NodeState[]):string{
  return states.map(node=>node.name+' '+Math.round(node.width)+'×'+Math.round(node.height)+
    ' @('+Math.round(node.x)+','+Math.round(node.y)+')'+
    (node.content?' 内容='+node.content.slice(0,100):'')).join('；');
}

/** Resolve remembered IDs against the current page. IDs never come from Jev. */
async function active():Promise<Editable[]>{
  const candidates=ids.length?await Promise.all(ids.map(id=>figma.getNodeByIdAsync(id))):figma.currentPage.selection;
  const objects=candidates.filter((node):node is Editable=>!!node&&
    (node.type==='INSTANCE'||node.type==='FRAME'||node.type==='ELLIPSE'||node.type==='RECTANGLE'||node.type==='TEXT')&&
    node.parent?.id===figma.currentPage.id&&!!adapterFor(node));
  if(objects.length!==candidates.length)throw Error('编辑对象已变化，请重新选择目标。');
  return objects;
}
export async function conversationContext():Promise<ConversationContext>{
  let objects:Editable[]=[];
  try{objects=await active();}catch{ids=[];}
  const semantics=await Promise.all(objects.map(async node=>
    node.type==='INSTANCE'&&await isButtonInstance(node)?'button' as const:null));
  return {
    pageId:figma.currentPage.id,
    activeCount:objects.length,
    selectedCount:figma.currentPage.selection.filter(node=>node.parent?.id===figma.currentPage.id&&!!adapterFor(node)).length,
    selectedMatchesActive:figma.currentPage.selection.length===1&&objects.length===1&&
      figma.currentPage.selection[0].id===objects[0].id,
    activeObjects:objects.map(node=>adapterFor(node)!.kind),
    activeSemantics:semantics,
    hasAnchor:!!currentAnchor(),
    lastEdit:lastChange?{
      action:lastChange.action,property:lastChange.property,
      before:describe(lastChange.before),after:describe(lastChange.after)
    }:null
  };
}

/** Resolve “这个／中间那个／都” from the current object group. */
function targets(group:Editable[],target:Target):Editable[]{
  if(target==='named')throw Error('按名称指定对象尚未实现；请选中对象或使用序号。');
  if(target==='selected'){
    const selected=figma.currentPage.selection;
    if(selected.length!==1||selected[0].parent?.id!==figma.currentPage.id||!adapterFor(selected[0]))
      throw Error('请在当前页面明确单选一个可编辑对象。');
    return [selected[0] as Editable];
  }
  if(!group.length)throw Error('请先创建或选中编辑对象。');
  if(target==='all')return group;
  if(target==='previous')throw Error('“刚创建的对象”只能在同一句依赖编辑中使用。');
  if(target==='current'){
    const selected=figma.currentPage.selection;
    if(selected.length===1&&selected[0].parent?.id===figma.currentPage.id&&adapterFor(selected[0]))
      return [selected[0] as Editable];
    if(group.length===1)return [group[0]];
    throw Error('当前有多个对象，无法确定“这个”是哪一个；请选中对象或说序号。');
  }
  if(target==='last')return [group[group.length-1]];
  if(target==='first')return [group[0]];
  if(group.length<3||group.length%2===0)throw Error('无法明确定位“中间那个”；请选中目标或说序号。');
  return [group[Math.floor(group.length/2)]];
}

async function checkedTargets(group:Editable[],target:Target,parameters:EditCommand['parameters']):Promise<Editable[]>{
  const nodes=targets(group,target);
  for(const node of nodes){
    const adapter=adapterFor(node)!;
    if(parameters.expectedObject&&adapter.kind!==parameters.expectedObject)
      throw Error('目标对象类型与语音所指不一致；画布未修改。');
    if(parameters.expectedSemantic==='button'&&(node.type!=='INSTANCE'||!await isButtonInstance(node)))
      throw Error('目标不是按钮组件；画布未修改。');
  }
  return nodes;
}
function remember(beforeIds:string[],previous:ChangeRecord|null,usedWorkflow:boolean,record:ChangeRecord){
  history.push({ids:beforeIds,lastChange:previous,usedWorkflow});
  lastChange=record;
}
function record(action:LiveCommand['kind'],property:Property|undefined,before:NodeState[],after:Editable[]):ChangeRecord{
  return {pageId:figma.currentPage.id,action,property,targetIds:after.map(node=>node.id),before,after:snapshot(after)};
}
function positionForCreate(position:CreationPosition,group:Editable[],kind:LiveCommand&{kind:'create'}):{x:number;y:number;pageId:string;reference?:Editable}{
  if(position.kind==='anchor'){
    const anchor=currentAnchor();if(!anchor)throw Error('请先把“创建位置”拖到当前页面；无法猜测“这里”。');
    return anchor;
  }
  const adapter=adapters[kind.object];
  if(!adapter.createRelative)throw Error(kind.object+' 暂不支持相对对象创建；请先设置画布落点。');
  const [reference]=targets(group,position.reference);
  return {x:reference.x,y:reference.y,pageId:figma.currentPage.id,reference};
}
function placeRelative(created:Editable,reference:Editable,direction:string){
  const gap=12;
  if(direction==='right'){created.x=reference.x+reference.width+gap;created.y=reference.y;}
  else if(direction==='left'){created.x=reference.x-created.width-gap;created.y=reference.y;}
  else if(direction==='below'){created.x=reference.x;created.y=reference.y+reference.height+gap;}
  else {created.x=reference.x;created.y=reference.y-created.height-gap;}
}

async function planModification(command:ModifyCommand,group:Editable[]):Promise<{nodes:Editable[];changes:PreparedChange[]}>{
  const nodes=await checkedTargets(group,command.target,command);
  const changes=await Promise.all(nodes.map(async node=>{
    const adapter=adapterFor(node)!;
    if(command.expectedObject&&adapter.kind!==command.expectedObject)
      throw Error('目标对象类型与语音所指不一致；画布未修改。');
    if(command.expectedSemantic==='button'&&(node.type!=='INSTANCE'||!await isButtonInstance(node)))
      throw Error('目标不是按钮组件；画布未修改。');
    requireAction(adapter,'modify');requireProperty(adapter,command.property);
    return adapter.planModify(node,command);
  }));
  return {nodes,changes};
}

/** Figma-specific add/delete behavior is validated by object adapters. */
async function executeStructuralEdit(command:EditCommand):Promise<string>{
  const target=command.target;
  if(!target)throw Error('这项编辑缺少目标。');
  const group=await active();
  const nodes=await checkedTargets(group,target,command.parameters);
  const beforeIds=[...ids],previous=lastChange,before=snapshot(nodes);
  if(command.operation==='delete'&&command.operand==='object'||
    command.operation==='delete'&&command.operand==='text'&&nodes.every(node=>node.type==='TEXT')){
    for(const node of nodes)requireAction(adapterFor(node)!,'delete');
    for(const node of nodes)node.remove();
    ids=target==='selected'||target==='current'&&nodes.every(node=>!ids.includes(node.id))?[]:
      ids.filter(id=>!nodes.some(node=>node.id===id));
    figma.currentPage.selection=[];
    figma.commitUndo();remember(beforeIds,previous,false,record('edit',undefined,before,[]));
    return '已删除 '+nodes.length+' 个设计对象。';
  }
  const property:Property=command.operand==='text'?'content':command.parameters.property!;
  if(!property)throw Error('请说明要添加或删除的属性。');
  const changes=await Promise.all(nodes.map(async node=>{
    const adapter=adapterFor(node)!;
    if(command.operation==='add'){
      requireAddable(adapter,property);
      const value=command.parameters.value;
      return adapter.planAdd!(node,property,value?.kind==='text'?undefined:value);
    }
    requireRemovable(adapter,property);
    return adapter.planRemove!(node,property);
  }));
  for(const change of changes)change.apply();
  const after=changes.map((change,index)=>change.resultingNode?.()||nodes[index]);
  if(nodes.some(node=>!ids.includes(node.id)))ids=after.map(node=>node.id);
  else ids=ids.map(id=>{const index=nodes.findIndex(node=>node.id===id);return index>=0?after[index].id:id;});
  figma.commitUndo();remember(beforeIds,previous,false,record('edit',property,before,after));
  return changes.map(change=>change.description).join('；');
}

/** Lower the composable command into the existing Figma operations. */
async function executeEdit(command:EditCommand):Promise<string>{
  const {operation,operand,target,parameters:p}=command;
  if(operation==='undo')return undoLive();
  if(operation==='add'&&operand==='object'){
    if(!p.object||!p.position)throw Error('创建对象缺少类型或位置。');
    return executeLive({kind:'create',object:p.object,position:p.position,role:p.role,content:p.content});
  }
  if((operation==='add'||operation==='set')&&operand==='text'){
    if(!target||p.value?.kind!=='text')throw Error('文字命令缺少目标或原文。');
    return executeLive({kind:'modify',target,property:'content',mode:'set',value:p.value,
      slot:'content',placement:p.placement,expectedObject:p.expectedObject,expectedSemantic:p.expectedSemantic});
  }
  if((operation==='set'||operation==='adjust')&&operand==='property'){
    if(!target||!p.property||!p.mode)throw Error('属性命令缺少目标或参数。');
    return executeLive({kind:'modify',target,property:p.property,mode:p.mode,value:p.value,
      expectedObject:p.expectedObject,expectedSemantic:p.expectedSemantic});
  }
  if(operation==='duplicate'&&operand==='object'){
    if(!target||!p.additional||!p.arrangement)throw Error('复制命令缺少数量或排列。');
    return executeLive({kind:'duplicate',target,additional:p.additional,arrangement:p.arrangement});
  }
  if(operation==='move'&&operand==='object'){
    if(!target||!p.direction||!p.distance||!['left','right','above','below'].includes(p.direction))
      throw Error('移动命令缺少方向或距离。');
    return executeLive({kind:'move',target,direction:p.direction as 'left'|'right'|'above'|'below',distance:p.distance});
  }
  if(operation==='arrange'&&operand==='object'){
    if(!target||!p.direction||!['horizontal','vertical'].includes(p.direction))throw Error('排列方向不明确。');
    return executeLive({kind:'arrange',target,direction:p.direction as 'horizontal'|'vertical'});
  }
  if(operation==='delete'||operation==='add'&&operand==='property')return executeStructuralEdit(command);
  throw Error('这项操作与操作对象的组合尚不支持；画布未修改。');
}

/** Complete planning for every target before the first Figma mutation. */
export async function executeLive(command:LiveCommand):Promise<string>{
  if(command.kind==='edit')return executeEdit(command);
  if(command.kind==='sequence'){
    const startingIds=[...ids],startingEdit=lastChange,startingHistory=history.length;
    const before=snapshot(await active());
    const results:string[]=[];
    try{
      for(const step of command.commands){
        const resolved=(step.kind==='modify'||step.kind==='edit')&&step.target==='previous'?
          {...step,target:'current' as const}:step;
        results.push(await executeLive(resolved));
      }
    }catch(error){
      while(history.length>startingHistory)undoLive();
      throw Error('依赖编辑未全部完成，已回滚：'+(error instanceof Error?error.message:String(error)));
    }
    const steps=history.splice(startingHistory);
    history.push({ids:startingIds,lastChange:startingEdit,usedWorkflow:false,steps});
    lastChange=record('sequence',undefined,before,await active());
    return results.join('；');
  }
  if(command.kind==='undo')return undoLive(command.reason==='correction'?'size':undefined);
  if(command.kind==='modify'&&command.mode==='restore')return undoLive(command.property);
  const beforeIds=[...ids],previous=lastChange;
  const group=await active();

  if(command.kind==='create'){
    const location=positionForCreate(command.position,group,command);
    const adapter=adapters[command.object];requireAction(adapter,'create');
    const result=await adapter.create(location,command.role,command.content);
    if(command.position.kind==='relative')placeRelative(result.node,location.reference!,command.position.direction);
    if(!result.committed)figma.commitUndo();
    ids=[result.node.id];
    remember(beforeIds,previous,result.committed,record('create',undefined,[],[result.node]));
    return result.detail;
  }
  if(!group.length)throw Error('请先创建或选中编辑对象。');

  if(command.kind==='duplicate'){
    const source=targets(group,command.target);
    if(source.length!==1)throw Error('一次复制请明确指定一个来源对象。');
    const adapter=adapterFor(source[0])!;requireAction(adapter,'duplicate');
    if(group.length+command.additional>20)throw Error('一次最多支持 20 个对象。');
    const before=snapshot(group);
    const copies=Array.from({length:command.additional},()=>source[0].clone());
    for(const copy of copies)figma.currentPage.appendChild(copy);
    const result=[...group,...copies];
    arrange(result,command.arrangement);
    ids=result.map(node=>node.id);figma.currentPage.selection=result;
    figma.commitUndo();
    remember(beforeIds,previous,false,record('duplicate',undefined,before,result));
    return '已增加 '+command.additional+' 个对象，现有 '+result.length+' 个，'+(command.arrangement==='horizontal'?'横向':'纵向')+'排列。';
  }
  if(command.kind==='arrange'){
    const nodes=targets(group,command.target);
    if(nodes.length<2)throw Error('排列至少需要两个对象。');
    for(const node of nodes)requireAction(adapterFor(node)!,'arrange');
    const before=snapshot(nodes);arrange(nodes,command.direction);figma.commitUndo();
    remember(beforeIds,previous,false,record('arrange','layout',before,nodes));
    return nodes.length+' 个对象已'+(command.direction==='horizontal'?'横向':'纵向')+'排列。';
  }
  if(command.kind==='move'){
    const nodes=targets(group,command.target);
    for(const node of nodes)requireAction(adapterFor(node)!,'move');
    const before=snapshot(nodes);
    const delta=command.distance.amount;
    for(const node of nodes){
      if(command.direction==='left')node.x-=delta;
      else if(command.direction==='right')node.x+=delta;
      else if(command.direction==='above')node.y-=delta;
      else node.y+=delta;
    }
    figma.commitUndo();remember(beforeIds,previous,false,record('move',undefined,before,nodes));
    return nodes.length+' 个对象已向'+command.direction+'移动 '+delta+' px。';
  }
  const edits=command.kind==='batch'?command.commands.map(item=>{
    if(item.kind==='modify')return item;
    if(item.kind!=='edit'||item.operand!=='property'||!item.target||!item.parameters.property||!item.parameters.mode)
      throw Error('同句独立编辑只支持明确的属性修改。');
    return {kind:'modify' as const,target:item.target,property:item.parameters.property,
      mode:item.parameters.mode,value:item.parameters.value,
      expectedObject:item.parameters.expectedObject,expectedSemantic:item.parameters.expectedSemantic};
  }):[command];
  const planned=await Promise.all(edits.map(edit=>planModification(edit,group)));
  const nodes=planned.flatMap(item=>item.nodes);
  if(new Set(nodes.map(node=>node.id)).size!==nodes.length)throw Error('同一句话对同一对象有冲突修改。');
  const before=snapshot(nodes);
  for(const item of planned)for(const change of item.changes)change.apply();
  const finalNodes=planned.flatMap(item=>item.changes.map((change,index)=>change.resultingNode?.()||item.nodes[index]));
  if(nodes.some(node=>!ids.includes(node.id)))ids=finalNodes.map(node=>node.id);
  else if(finalNodes.some((node,index)=>node.id!==nodes[index].id)){
    ids=ids.map(id=>{const index=nodes.findIndex(node=>node.id===id);return index>=0?finalNodes[index].id:id;});
  }
  figma.commitUndo();
  const property=edits.length===1?edits[0].property:undefined;
  remember(beforeIds,previous,false,record(command.kind,property,before,finalNodes));
  return planned.flatMap(item=>item.changes.map(change=>change.description)).join('；');
}

function arrange(nodes:Editable[],direction:'horizontal'|'vertical'){
  let position=direction==='horizontal'?nodes[0].x:nodes[0].y;
  for(const node of nodes){
    if(direction==='horizontal'){node.x=position;node.y=nodes[0].y;position+=node.width+12;}
    else {node.y=position;node.x=nodes[0].x;position+=node.height+12;}
  }
}
export function undoLive(expectedProperty?:Property):string{
  const entry=history[history.length-1];
  if(!entry||!lastChange)throw Error('没有可撤回的上一句编辑。');
  if(lastChange.pageId!==figma.currentPage.id)throw Error('页面已切换，无法撤回上一句。');
  if(expectedProperty&&lastChange.property!==expectedProperty)throw Error('上一句不是该属性的修改，不能这样恢复。');
  history.pop();
  if(entry.steps){
    for(const step of [...entry.steps].reverse()){
      if(step.usedWorkflow)undoWorkflow();else figma.triggerUndo();
    }
  }else if(entry.usedWorkflow)undoWorkflow();else figma.triggerUndo();
  ids=entry.ids;lastChange=entry.lastChange;
  return '已退回上一句编辑。';
}
