import fs from 'node:fs';
import vm from 'node:vm';

const messages=[];
const events={};
const nodes=new Map();
let next=0,commits=0,undos=0;
let includeSolo=true;
let baseline=null;
const undoSnapshots=[];
function attach(parent,node){
  if(node.parent?.children)node.parent.children=node.parent.children.filter(item=>item!==node);
  node.parent=parent;parent.children.push(node);
}
function removeNode(node){
  if(node.parent?.children)node.parent.children=node.parent.children.filter(item=>item!==node);
  node.parent=null;
}
const page={id:'page-1',type:'PAGE',name:'Page',children:[],selection:[],appendChild(n){attach(this,n);}};
const set={id:'set-1',type:'COMPONENT_SET',name:'Button',children:[]};
for(const size of ['Medium','Small']) for(const color of ['Primary','Gray','Red']){
  const c={id:`component-${size}-${color}`,name:`Size=${size}, Color=${color}`,type:'COMPONENT',parent:set,width:size==='Small'?80:100,height:size==='Small'?32:40,variantProperties:{Size:size,Color:color,Type:color==='Gray'?'Secondary':color==='Red'?'Danger':'Primary'}};
  c.createInstance=()=>instance(c);
  set.children.push(c);nodes.set(c.id,c);
}
set.defaultVariant=set.children[0];
const solo={id:'component-solo',name:'Button Solo',type:'COMPONENT',parent:page,width:90,height:36,variantProperties:null,createInstance(){return instance(this);}};
nodes.set(solo.id,solo);
function instance(component){
  const n={id:`instance-${++next}`,name:'按钮',type:'INSTANCE',parent:page,x:0,y:0,width:component.width,height:component.height,
    fills:[{type:'SOLID',color:{r:0,g:0,b:1}}],variantProperties:{...component.variantProperties},mainComponent:component,
    componentProperties:{'ButtonText#0:1':{type:'TEXT',value:'按钮'}},overrides:[],
    setProperties(values){for(const [key,value] of Object.entries(values))this.componentProperties[key]={type:'TEXT',value};
      this.overrides=[{id:this.id,overriddenFields:['componentProperties']}];},
    removeOverrides(){this.componentProperties={'ButtonText#0:1':{type:'TEXT',value:'按钮'}};this.overrides=[];},
    textLayers:[],findAllWithCriteria(){return this.textLayers;},pluginData:{},
    getPluginData(key){return this.pluginData[key]||'';},setPluginData(key,value){this.pluginData[key]=value;},
    remove(){removeNode(this);},
    async getMainComponentAsync(){return this.mainComponent;},
    swapComponent(c){this.mainComponent=c;this.variantProperties={...c.variantProperties};this.width=c.width;this.height=c.height;},
    resize(width,height){this.width=width;this.height=height;},
    clone(){const result=instance(this.mainComponent);result.name=this.name;result.x=this.x;result.y=this.y;result.componentProperties=structuredClone(this.componentProperties);result.pluginData={...this.pluginData};return result;}};
  nodes.set(n.id,n);return n;
}
function ellipse(){
  const n={id:`ellipse-${++next}`,name:'圆形',type:'ELLIPSE',parent:page,x:0,y:0,width:100,height:100,
    fills:[{type:'SOLID',color:{r:.5,g:.5,b:.5}}],strokes:[],strokeWeight:1,
    resize(width,height){this.width=width;this.height=height;},
    remove(){removeNode(this);},
    clone(){const copy=ellipse();copy.name=this.name;copy.x=this.x;copy.y=this.y;copy.resize(this.width,this.height);copy.fills=this.fills;return copy;}};
  nodes.set(n.id,n);return n;
}
function rectangle(){const n=ellipse();n.type='RECTANGLE';n.name='矩形';n.cornerRadius=0;return n;}
function textNode(){
  const n={id:`text-${++next}`,name:'文字',type:'TEXT',parent:page,x:0,y:0,width:0,height:20,
    characters:'',fontName:{family:'Inter',style:'Regular'},fills:[],locked:false,
    getRangeAllFontNames:()=>[{family:'Inter',style:'Regular'}],
    rescale(scale){this.width*=scale;this.height*=scale;},
    remove(){removeNode(this);},
    clone(){const copy=textNode();copy.characters=this.characters;copy.width=this.width;copy.x=this.x;copy.y=this.y;return copy;}};
  Object.defineProperty(n,'characters',{get(){return this._characters||'';},set(value){this._characters=value;this.width=value.length*10;}});
  nodes.set(n.id,n);return n;
}
function frame(){
  const n={id:`frame-${++next}`,name:'Frame',type:'FRAME',parent:page,x:0,y:0,width:100,height:100,
    children:[],fills:[],layoutMode:'NONE',pluginData:{},clipsContent:false,
    getPluginData(key){return this.pluginData[key]||'';},setPluginData(key,value){this.pluginData[key]=value;},
    remove(){removeNode(this);},
    appendChild(child){attach(this,child);},
    findAllWithCriteria(){return this.children.filter(child=>child.type==='TEXT');},
    resize(width,height){this.width=width;this.height=height;},
    rescale(scale){this.width*=scale;this.height*=scale;for(const child of this.children){
      child.x*=scale;child.y*=scale;if(child.type==='TEXT')child.rescale(scale);else child.resize(child.width*scale,child.height*scale);
    }},
    clone(){throw Error('Frame clone not mocked');}};
  nodes.set(n.id,n);return n;
}
function capture(){
  return {
    children:page.children.map(node=>node.id),selection:page.selection.map(node=>node.id),
    items:[...nodes.values()].filter(node=>node.parent===page||node.parent?.type==='FRAME').map(node=>({
      id:node.id,name:node.name,x:node.x,y:node.y,width:node.width,height:node.height,
      parentId:node.parent?.id,children:node.children?.map(child=>child.id),characters:node.type==='TEXT'?node.characters:undefined,
      pluginData:node.pluginData&&structuredClone(node.pluginData),
      mainComponent:node.mainComponent,variantProperties:node.variantProperties&&{...node.variantProperties},
      fills:node.fills&&structuredClone(node.fills),strokes:node.strokes&&structuredClone(node.strokes),
      strokeWeight:node.strokeWeight,cornerRadius:node.cornerRadius,componentProperties:node.componentProperties&&structuredClone(node.componentProperties),
      overrides:node.overrides&&structuredClone(node.overrides)
    }))
  };
}
function restore(state){
  page.children=state.children.map(id=>nodes.get(id));
  page.selection=state.selection.map(id=>nodes.get(id));
  for(const item of state.items){
    const node=nodes.get(item.id);
    for(const key of ['name','x','y','width','height','mainComponent','variantProperties','fills','strokes','strokeWeight','cornerRadius','componentProperties','overrides','pluginData','characters'])
      if(item[key]!==undefined)node[key]=item[key];
    node.parent=item.parentId===page.id?page:nodes.get(item.parentId);
    if(item.children)node.children=item.children.map(id=>nodes.get(id));
  }
}
const figma={currentPage:page,root:{findAllWithCriteria:()=>includeSolo?[...set.children,solo]:[...set.children]},mixed:Symbol('mixed'),
  ui:{postMessage:m=>{
    messages.push(m);
    if(m.type==='jevRequest')queueMicrotask(()=>figma.ui.onmessage({type:'jevReply',id:m.id,ok:true,status:200,
      payload:{source:'jev',confidence:.95,command:interpreted[m.text]}}));
  },onmessage:null},showUI(){},on(type,fn){events[type]=fn;},
  getNodeByIdAsync:async id=>nodes.get(id)||null,loadAllPagesAsync:async()=>{},loadFontAsync:async()=>{},
  createEllipse:ellipse,createRectangle:rectangle,createFrame:frame,createText:textNode,
  commitUndo(){commits++;undoSnapshots.push(baseline);},triggerUndo(){undos++;const prior=undoSnapshots.pop();if(prior)restore(prior);},
  getLocalTextStylesAsync:async()=>[],getLocalPaintStylesAsync:async()=>[],
  variables:{getLocalVariablesAsync:async()=>[],setBoundVariableForPaint:(paint)=>paint}};
