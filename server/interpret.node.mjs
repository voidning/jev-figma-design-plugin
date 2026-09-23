import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretWithJev,additionalCopies,parseLength} from './interpret.mjs';
import {textCandidates,selectOriginalText} from './text-content.mjs';
import {questions} from './questions.mjs';

const choice=(value,confidence=.95)=>({type:'choice',choice:value,confidence});
const context={pageId:'page-1',activeCount:1,selectedCount:1,selectedMatchesActive:true,
  activeObjects:['circle'],hasAnchor:true,lastEdit:null};
const create=(family,shape)=>({operation:choice('add'),operand:choice('object'),
  objectFamily:choice(family),shapeKind:choice(shape||'none'),
  componentSemantic:choice(family==='component'?'button':'none'),position:choice('here'),
  valueKind:choice('none')});
const writing=(target,objectFamily,shapeKind='none',position='insideCenter')=>({
  operation:choice('add'),operand:choice('text'),target:choice(target),
  objectFamily:choice(objectFamily),shapeKind:choice(shapeKind),position:choice(position),valueKind:choice('text')
});
const adjusting=(target,detail)=>({operation:choice('adjust'),operand:choice('property'),target:choice(target),
  attributeCategory:choice('dimensions'),attributeDetail:choice(detail),change:choice('increase'),valueKind:choice('step')});
function fake(responses,content){
  const calls=[];
  const fetch=async(url,options)=>{
    assert.equal(url,'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.headers.Authorization,'Bearer test-key');
    const body=JSON.parse(options.body);calls.push(body);
    assert.equal(body.model,'jev-latest');
    if(body.questions.contentSpan){
      assert.ok(Object.keys(body.questions.contentSpan.criteria).length<=25);
      const answer=content?.(body.questions.contentSpan.criteria,body.state.original_transcript)||choice('none');
      return {ok:true,json:async()=>({model:'jev',answers:{contentSpan:answer}})};
    }
    for(const axis of ['operation','operand','objectFamily','shapeKind','target','position',
      'attributeCategory','attributeDetail','change','valueKind','clauseRelation'])
      assert.equal(body.questions[axis].type,'choice');
    return {ok:true,json:async()=>({model:'jev',answers:responses[body.state.utterance]})};
  };
  return {fetch,calls};
}
const select=(wanted)=>(criteria)=>{
  const entry=Object.entries(criteria).find(([,label])=>label.endsWith(JSON.stringify(wanted)));
  return choice(entry?.[0]||'none');
};

test('orthogonal object and position judgments create shapes, text, and button components',async()=>{
  const responses={
    '在这里加一个圆':create('graphic','circle'),
    '在这儿画个圆形':create('graphic','circle'),
    '在这里画矩形':create('graphic','rectangle'),
    '在这里放个按钮':create('component')
  };
  for(const [phrase,object] of [['在这里加一个圆','circle'],['在这儿画个圆形','circle'],
    ['在这里画矩形','rectangle'],['在这里放个按钮','component']]){
    const result=await interpretWithJev(phrase,'test-key',context,fake(responses).fetch);
    assert.deepEqual(result.command,{kind:'edit',operation:'add',operand:'object',parameters:{
      object,position:{kind:'anchor'},...(object==='component'?{semantic:'button'}:{})
    }});
  }
});

test('Jev natural-language prompts and option descriptions are Chinese',()=>{
  for(const question of Object.values(questions)){
    assert.doesNotMatch(question.instructions,/[A-Za-z]/);
    for(const description of Object.values(question.criteria))assert.doesNotMatch(description,/[A-Za-z]/);
  }
});

test('放大点 is a relative increase after a focused Jev change judgment',async()=>{
  const phrase='放大点';
  const answers={...adjusting('current','size'),change:choice('none',.52)};
  let calls=0;
  const fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);calls++;
    if(calls===2){assert.deepEqual(Object.keys(body.questions),['change']);
      assert.equal(body.state.conversation.knownIntent.attributeDetail,'size');
      return {ok:true,json:async()=>({answers:{change:choice('increase',.96)}})};}
    return {ok:true,json:async()=>({answers})};
  };
  const result=await interpretWithJev(phrase,'test-key',context,fetch);
  assert.equal(result.command.parameters.mode,'increase');
  assert.equal(result.command.parameters.value.kind,'step');
  assert.equal(calls,2);
});

