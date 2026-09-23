export type Intent =
  | { kind:'undoStep' }
  | { kind:'createButton'; role?:'primary' }
  | { kind:'duplicateButtons'; total:3 }
  | { kind:'ensurePrimary' }
  | { kind:'setButtonTypes'; changes:{index:2|3;role:'secondary'|'danger'}[] }
  | { kind:'colorButtons'; changes:{index:2|3;color:'gray'|'red'}[] }
  | { kind:'direction'; value:'HORIZONTAL'|'VERTICAL' }
  | { kind:'gap'|'padding'|'width'|'height'; value:number }
  | { kind:'align'; value:'MIN'|'CENTER'|'MAX'; axis:'horizontal'|'vertical' }
  | { kind:'distribute'; value:'horizontal'|'vertical' }
  | { kind:'style'|'variable'; name:string }
  | { kind:'rename'; pattern:string }
  | { kind:'smaller' }
  | { kind:'sizing'; axis:'horizontal'|'vertical'; value:'HUG'|'FILL' }
  | { kind:'variant'; value:string };
export type ParseResult = { intent?:Intent; error?:string };
const number = '([0-9]+(?:\\.[0-9]+)?)\\s*(?:px|像素)?';
function value(text:string, tokens:string[]):number|undefined {
  if (!tokens.some(t=>text.includes(t))) return;
  const starts=tokens.map(token=>({index:text.indexOf(token),length:token.length})).filter(x=>x.index>=0).sort((a,b)=>a.index-b.index);
  if(!starts.length)return;
  const clause=text.slice(starts[0].index+starts[0].length).split(/[,，。；;]/)[0];
  const assigned=[...clause.matchAll(new RegExp('(?:改成|改为|设为|设置为|变成|变为|调到|改到|调整为|调整到|更新为|\\bto\\b)\\s*'+number,'gi'))];
  if(assigned.length)return Number(assigned[assigned.length-1][1]);
  const fromTo=clause.match(new RegExp('(?:从|由|from)\\s*'+number+'\\s*(?:到|至|to)\\s*'+number,'i'));
  if(fromTo)return Number(fromTo[2]);
  const matches=[...clause.matchAll(new RegExp(number,'g'))];
  if(matches.length===1)return Number(matches[0][1]);
  return undefined;
}
export function parse(raw:string):ParseResult {
  const t=raw.trim().replace(/，/g,',').replace(/：/g,':');
  if (!t) return {error:'请输入指令。'};
  if(/(?:在这里|在此处|这里).*(?:创建|新建|生成).*(?:按钮)|(?:创建|新建|生成).*(?:按钮).*(?:在这里|在此处)/.test(t)) return {intent:{kind:'createButton',...(/主要|primary/i.test(t)?{role:'primary' as const}:{})}};
  if(/(?:复制|克隆).*(?:三个|3个|3 个).*(?:按钮)?|(?:按钮).*(?:复制|克隆).*(?:三个|3个|3 个)/.test(t)) return {intent:{kind:'duplicateButtons',total:3}};
  if(/第[一1]个/.test(t)&&/保持|设为|改为|改成/.test(t)&&/主要|primary/i.test(t)) return {intent:{kind:'ensurePrimary'}};
  if(/第[二三23]个/.test(t)&&/次要|危险|secondary|danger|destructive/i.test(t)){
    const clauses=t.split(/[,;；。]/).map(s=>s.trim()).filter(Boolean);
    const changes:{index:2|3;role:'secondary'|'danger'}[]=[];
    for(const clause of clauses){
      const index=/第[二2]个/.test(clause)?2:/第[三3]个/.test(clause)?3:null;
      const role=/次要|secondary/i.test(clause)?'secondary':/危险|danger|destructive/i.test(clause)?'danger':null;
      if(index===null||role===null||changes.some(c=>c.index===index)) return {error:'请分别说明第二个和第三个按钮的语义类型。'};
      changes.push({index,role});
    }
    if(changes.length!==2||!changes.some(c=>c.index===2&&c.role==='secondary')||!changes.some(c=>c.index===3&&c.role==='danger')) return {error:'请明确指定第二个为次要按钮、第三个为危险按钮。'};
    return {intent:{kind:'setButtonTypes',changes}};
  }
  if(/第[二三23]个/.test(t)&&/(?:灰|红)/.test(t)){
    const clauses=t.split(/[,;；。]/).map(s=>s.trim()).filter(Boolean);
    const changes:{index:2|3;color:'gray'|'red'}[]=[];
    for(const clause of clauses){
      const index=/第[二2]个/.test(clause)?2:/第[三3]个/.test(clause)?3:null;
      const color=/灰/.test(clause)?'gray':/红/.test(clause)?'red':null;
      if(index===null||color===null||changes.some(c=>c.index===index)) return {error:'请分别说明第二个和第三个按钮的颜色，避免歧义。'};
      changes.push({index,color});
    }
    if(changes.length!==2||!changes.some(c=>c.index===2&&c.color==='gray')||!changes.some(c=>c.index===3&&c.color==='red')) return {error:'请明确指定第二个为灰色、第三个为红色。'};
    return {intent:{kind:'colorButtons',changes}};
  }
  if(/(?:或|或者|还是|\bor\b|\/|~|～)/i.test(t) && [...t.matchAll(/[0-9]+(?:\.[0-9]+)?/g)].length>1) return {error:'存在多个候选数值，请只指定一个目标值。'};
  const rename=t.match(/(?:批量)?(?:重命名|命名为|改名为)\s*[:：]?\s*[「“"']?(.+?)[」”"']?$/);
  if (rename) {
    const pattern=rename[1].trim().replace(/[」”"']$/,'');
    return pattern && pattern.length<=80 ? {intent:{kind:'rename',pattern}} : {error:'请输入不超过 80 字的名称。'};
  }
  const named=t.match(/(?:应用|使用|套用)(?:已有|本地)?\s*(?:名为)?[「“"']?(.+?)[」”"']?\s*(文字样式|文本样式|填充样式|颜色样式|样式|变量)$/);
  if(named) return {intent:{kind:named[2]==='变量'?'variable':'style',name:named[1].trim()}};
  const variant=t.match(/(?:切换|改成|设为|使用)(?:组件)?(?:变体|属性)?\s*[「“"']?(Small|Medium|Large|Secondary|Primary|小号|中号|大号|次要|主要)[」”"']?$/i);
  if(variant) return {intent:{kind:'variant',value:variant[1]}};
  if(/hug|fill|内容自适应|填满|撑满/i.test(t)){
    const axis=/高|纵|垂直/.test(t)?'vertical':'horizontal';
    return {intent:{kind:'sizing',axis,value:/fill|填满|撑满/i.test(t)?'FILL':'HUG'}};
  }
  const dimension:[Intent['kind'],string[]][]=[['gap',['间距','gap','spacing']],['padding',['内边距','padding']],['width',['宽度','宽','width']],['height',['高度','高','height']]];
  for(const [kind,terms] of dimension){
    if(terms.some(x=>t.toLowerCase().includes(x))){
      const n=value(t.toLowerCase(),terms);
      if(n===undefined) return {error:'请给出明确数值，例如“间距改成 8 px”。'};
      if(!Number.isFinite(n)||n<0||n>10000 || ((kind==='width'||kind==='height')&&n===0)) return {error:'数值须在 0–10000 px 之间。'};
      return {intent:{kind:kind as 'gap'|'padding'|'width'|'height',value:n}};
    }
  }
  if(/小一点|缩小一点|smaller/i.test(t)) return {intent:{kind:'smaller'}};
  if(/等距|均匀分布|平均分布/.test(t)) return {intent:{kind:'distribute',value:/纵向|垂直/.test(t)?'vertical':'horizontal'}};
  if(/横向|水平排列|改成横排|horizontal/i.test(t)) return {intent:{kind:'direction',value:'HORIZONTAL'}};
  if(/纵向|垂直排列|改成竖排|vertical/i.test(t)) return {intent:{kind:'direction',value:'VERTICAL'}};
  if(/居中|左对齐|右对齐|顶部对齐|底部对齐/.test(t)) return {intent:{kind:'align',axis:/顶部|底部|垂直/.test(t)?'vertical':'horizontal',value:/左|顶部/.test(t)?'MIN':/右|底部/.test(t)?'MAX':'CENTER'}};
  return {error:'暂不支持这条指令。可调整布局、尺寸、样式、变量或批量命名。'};
}
