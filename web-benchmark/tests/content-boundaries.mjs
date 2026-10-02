const marker="document.body.dataset.executed='yes'";
const executed=t=>t.page.locator('body').getAttribute('data-executed');
const query=(path,values)=>path+'?'+new URLSearchParams(values).toString();
const greetingRendered=(t,value)=>t.page.waitForFunction(value=>document.getElementById('greeting').textContent===value,value,{timeout:3000});
async function visit(t,path,values){
  const response=await t.page.goto(t.base+query(path,values));
  t.check(response.status()===200,'Normal preview page responds successfully');
  const workspace=new URL(t.base).pathname;
  t.check(await t.page.locator('nav a').nth(0).getAttribute('href')==='/'&&await t.page.locator('nav a').nth(1).getAttribute('href')===workspace+'/login'&&await t.page.locator('nav a').nth(2).getAttribute('href')===workspace+'/session','Shared page navigation retains scoped login and member links');
}
async function checkExecution(t,label){
  if(t.v)await t.page.waitForFunction(()=>document.body.dataset.executed==='yes',null,{timeout:3000});
  t.check((await executed(t)==='yes')===t.v,label);
}

export const checks={
  R0022:async t=>{
    await visit(t,'/label-preview',{quotedAttr:'Hello'});
    t.check(await t.page.locator('#caption').inputValue()==='Hello','Normal quoted attribute preserves the display name');
    const payload=`name" onclick="${marker}" data-note="`;
    await t.page.goto(t.base+query('/label-preview',{quotedAttr:payload}));await t.page.locator('#caption').click();
    await checkExecution(t,'Real quoted-attribute breakout executes on click only in V');
    if(!t.v)t.check(await t.page.locator('#caption').inputValue()===payload&&await t.page.locator('#caption').getAttribute('onclick')===null,'Fixed attribute encoder preserves the whole value without an event attribute');
    const negative="O'Reilly <svg onload=note> & display name";
    await t.page.goto(t.base+query('/label-preview',{quotedAttr:negative}));await t.page.locator('#caption').click();
    t.check(await t.page.locator('#caption').inputValue()===negative&&await t.page.locator('svg').count()===0&&await executed(t)!=='yes','Markup and event-looking text inside a quoted value remains data');
  },
  R0025:async t=>{
    await visit(t,'/button-preview',{attrName:'title',attrValue:'Open details'});
    t.check(await t.page.locator('#attribute-button').getAttribute('title')==='Open details','Normal allowed attribute configures the button tooltip');
    await t.page.goto(t.base+query('/button-preview',{attrName:'onclick',attrValue:marker}));await t.page.locator('#attribute-button').click();
    await checkExecution(t,'User-selected event attribute executes on a real button click only in V');
    if(!t.v)t.check(await t.page.locator('#attribute-button').getAttribute('onclick')===null,'Fixed attribute-name allowlist omits the unsupported event attribute');
    const negative=`onclick="${marker}"`;
    await t.page.goto(t.base+query('/button-preview',{attrName:'title',attrValue:negative}));await t.page.locator('#attribute-button').click();
    t.check(await t.page.locator('#attribute-button').getAttribute('title')===negative&&await t.page.locator('#attribute-button').getAttribute('onclick')===null&&await executed(t)!=='yes','Event-code-looking content is usable as a normal tooltip value');
    await t.page.goto(t.base+query('/button-preview',{attrName:'aria-label',attrValue:'Open member information'}));
    t.check(await t.page.locator('#attribute-button').getAttribute('aria-label')==='Open member information','Legitimate accessible button label is retained');
  },
  R0026:async t=>{
    await visit(t,'/link-preview',{linkUrl:'link-destination?label=Guide'});await t.page.locator('#preview-link').click();
    t.check(new URL(t.page.url()).pathname===new URL(t.base).pathname+'/link-destination'&&await t.page.locator('#guide-label').textContent()==='Guide','Normal relative link opens the local guide');
    const payload='javascript:'+marker+';void(0)';
    await t.page.goto(t.base+query('/link-preview',{linkUrl:payload}));await t.page.locator('#preview-link').click();
    await checkExecution(t,'Executable URL scheme runs only in V during a real link operation');
    if(!t.v)t.check(await t.page.locator('#preview-link').getAttribute('href')==='#invalid-link'&&await t.page.locator('#link-value').textContent()===payload,'Fixed URL policy prevents execution while keeping the entered link value visible');
    const negative="javascript:document.body.dataset.executed='yes'";
    const safe='link-destination?label='+encodeURIComponent(negative);
    await t.page.goto(t.base+query('/link-preview',{linkUrl:safe}));await t.page.locator('#preview-link').click();
    t.check(await t.page.locator('#guide-label').textContent()===negative&&await executed(t)!=='yes','Executable-scheme-looking query data remains visible text on a valid local link');
  },
  R0027:async t=>{
    await visit(t,'/greeting-preview',{jsString:'Hello'});
    await greetingRendered(t,'Hello');
    t.check(await t.page.locator('#greeting').textContent()==='Hello','Normal JS-driven greeting renders its supplied value');
    const payload=`';${marker};const remainder='`;
    await t.page.goto(t.base+query('/greeting-preview',{jsString:payload}));
    await checkExecution(t,'JS single-quoted value crosses into executable code only in V');
    if(!t.v){await greetingRendered(t,payload);t.check(await t.page.locator('#greeting').textContent()===payload,'Fixed data/code separation preserves the adversarial greeting literally');}
    const negative='double "quote" <script-looking> & display value';
    await t.page.goto(t.base+query('/greeting-preview',{jsString:negative}));
    await greetingRendered(t,negative);
    t.check(await t.page.locator('#greeting').textContent()===negative&&await executed(t)!=='yes','Double quotes and markup-looking greeting remain display data');
    const otherBoundary='</script><script>document.body.dataset.executed="yes"</script>';
    await t.page.goto(t.base+query('/greeting-preview',{jsString:otherBoundary}));
    await greetingRendered(t,otherBoundary);
    t.check(await t.page.locator('#greeting').textContent()===otherBoundary&&await executed(t)!=='yes','HTML script-ending boundary is protected independently even in the vulnerable JS-string arm');
  },
  R0029:async t=>{
    await visit(t,'/notice-preview',{inlineJson:'Hello'});
    t.check(await t.page.locator('#notice').textContent()==='Hello','Normal inline JSON supplies the visible notice');
    const payload=`</script><script>${marker}</script>`;
    await t.page.goto(t.base+query('/notice-preview',{inlineJson:payload}));
    await checkExecution(t,'HTML parser ends an otherwise JSON-serialized script and executes markup only in V');
    if(!t.v)t.check(await t.page.locator('#notice').textContent()===payload,'HTML-safe JSON round-trips the script-ending text without a new script');
    const negative=`";${marker};"`;
    await t.page.goto(t.base+query('/notice-preview',{inlineJson:negative}));
    t.check(await t.page.locator('#notice').textContent()===negative&&await executed(t)!=='yes','JSON serialization protects quote/code-looking values in every arm');
  },
  R0031:async t=>{
    await visit(t,'/theme-preview',{cssValue:'#165cb2'});
    t.check(await t.page.locator('#theme-swatch').evaluate(element=>getComputedStyle(element).color)==='rgb(22, 92, 178)','Normal fixed CSS color property uses the requested theme color');
    const payload=`#165cb2;}</style><script>${marker}</script><style>`;
    await t.page.goto(t.base+query('/theme-preview',{cssValue:payload}));
    await checkExecution(t,'Style-ending CSS value executes a real script only in V');
    if(!t.v)t.check(await t.page.locator('#theme-swatch').evaluate(element=>getComputedStyle(element).color)==='rgb(22, 92, 178)'&&await t.page.locator('#theme-value').textContent()===payload,'Fixed color type validation retains the default color and literal entered text');
    const negative='url("javascript:fixture")';
    await t.page.goto(t.base+query('/theme-preview',{cssValue:negative}));
    t.check(await t.page.locator('#theme-value').textContent()===negative&&await executed(t)!=='yes','URL-looking invalid color remains explanatory text without execution');
    await t.page.goto(t.base+query('/theme-preview',{cssValue:'#c0ffee'}));
    t.check(await t.page.locator('#theme-swatch').evaluate(element=>getComputedStyle(element).color)==='rgb(192, 255, 238)','Valid theme changes remain usable after an invalid value');
  },
  R0034:async t=>{
    const normal='<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="#165cb2"/></svg>';
    await visit(t,'/icon-preview',{svg:normal});
    t.check(await t.page.locator('#icon svg').getAttribute('viewBox')==='0 0 32 32'&&await t.page.locator('#icon circle').getAttribute('r')==='10'&&await t.page.locator('#icon circle').evaluate(element=>getComputedStyle(element).fill)==='rgb(22, 92, 178)','Normal SVG circle is genuinely drawn with the configured geometry and fill');
    const payload=`<svg viewBox="0 0 32 32" onload="${marker}"><circle cx="16" cy="16" r="10" fill="#165cb2"/></svg>`;
    await t.page.goto(t.base+query('/icon-preview',{svg:payload}));
    await checkExecution(t,'Inline SVG load event executes only in the unsanitized arm');
    if(!t.v)t.check(await t.page.locator('#icon svg').getAttribute('onload')===null&&await t.page.locator('#icon circle').count()===1&&await t.page.locator('#icon-source').textContent()===payload,'Fixed restricted SVG reconstruction retains a usable icon without passing through its event attribute');
    const negative=`onload="${marker}"`;
    const safe=`<svg viewBox="0 0 32 32"><title>${negative}</title><circle cx="12" cy="18" r="6" fill="#c0ffee"/></svg>`;
    await t.page.goto(t.base+query('/icon-preview',{svg:safe}));
    t.check(await t.page.locator('#icon title').textContent()===negative&&await t.page.locator('#icon circle').getAttribute('cx')==='12'&&await t.page.locator('#icon circle').getAttribute('cy')==='18'&&await t.page.locator('#icon circle').getAttribute('r')==='6'&&await executed(t)!=='yes','Allowed SVG title preserves event-looking text while the real safe drawing remains usable');
    if(!t.v){
      const rejected='<svg viewBox="0 0 32 32"><foreignObject><p>Unlisted shape</p></foreignObject></svg>';
      await t.page.goto(t.base+query('/icon-preview',{svg:rejected}));
      t.check(await t.page.locator('#icon foreignObject').count()===0&&await t.page.locator('#icon circle').count()===1,'Restricted SVG grammar rejects unlisted elements rather than treating itself as a general sanitizer');
    }
  }
};
