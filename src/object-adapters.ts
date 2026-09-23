import type {ChangeMode,EditValue,TextContent,ModifyCommand,NamedColor,ObjectKind,Role} from './live-command';
import {applyWorkflow,previewWorkflow,semanticVariant} from './workflow';

export type Editable=InstanceNode|FrameNode|EllipseNode|RectangleNode|TextNode;
type Anchor={x:number;y:number;pageId:string};
type Action='create'|'duplicate'|'modify'|'move'|'arrange'|'delete';
type Property=ModifyCommand['property'];
export type PreparedChange={apply:()=>void;description:string;resultingNode?:()=>Editable};

/** Add an object by declaring capabilities and its small Figma adapter. */
export interface FigmaObjectAdapter {
  kind:ObjectKind;
  actions:readonly Action[];
  properties:readonly Property[];
  addable:readonly Property[];
  removable:readonly Property[];
  createRelative:boolean;
  matches(node:SceneNode):node is Editable;
  create(anchor:Anchor,role?:Role,content?:TextContent):Promise<{node:Editable;detail:string;committed:boolean}>;
  planModify(node:Editable,command:ModifyCommand):Promise<PreparedChange>;
  planAdd?(node:Editable,property:Property,value?:EditValue):Promise<PreparedChange>;
  planRemove?(node:Editable,property:Property):Promise<PreparedChange>;
}

const palette:Record<NamedColor,{r:number;g:number;b:number}>={
  red:{r:217/255,g:45/255,b:32/255},danger:{r:217/255,g:45/255,b:32/255},
  blue:{r:13/255,g:117/255,b:232/255},primary:{r:13/255,g:117/255,b:232/255},
  gray:{r:128/255,g:128/255,b:128/255},secondary:{r:128/255,g:128/255,b:128/255},
  green:{r:0,g:128/255,b:0},yellow:{r:1,g:1,b:0},black:{r:0,g:0,b:0},white:{r:1,g:1,b:1}
};

async function colorPaint(name:NamedColor|`#${string}`,source:'literal'|'semantic'):Promise<SolidPaint>{
  if(name.startsWith('#')){
    const hex=name.slice(1);
    if(!/^[0-9a-fA-F]{6}$/.test(hex))throw Error('十六进制颜色格式无效。');
    return {type:'SOLID',color:{r:parseInt(hex.slice(0,2),16)/255,
      g:parseInt(hex.slice(2,4),16)/255,b:parseInt(hex.slice(4,6),16)/255}};
  }
  const named=name as NamedColor;
  const paint:SolidPaint={type:'SOLID',color:palette[named]};
  if(source==='literal')return paint;
  const aliases:Record<NamedColor,RegExp>={
    red:/red|红/i,danger:/danger|destructive|危险/i,
    blue:/blue|蓝/i,primary:/primary|主要/i,
    gray:/gray|grey|灰/i,secondary:/secondary|次要/i,
    green:/green|绿/i,yellow:/yellow|黄/i,black:/black|黑/i,white:/white|白/i
  };
  const matches=(await figma.variables.getLocalVariablesAsync()).filter(variable=>
    variable.resolvedType==='COLOR'&&aliases[named].test(variable.name));
  return matches.length===1?figma.variables.setBoundVariableForPaint(paint,'color',matches[0]):paint;
}