const interpreted={
  '在这里放个按钮':{kind:'create',object:'component',semantic:'button',position:{kind:'anchor'}},
  '在这里加一个圆':{kind:'create',object:'circle',position:{kind:'anchor'}},
  '在这儿画个圆形':{kind:'create',object:'circle',position:{kind:'anchor'}},
  '把这个圆改成危险按钮':{kind:'modify',target:'current',property:'semanticRole',mode:'set',value:{kind:'role',name:'danger'}},
  '再来两个，排成一行':{kind:'duplicate',target:'current',additional:2,arrangement:'horizontal'},
  '中间那个低调一点，最后那个要有危险感':{kind:'batch',commands:[
    {kind:'modify',target:'middle',property:'semanticRole',mode:'set',value:{kind:'role',name:'secondary'}},
    {kind:'modify',target:'last',property:'semanticRole',mode:'set',value:{kind:'role',name:'danger'}}]},
  '三个都大一点':{kind:'modify',target:'all',property:'size',mode:'increase',value:{kind:'step',count:1}},
  '大一点':{kind:'modify',target:'current',property:'size',mode:'increase',value:{kind:'step',count:1}},
  '改成红色':{kind:'modify',target:'current',property:'fill',mode:'set',value:{kind:'color',name:'red',source:'literal'}},
  '太大了，退回去':{kind:'undo',reason:'correction'}
};
for(const [phrase,label] of [['在按钮中间加一个开始','开始'],['在按钮上填上开始','开始'],
  ['把按钮文字改成开始使用','开始使用']]){
  const start=phrase.lastIndexOf(label);
  interpreted[phrase]={kind:'modify',target:'current',property:'content',mode:'set',slot:'content',
    placement:'center',value:{kind:'text',text:label,source:{start,end:start+label.length}}};
}
interpreted['把按钮文字改成']={kind:'modify',target:'current',property:'content',mode:'set',slot:'content',
  placement:'center',value:{kind:'text',text:'开始',source:{start:0,end:2}}};