test('太大了 resolves the only selected active object after a focused Jev target judgment',async()=>{
  const answers={...adjusting('current','size'),target:choice('current',.61),change:choice('decrease')};
  let calls=0;
  const fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);calls++;
    if(calls===2){assert.deepEqual(Object.keys(body.questions),['target']);
      assert.equal(body.state.conversation.selectedMatchesActive,true);
      return {ok:true,json:async()=>({answers:{target:choice('current',.7)}})};}
    return {ok:true,json:async()=>({answers})};
  };
  const command=(await interpretWithJev('太大了','test-key',context,fetch)).command;
  assert.equal(command.target,'current');
  assert.equal(command.parameters.mode,'decrease');
  assert.equal(calls,2);
});

test('implicit target remains rejected for a group or conflicting selection',async()=>{
  const answers={...adjusting('current','size'),target:choice('current',.61),change:choice('decrease')};
  for(const state of [{...context,activeCount:2,selectedCount:1,selectedMatchesActive:false},
    {...context,activeCount:1,selectedCount:1,selectedMatchesActive:false}]){
    let calls=0;
    const fetch=async()=>({ok:true,json:async()=>({answers:++calls===1?answers:{target:choice('current',.7)}})});
    await assert.rejects(interpretWithJev('太大了','test-key',state,fetch),/目标对象/);
  }
});

test('the same focused Choice path covers operation, shape and position',async()=>{
  const phrase='在这里画个圆';
  const answers={...create('graphic','circle'),operation:choice('add',.6),
    shapeKind:choice('circle',.65),position:choice('here',.7)};
  const repairs={operation:choice('add'),shapeKind:choice('circle'),position:choice('here')};
  const asked=[];
  const fetch=async(_url,options)=>{
    const axes=Object.keys(JSON.parse(options.body).questions);
    if(axes.length>1)return {ok:true,json:async()=>({answers})};
    asked.push(axes[0]);
    return {ok:true,json:async()=>({answers:{[axes[0]]:repairs[axes[0]]}})};
  };
  const command=(await interpretWithJev(phrase,'test-key',context,fetch)).command;
  assert.deepEqual(asked,['operation','shapeKind','position']);
  assert.equal(command.parameters.object,'circle');
});

test('uncertain clause relation is re-asked before dependent edits are composed',async()=>{
  const utterance='在这里加一个圆，然后放大一点';
  const responses={
    [utterance]:{clauseRelation:choice('dependent',.55)},
    '在这里加一个圆':create('graphic','circle'),
    '放大一点':adjusting('previous','size')
  };
  const asked=[];
  const fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(Object.keys(body.questions).length===1){
      asked.push('clauseRelation');
      return {ok:true,json:async()=>({answers:{clauseRelation:choice('dependent')}})};
    }
    return {ok:true,json:async()=>({answers:responses[body.state.utterance]})};
  };
  const result=await interpretWithJev(utterance,'test-key',context,fetch);
  assert.deepEqual(asked,['clauseRelation']);
  assert.equal(result.command.kind,'sequence');
  assert.equal(result.command.commands.length,2);
});

test('only required low-confidence choices are re-asked; unresolved ones still refuse',async()=>{
  const phrase='圆角大一点';
  const answers={...adjusting('current','cornerRadius'),attributeDetail:choice('cornerRadius',.6),
    valueKind:choice('step',.7),semanticColor:choice('none',.2)};
  const asked=[];
  const fetch=async(_url,options)=>{
    const axes=Object.keys(JSON.parse(options.body).questions);
    if(axes.length>1)return {ok:true,json:async()=>({answers})};
    asked.push(axes[0]);
    return {ok:true,json:async()=>({answers:{[axes[0]]:choice(
      axes[0]==='attributeDetail'?'cornerRadius':'step')}})};
  };
  const command=(await interpretWithJev(phrase,'test-key',context,fetch)).command;
  assert.deepEqual(asked,['attributeDetail','valueKind']);
  assert.equal(command.parameters.property,'cornerRadius');

  let calls=0;
  const stuck=async()=>({ok:true,json:async()=>({answers:++calls===1?answers:
    {attributeDetail:choice('cornerRadius',.6)}})});
  await assert.rejects(interpretWithJev(phrase,'test-key',context,stuck),/具体属性/);
  assert.equal(calls,2);
});