function dimensions(node:Editable,mode:ChangeMode,value:EditValue|TextContent|undefined,property:'size'|'width'|'height'='size'):PreparedChange{
  const length=value?.kind==='length'?value.amount:null;
  if(mode==='set'&&length===null)throw Error('设置尺寸需要带 px 的数值。');
  const change=(current:number)=>{
    if(mode==='set')return length!;
    if(length!==null)return current+(mode==='increase'?length:-length);
    return Math.round(current*(mode==='increase'?1.1:0.9));
  };
  let width=node.width,height=node.height;
  if(property==='size'){
    if(node.width<=0)throw Error('空文字还没有可缩放尺寸；请先写入内容。');
    const scale=change(node.width)/node.width;
    width=Math.max(1,Math.round(node.width*scale));height=Math.max(1,Math.round(node.height*scale));
  }else if(property==='width')width=Math.max(1,Math.round(change(node.width)));
  else height=Math.max(1,Math.round(change(node.height)));
  if(node.type==='ELLIPSE'){
    const equal=property==='height'?height:width;width=equal;height=equal;
  }
  if(node.type==='FRAME'&&['circle','rectangle'].includes(node.getPluginData('jevKind'))){
    if(property==='size'){
      const scale=width/node.width;
      return {apply:()=>node.rescale(scale),description:node.name+' → '+width+'×'+height+' px'};
    }
    if(node.getPluginData('jevKind')==='circle')throw Error('带文字的圆形只支持整体等比缩放；画布未修改。');
    const shape=node.children.find(child=>child.type==='RECTANGLE');
    const label=node.children.find(child=>child.type==='TEXT');
    if(!shape||!label)throw Error('图形容器结构已变化；画布未修改。');
    return {apply:()=>{node.resize(width,height);shape.resize(width,height);
      label.x=(width-label.width)/2;label.y=(height-label.height)/2;},
      description:node.name+' → '+width+'×'+height+' px'};
  }
  return {apply:()=>node.type==='TEXT'?node.rescale(width/node.width):node.resize(width,height),
    description:node.name+' → '+width+'×'+height+' px'};
}

/** Resolve exactly one safe label destination before mutating the canvas. */
async function componentContent(node:InstanceNode,command:ModifyCommand):Promise<PreparedChange>{
  const value=command.value;
  if(command.mode!=='set'||value?.kind!=='text'||command.slot!=='content')
    throw Error('文字命令缺少明确的标签内容。');
  const label=value.text;
  if(node.locked)throw Error('按钮已锁定；画布未修改。');
  const properties=Object.entries(node.componentProperties).filter(([,property])=>property.type==='TEXT');
  if(properties.length>1)throw Error('组件实例有多个文字属性，无法确定内容；画布未修改。');
  if(properties.length===1){
    const [name]=properties[0];
    return {apply:()=>node.setProperties({[name]:label}),description:node.name+' 文字 → '+label};
  }
  const texts=node.findAllWithCriteria({types:['TEXT']}).filter(item=>!item.locked);
  if(texts.length>1)throw Error('组件内有多个文本层，无法确定内容；画布未修改。');
  if(texts.length===1){
    const text=texts[0];
    const fonts=text.characters.length?text.getRangeAllFontNames(0,text.characters.length):
      text.fontName===figma.mixed?[]:[text.fontName];
    if(!fonts.length)throw Error('组件文字字体不明确；画布未修改。');
    await Promise.all(fonts.map(font=>figma.loadFontAsync(font)));
    return {apply:()=>{text.characters=label;},description:node.name+' 文字 → '+label};
  }
  throw Error('组件实例没有安全的文字属性或文本层；画布未修改。');
}

function graphicShape(node:Editable):EllipseNode|RectangleNode|null{
  if(node.type==='ELLIPSE'||node.type==='RECTANGLE')return node;
  if(node.type==='FRAME'&&['circle','rectangle'].includes(node.getPluginData('jevKind'))){
    const shape=node.children.find(child=>child.type==='ELLIPSE'||child.type==='RECTANGLE');
    return shape?.type==='ELLIPSE'||shape?.type==='RECTANGLE'?shape:null;
  }
  return null;
}