const circleText='在圆中间写上开始';
interpreted[circleText]={kind:'edit',operation:'add',operand:'text',target:'current',parameters:{
  placement:'center',expectedObject:'circle',value:{kind:'text',text:'开始',
    source:{start:circleText.indexOf('开始'),end:circleText.indexOf('开始')+2}}}};
const compoundCircle='在这里创建一个圆，在中间写上开始，然后放大一点';
interpreted[compoundCircle]={kind:'sequence',commands:[
  {kind:'edit',operation:'add',operand:'object',parameters:{object:'circle',position:{kind:'anchor'}}},
  {kind:'edit',operation:'add',operand:'text',target:'previous',parameters:{
    placement:'center',expectedObject:'circle',value:{kind:'text',text:'开始',
      source:{start:compoundCircle.indexOf('开始'),end:compoundCircle.indexOf('开始')+2}}}},
  {kind:'edit',operation:'adjust',operand:'property',target:'previous',parameters:{
    property:'size',mode:'increase',value:{kind:'step',count:1}}}
]};
const requestedCircle='在这里加一个圆，在中间写开始，然后放大一点';
interpreted[requestedCircle]=structuredClone(interpreted[compoundCircle]);
interpreted[requestedCircle].commands[1].parameters.value.source={
  start:requestedCircle.indexOf('开始'),end:requestedCircle.indexOf('开始')+2};
const independentText='在这里加一段文字，写欢迎';
interpreted[independentText]={kind:'sequence',commands:[
  {kind:'edit',operation:'add',operand:'object',parameters:{object:'text',position:{kind:'anchor'}}},
  {kind:'edit',operation:'add',operand:'text',target:'previous',parameters:{expectedObject:'text',
    placement:'existing-or-center',value:{kind:'text',text:'欢迎',
      source:{start:independentText.indexOf('欢迎'),end:independentText.length}}}}
]};
interpreted['在这里加个矩形']={kind:'create',object:'rectangle',position:{kind:'anchor'}};
interpreted['把这个对象往右移 20 px']={kind:'edit',operation:'move',operand:'object',target:'current',
  parameters:{direction:'right',distance:{kind:'length',amount:20,unit:'px'}}};
interpreted['把这个圆里的字删掉']={kind:'edit',operation:'delete',operand:'text',target:'current',
  parameters:{expectedObject:'circle'}};
interpreted['把这个圆删掉']={kind:'edit',operation:'delete',operand:'object',target:'current',
  parameters:{expectedObject:'circle'}};