test('uncertain operand gets one focused Jev judgment before composing',async()=>{
  const phrase='在这里加一个圆';
  const asked=[];
  const fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    asked.push(Object.keys(body.questions));
    return {ok:true,json:async()=>({model:'jev',answers:asked.length===1?
      {...create('graphic','circle'),operand:choice('none',.55)}:{operand:choice('object',.96)}})};
  };
  const result=await interpretWithJev(phrase,'test-key',context,fetch);
  assert.equal(result.command.parameters.object,'circle');
  assert.deepEqual(asked[1],['operand']);
  assert.equal(result.confidence,.95);
});

test('confident independent axes can resolve an unclear create operand without phrase rules',async()=>{
  for(const phrase of ['在这里加一个圆','在这儿画个圆形']){
    const answers={...create('graphic','circle'),operand:choice('none',.5),
      attributeCategory:choice('none'),valueKind:choice('none')};
    let calls=0;
    const fetch=async(_url,options)=>{
      const body=JSON.parse(options.body);calls++;
      if(calls===2){assert.equal(body.state.conversation.knownIntent.shapeKind,'circle');
        return {ok:true,json:async()=>({answers:{operand:choice('none',.55)}})};}
      return {ok:true,json:async()=>({answers})};
    };
    const result=await interpretWithJev(phrase,'test-key',context,fetch);
    assert.equal(result.command.operand,'object');
    assert.equal(result.command.parameters.object,'circle');
    assert.equal(calls,2);
  }
});

test('unclear operand is not resolved when text or styling axes conflict',async()=>{
  for(const changed of [{valueKind:choice('text')},{attributeCategory:choice('stroke')}]){
    const answers={...create('graphic','circle'),operand:choice('none',.5),
      attributeCategory:choice('none'),valueKind:choice('none'),...changed};
    let calls=0;
    const fetch=async()=>({ok:true,json:async()=>({answers:++calls===1?answers:{operand:choice('none',.55)}})});
    await assert.rejects(interpretWithJev('在这里创建图形','test-key',context,fetch),/操作对象/);
  }
});

test('literal text is selected by candidate ID and mapped back to transcript offsets',async()=>{
  for(const [phrase,wanted,position] of [
    ['在按钮中间加一个开始','开始','insideCenter'],
    ['在按钮上填上开始','开始','inside'],
    ['把按钮文字改成开始使用','开始使用','none'],
    ['在圆中间写开始','开始','insideCenter']
  ]){
    const answers={...writing('current',phrase.includes('圆')?'graphic':'component',phrase.includes('圆')?'circle':'none',position),
      operation:choice(phrase.startsWith('把')?'set':'add'),componentSemantic:choice('button')};
    const setup=fake({[phrase]:answers},select(wanted));
    const result=await interpretWithJev(phrase,'test-key',context,setup.fetch);
    assert.deepEqual(result.command.parameters.value,{kind:'text',text:wanted,source:{
      start:phrase.indexOf(wanted),end:phrase.indexOf(wanted)+wanted.length}});
    assert.equal(result.command.operand,'text');
    assert.equal(setup.calls.length,2);
  }
});

test('dependent create → content → size uses previous target and full-transcript offsets',async()=>{
  const utterance='在这里加一个圆，在中间写开始，然后放大一点';
  const clauses=['在这里加一个圆','在中间写开始','放大一点'];
  const setup=fake({
    [utterance]:{clauseRelation:choice('dependent')},
    [clauses[0]]:create('graphic','circle'),
    [clauses[1]]:writing('previous','graphic','circle'),
    [clauses[2]]:adjusting('previous','size')
  },select('开始'));
  const result=await interpretWithJev(utterance,'test-key',context,setup.fetch);
  assert.equal(result.command.kind,'sequence');
  assert.equal(result.command.commands.length,3);
  assert.deepEqual(result.command.commands[1].parameters.value,{kind:'text',text:'开始',source:{
    start:utterance.indexOf('开始'),end:utterance.indexOf('开始')+2}});
  assert.equal(result.command.commands[1].target,'previous');
  assert.equal(result.command.commands[2].parameters.property,'size');
  assert.equal(setup.calls.length,5);
});