async function graphicContent(node:EllipseNode|RectangleNode|FrameNode,command:ModifyCommand):Promise<PreparedChange>{
  if(command.value?.kind!=='text'||command.slot!=='content'||command.mode!=='set')
    throw Error('图形文字缺少明确的原文内容。');
  await figma.loadFontAsync({family:'Inter',style:'Regular'});
  const content=command.value.text;
  if(node.type==='FRAME'){
    const labels=node.children.filter(child=>child.type==='TEXT');
    if(labels.length!==1||node.children.length!==2)throw Error('图形文字容器结构已变化；画布未修改。');
    const label=labels[0];
    const fonts=label.characters.length?label.getRangeAllFontNames(0,label.characters.length):
      label.fontName===figma.mixed?[]:[label.fontName];
    if(!fonts.length)throw Error('图形文字字体不明确；画布未修改。');
    await Promise.all(fonts.map(font=>figma.loadFontAsync(font)));
    return {apply:()=>{label.characters=content;label.x=(node.width-label.width)/2;
      label.y=(node.height-label.height)/2;},description:node.name+' 文字 → '+content};
  }
  let wrapper:FrameNode|undefined;
  return {apply:()=>{
    const page=figma.currentPage;
    const x=node.x,y=node.y,width=node.width,height=node.height;
    wrapper=figma.createFrame();wrapper.name=node.name+' · 文字';
    wrapper.resize(width,height);wrapper.x=x;wrapper.y=y;
    wrapper.fills=[];wrapper.clipsContent=false;wrapper.setPluginData('jevKind',node.type==='ELLIPSE'?'circle':'rectangle');
    page.appendChild(wrapper);wrapper.appendChild(node);node.x=0;node.y=0;
    const label=figma.createText();label.name='内容';
    label.fontName={family:'Inter',style:'Regular'};label.characters=content;
    wrapper.appendChild(label);label.x=(width-label.width)/2;label.y=(height-label.height)/2;
    page.selection=[wrapper];
  },resultingNode:()=>wrapper!,description:node.name+' 中间文字 → '+content};
}

async function graphicsProperty(node:EllipseNode|RectangleNode|FrameNode,command:ModifyCommand):Promise<PreparedChange>{
  if(command.property==='content')return graphicContent(node,command);
  if(command.property==='size'||command.property==='width'||command.property==='height'){
    if(node.type==='FRAME'){
      const labels=node.findAllWithCriteria({types:['TEXT']});
      for(const label of labels){
        const fonts=label.characters.length?label.getRangeAllFontNames(0,label.characters.length):
          label.fontName===figma.mixed?[]:[label.fontName];
        if(!fonts.length)throw Error('图形文字字体不明确；无法整体缩放。');
        await Promise.all(fonts.map(font=>figma.loadFontAsync(font)));
      }
    }
    return dimensions(node,command.mode,command.value,command.property);
  }
  const shape=graphicShape(node);
  if(!shape)throw Error('图形容器结构已变化；画布未修改。');
  if(command.property==='cornerRadius'){
    if(shape.type!=='RECTANGLE')throw Error('圆形暂不支持圆角；画布未修改。');
    const old=shape.cornerRadius;
    if(typeof old!=='number')throw Error('混合圆角无法直接调整；画布未修改。');
    const value=command.value;
    const amount=value?.kind==='length'?value.amount:value?.kind==='step'?2:null;
    if(amount===null)throw Error('圆角需要带 px 的数值或明确的调整方向。');
    const next=command.mode==='set'?amount:Math.max(0,old+(command.mode==='increase'?amount:-amount));
    if(next>10000)throw Error('圆角超出 0–10000 px；画布未修改。');
    return {apply:()=>{shape.cornerRadius=next;},description:node.name+' 圆角 → '+next+' px'};
  }
  if(command.property==='strokeWidth'){
    if(command.value?.kind!=='length')throw Error('描边宽度需要带 px 的数值。');
    const old=shape.strokeWeight;
    if(typeof old!=='number')throw Error('混合描边宽度无法直接调整。');
    const amount=command.value.amount;
    const next=command.mode==='set'?amount:old+(command.mode==='increase'?amount:-amount);
    if(next<0||next>1000)throw Error('描边宽度超出 0–1000 px。');
    return {apply:()=>{shape.strokeWeight=next;},description:node.name+' 描边宽度 → '+next+' px'};
  }
  if(command.property==='fill'||command.property==='stroke'){
    if(command.mode!=='set'||command.value?.kind!=='color')throw Error('请明确设置的颜色。');
    const paint=await colorPaint(command.value.name,command.value.source);
    return {apply:()=>{if(command.property==='fill')shape.fills=[paint];else shape.strokes=[paint];},
      description:node.name+' '+(command.property==='fill'?'填充':'描边')+' → '+command.value.name};
  }
  throw Error(node.type+' 暂不支持 '+command.property+'；画布未修改。');
}

