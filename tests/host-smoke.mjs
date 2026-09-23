import fs from 'node:fs';
import vm from 'node:vm';
const out=[];
const parent={type:'PAGE'};
function frame(name,x,y){return {id:name,name,type:'FRAME',parent,x,y,width:100,height:40,layoutMode:'HORIZONTAL',layoutSizingHorizontal:'HUG',layoutSizingVertical:'HUG',itemSpacing:12,paddingTop:8,paddingRight:12,paddingBottom:8,paddingLeft:12,counterAxisAlignItems:'MIN',primaryAxisAlignItems:'MIN',resize(w,h){this.width=w;this.height=h;}};}
const a=frame('A',10,10),b=frame('B',45,60),c=frame('C',200,110);parent.children=[a,b,c];
let resized=0;
const figma={currentPage:{selection:[a]},mixed:Symbol('mixed'),ui:{postMessage:m=>out.push(m),onmessage:null,resize(_width,height){resized=height;}},showUI(){},on(){},commitUndo(){},triggerUndo(){},getLocalTextStylesAsync:async()=>[],getLocalPaintStylesAsync:async()=>[],variables:{getLocalVariablesAsync:async()=>[]}};
vm.runInNewContext(fs.readFileSync(new URL('../dist/code.js', import.meta.url),'utf8'),{figma,__html__:''});
await figma.ui.onmessage({type:'resizeUI',height:308});
if(resized!==308)throw Error('Plugin UI did not resize to visible content');
await figma.ui.onmessage({type:'resizeUI',height:900});
if(resized!==308)throw Error('Plugin UI accepted an oversized height');
async function action(type,text){await figma.ui.onmessage({type,text});return out.at(-1);}
let p=await action('preview','2 个按钮间距改成 8 px');if(p.type!=='plan'||!p.rows[0].includes('8 px'))throw Error(JSON.stringify(p));
let d=await action('apply');if(d.type!=='context'||a.itemSpacing!==8)throw Error(JSON.stringify({d,gap:a.itemSpacing}));
figma.currentPage.selection=[a,b,c];
p=await action('preview','顶部对齐');if(p.type!=='plan'||!p.rows[0].includes('垂直'))throw Error(JSON.stringify(p));
await action('apply');if(![a.y,b.y,c.y].every(y=>y===10))throw Error('Vertical align failed');
a.y=10;b.y=60;c.y=110;
p=await action('preview','纵向等距分布');if(p.type!=='plan'||!p.rows[0].includes('垂直'))throw Error(JSON.stringify(p));
await action('apply');if(b.y!==60)throw Error('distribution failed');
console.log('Figma host smoke: gap, vertical align, vertical distribute passed');