test('standalone text creation and later content reuse the same operation × operand axes',async()=>{
  const utterance='在这里加一段文字，写欢迎';
  const setup=fake({[utterance]:{clauseRelation:choice('dependent')},
    '在这里加一段文字':create('text'),
    '写欢迎':writing('previous','text','none','none')
  },select('欢迎'));
  const result=await interpretWithJev(utterance,'test-key',context,setup.fetch);
  assert.equal(result.command.commands[0].parameters.object,'text');
  assert.equal(result.command.commands[1].operand,'text');
  assert.equal(result.command.commands[1].parameters.value.text,'欢迎');
});

test('one delete operation composes object, text, and property removal separately',async()=>{
  const answers=(operand,detail='none',category='none',family='graphic',shape='circle')=>({
    operation:choice('delete'),operand:choice(operand),target:choice('current'),
    objectFamily:choice(family),shapeKind:choice(shape),
    attributeCategory:choice(category),attributeDetail:choice(detail)
  });
  const responses={
    '把这个圆删掉':answers('object'),
    '把这个圆里的字删掉':answers('text'),
    '把描边删掉':answers('property','stroke','stroke'),
    '把宽度删掉':answers('property','width','dimensions'),
    '删除这个组件的覆盖':answers('property','componentOverride','componentOverride','component','none')
  };
  for(const [phrase,operand,property] of [
    ['把这个圆删掉','object',undefined],['把这个圆里的字删掉','text',undefined],
    ['把描边删掉','property','stroke'],['把宽度删掉','property','width'],
    ['删除这个组件的覆盖','property','componentOverride']
  ]){
    const result=await interpretWithJev(phrase,'test-key',context,fake(responses).fetch);
    assert.equal(result.command.operation,'delete');assert.equal(result.command.operand,operand);
    assert.equal(result.command.parameters.property,property);
  }
  const explicitDelete={...answers('property','stroke','stroke'),change:choice('restore')};
  const result=await interpretWithJev('把描边删掉','test-key',context,
    fake({'把描边删掉':explicitDelete}).fetch);
  assert.equal(result.command.operation,'delete');
});

test('add stroke then delete stroke is an ordered dependency without extra Jev delete intents',async()=>{
  const utterance='给这个矩形加描边，然后把描边删掉';
  const setup=fake({
    [utterance]:{clauseRelation:choice('dependent')},
    '给这个矩形加描边':{operation:choice('add'),operand:choice('property'),target:choice('current'),
      objectFamily:choice('graphic'),shapeKind:choice('rectangle'),
      attributeCategory:choice('stroke'),attributeDetail:choice('stroke'),valueKind:choice('none')},
    '把描边删掉':{operation:choice('delete'),operand:choice('property'),target:choice('previous'),
      attributeCategory:choice('stroke'),attributeDetail:choice('stroke')}
  });
  const result=await interpretWithJev(utterance,'test-key',context,setup.fetch);
  assert.deepEqual(result.command.commands.map(command=>[command.operation,command.operand,command.target]),
    [['add','property','current'],['delete','property','previous']]);
});