const graphics=(kind:'circle'|'rectangle'):FigmaObjectAdapter=>({
  kind,actions:['create','duplicate','modify','move','arrange','delete'],
  properties:kind==='circle'?['size','fill','stroke','strokeWidth','content']:
    ['size','width','height','cornerRadius','fill','stroke','strokeWidth','content'],
  addable:['stroke'],removable:kind==='rectangle'?['content','stroke','fill','cornerRadius']:['content','stroke','fill'],createRelative:true,
  matches:(node):node is EllipseNode|RectangleNode|FrameNode=>
    (kind==='circle'?node.type==='ELLIPSE':node.type==='RECTANGLE')||
    node.type==='FRAME'&&node.getPluginData('jevKind')===kind,
  async create(anchor,role){
    if(role)throw Error('图形不支持按钮语义类型。');
    const node=kind==='circle'?figma.createEllipse():figma.createRectangle();
    node.name=kind==='circle'?'圆形':'矩形';
    node.resize(kind==='circle'?80:120,kind==='circle'?80:80);
    figma.currentPage.appendChild(node);node.x=anchor.x;node.y=anchor.y;
    figma.currentPage.selection=[node];
    return {node,detail:'在画布 ('+Math.round(anchor.x)+', '+Math.round(anchor.y)+') 创建 '+node.width+'×'+node.height+' '+node.name+'。',committed:false};
  },
  async planModify(node,command){
    if(node.type!=='ELLIPSE'&&node.type!=='RECTANGLE'&&node.type!=='FRAME')throw Error('目标不是基础图形。');
    return graphicsProperty(node,command);
  },
  async planAdd(node,property,value){
    if(property!=='stroke')throw Error('图形不支持添加 '+property+'。');
    const shape=graphicShape(node);if(!shape)throw Error('图形结构已变化。');
    if(Array.isArray(shape.strokes)&&shape.strokes.length)throw Error('目标已有描边；请改颜色或宽度。');
    const paint=value?.kind==='color'?await colorPaint(value.name,value.source):
      {type:'SOLID' as const,color:{r:0,g:0,b:0}};
    return {apply:()=>{shape.strokes=[paint];shape.strokeWeight=1;},description:node.name+' 已添加 1 px 描边'};
  },
  async planRemove(node,property){
    const shape=graphicShape(node);if(!shape)throw Error('图形结构已变化。');
    if(property==='cornerRadius'){
      if(shape.type!=='RECTANGLE')throw Error('圆形暂不支持圆角；画布未修改。');
      if(typeof shape.cornerRadius!=='number')throw Error('混合圆角无法安全移除；画布未修改。');
      return {apply:()=>{shape.cornerRadius=0;},description:node.name+' 圆角 → 0 px'};
    }
    if(property==='stroke'){
      if(!Array.isArray(shape.strokes)||!shape.strokes.length)throw Error('目标没有可删除的描边；画布未修改。');
      return {apply:()=>{shape.strokes=[];},description:node.name+' 已移除描边'};
    }
    if(property==='fill'){
      if(!Array.isArray(shape.fills)||!shape.fills.length)throw Error('目标没有可删除的填充；画布未修改。');
      return {apply:()=>{shape.fills=[];},description:node.name+' 已移除填充'};
    }
    if(property!=='content')throw Error('图形不支持删除 '+property+'。');
    if(node.type!=='FRAME')throw Error('该图形没有关联文字；画布未修改。');
    const labels=node.children.filter(child=>child.type==='TEXT');
    if(labels.length!==1||node.children.length!==2)throw Error('图形文字容器结构已变化；画布未修改。');
    let result:EllipseNode|RectangleNode|undefined;
    return {apply:()=>{
      const x=node.x,y=node.y;
      figma.currentPage.appendChild(shape);shape.x=x;shape.y=y;
      node.remove();figma.currentPage.selection=[shape];result=shape;
    },resultingNode:()=>result!,description:node.name+' 已删除关联文字'};
  }
});

export async function isButtonInstance(node:InstanceNode):Promise<boolean>{
  if(node.getPluginData('jevSemantic')==='button')return true;
  try{
    const main=await node.getMainComponentAsync();
    return /button|按钮/i.test(main?.name||'')||/button|按钮/i.test(main?.parent?.name||'');
  }catch{return false;}
}

