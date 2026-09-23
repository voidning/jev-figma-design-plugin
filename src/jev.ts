import type {ConversationContext,LiveCommand,Role,Target} from './live-command';

const targets=new Set<Target>(['current','selected','first','middle','last','all','previous','named']);
const roles=new Set<Role>(['primary','secondary','danger']);
const properties=new Set(['size','width','height','cornerRadius','fill','stroke','textColor','strokeWidth','layout','semanticRole','componentOverride','content']);
const modes=new Set(['set','increase','decrease','restore']);
const directions=new Set(['left','right','above','below']);
const length=(value:any)=>value?.kind==='length'&&value.unit==='px'&&Number.isFinite(value.amount)&&value.amount>=0&&value.amount<=10000;
const textValue=(value:any,transcript:string)=>value?.kind==='text'&&
  typeof value.text==='string'&&value.text.trim().length>0&&value.text.length<=80&&
  Number.isInteger(value.source?.start)&&Number.isInteger(value.source?.end)&&
  value.source.start>=0&&value.source.end>value.source.start&&
  transcript.slice(value.source.start,value.source.end)===value.text;
const colorValue=(value:any)=>value?.kind==='color'&&
  (value.source==='literal'&&(['red','blue','gray','green','yellow','black','white'].includes(value.name)||/^#[0-9a-fA-F]{6}$/.test(value.name))||
    value.source==='semantic'&&['primary','secondary','danger'].includes(value.name));

function validEdit(command:any,transcript:string):boolean{
  const p=command.parameters;
  if(!p||typeof p!=='object'||!['object','text','property'].includes(command.operand))return false;
  if(command.operation==='undo')return command.operand==='object';
  if(command.operation==='add'&&command.operand==='object')return ['component','circle','rectangle','text'].includes(p.object)&&
    (p.object!=='component'||p.semantic==='button')&&
    (p.position?.kind==='anchor'||p.position?.kind==='relative'&&targets.has(p.position.reference)&&directions.has(p.position.direction))&&
    (p.content===undefined||p.object==='text'&&textValue(p.content,transcript));
  if(!targets.has(command.target))return false;
  if(p.expectedObject!==undefined&&!['component','circle','rectangle','text'].includes(p.expectedObject))return false;
  if(p.expectedSemantic!==undefined&&(p.expectedObject!=='component'||p.expectedSemantic!=='button'))return false;
  if(command.operation==='delete')return command.operand!=='property'||properties.has(p.property);
  if(command.operand==='text'&&['add','set'].includes(command.operation))return textValue(p.value,transcript)&&
    ['center','existing-or-center'].includes(p.placement);
  if(command.operand==='property'&&['add','set','adjust'].includes(command.operation)){
    if(!properties.has(p.property))return false;
    if(command.operation==='add'&&p.property==='stroke')return p.value===undefined||colorValue(p.value);
    if(!modes.has(p.mode))return false;
    if(p.mode==='restore')return p.value===undefined;
    if(['size','width','height','cornerRadius'].includes(p.property))return p.value?.kind==='step'&&p.value.count===1||length(p.value);
    if(p.property==='strokeWidth')return length(p.value);
    if(['fill','stroke','textColor'].includes(p.property))return colorValue(p.value);
    if(p.property==='semanticRole')return p.value?.kind==='role'&&roles.has(p.value.name);
    if(p.property==='layout')return p.value?.kind==='layout'&&['horizontal','vertical'].includes(p.value.direction);
    return false;
  }
  if(command.operation==='duplicate')return command.operand==='object'&&Number.isInteger(p.additional)&&p.additional>=1&&p.additional<=19&&
    ['horizontal','vertical'].includes(p.arrangement);
  if(command.operation==='move')return command.operand==='object'&&directions.has(p.direction)&&length(p.distance);
  if(command.operation==='arrange')return command.operand==='object'&&['horizontal','vertical'].includes(p.direction);
  return false;
}

/** The bridge is local, but its response still must not be trusted as Figma code. */
function valid(command:any,transcript:string):command is LiveCommand{
  if(!command||typeof command!=='object')return false;
  if(command.kind==='edit')return validEdit(command,transcript);
  if(command.kind==='undo')return command.reason==='correction'||command.reason==='explicit';
  if(command.kind==='create'){
    const position=command.position;
    const validPosition=position?.kind==='anchor'||position?.kind==='relative'&&targets.has(position.reference)&&directions.has(position.direction);
    return ['component','circle','rectangle','text'].includes(command.object)&&validPosition&&
      (command.object!=='component'||command.semantic==='button')&&
      (command.role===undefined||command.semantic==='button'&&roles.has(command.role))&&
      (command.content===undefined||command.object==='text'&&textValue(command.content,transcript));
  }
  if(command.kind==='duplicate')return targets.has(command.target)&&Number.isInteger(command.additional)&&
    command.additional>=1&&command.additional<=19&&['horizontal','vertical'].includes(command.arrangement);
  if(command.kind==='move')return targets.has(command.target)&&directions.has(command.direction)&&length(command.distance);
  if(command.kind==='arrange')return targets.has(command.target)&&['horizontal','vertical'].includes(command.direction);
  if(command.kind==='batch')return Array.isArray(command.commands)&&command.commands.length>=2&&command.commands.length<=3&&
    command.commands.every((item:any)=>valid(item,transcript)&&
      (item.kind==='modify'||item.kind==='edit'&&item.operand==='property'&&['set','adjust'].includes(item.operation)));
  if(command.kind==='sequence')return Array.isArray(command.commands)&&command.commands.length>=2&&command.commands.length<=3&&
    (command.commands[0].kind==='create'||command.commands[0].kind==='edit'&&command.commands[0].operation==='add'&&
      ['object','property'].includes(command.commands[0].operand))&&
    command.commands.every((item:any,index:number)=>
      item.kind!=='sequence'&&item.kind!=='batch'&&item.kind!=='undo'&&valid(item,transcript)&&
      (index===0||!['modify','edit'].includes(item.kind)||'target' in item&&item.target==='previous'));
  if(command.kind!=='modify'||!targets.has(command.target)||!properties.has(command.property)||!modes.has(command.mode))return false;
  if(command.expectedObject!==undefined&&!['component','circle','rectangle','text'].includes(command.expectedObject))return false;
  if(command.expectedSemantic!==undefined&&(command.expectedObject!=='component'||command.expectedSemantic!=='button'))return false;
  if(command.mode==='restore')return command.value===undefined;
  const value=command.value;
  if(command.property==='content')return command.mode==='set'&&command.slot==='content'&&
    ['center','existing-or-center'].includes(command.placement)&&textValue(value,transcript);
  if(['size','width','height','cornerRadius'].includes(command.property))return value?.kind==='step'&&value.count===1||length(value);
  if(command.property==='strokeWidth')return length(value);
  if(['fill','stroke','textColor'].includes(command.property))return colorValue(value);
  if(command.property==='semanticRole')return value?.kind==='role'&&roles.has(value.name);
  if(command.property==='layout')return value?.kind==='layout'&&['horizontal','vertical'].includes(value.direction);
  return false;
}

export type JevReply={ok:boolean;status:number;payload:{command?:unknown;source?:string;confidence?:number;error?:string}};

export async function interpret(text:string,context:ConversationContext,
  request:(text:string,context:ConversationContext)=>Promise<JevReply>):Promise<{command:LiveCommand;confidence:number}>{
  const response=await request(text,context);
  const payload=response.payload;
  if(!response.ok)throw Error(payload.error||`Jev 服务错误（HTTP ${response.status}）。`);
  if(payload.source!=='jev'||typeof payload.confidence!=='number'||payload.confidence<.8||!valid(payload.command,text.trim()))
    throw Error('Jev 返回了无效或低置信度的编辑命令，本步未执行。');
  return {command:payload.command,confidence:payload.confidence};
}