test('stroke add, semantic versus literal color, quantity and refusal paths',async()=>{
  const responses={
    '给这个矩形加描边':{operation:choice('add'),operand:choice('property'),target:choice('current'),
      objectFamily:choice('graphic'),shapeKind:choice('rectangle'),
      attributeCategory:choice('stroke'),attributeDetail:choice('stroke'),valueKind:choice('none')},
    '改成红色':{operation:choice('set'),operand:choice('property'),target:choice('current'),
      attributeCategory:choice('color'),attributeDetail:choice('fill'),valueKind:choice('literalColor')},
    '三个都大一点':{...adjusting('all','size')},
    '再来两个，排成一行':{operation:choice('duplicate'),operand:choice('object'),target:choice('current'),
      quantityMode:choice('additional'),layout:choice('horizontal'),clauseRelation:choice('continuation')},
    '开始创建一个圆':create('graphic','circle')
  };
  assert.equal((await interpretWithJev('给这个矩形加描边','test-key',context,fake(responses).fetch)).command.parameters.property,'stroke');
  assert.deepEqual((await interpretWithJev('改成红色','test-key',context,fake(responses).fetch)).command.parameters.value,
    {kind:'color',source:'literal',name:'red'});
  assert.equal((await interpretWithJev('三个都大一点','test-key',context,fake(responses).fetch)).command.parameters.value.kind,'step');
  assert.equal((await interpretWithJev('再来两个，排成一行','test-key',context,fake(responses).fetch)).command.parameters.additional,2);
  const noText=fake(responses,select('开始'));
  assert.equal((await interpretWithJev('开始创建一个圆','test-key',context,noText.fetch)).command.operand,'object');
  assert.equal(noText.calls.length,1);
  assert.equal(additionalCopies('复制成三个',1,'total'),2);
  assert.deepEqual(parseLength('描边 2 px'),{kind:'length',amount:2,unit:'px'});
});

test('复制成三份 uses a focused total-count judgment and the documented layout default',async()=>{
  const phrase='复制成三份';
  const initial={operation:choice('duplicate'),operand:choice('object'),target:choice('current'),
    quantityMode:choice('unknown',.52),layout:choice('none'),clauseRelation:choice('continuation')};
  const asked=[];
  const fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);
    asked.push(Object.keys(body.questions));
    return {ok:true,json:async()=>({answers:asked.length===1?initial:{quantityMode:choice('total')}})};
  };
  const command=(await interpretWithJev(phrase,'test-key',context,fetch)).command;
  assert.deepEqual(asked.slice(1),[['quantityMode']]);
  assert.equal(command.parameters.additional,2);
  assert.equal(command.parameters.arrangement,'horizontal');
  assert.equal(additionalCopies('再复制三份',1,'additional'),3);
  assert.equal(additionalCopies('把这个图形变成三份',1,'total'),2);
  assert.equal(additionalCopies('把当前三个复制成五份',3,'total'),2);
});

test('quantity parsing covers numeric and Chinese counts without per-number commands',()=>{
  const chinese='一二三四五六七八九';
  for(let count=1;count<=9;count++){
    assert.equal(additionalCopies(`复制${count}份`,1,'additional'),count);
    assert.equal(additionalCopies(`再复制${chinese[count-1]}份`,1,'additional'),count);
    if(count>1){
      assert.equal(additionalCopies(`复制成${count}份`,1,'total'),count-1);
      assert.equal(additionalCopies(`复制成${chinese[count-1]}份`,1,'total'),count-1);
    }
  }
  assert.equal(additionalCopies('复制成十二份',1,'total'),11);
  assert.equal(additionalCopies('复制成20份',1,'total'),19);
  assert.throws(()=>additionalCopies('复制成1份',1,'total'),/已经符合要求/);
  assert.throws(()=>additionalCopies('复制成21份',1,'total'),/最多支持 20/);
  assert.throws(()=>additionalCopies('复制成一二份',1,'total'),/说清楚/);
  assert.throws(()=>additionalCopies('复制2份，再加3份',1,'additional'),/唯一明确/);
  assert.throws(()=>additionalCopies('复制2份，再复制3份',1,'additional'),/唯一明确/);
  assert.throws(()=>additionalCopies('复制两份再复制三份',1,'additional'),/唯一明确/);
});