const component:FigmaObjectAdapter={
  kind:'component',actions:['create','duplicate','modify','move','arrange','delete'],
  properties:['size','width','height','semanticRole','content'],addable:[],
  removable:['content','componentOverride'],createRelative:false,
  matches:(node):node is InstanceNode=>node.type==='INSTANCE',
  async create(_anchor,role){
    if(role&&role!=='primary')throw Error('创建时只支持默认或主要按钮；创建后可改语义类型。');
    const preview=await previewWorkflow({kind:'createButton',...(role?{role:'primary' as const}:{})});
    if(preview.choices)throw Error('找到多个按钮组件，请先在规则预览中选择来源。');
    if(!preview.candidateId)throw Error('当前文件没有按钮组件；语音不会悄悄创建普通图形。');
    const detail=await applyWorkflow(preview);
    const node=figma.currentPage.selection[0];
    if(!node||!component.matches(node))throw Error('按钮创建后无法确认目标。');
    node.setPluginData('jevSemantic','button');
    return {node,detail,committed:true};
  },
  async planModify(node,command){
    if(node.type!=='INSTANCE')throw Error('目标不是组件实例。');
    if(command.property==='content')return componentContent(node,command);
    if(command.property==='semanticRole'){
      if(command.value?.kind!=='role')throw Error('请明确按钮语义类型。');
      if(!await isButtonInstance(node))throw Error(node.name+' 不是按钮组件实例，无法切换语义类型。');
      const main=await node.getMainComponentAsync();
      const component=main&&semanticVariant(node,command.value.name,main);
      if(!component)throw Error(node.name+' 找不到 '+command.value.name+' 组件变体。');
      return {apply:()=>node.swapComponent(component),description:node.name+' → '+command.value.name};
    }
    if(command.property==='size'||command.property==='width'||command.property==='height'){
      if(command.property==='size'&&command.value?.kind==='step'&&node.type==='INSTANCE'){
        const main=await node.getMainComponentAsync();
        if(main?.parent?.type==='COMPONENT_SET'){
          const props=node.variantProperties||{};
          const key=Object.keys(props).find(item=>/^(size|尺寸)$/i.test(item));
          const levels=['small','medium','large'];
          const index=key?levels.indexOf((props[key]||'').toLowerCase()):-1;
          const next=index+(command.mode==='increase'?1:-1);
          if(key&&index>=0&&next>=0&&next<levels.length){
            const variant=main.parent.children.find(item=>item.type==='COMPONENT'&&
              item.variantProperties?.[key]?.toLowerCase()===levels[next]&&
              Object.entries(props).every(([field,value])=>field===key||item.variantProperties?.[field]===value));
            if(variant?.type==='COMPONENT')return {apply:()=>node.swapComponent(variant),description:node.name+' → '+variant.name};
          }
        }
      }
      return dimensions(node,command.mode,command.value,command.property);
    }
    throw Error('component 暂不支持 '+command.property+'；画布未修改。');
  },
  async planRemove(node,property){
    if(node.type!=='INSTANCE')throw Error('目标不是组件实例。');
    if(property==='componentOverride'){
      if(node.overrides.length===0)throw Error('组件没有直接覆盖可移除；画布未修改。');
      return {apply:()=>node.removeOverrides(),description:node.name+' 已移除全部直接覆盖'};
    }
    if(property!=='content')throw Error('组件不支持删除 '+property+'。');
    const properties=Object.entries(node.componentProperties).filter(([,item])=>item.type==='TEXT');
    if(properties.length>1)throw Error('组件有多个文字属性，无法明确删除哪个。');
    if(properties.length===1){
      const [name]=properties[0];
      if(properties[0][1].value==='')throw Error('组件文字已经为空；画布未修改。');
      return {apply:()=>node.setProperties({[name]:''}),description:node.name+' 已清空文字属性'};
    }
    const texts=node.findAllWithCriteria({types:['TEXT']});
    if(texts.length!==1)throw Error('组件没有唯一可安全清空的文字层。');
    const label=texts[0];
    if(!label.characters)throw Error('组件文字已经为空；画布未修改。');
    const fonts=label.characters.length?label.getRangeAllFontNames(0,label.characters.length):
      label.fontName===figma.mixed?[]:[label.fontName];
    if(!fonts.length)throw Error('文字字体不明确。');
    await Promise.all(fonts.map(font=>figma.loadFontAsync(font)));
    return {apply:()=>{label.characters='';},description:node.name+' 已清空文字层'};
  }
};

