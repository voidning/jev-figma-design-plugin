const minimumConfidence=.8;
const axisNames={operation:'操作',operand:'操作对象',objectFamily:'对象类别',shapeKind:'图形种类',
  componentSemantic:'组件语义',target:'目标对象',position:'位置',attributeCategory:'属性类别',
  attributeDetail:'具体属性',change:'变化方式',valueKind:'值类型',semanticColor:'语义颜色',
  role:'组件角色',layout:'排列方向',quantityMode:'数量含义'};

export class UncertainChoiceError extends Error {
  constructor(axis){
    super(`Jev 对“${axisNames[axis]||axis}”的判断不够明确；画布未修改。`);
    this.axis=axis;
  }
}

/** Combine orthogonal judgments into one typed operation × operand × target × parameters command. */
export function compose(answers,utterance,context={},content){
  const used=[];
  function read(key,allowed){
    const answer=answers?.[key];
    if(answer?.type!=='choice'||typeof answer.confidence!=='number'||answer.confidence<minimumConfidence)
      throw new UncertainChoiceError(key);
    if(!allowed.includes(answer.choice))
      throw Error(`Jev 对“${axisNames[key]||key}”没有选出可执行的选项；画布未修改。`);
    used.push(answer.confidence);
    return answer.choice;
  }
  function optional(key,allowed){
    const answer=answers?.[key];
    if(answer?.type!=='choice'||answer.confidence<minimumConfidence||!allowed.includes(answer.choice))return undefined;
    return answer.choice;
  }
  const operation=read('operation',['add','delete','set','adjust','duplicate','move','arrange','undo','unknown']);
  if(operation==='unknown')throw Error('没有明确的受支持操作。');
  const result=(operand,parameters={},target)=>({command:{kind:'edit',operation,operand,
    ...(target?{target}:{}),parameters},confidence:Math.min(...used)});
  if(operation==='undo')return result('object');

  const operand=read('operand',['object','text','property','none']);
  if(operand==='none')throw Error('无法确定本句要操作的对象、文字或属性。');
  const target=()=>{
    const value=read('target',['current','selected','previous','first','middle','last','all','named','unknown']);
    if(value==='unknown')throw Error('无法确定编辑目标。');
    return value;
  };
  const expected=()=>{
    const family=optional('objectFamily',['component','graphic','text','unknown']);
    if(family==='graphic'){
      const shape=optional('shapeKind',['circle','rectangle','none']);
      return shape==='circle'||shape==='rectangle'?{expectedObject:shape}:{};
    }
    if(family==='component'){
      const semantic=optional('componentSemantic',['button','generic','none']);
      return {expectedObject:'component',...(semantic==='button'?{expectedSemantic:'button'}:{})};
    }
    return family==='text'?{expectedObject:'text'}:{};
  };
  const position=()=>read('position',['here','insideCenter','inside','left','right','above','below','none']);

  if(operation==='add'&&operand==='object'){
    const family=read('objectFamily',['component','graphic','text','unknown']);
    let object;
    if(family==='graphic')object=read('shapeKind',['circle','rectangle']);
    else if(family==='component'){
      const semantic=read('componentSemantic',['button','generic','none']);
      if(semantic!=='button')throw Error('当前只能创建已识别为按钮的组件。');
      object='component';
    }else if(family==='text')object='text';
    else throw Error('请明确要创建的设计对象。');
    const where=position();
    if(where==='none'||where==='inside'||where==='insideCenter')throw Error('请说明画布落点或相对位置。');
    const placement=where==='here'?{kind:'anchor'}:{kind:'relative',reference:target(),direction:where};
    const parameters={object,position:placement,...(object==='component'?{semantic:'button'}:{})};
    if(object==='text'&&content)parameters.content=content;
    if(object==='component'){
      const role=optional('role',['primary','secondary','danger','none']);
      if(role&&role!=='none')parameters.role=role;
    }
    return result('object',parameters);
  }

  if(operation==='delete'){
    if(operand==='property')return result(operand,{...attribute(answers,read),...expected()},target());
    return result(operand,expected(),target());
  }
  if((operation==='add'||operation==='set')&&operand==='text'){
    if(!content)throw Error('没有明确的原文文字片段；画布未修改。');
    const where=position();
    if(!['insideCenter','inside','none'].includes(where))throw Error('请说明文字在目标内部的位置。');
    return result('text',{value:content,placement:where==='insideCenter'?'center':'existing-or-center',...expected()},target());
  }
  if((operation==='add'||operation==='set'||operation==='adjust')&&operand==='property'){
    const named=attribute(answers,read);
    const change=operation==='adjust'?read('change',['increase','decrease','restore']):'set';
    let value;
    if(operation==='add'&&named.property==='stroke'){
      // A plain “add stroke” uses the executor's documented default.
      const kind=optional('valueKind',['literalColor','semanticColor','none']);
      if(kind==='literalColor'||kind==='semanticColor')value=colorValue(kind,utterance,read);
    }else if(change!=='restore')value=propertyValue(named.property,change,utterance,read);
    return result('property',{...named,mode:change,...(value?{value}:{}),...expected()},target());
  }
  if(operation==='duplicate'){
    const quantityMode=read('quantityMode',['additional','total']);
    // An unspecified arrangement uses the plugin's visible horizontal default.
    // An uncertain Jev answer still triggers a focused question instead of guessing.
    const layout=read('layout',['horizontal','vertical','none']);
    const direction=layout==='none'?'horizontal':layout;
    return result('object',{additional:additionalCopies(utterance,context.activeCount||0,quantityMode),
      arrangement:direction,...expected()},target());
  }
  if(operation==='move'){
    const direction=position();
    if(!['left','right','above','below'].includes(direction))throw Error('请说明移动方向。');
    return result('object',{direction,distance:parseLength(utterance)||{kind:'length',amount:16,unit:'px'},...expected()},target());
  }
  if(operation==='arrange'){
    const direction=read('layout',['horizontal','vertical']);
    return result('object',{direction,...expected()},target());
  }
  throw Error('这个操作与操作对象的组合尚不支持；画布未修改。');
}