interpreted['给这个矩形加描边']={kind:'edit',operation:'add',operand:'property',target:'current',
  parameters:{property:'stroke',expectedObject:'rectangle'}};
interpreted['把描边删掉']={kind:'edit',operation:'delete',operand:'property',target:'current',
  parameters:{property:'stroke',expectedObject:'rectangle'}};
interpreted['把宽度删掉']={kind:'edit',operation:'delete',operand:'property',target:'current',
  parameters:{property:'width',expectedObject:'rectangle'}};
interpreted['删除这个组件的覆盖']={kind:'edit',operation:'delete',operand:'property',target:'current',
  parameters:{property:'componentOverride',expectedObject:'component'}};
const strokeSequence='给这个矩形加描边，然后把描边删掉';
interpreted[strokeSequence]={kind:'sequence',commands:[
  {...interpreted['给这个矩形加描边']},
  {...interpreted['把描边删掉'],target:'previous'}
]};
vm.runInNewContext(fs.readFileSync(new URL('../dist/code.js',import.meta.url),'utf8'),{figma,setTimeout,clearTimeout,__html__:''});
async function send(type,text,candidateId){baseline=capture();await figma.ui.onmessage({type,text,candidateId});return [...messages].reverse().find(m=>m.type==='plan'||m.type==='error'||m.type==='done');}
let result=await send('preview','在这里创建一个按钮');
if(result.type!=='error'||!result.message.includes('创建位置')) throw Error('Missing anchor should be rejected');
result=await send('auto','在这里加一个圆');
if(result.type!=='error'||!result.message.includes('创建位置')) throw Error('Circle without anchor should be rejected');
events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:240,absoluteY:360});
result=await send('preview','在这里创建一个按钮');
if(result.type!=='plan'||result.choices.length!==2) throw Error('Component choices missing');
result=await send('preview','在这里创建一个按钮','component-Medium-Primary');
if(result.type!=='plan'||!result.rows[0].includes('(240, 360)')) throw Error('Create preview missing location');
await send('apply');
const first=page.selection[0];
if(first.type!=='INSTANCE'||first.x!==240||first.y!==360||first.mainComponent.id!=='component-Medium-Primary') throw Error('Component instance not created at anchor');
result=await send('preview','这个按钮小一点');
if(result.type!=='plan'||!result.rows[0].includes('Small')) throw Error('Small variant not previewed');
await send('apply');
if(first.variantProperties.Size!=='Small') throw Error('Small variant not applied');
result=await send('preview','复制成三个按钮');
if(result.type!=='plan') throw Error('Duplication not previewed');
await send('apply');
const group=page.selection;
if(group.length!==3||group.some(n=>n.type!=='INSTANCE')||group[1].x!==first.x+first.width+12||group[2].x!==group[1].x+group[1].width+12) throw Error('Three connected buttons not placed in a row');
result=await send('preview','第二个改成灰色的，第三个改成红色的');
if(result.type!=='plan'||result.rows.length!==2) throw Error('Batch color preview missing');
await send('apply');
if(group[1].fills[0].color.r!==128/255||group[2].fills[0].color.r!==217/255||group.some(n=>!n.mainComponent)) throw Error('Color suggestions or component connections lost');
await send('undo');
if(undos!==1||commits!==4) throw Error('Step undo did not invoke Figma history');
events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:500,absoluteY:600});
includeSolo=false;
let beforeEnlarge=null;
for(const text of ['在这里放个按钮','再来两个，排成一行','中间那个低调一点，最后那个要有危险感','三个都大一点','太大了，退回去']){
  if(text==='三个都大一点')beforeEnlarge=page.selection.map(node=>[node.width,node.height]);
  const response=await send('auto',text);
  if(response.type!=='done'||!response.message.includes('Jev 判断')) throw Error(`Jev auto step failed: ${text} ${JSON.stringify(response)}`);
}
if(page.selection.some((node,index)=>node.width!==beforeEnlarge[index][0]||node.height!==beforeEnlarge[index][1]))
  throw Error('Natural correction did not restore the previous sizes');