const textObject:FigmaObjectAdapter={
  kind:'text',actions:['create','duplicate','modify','move','arrange','delete'],
  properties:['content','size','textColor'],addable:[],removable:[],createRelative:true,
  matches:(node):node is TextNode=>node.type==='TEXT',
  async create(anchor,_role,content){
    await figma.loadFontAsync({family:'Inter',style:'Regular'});
    const node=figma.createText();node.name='文字';node.fontName={family:'Inter',style:'Regular'};
    node.characters=content?.text||'';
    figma.currentPage.appendChild(node);node.x=anchor.x;node.y=anchor.y;
    figma.currentPage.selection=[node];
    return {node,detail:'在画布创建文字'+(content?'：'+content.text:'。'),committed:false};
  },
  async planModify(node,command){
    if(node.type!=='TEXT')throw Error('目标不是文字节点。');
    if(command.property==='content'){
      if(command.value?.kind!=='text')throw Error('文字内容不明确。');
      const fonts=node.characters.length?node.getRangeAllFontNames(0,node.characters.length):
        node.fontName===figma.mixed?[]:[node.fontName];
      if(!fonts.length)throw Error('文字字体不明确；画布未修改。');
      await Promise.all(fonts.map(font=>figma.loadFontAsync(font)));
      const content=command.value.text;
      return {apply:()=>{node.characters=content;},description:node.name+' → '+content};
    }
    if(command.property==='size'){
      const fonts=node.characters.length?node.getRangeAllFontNames(0,node.characters.length):
        node.fontName===figma.mixed?[]:[node.fontName];
      if(!fonts.length)throw Error('文字字体不明确；无法缩放。');
      await Promise.all(fonts.map(font=>figma.loadFontAsync(font)));
      return dimensions(node,command.mode,command.value);
    }
    if(command.property==='textColor'){
      if(command.value?.kind!=='color')throw Error('请明确文字颜色。');
      const paint=await colorPaint(command.value.name,command.value.source);
      return {apply:()=>{node.fills=[paint];},description:node.name+' 文字颜色 → '+command.value.name};
    }
    throw Error('文字对象暂不支持 '+command.property+'；画布未修改。');
  }
};

export const adapters:Record<ObjectKind,FigmaObjectAdapter>={component,circle:graphics('circle'),rectangle:graphics('rectangle'),text:textObject};
export function adapterFor(node:SceneNode):FigmaObjectAdapter|null{
  return adapters.circle.matches(node)?adapters.circle:adapters.rectangle.matches(node)?adapters.rectangle:
    component.matches(node)?component:textObject.matches(node)?textObject:null;
}
export function requireAction(adapter:FigmaObjectAdapter,action:Action):void{
  if(!adapter.actions.includes(action))throw Error(adapter.kind+' 暂不支持 '+action+'；画布未修改。');
}
export function requireProperty(adapter:FigmaObjectAdapter,property:Property):void{
  if(!adapter.properties.includes(property))throw Error(adapter.kind+' 暂不支持 '+property+'；画布未修改。');
}
export function requireAddable(adapter:FigmaObjectAdapter,property:Property):void{
  if(!adapter.addable.includes(property)||!adapter.planAdd)
    throw Error(adapter.kind+' 暂不支持添加 '+property+'；画布未修改。');
}
export function requireRemovable(adapter:FigmaObjectAdapter,property:Property):void{
  if(property==='width'||property==='height'||property==='size')
    throw Error('宽高和尺寸是对象固有属性，不能删除；画布未修改。');
  if(!adapter.removable.includes(property)||!adapter.planRemove)
    throw Error(adapter.kind+' 暂不支持删除 '+property+'；画布未修改。');
}