test('button role is a component capability; hex color remains literal data',async()=>{
  const responses={
    '中间那个低调一点':{operation:choice('set'),operand:choice('property'),target:choice('middle'),
      objectFamily:choice('component'),componentSemantic:choice('button'),
      attributeCategory:choice('componentRole'),attributeDetail:choice('semanticRole'),
      valueKind:choice('role'),role:choice('secondary')},
    '填充改成 #12AB34':{operation:choice('set'),operand:choice('property'),target:choice('current'),
      attributeCategory:choice('color'),attributeDetail:choice('fill'),valueKind:choice('literalColor')}
  };
  const role=(await interpretWithJev('中间那个低调一点','test-key',context,fake(responses).fetch)).command;
  assert.deepEqual(role.parameters,{property:'semanticRole',mode:'set',
    value:{kind:'role',name:'secondary'},expectedObject:'component',expectedSemantic:'button'});
  const color=(await interpretWithJev('填充改成 #12AB34','test-key',context,fake(responses).fetch)).command;
  assert.deepEqual(color.parameters.value,{kind:'color',source:'literal',name:'#12ab34'});
});

test('new literal colors reuse fill, stroke, and text-color judgments without changing semantic colors',async()=>{
  for(const [phrase,detail,name] of [
    ['填充改成绿色','fill','green'],['描边设为黄色','stroke','yellow'],
    ['文字改为黑色','textColor','black'],['填充改成白色','fill','white'],
    ['填充改成红色','fill','red'],['填充改成蓝色','fill','blue'],['填充改成灰色','fill','gray']
  ]){
    const category=detail==='stroke'?'stroke':'color';
    const answers={operation:choice('set'),operand:choice('property'),target:choice('current'),
      attributeCategory:choice(category),attributeDetail:choice(detail),valueKind:choice('literalColor')};
    const result=await interpretWithJev(phrase,'test-key',context,fake({[phrase]:answers}).fetch);
    assert.deepEqual(result.command.parameters.value,{kind:'color',source:'literal',name});
  }
  const semantic='填充改为主要色';
  const answers={operation:choice('set'),operand:choice('property'),target:choice('current'),
    attributeCategory:choice('color'),attributeDetail:choice('fill'),valueKind:choice('semanticColor'),semanticColor:choice('primary')};
  assert.deepEqual((await interpretWithJev(semantic,'test-key',context,fake({[semantic]:answers}).fetch)).command.parameters.value,
    {kind:'color',source:'semantic',name:'primary'});
  for(const phrase of ['填充改成绿色或黄色','填充改成紫色']){
    await assert.rejects(interpretWithJev(phrase,'test-key',context,
      fake({[phrase]:{...answers,valueKind:choice('literalColor')}}).fetch),/唯一明确的颜色值/);
  }
});

test('corner radius is one attribute detail across set, adjust, and delete',async()=>{
  for(const [phrase,operation,change,value] of [
    ['圆角设为 12 像素','set','set',{kind:'length',amount:12,unit:'px'}],
    ['圆角大一点','adjust','increase',{kind:'step',count:1}],
    ['圆角小一点','adjust','decrease',{kind:'step',count:1}],
    ['去掉圆角','delete',undefined,undefined]
  ]){
    const answers={operation:choice(operation),operand:choice('property'),target:choice('current'),
      attributeCategory:choice('dimensions'),attributeDetail:choice('cornerRadius'),
      ...(change?{change:choice(change),valueKind:choice(value.kind==='step'?'step':'length')}:{})};
    const command=(await interpretWithJev(phrase,'test-key',context,fake({[phrase]:answers}).fetch)).command;
    assert.equal(command.parameters.property,'cornerRadius');
    assert.equal(command.operation,operation);
    assert.deepEqual(command.parameters.value,value);
  }
});

test('none, missing candidates and low confidence refuse content',async()=>{
  const phrase='在圆中间写开始';
  for(const response of [choice('none'),choice('missing'),choice('span_0',.3)]){
    await assert.rejects(interpretWithJev(phrase,'test-key',context,
      fake({[phrase]:writing('current','graphic','circle')},()=>response).fetch),/画布未修改/);
  }
  await assert.rejects(interpretWithJev(phrase,'',context),/TYPESAFE_API_KEY/);
  assert.ok(textCandidates(phrase).some(item=>item.text==='开始'));
  assert.throws(()=>selectOriginalText(phrase,textCandidates(phrase),choice('missing')),/不在本句/);
});