const detailCategory={
  size:'dimensions',width:'dimensions',height:'dimensions',cornerRadius:'dimensions',fill:'color',textColor:'color',
  stroke:'stroke',strokeWidth:'stroke',layout:'layout',semanticRole:'componentRole',
  componentOverride:'componentOverride',content:'content'
};
function attribute(_answers,read){
  const category=read('attributeCategory',['dimensions','color','stroke','layout','textStyle','componentRole','componentOverride','content','none']);
  const property=read('attributeDetail',Object.keys(detailCategory));
  if(category==='none'||detailCategory[property]!==category)
    throw Error('属性类别与细项不一致；画布未修改。');
  return {property};
}
function propertyValue(property,change,utterance,read){
  if(['size','width','height','cornerRadius','strokeWidth'].includes(property)){
    const kind=read('valueKind',['length','step','none']);
    const exact=parseLength(utterance);
    if(kind==='length'&&exact)return exact;
    if(kind==='step'&&change!=='set'&&property!=='strokeWidth')return {kind:'step',count:1};
    throw Error('请给出明确的尺寸档位或带单位数值。');
  }
  if(['fill','stroke','textColor'].includes(property)){
    const kind=read('valueKind',['literalColor','semanticColor']);
    return colorValue(kind,utterance,read);
  }
  if(property==='semanticRole'){
    read('valueKind',['role']);
    const role=read('role',['primary','secondary','danger']);
    return {kind:'role',name:role};
  }
  if(property==='layout'){
    read('valueKind',['layout']);
    return {kind:'layout',direction:read('layout',['horizontal','vertical'])};
  }
  throw Error('该属性缺少可执行的值；画布未修改。');
}
function colorValue(kind,utterance,read){
  if(kind==='semanticColor')return {kind:'color',source:'semantic',name:read('semanticColor',['primary','secondary','danger'])};
  const matches=[...String(utterance).matchAll(/#[0-9a-fA-F]{6}\b|红色|蓝色|灰色|绿色|黄色|黑色|白色|\b(?:red|blue|gray|grey|green|yellow|black|white)\b/gi)];
  const names={红色:'red',蓝色:'blue',灰色:'gray',绿色:'green',黄色:'yellow',黑色:'black',白色:'white',grey:'gray'};
  const colors=[...new Set(matches.map(([raw])=>raw.startsWith('#')?raw.toLowerCase():names[raw.toLowerCase()]||raw.toLowerCase()))];
  if(colors.length!==1)throw Error('无法从原文读取唯一明确的颜色值；画布未修改。');
  return {kind:'color',source:'literal',name:colors[0]};
}

// Jev decides whether the count is additional or total. Code reads the exact
// numeral from the transcript, without adding a rule for each spoken number.
const maxDuplicateObjects=20;
const countToken='(?:\\d+|[零一二两三四五六七八九十百千]+)';
function parseCount(token){
  if(/^\d+$/.test(token))return Number(token);
  const normalized=token.replaceAll('两','二');
  const digits='一二三四五六七八九';
  if(normalized.length===1)return digits.includes(normalized)?digits.indexOf(normalized)+1:NaN;
  const tens=normalized.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/);
  if(!tens)return NaN;
  return (tens[1]?digits.indexOf(tens[1])+1:1)*10+
    (tens[2]?digits.indexOf(tens[2])+1:0);
}
function transcriptCount(text){
  const transcript=String(text);
  const counted=[...transcript.matchAll(new RegExp(`(${countToken})\\s*(?:个|份)`,'g'))];
  let matches=counted;
  if(counted.length>1){
    // An earlier count may describe the existing group: “把三个复制成五份”.
    const cues=[...transcript.matchAll(/复制|再来|变成|总共|一共/g)];
    matches=cues.length===1?counted.filter(match=>match.index>cues[0].index):[];
  }
  if(counted.length===0)matches=[...transcript.matchAll(new RegExp(countToken,'g'))];
  if(matches.length!==1)throw Error('无法从原文读取唯一明确的复制数量；画布未修改。');
  return parseCount(matches[0][1]||matches[0][0]);
}
export function additionalCopies(text,currentCount,quantityMode){
  const value=transcriptCount(text);
  if(!Number.isSafeInteger(value)||value<1)throw Error('请说清楚要复制几个对象。');
  const additional=quantityMode==='additional'?value:quantityMode==='total'?value-currentCount:NaN;
  if(additional===0)throw Error('当前对象数量已经符合要求；画布未修改。');
  if(additional<0)throw Error('复制不能减少当前对象数量；画布未修改。');
  if(!Number.isSafeInteger(additional)||currentCount+additional>maxDuplicateObjects)
    throw Error(`一次最多支持 ${maxDuplicateObjects} 个对象；画布未修改。`);
  return additional;
}
export function parseLength(text){
  const match=String(text).match(/([0-9]+(?:\.[0-9]+)?)\s*(px|像素)/i);
  if(!match)return null;
  const amount=Number(match[1]);
  if(!Number.isFinite(amount)||amount<0||amount>10000)throw Error('数值须在 0–10000 px 之间。');
  return {kind:'length',amount,unit:'px'};
}