const semantic=page.selection;
if(semantic.length!==3||semantic[0].variantProperties.Type!=='Primary'||semantic[1].variantProperties.Type!=='Secondary'||semantic[2].variantProperties.Type!=='Danger'||semantic.some(n=>!n.mainComponent)) throw Error('Semantic instance variants failed');
await send('undo');await send('undo');await send('undo');
if(undos!==5) throw Error('Per-step semantic undo failed');
for(const phrase of ['在这里加一个圆','在这儿画个圆形']){
  events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:700,absoluteY:500});
  const result=await send('auto',phrase);
  if(result.type!=='done')throw Error(`Circle phrase failed: ${phrase} ${JSON.stringify(result)}`);
  const circle=page.selection[0];
  if(circle.type!=='ELLIPSE'||circle.width!==circle.height||circle.x!==700||circle.y!==500)
    throw Error('Circle was not an equal-width-height ellipse at the canvas anchor');
  let changed=await send('auto','大一点');
  if(changed.type!=='done'||circle.width<=80||circle.width!==circle.height)
    throw Error('Circle relative resize failed');
  changed=await send('auto','改成红色');
  if(changed.type!=='done'||circle.fills[0].color.r!==217/255)
    throw Error('Circle fill color edit failed');
  const beforeUnsupported=commits;
  const unsupported=await send('auto','把这个圆改成危险按钮');
  if(unsupported.type!=='error'||!unsupported.message.includes('暂不支持')||commits!==beforeUnsupported)
    throw Error('Unsupported circle semantic-role edit should not mutate the canvas');
  await send('undo');await send('undo');await send('undo');
}
console.log('Workflow smoke: button sequence, circle creation/resize/fill in two phrasings, anchor, unsupported capability, undo passed');

// Mocked Figma host: final utterances execute without a per-step confirmation.
events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:900,absoluteY:500});
let response=await send('auto','在这里放个按钮');
if(response.type!=='done')throw Error('Button setup failed');
const textButton=page.selection[0];
for(const [phrase,expected] of [['在按钮中间加一个开始','开始'],['在按钮上填上开始','开始'],
  ['把按钮文字改成开始使用','开始使用']]){
  response=await send('auto',phrase);
  if(response.type!=='done'||textButton.componentProperties['ButtonText#0:1'].value!==expected||!textButton.mainComponent)
    throw Error('Spoken label did not update connected button: '+phrase);
}
response=await send('auto','把按钮文字改成');
if(response.type!=='error'||textButton.componentProperties['ButtonText#0:1'].value!=='开始使用')
  throw Error('Missing or forged transcript span should be rejected');
const beforeUndo=textButton.componentProperties['ButtonText#0:1'].value;
response=await send('auto','在按钮上填上开始');
if(response.type!=='done')throw Error('Sequential label edit failed');
await send('undo');
if(textButton.componentProperties['ButtonText#0:1'].value!==beforeUndo)throw Error('Spoken label undo failed');
response=await send('auto','再来两个，排成一行');
if(response.type!=='done'||page.selection.length!==3)throw Error('Text ambiguity setup failed');
const beforeAmbiguity=commits;
response=await send('auto','在按钮上填上开始');
if(response.type!=='error'||commits!==beforeAmbiguity)throw Error('Ambiguous button target changed canvas');
console.log('Text smoke: original transcript validation, three phrasings, connected instance label, ambiguity, sequential undo passed');

// A connected instance without a TEXT component property can use one editable text layer.
events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:1100,absoluteY:500});
response=await send('auto','在这里放个按钮');
if(response.type!=='done')throw Error('Text layer setup failed');
const fallbackButton=page.selection[0];
fallbackButton.componentProperties={};
const layer={characters:'旧文案',locked:false,getRangeAllFontNames:()=>[{family:'Inter',style:'Regular'}]};
fallbackButton.textLayers=[layer];
response=await send('auto','在按钮中间加一个开始');
if(response.type!=='done'||layer.characters!=='开始'||!fallbackButton.mainComponent)
  throw Error('Unique text layer fallback failed');
fallbackButton.textLayers.push({...layer});
const beforeUnsafe=commits;
response=await send('auto','把按钮文字改成开始使用');
if(response.type!=='error'||commits!==beforeUnsafe||layer.characters!=='开始')
  throw Error('Multiple text layers should reject without a write');

