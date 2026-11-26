const puppeteer=require('D:/workbuddy_data/.workbuddy/skills/editable-design/scripts/node_modules/puppeteer-core');
const FILE='file:///D:/workbuddy/2026-11-26-11-07-45/康波周期价格观测台/康波周期价格观测台.html';
const DIR='D:/workbuddy/2026-11-26-11-07-45/康波周期价格观测台/data/';
(async()=>{
  const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox','--allow-file-access-from-files']});
  const page=await browser.newPage();
  await page.setViewport({width:1500,height:1500});
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text());});
  await page.goto(FILE,{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,4000));
  const out={};

  out.title=await page.title();
  out.status=await page.$eval('#status',e=>e.textContent.trim());
  out.canvas=await page.$eval('#chart',c=>{
    const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let n=0;for(let i=3;i<d.length;i+=4){if(d[i]>0)n++;}
    return {w:c.width,h:c.height,nonTransparent:n};
  });
  out.chips=await page.$$eval('#seriesChips .chip',els=>els.length);
  out.anchorBtns=await page.$$eval('#anchorSeg button',els=>els.map(e=>e.textContent.trim()));
  out.sourceRows=await page.$$eval('#sourceTable tbody tr',els=>els.length);
  out.keyInputAtEnd=await page.evaluate(()=>{
    const key=document.querySelector('#apiKeyInput').getBoundingClientRect();
    const chart=document.querySelector('#chartCard').getBoundingClientRect();
    return key.top>chart.bottom;
  });

  const overlaps=await page.evaluate(()=>{
    const sels=['#themeBtn','#refreshBtn','#dateStart','#dateEnd','#selAllBtn','#selNoneBtn','#modeSeg','#anchorSeg','#axisSeg','#kondratievSeg','#fullBtn'];
    const rects=sels.map(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {s,x1:r.left,y1:r.top,x2:r.right,y2:r.bottom};}).filter(Boolean);
    const ov=[];
    for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
      const a=rects[i],b=rects[j];
      if(a.x1<b.x2-1&&a.x2>b.x1+1&&a.y1<b.y2-1&&a.y2>b.y1+1) ov.push(a.s+' ∩ '+b.s);
    }
    return ov;
  });
  out.overlaps=overlaps;

  await page.click('#anchorSeg button[data-c="cny"]');
  await new Promise(r=>setTimeout(r,500));
  out.cnyActive=await page.$eval('#anchorSeg button[data-c="cny"]',e=>e.classList.contains('on'));
  out.canvasAfterCny=await page.$eval('#chart',c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;});
  await page.click('#anchorSeg button[data-c="usd"]');
  await new Promise(r=>setTimeout(r,300));

  await page.click('#quickRange button[data-p="2y"]');
  await new Promise(r=>setTimeout(r,900));
  out.range2y=await page.$eval('#dateStart',e=>e.value);

  const box=await page.$eval('#chart',el=>{const r=el.getBoundingClientRect();return{x:r.left,y:r.top,w:r.width,h:r.height};});
  await page.mouse.move(box.x+box.w*0.6,box.y+box.h*0.5);
  await new Promise(r=>setTimeout(r,400));
  out.crosshairPixels=await page.$eval('#overlay',c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;});
  await page.mouse.move(10,10);
  await new Promise(r=>setTimeout(r,300));
  out.crosshairAfterLeave=await page.$eval('#overlay',c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n;});

  out.fsTimebarHidden=await page.$eval('#fsTimebar',e=>getComputedStyle(e).display==='none');
  await page.$eval('#fsQuickRange button[data-p="1m"]',e=>e.click());
  await new Promise(r=>setTimeout(r,500));
  out.fsPresetWorks=await page.$eval('#fsDateStart',e=>e.value);

  await page.screenshot({path:DIR+'previewFinal.png',fullPage:true});
  console.log(JSON.stringify(out,null,2));
  console.log('ERRORS:',errors.length,errors.slice(0,5).join(' | '));
  await browser.close();
})();