events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:1200,absoluteY:700});
response=await send('auto','在这里加一个圆');
if(response.type!=='done'||page.selection[0].type!=='ELLIPSE')throw Error('Circle creation regressed');
response=await send('auto','在圆中间写上开始');
const circleWithText=page.selection[0];
if(response.type!=='done'||circleWithText.type!=='FRAME'||circleWithText.getPluginData('jevKind')!=='circle'||
  circleWithText.children.find(child=>child.type==='TEXT')?.characters!=='开始'||
  circleWithText.children.find(child=>child.type==='ELLIPSE')?.parent!==circleWithText)
  throw Error('Circle text was not grouped with its graphic');
const circleX=circleWithText.x;
response=await send('auto','大一点');
if(response.type!=='done'||circleWithText.width<=80||circleWithText.children[0].width!==circleWithText.width)
  throw Error('Labeled circle did not scale as one object');
await send('undo');
if(circleWithText.width!==80)throw Error('Labeled circle size undo failed');
await send('undo');
if(page.selection[0]?.type!=='ELLIPSE'||page.selection[0].x!==circleX)throw Error('Graphic text wrap undo failed');

events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:1300,absoluteY:700});
response=await send('auto',compoundCircle);
const compoundNode=page.selection[0];
if(response.type!=='done'||compoundNode.type!=='FRAME'||compoundNode.width<=80||
  compoundNode.children.find(child=>child.type==='TEXT')?.characters!=='开始')
  throw Error('Dependent create → text → size sequence failed');
await send('undo');
if(page.selection[0]?.id===compoundNode.id)throw Error('Dependent sequence was not undone as one utterance');

events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:1400,absoluteY:700});
response=await send('auto',independentText);
if(response.type!=='done'||page.selection[0]?.type!=='TEXT'||page.selection[0].characters!=='欢迎')
  throw Error('Standalone text sequence failed');
await send('undo');

events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:1500,absoluteY:700});
response=await send('auto','在这里加个矩形');
if(response.type!=='done'||page.selection[0]?.type!=='RECTANGLE')throw Error('Rectangle creation regressed');
response=await send('auto','大一点');
if(response.type!=='done'||page.selection[0]?.width<=120)throw Error('Rectangle size edit regressed');
console.log('General text smoke: circle content, grouped scaling, dependent sequence, standalone text, rectangle regression and undo passed');

// New operation × operand commands use the same host and adapter path.
events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:1600,absoluteY:700});
response=await send('auto',requestedCircle);
const requestedNode=page.selection[0];
if(response.type!=='done'||requestedNode.type!=='FRAME'||requestedNode.width<=80||
  requestedNode.children.find(child=>child.type==='TEXT')?.characters!=='开始')
  throw Error('Requested circle dependent sequence failed');
response=await send('auto','把这个圆里的字删掉');
if(response.type!=='done'||page.selection[0]?.type!=='ELLIPSE'||page.selection[0]?.width<=80)
  throw Error('Removing associated text did not unwrap the same circle');
await send('undo');
if(page.selection[0]?.type!=='FRAME'||page.selection[0].children.find(child=>child.type==='TEXT')?.characters!=='开始')
  throw Error('Associated text removal undo failed');
response=await send('auto','把这个圆删掉');
if(response.type!=='done'||page.children.includes(requestedNode))throw Error('Circle object deletion failed');
await send('undo');
if(!page.children.includes(requestedNode))throw Error('Circle object deletion undo failed');

events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:1700,absoluteY:700});
response=await send('auto','在这里加个矩形');
if(response.type!=='done')throw Error('Rectangle stroke setup failed');
const strokeRectangle=page.selection[0];
response=await send('auto','给这个矩形加描边');
if(response.type!=='done'||strokeRectangle.strokes.length!==1||strokeRectangle.strokeWeight!==1)
  throw Error('Adding rectangle stroke failed');
response=await send('auto','把描边删掉');
if(response.type!=='done'||strokeRectangle.strokes.length!==0)throw Error('Removing rectangle stroke failed');
await send('undo');
if(strokeRectangle.strokes.length!==1)throw Error('Stroke removal undo failed');
const beforeIntrinsic=commits;
response=await send('auto','把宽度删掉');
if(response.type!=='error'||!response.message.includes('固有属性')||commits!==beforeIntrinsic)
  throw Error('Intrinsic width deletion should give an accurate refusal');
response=await send('auto','把描边删掉');
if(response.type!=='done'||strokeRectangle.strokes.length!==0)throw Error('Stroke setup clear failed');
response=await send('auto',strokeSequence);
if(response.type!=='done'||strokeRectangle.strokes.length!==0)throw Error('Dependent add/remove stroke failed');
await send('undo');
if(strokeRectangle.strokes.length!==0)throw Error('Stroke sequence undo did not restore the prior state');

events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:1800,absoluteY:700});
response=await send('auto',independentText);
const standalone=page.selection[0];
const deleteStandalone={kind:'edit',operation:'delete',operand:'text',target:'current',parameters:{expectedObject:'text'}};
interpreted['把这段独立文字删掉']=deleteStandalone;
response=await send('auto','把这段独立文字删掉');
if(response.type!=='done'||page.children.includes(standalone))throw Error('Standalone text deletion failed');
await send('undo');
if(!page.children.includes(standalone))throw Error('Standalone text deletion undo failed');
console.log('Delete smoke: one delete operation removes graphic text, design objects, strokes and standalone text; intrinsic width refused; undo passed');

events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:1900,absoluteY:700});
response=await send('auto','在这里加个矩形');
const labeledRectangle=page.selection[0];
const rectanglePhrase='在这个矩形中间写欢迎';
interpreted[rectanglePhrase]={kind:'edit',operation:'add',operand:'text',target:'current',parameters:{
  expectedObject:'rectangle',placement:'center',value:{kind:'text',text:'欢迎',
    source:{start:rectanglePhrase.indexOf('欢迎'),end:rectanglePhrase.length}}}};
response=await send('auto',rectanglePhrase);
if(response.type!=='done'||page.selection[0]?.type!=='FRAME'||
  page.selection[0].children.find(child=>child.type==='TEXT')?.characters!=='欢迎')
  throw Error('Rectangle associated text failed');
const movingGroup=page.selection[0],beforeMoveX=movingGroup.x;
response=await send('auto','把这个对象往右移 20 px');
if(response.type!=='done'||movingGroup.x!==beforeMoveX+20||movingGroup.children[0].parent!==movingGroup)
  throw Error('Graphic and text did not move as one object');
await send('undo');
if(movingGroup.x!==beforeMoveX)throw Error('Grouped move undo failed');

const genericComponent={id:'component-card',name:'Card',type:'COMPONENT',parent:page,width:100,height:40,variantProperties:null};
const card=instance(genericComponent);card.name='Card';page.appendChild(card);page.selection=[card];
const mistakenButton='在选中的按钮上写开始';
interpreted[mistakenButton]={kind:'edit',operation:'add',operand:'text',target:'selected',parameters:{
  expectedObject:'component',expectedSemantic:'button',placement:'center',
  value:{kind:'text',text:'开始',source:{start:mistakenButton.indexOf('开始'),end:mistakenButton.length}}}};
const beforeGeneric=commits;
response=await send('auto',mistakenButton);
if(response.type!=='error'||commits!==beforeGeneric||card.componentProperties['ButtonText#0:1'].value!=='按钮')
  throw Error('Generic component was incorrectly treated as a button');
const ordinaryFrame=frame();ordinaryFrame.name='普通 Frame';page.appendChild(ordinaryFrame);page.selection=[ordinaryFrame];
response=await send('auto',mistakenButton);
if(response.type!=='error'||commits!==beforeGeneric)throw Error('Generic Frame was incorrectly treated as a button');
events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:2000,absoluteY:700});
response=await send('auto','在这里放个按钮');
if(response.type!=='done')throw Error('Component override setup failed');
const overrideButton=page.selection[0];
response=await send('auto','在按钮上填上开始');
if(response.type!=='done'||overrideButton.componentProperties['ButtonText#0:1'].value!=='开始')
  throw Error('Component override setup text failed');
response=await send('auto','删除这个组件的覆盖');
if(response.type!=='done'||overrideButton.componentProperties['ButtonText#0:1'].value!=='按钮'||
  !overrideButton.mainComponent)throw Error('Removing direct component overrides failed');
await send('undo');
if(overrideButton.componentProperties['ButtonText#0:1'].value!=='开始')
  throw Error('Component override removal undo failed');
console.log('Capability smoke: rectangle text grouping, grouped move and undo, generic component/Frame button refusal passed');

// The same property commands reach the Figma adapter for every literal color.
events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:2100,absoluteY:700});
response=await send('auto','在这里加个矩形');
if(response.type!=='done')throw Error('Color and radius setup failed');
const rounded=page.selection[0];
const colors=[
  ['填充改成绿色','fill','green',{r:0,g:128/255,b:0}],
  ['描边设为黄色','stroke','yellow',{r:1,g:1,b:0}],
  ['填充改成白色','fill','white',{r:1,g:1,b:1}],
  ['填充改成 #123456','fill','#123456',{r:18/255,g:52/255,b:86/255}],
  ['填充改成蓝色','fill','blue',{r:13/255,g:117/255,b:232/255}],
  ['填充改成灰色','fill','gray',{r:128/255,g:128/255,b:128/255}]
];
for(const [phrase,property,name,rgb] of colors){
  interpreted[phrase]={kind:'edit',operation:'set',operand:'property',target:'current',parameters:{
    property,mode:'set',value:{kind:'color',source:'literal',name}}};
  response=await send('auto',phrase);
  const paint=(property==='stroke'?rounded.strokes:rounded.fills)[0];
  if(response.type!=='done'||JSON.stringify(paint?.color)!==JSON.stringify(rgb))
    throw Error('Literal color write failed: '+phrase);
}
const cornerCommands=[
  ['圆角设为 12 像素','set','set',{kind:'length',amount:12,unit:'px'},12],
  ['圆角大一点','adjust','increase',{kind:'step',count:1},14],
  ['圆角小一点','adjust','decrease',{kind:'step',count:1},12],
  ['去掉圆角','delete',undefined,undefined,0]
];
for(const [phrase,operation,mode,value,expected] of cornerCommands){
  interpreted[phrase]={kind:'edit',operation,operand:'property',target:'current',parameters:{
    property:'cornerRadius',...(mode?{mode,value}:{})}};
  response=await send('auto',phrase);
  if(response.type!=='done'||rounded.cornerRadius!==expected)throw Error('Rectangle radius write failed: '+phrase);
}
await send('undo');
if(rounded.cornerRadius!==12)throw Error('Corner radius delete undo failed');
const rectangleText='在这个矩形中间写欢迎';
page.selection=[rounded];
response=await send('auto',rectangleText);
if(response.type!=='done')throw Error('Labeled rectangle setup failed');
const roundedWrapper=page.selection[0];
response=await send('auto','圆角大一点');
if(response.type!=='done'||roundedWrapper.children.find(n=>n.type==='RECTANGLE')?.cornerRadius!==14)
  throw Error('Labeled rectangle inner shape radius failed');
await send('undo');
if(roundedWrapper.children.find(n=>n.type==='RECTANGLE')?.cornerRadius!==12)
  throw Error('Labeled rectangle radius undo failed');
const black='文字改为黑色';
interpreted[black]={kind:'edit',operation:'set',operand:'property',target:'current',parameters:{
  property:'textColor',mode:'set',value:{kind:'color',source:'literal',name:'black'}}};
// Text color applies to a standalone text node, while graphic text remains a separate capability.
events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:2200,absoluteY:700});
response=await send('auto',independentText);
if(response.type!=='done')throw Error('Standalone text color setup failed');
const coloredText=page.selection[0];
response=await send('auto',black);
if(response.type!=='done'||JSON.stringify(coloredText.fills[0]?.color)!==JSON.stringify({r:0,g:0,b:0}))
  throw Error('Black text color write failed');
await send('undo');
if(coloredText.fills.length!==0)throw Error('Text color undo failed');
events.drop({node:page,dropMetadata:{kind:'creation-anchor'},absoluteX:2300,absoluteY:700});
response=await send('auto','在这里加一个圆');
const beforeCircleRadius=commits;
response=await send('auto','圆角设为 12 像素');
if(response.type!=='error'||!response.message.includes('暂不支持')||commits!==beforeCircleRadius)
  throw Error('Circle radius edit should be refused without mutation');
console.log('Color and corner radius smoke: literal fill/stroke/text colors, rectangle and labeled container radius, refusal and undo passed');
