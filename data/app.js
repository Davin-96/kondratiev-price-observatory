(function () {
  'use strict';
  var DATA = window.__COMMODITY_DATA__, meta = DATA.meta, series = DATA.series, fxAnchor = DATA.fx || { USD_CNY: 6.678 };
  var canvas = document.getElementById('chart'), ctx = canvas.getContext('2d');
  var overlay = document.getElementById('overlay'), octx = overlay.getContext('2d');
  var tip = document.getElementById('tip');
  var slider = document.getElementById('timeSlider'), sctx = slider.getContext('2d');

  var FULL_START = '1780-01-01', FULL_END = '2026-12-31';
  var state = {
    start: FULL_START, end: FULL_END,
    selected: ['gold','silver','platinum','palladium','wti','brent','natural_gas','gasoline'],
    mode:'raw', axis:'linear', kond:'zhou', anchor:'usd', events:true, ratio:false
  };
  var view = { t0:0, t1:0 }, geom = { l:74, r:34, t:46, b:78, w:0, h:0 };
  var dpr = window.devicePixelRatio || 1;
  var usdCny = fxAnchor.USD_CNY;
  var liveDates = {};

  var KOND = {
    zhou:{ label:'周金涛口径',
      waves:[{name:'第一波·蒸汽机',s:1782,e:1845},{name:'第二波·钢铁铁路',s:1845,e:1892},
        {name:'第三波·电气',s:1892,e:1948},{name:'第四波·汽车石化',s:1948,e:1991},{name:'第五波·信息技术',s:1991,e:2030}],
      phases:[{name:'回升',s:1991,e:2004},{name:'繁荣',s:2004,e:2008},{name:'衰退',s:2008,e:2019},{name:'萧条',s:2019,e:2030}] },
    zeping:{ label:'泽平口径',
      waves:[{name:'第一轮·蒸汽机',s:1782,e:1845},{name:'第二轮·钢铁铁路',s:1845,e:1892},
        {name:'第三轮·电气',s:1892,e:1948},{name:'第四轮·石油汽车',s:1948,e:1982},{name:'第五轮·信息技术',s:1982,e:2030}],
      phases:[{name:'回升',s:1982,e:1991},{name:'繁荣',s:1991,e:2008},{name:'衰退',s:2008,e:2019},{name:'萧条',s:2019,e:2030}] }
  };
  var EVENTS = [
    {y:1825,t:'英国首次生产过剩危机',s:1820,e:1832},
    {y:1873,t:'维也纳股灾·长萧条',s:1873,e:1896},
    {y:1929,t:'大崩盘·大萧条',s:1929,e:1939},
    {y:1973,t:'第一次石油危机',s:1973,e:1975},
    {y:1979,t:'第二次石油危机',s:1979,e:1982},
    {y:2000,t:'互联网泡沫破裂',s:2000,e:2002},
    {y:2008,t:'全球金融危机',s:2007,e:2009},
    {y:2020,t:'新冠疫情冲击',s:2020,e:2021},
    {y:2022,t:'俄乌冲突·能源波动',s:2022,e:2023}
  ];

  function cssVar(n){ return getComputedStyle(document.body).getPropertyValue(n).trim(); }
  function ts(d){ return new Date(d+'T00:00:00').getTime(); }
  function dateOf(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function inWin(d){ return d>=state.start && d<=state.end; }
  function num(s){ var v=parseFloat(s); return isNaN(v)?null:v; }

  function cnyFactorFor(k){ var m=meta[k]; return (m&&m.cnyFactor)||1; }
  function convert(k,v){
    if(state.anchor==='cny') return v*usdCny*cnyFactorFor(k);
    return v;
  }
  function unitOf(k){
    if(state.anchor==='cny') return meta[k].cnyUnit||meta[k].unit;
    return meta[k].unit;
  }

  var cpiArr = series.cpi.map(function(p){ return [p[0],p[1]]; });
  function cpiAt(dateStr){
    var lo=0,hi=cpiArr.length-1,best=null;
    while(lo<=hi){ var m=(lo+hi)>>1; if(cpiArr[m][0]<=dateStr){best=cpiArr[m][1];lo=m+1;} else hi=m-1; }
    return best;
  }
  function getPoints(key){
    var raw=series[key]; if(!raw) return [];
    var pts=[];
    for(var i=0;i<raw.length;i++){
      var d=raw[i][0],v=raw[i][1]; if(!inWin(d)) continue;
      if(state.mode==='real'&&key!=='cpi'){ var c=cpiAt(d); if(c&&c>0) v=v/c*100; }
      v=convert(key,v);
      pts.push([ts(d),v,d]);
    }
    if(state.mode==='norm'&&pts.length){ var base=pts[0][1]; if(base) pts=pts.map(function(p){ return [p[0],p[1]/base*100,p[2]]; }); }
    return pts;
  }
  function buildRatio(){
    if(!state.ratio) return [];
    var gm={},wm={},sm={};
    series.gold.forEach(function(p){gm[p[0].slice(0,7)]=convert('gold',p[1]);});
    series.wti.forEach(function(p){wm[p[0].slice(0,7)]=convert('wti',p[1]);});
    series.silver.forEach(function(p){sm[p[0].slice(0,7)]=convert('silver',p[1]);});
    var go=[],gs=[];
    Object.keys(gm).sort().forEach(function(m){
      var d=m+'-01'; if(!inWin(d)) return;
      if(wm[m]) go.push([ts(d),gm[m]/wm[m]]);
      if(sm[m]) gs.push([ts(d),gm[m]/sm[m]]);
    });
    return [{name:'金油比',color:'#B45309',data:go},{name:'金银比',color:'#6D28D9',data:gs}];
  }

  function niceTicks(min,max,count){
    if(!(max>min)) return [min];
    var span=max-min,raw=span/count,mag=Math.pow(10,Math.floor(Math.log10(raw)));
    var norm=raw/mag,step;
    if(norm<1.5) step=1; else if(norm<3) step=2; else if(norm<7) step=5; else step=10;
    step*=mag; var ticks=[],v=Math.floor(min/step)*step;
    for(;v<=max+step*0.001;v+=step) ticks.push(Math.round(v*1e8)/1e8);
    return ticks;
  }
  function yearTicks(t0,t1){
    var y0=new Date(t0).getFullYear(),y1=new Date(t1).getFullYear(),span=y1-y0;
    var step=span>150?50:span>80?25:span>40?10:span>20?5:span>8?2:1;
    var out=[],y=Math.ceil(y0/step)*step;
    for(;y<=y1;y+=step) out.push(y);
    return out;
  }
  function xOf(t){ return geom.l+(t-view.t0)/(view.t1-view.t0)*(geom.w-geom.l-geom.r); }
  function tOf(x){ return view.t0+(x-geom.l)/(geom.w-geom.l-geom.r)*(view.t1-view.t0); }

  function computeYRange(allPts){
    var vals=[];
    allPts.forEach(function(s){ s.data.forEach(function(p){ if(p[1]>0||state.axis==='linear') vals.push(p[1]); }); });
    if(!vals.length) return [0,1];
    var min=Math.min.apply(null,vals),max=Math.max.apply(null,vals);
    if(state.axis==='log'){ min=Math.max(min,0.0001);max=Math.max(max,min*1.1);return [min*0.9,max*1.1]; }
    if(min>0) min=0;
    var pad=(max-min)*0.06||max*0.1||1;
    return [min,max+pad];
  }
  function yOf(v,range){
    var top=geom.t,bot=geom.h-geom.b;
    if(state.axis==='log'){
      var lo=Math.log10(range[0]),hi=Math.log10(range[1]);
      return bot-(Math.log10(Math.max(v,range[0]))-lo)/(hi-lo)*(bot-top);
    }
    return bot-(v-range[0])/(range[1]-range[0])*(bot-top);
  }
  function downsample(data,width){
    if(data.length<=width*2) return data;
    var out=[],bucket=Math.max(1,Math.floor(data.length/width));
    for(var i=0;i<data.length;i+=bucket){
      var end=Math.min(i+bucket,data.length),lo=data[i],hi=data[i];
      for(var j=i+1;j<end;j++){ if(data[j][1]<lo[1])lo=data[j]; if(data[j][1]>hi[1])hi=data[j]; }
      out.push(lo); if(hi!==lo) out.push(hi);
    }
    return out;
  }

  var drawn=[], eventHits=[];
  var yRange=[0,1], ratioYRange=[0,1];

  function cardRotated(){
    var c=document.getElementById('chartCard');
    return !!(c&&c.classList.contains('fs-rotated'));
  }
  function localXY(el,cx,cy){
    var r=el.getBoundingClientRect();
    if(cardRotated()) return {x:cy-r.top,y:r.width-(cx-r.left)};
    return {x:cx-r.left,y:cy-r.top};
  }

  function render(){
    geom.w=canvas.clientWidth; geom.h=canvas.clientHeight;
    canvas.width=Math.round(geom.w*dpr); canvas.height=Math.round(geom.h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,geom.w,geom.h);
    var textC=cssVar('--chart-text')||'#52525b', gridC=cssVar('--grid-line')||'#e4e4e7', mutedC=cssVar('--muted-foreground')||'#71717a';

    var all=[];
    state.selected.forEach(function(k){ var p=getPoints(k); if(p.length) all.push({key:k,name:meta[k].label,color:meta[k].color,data:p,unit:unitOf(k)}); });
    buildRatio().forEach(function(r){ if(r.data.length) all.push({key:null,name:r.name,color:r.color,data:r.data,ratio:true,unit:''}); });
    yRange=computeYRange(all.filter(function(s){return !s.ratio;}));
    ratioYRange=[0,1];
    if(state.ratio){
      var rv=[]; all.filter(function(s){return s.ratio;}).forEach(function(s){s.data.forEach(function(p){rv.push(p[1]);});});
      if(rv.length) ratioYRange=[Math.min.apply(null,rv)*0.9,Math.max.apply(null,rv)*1.1];
    }
    var range=yRange, ratioRange=ratioYRange;

    if(state.kond!=='off'){
      var K=KOND[state.kond];
      K.waves.forEach(function(w,i){
        var x0=xOf(ts(w.s+'-01-01')),x1=xOf(ts(Math.min(w.e,2030)+'-12-31'));
        if(x1<geom.l||x0>geom.w-geom.r) return;
        ctx.fillStyle=i%2?'rgba(120,120,130,0.075)':'rgba(120,120,130,0.035)';
        ctx.fillRect(Math.max(x0,geom.l),geom.t,Math.min(x1,geom.w-geom.r)-Math.max(x0,geom.l),geom.h-geom.t-geom.b);
      });
      var pc=['rgba(22,163,74,0.07)','rgba(220,38,38,0.07)','rgba(234,179,8,0.07)','rgba(113,113,122,0.08)'];
      K.phases.forEach(function(p,i){
        var x0=xOf(ts(p.s+'-01-01')),x1=xOf(ts(p.e+'-12-31'));
        if(x1<geom.l||x0>geom.w-geom.r) return;
        ctx.fillStyle=pc[i];
        ctx.fillRect(Math.max(x0,geom.l),geom.t,Math.min(x1,geom.w-geom.r)-Math.max(x0,geom.l),geom.h-geom.t-geom.b);
        ctx.fillStyle=mutedC;ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
        ctx.fillText(p.name,(Math.max(x0,geom.l)+Math.min(x1,geom.w-geom.r))/2,geom.h-geom.b-18);
      });
    }

    var yTicks=niceTicks(range[0],range[1],6);
    ctx.font='11px sans-serif';ctx.textBaseline='middle';
    yTicks.forEach(function(v){
      var y=yOf(v,range); if(y<geom.t||y>geom.h-geom.b) return;
      ctx.strokeStyle=gridC;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(geom.l,y+0.5);ctx.lineTo(geom.w-geom.r,y+0.5);ctx.stroke();
      ctx.fillStyle=textC;ctx.textAlign='right';ctx.fillText(fmtNum(v),geom.l-8,y);
    });
    ctx.textAlign='center';ctx.textBaseline='top';
    yearTicks(view.t0,view.t1).forEach(function(y){
      var x=xOf(ts(y+'-01-01')); if(x<geom.l||x>geom.w-geom.r) return;
      ctx.strokeStyle=gridC;ctx.globalAlpha=0.5;
      ctx.beginPath();ctx.moveTo(x+0.5,geom.t);ctx.lineTo(x+0.5,geom.h-geom.b);ctx.stroke();
      ctx.globalAlpha=1;ctx.fillStyle=textC;ctx.fillText(String(y),x,geom.h-geom.b+8);
    });
    ctx.fillStyle=mutedC;ctx.textAlign='left';ctx.textBaseline='top';ctx.font='11px sans-serif';
    var yname=state.mode==='norm'?'起点=100':state.mode==='real'?'实际价格(1982-84美元)':(state.anchor==='cny'?'人民币':'价格');
    ctx.fillText(yname,geom.l-66,geom.t-20);
    if(state.ratio){ctx.textAlign='right';ctx.fillText('比值',geom.w-geom.r+30,geom.t-20);}

    eventHits=[];
    if(state.events){
      var lastLabelX=-999,row=0;
      EVENTS.forEach(function(e){
        var t=ts(e.y+'-01-01'); if(t<view.t0||t>view.t1) return;
        var x=xOf(t);
        ctx.strokeStyle=gridC;ctx.setLineDash([3,3]);ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(x+0.5,geom.t);ctx.lineTo(x+0.5,geom.h-geom.b);ctx.stroke();ctx.setLineDash([]);
        row=(x-lastLabelX<110)?(row+1)%3:0; lastLabelX=x;
        ctx.fillStyle=mutedC;ctx.textAlign='left';ctx.textBaseline='top';ctx.font='10px sans-serif';
        var ly=geom.t+4+row*14; ctx.fillText(e.t,x+4,ly);
        var tw=ctx.measureText(e.t).width;
        eventHits.push({x1:x+2,y1:ly-3,x2:x+6+tw,y2:ly+15,ev:e});
      });
    }

    drawn=[];
    all.forEach(function(s){
      var pts=downsample(s.data.filter(function(p){return p[0]>=view.t0&&p[0]<=view.t1;}),Math.round(geom.w));
      if(pts.length<2) return;
      var rg=s.ratio?ratioRange:range, liveSet=s.key?liveDates[s.key]:null;
      ctx.strokeStyle=s.color;ctx.lineWidth=s.ratio?1.6:1.9;ctx.globalAlpha=s.ratio?0.9:1;
      ctx.beginPath();var started=false,prevLive=false;
      for(var i=0;i<pts.length;i++){
        var x=xOf(pts[i][0]),y=yOf(pts[i][1],rg);
        var isLive=liveSet&&pts[i][2]&&liveSet[pts[i][2]]===true;
        if(!started){ctx.moveTo(x,y);started=true;prevLive=isLive;}
        else{
          if(isLive!==prevLive){ctx.stroke();ctx.setLineDash(isLive?[5,3]:[]);ctx.beginPath();ctx.moveTo(x,y);prevLive=isLive;}
          else ctx.lineTo(x,y);
        }
      }
      ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      drawn.push(s);
    });
    drawSlider(); drawTimeSlider(); drawOverlay();
  }

  function drawSlider(){
    var sy=geom.h-30,sh=14,sx=geom.l,sw=geom.w-geom.l-geom.r;
    ctx.fillStyle=cssVar('--muted')||'#f4f4f5';ctx.fillRect(sx,sy,sw,sh);
    var f0=ts(state.start),f1=ts(state.end);
    var a=sx+(view.t0-f0)/(f1-f0)*sw,b=sx+(view.t1-f0)/(f1-f0)*sw;
    ctx.fillStyle=cssVar('--primary')||'#18181b';ctx.globalAlpha=0.18;ctx.fillRect(a,sy,b-a,sh);ctx.globalAlpha=1;
    ctx.strokeStyle=cssVar('--primary')||'#18181b';ctx.lineWidth=1.5;ctx.strokeRect(a,sy,Math.max(1,b-a),sh);
    [a,b].forEach(function(x){
      var cy=sy+sh/2;
      ctx.fillStyle=cssVar('--card')||'#fff';ctx.beginPath();ctx.arc(x,cy,7,0,2*Math.PI);ctx.fill();
      ctx.strokeStyle=cssVar('--primary')||'#18181b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,cy,7,0,2*Math.PI);ctx.stroke();
      ctx.fillStyle=cssVar('--primary')||'#18181b';ctx.beginPath();ctx.arc(x,cy,2.5,0,2*Math.PI);ctx.fill();
    });
  }

  var SL={pad:10,w:0,h:0,a:0,b:0,handleW:12,drag:null};
  function drawTimeSlider(){
    SL.w=slider.clientWidth;SL.h=slider.clientHeight;
    slider.width=Math.round(SL.w*dpr);slider.height=Math.round(SL.h*dpr);
    sctx.setTransform(dpr,0,0,dpr,0,0);sctx.clearRect(0,0,SL.w,SL.h);
    var trackY=10,trackH=8,x0=SL.pad,x1=SL.w-SL.pad,tw=x1-x0;
    var f0=ts(FULL_START),f1=ts(FULL_END);
    SL.a=x0+(ts(state.start)-f0)/(f1-f0)*tw; SL.b=x0+(ts(state.end)-f0)/(f1-f0)*tw;
    sctx.fillStyle=cssVar('--muted')||'#f4f4f5';sctx.fillRect(x0,trackY,tw,trackH);
    sctx.fillStyle=cssVar('--primary')||'#18181b';sctx.globalAlpha=0.35;
    sctx.fillRect(SL.a,trackY,Math.max(1,SL.b-SL.a),trackH);sctx.globalAlpha=1;
    sctx.fillStyle=cssVar('--muted-foreground')||'#71717a';sctx.font='10px sans-serif';
    sctx.textBaseline='top';sctx.textAlign='center';
    [1780,1850,1920,1990,2026].forEach(function(y){
      var x=x0+(ts(y+'-01-01')-f0)/(f1-f0)*tw;
      sctx.fillText(String(y),Math.max(16,Math.min(SL.w-16,x)),trackY+trackH+3);
    });
    [SL.a,SL.b].forEach(function(x){
      var hy=trackY+trackH/2;
      sctx.fillStyle=cssVar('--card')||'#fff';sctx.beginPath();sctx.arc(x,hy,8,0,2*Math.PI);sctx.fill();
      sctx.strokeStyle=cssVar('--primary')||'#18181b';sctx.lineWidth=2;sctx.beginPath();sctx.arc(x,hy,8,0,2*Math.PI);sctx.stroke();
      sctx.fillStyle=cssVar('--primary')||'#18181b';sctx.beginPath();sctx.arc(x,hy,3,0,2*Math.PI);sctx.fill();
    });
  }
  function sliderXToDate(x){
    var x0=SL.pad,x1=SL.w-SL.pad,tw=x1-x0,f0=ts(FULL_START),f1=ts(FULL_END);
    return dateOf(f0+Math.max(0,Math.min(1,(x-x0)/tw))*(f1-f0));
  }
  slider.addEventListener('pointerdown',function(e){
    var x=localXY(slider,e.clientX,e.clientY).x;
    SL.drag=Math.abs(x-SL.a)<=Math.abs(x-SL.b)?'a':'b';
    if(slider.setPointerCapture) slider.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  slider.addEventListener('pointermove',function(e){
    if(!SL.drag) return;
    var d=sliderXToDate(localXY(slider,e.clientX,e.clientY).x);
    if(SL.drag==='a'){ if(d<state.end) state.start=d; } else { if(d>state.start) state.end=d; }
    syncDateUI(); resetView(); render();
  });
  ['pointerup','pointercancel'].forEach(function(ev){ slider.addEventListener(ev,function(){SL.drag=null;}); });
  function syncDateUI(){
    ['dateStart','fsDateStart'].forEach(function(id){var el=document.getElementById(id);if(el)el.value=state.start;});
    ['dateEnd','fsDateEnd'].forEach(function(id){var el=document.getElementById(id);if(el)el.value=state.end;});
    document.getElementById('sliderLabel').textContent=state.start.slice(0,4)+' — '+state.end.slice(0,4);
    var tag=document.getElementById('fsRangeTag');
    if(tag) tag.textContent=state.start.slice(0,4)+' — '+state.end.slice(0,4);
  }

  var hover={ x:null, y:null, inChart:false, event:null };
  var pinned=null;
  function drawOverlay(){
    if(overlay.width!==canvas.width||overlay.height!==canvas.height){
      overlay.width=canvas.width;overlay.height=canvas.height;
    }
    octx.setTransform(dpr,0,0,dpr,0,0);octx.clearRect(0,0,geom.w,geom.h);
    if(!hover.inChart&&!pinned) return;
    var src=hover.inChart?hover:pinned;

    if(src.event){
      var e=src.event;
      var xa=xOf(ts(e.s+'-01-01')),xb=xOf(ts(e.e+'-12-31'));
      var lo=Math.max(xa,geom.l),hi=Math.min(xb,geom.w-geom.r);
      octx.fillStyle='rgba(220,38,38,0.10)';
      octx.fillRect(lo,geom.t,Math.max(2,hi-lo),geom.h-geom.t-geom.b);
      octx.strokeStyle='rgba(220,38,38,0.55)';octx.setLineDash([4,3]);octx.lineWidth=1;
      octx.beginPath();octx.moveTo(lo,geom.t);octx.lineTo(lo,geom.h-geom.b);
      octx.moveTo(hi,geom.t);octx.lineTo(hi,geom.h-geom.b);octx.stroke();octx.setLineDash([]);
      return;
    }

    if(src.x===null||src.x<geom.l||src.x>geom.w-geom.r||src.y<geom.t||src.y>geom.h-geom.b) return;
    var t=tOf(src.x),x=xOf(t);
    octx.strokeStyle=cssVar('--chart-text')||'#52525b';octx.globalAlpha=0.5;
    octx.setLineDash([4,3]);octx.lineWidth=1;
    octx.beginPath();octx.moveTo(x+0.5,geom.t);octx.lineTo(x+0.5,geom.h-geom.b);octx.stroke();
    octx.setLineDash([]);octx.globalAlpha=1;

    var span=view.t1-view.t0,tol=span*0.02;
    drawn.forEach(function(s){
      var best=null,bd=Infinity;
      for(var i=0;i<s.data.length;i++){ var d=Math.abs(s.data[i][0]-t); if(d<bd){bd=d;best=s.data[i];} }
      if(!best||bd>tol) return;
      var rg=s.ratio?ratioYRange:yRange;
      var px=xOf(best[0]),py=yOf(best[1],rg);
      if(py<geom.t||py>geom.h-geom.b) return;
      octx.fillStyle=cssVar('--card')||'#fff';
      octx.beginPath();octx.arc(px,py,6,0,2*Math.PI);octx.fill();
      octx.strokeStyle=s.color;octx.lineWidth=1.6;
      octx.beginPath();octx.arc(px,py,6,0,2*Math.PI);octx.stroke();
      octx.fillStyle=s.color;
      octx.beginPath();octx.arc(px,py,2.5,0,2*Math.PI);octx.fill();
    });
  }

  function fmtNum(v){
    var a=Math.abs(v);
    if(a>=1000) return v.toFixed(0);
    if(a>=10) return v.toFixed(1);
    if(a>=1) return v.toFixed(2);
    return v.toFixed(3);
  }

  var drag=null,gesture=null;
  function setPinFromTouch(t){
    var p=localXY(canvas,t.clientX,t.clientY);
    var x=Math.max(geom.l,Math.min(geom.w-geom.r,p.x));
    var y=Math.max(geom.t,Math.min(geom.h-geom.b,p.y));
    pinned={x:x,y:y};hover.x=x;hover.y=y;hover.inChart=true;hover.event=null;
    drawOverlay();showTip(x,y);
  }
  function initGesture(touches){
    var a=localXY(canvas,touches[0].clientX,touches[0].clientY);
    var b=localXY(canvas,touches[1].clientX,touches[1].clientY);
    return {x0:(a.x+b.x)/2,d0:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),t0:view.t0,t1:view.t1};
  }
  canvas.addEventListener('mousedown',function(e){
    var p=localXY(canvas,e.clientX,e.clientY);
    drag={x0:p.x,t0:view.t0,t1:view.t1,moved:false};
  });
  canvas.addEventListener('click',function(e){
    if(drag&&drag.moved) return;
    var p=localXY(canvas,e.clientX,e.clientY),x=p.x,y=p.y;
    if(x<geom.l||x>geom.w-geom.r||y<geom.t||y>geom.h-geom.b) return;
    pinned={x:x,y:y};hover.x=x;hover.y=y;hover.event=null;
    drawOverlay();showTip(x,y);
  });
  canvas.addEventListener('touchstart',function(e){
    if(e.touches.length>=2){
      gesture=initGesture(e.touches);pinned=null;hover.inChart=false;
      tip.style.display='none';drawOverlay();e.preventDefault();return;
    }
    var t=e.touches[0],p=localXY(canvas,t.clientX,t.clientY),x=p.x,y=p.y;
    if(x<geom.l||x>geom.w-geom.r||y<geom.t||y>geom.h-geom.b)return;
    pinned={x:x,y:y};hover.x=x;hover.y=y;hover.inChart=true;hover.event=null;
    drawOverlay();showTip(x,y);e.preventDefault();
  },{passive:false});
  canvas.addEventListener('touchmove',function(e){
    if(e.touches.length>=2){
      if(!gesture) gesture=initGesture(e.touches);
      var a=localXY(canvas,e.touches[0].clientX,e.touches[0].clientY);
      var b=localXY(canvas,e.touches[1].clientX,e.touches[1].clientY);
      var x=(a.x+b.x)/2,d=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      var f0=ts(state.start),f1=ts(state.end),fullSpan=f1-f0;
      var span0=gesture.t1-gesture.t0;
      var factor=Math.max(0.15,Math.min(6.6,gesture.d0/d));
      var span=Math.max(fullSpan*0.008,Math.min(fullSpan,span0*factor));
      var pw=Math.max(1,geom.w-geom.l-geom.r);
      var tAt=gesture.t0+Math.max(0,Math.min(1,(gesture.x0-geom.l)/pw))*span0;
      var ratio=(tAt-gesture.t0)/span0;
      var z0=tAt-span*ratio;
      var dt=(x-gesture.x0)/pw*span;
      var nt0=Math.max(f0,Math.min(f1-span,z0-dt));
      view.t0=nt0;view.t1=nt0+span;render();
      e.preventDefault();return;
    }
    if(gesture){
      gesture=null;
      if(e.touches.length===1) setPinFromTouch(e.touches[0]);
      e.preventDefault();return;
    }
    if(!pinned)return;
    setPinFromTouch(e.touches[0]);e.preventDefault();
  },{passive:false});
  ['touchend','touchcancel'].forEach(function(ev){
    canvas.addEventListener(ev,function(e){
      if(e.touches.length<2) gesture=null;
      if(e.touches.length===1&&pinned) setPinFromTouch(e.touches[0]);
    });
  });
  window.addEventListener('mousemove',function(e){
    var p=localXY(canvas,e.clientX,e.clientY),x=p.x,y=p.y;
    if(drag&&(x<geom.l||x>geom.w-geom.r)===false){
      if(Math.abs(x-drag.x0)>2) drag.moved=true;
      hover.inChart=false;drawOverlay();
      var dt=(x-drag.x0)/(geom.w-geom.l-geom.r)*(drag.t1-drag.t0);
      var f0=ts(state.start),f1=ts(state.end),span=drag.t1-drag.t0;
      var nt0=Math.max(f0,Math.min(f1-span,drag.t0-dt));
      view.t0=nt0;view.t1=nt0+span;render();return;
    }
    var overEvent=null;
    if(state.events&&x>=geom.l&&x<=geom.w-geom.r&&y>=geom.t&&y<=geom.h-geom.b){
      for(var i=0;i<eventHits.length;i++){
        var h=eventHits[i];
        if(x>=h.x1&&x<=h.x2&&y>=h.y1&&y<=h.y2){overEvent=h.ev;break;}
      }
    }
    hover.x=x;hover.y=y;hover.inChart=(x>=geom.l&&x<=geom.w-geom.r&&y>=geom.t&&y<=geom.h-geom.b);
    var prev=hover.event;
    hover.event=overEvent;
    drawOverlay();
    if(overEvent) showEventTip(overEvent,x,y);
    else if(prev) tip.style.display='none';
    else if(pinned&&!hover.inChart) showTip(pinned.x,pinned.y);
    else showTip(x,y);
  });
  window.addEventListener('mouseup',function(){drag=null;});
  canvas.addEventListener('mouseleave',function(){
    hover.inChart=false;hover.event=null;
    if(pinned){drawOverlay();showTip(pinned.x,pinned.y);}
    else {tip.style.display='none';drawOverlay();}
  });
  canvas.addEventListener('wheel',function(e){
    e.preventDefault();
    var x=localXY(canvas,e.clientX,e.clientY).x;
    if(x<geom.l||x>geom.w-geom.r) return;
    var tAt=tOf(x),factor=e.deltaY>0?1.18:0.85;
    var f0=ts(state.start),f1=ts(state.end),fullSpan=f1-f0;
    var span=Math.max(fullSpan*0.008,Math.min(fullSpan,(view.t1-view.t0)*factor));
    var ratio=(tAt-view.t0)/(view.t1-view.t0);
    var nt0=Math.max(f0,Math.min(f1-span,tAt-span*ratio));
    view.t0=nt0;view.t1=nt0+span;render();
  },{passive:false});

  function showEventTip(e,x,y){
    tip.innerHTML='<div class="t-h">'+e.t+'</div><div style="color:var(--muted-foreground)">时间段：'+e.s+' – '+e.e+'</div>';
    tip.style.display='block';
    var tx=x+16,ty=y+12;
    if(tx+190>geom.w) tx=x-190;
    if(ty+90>geom.h) ty=y-90;
    tip.style.left=tx+'px';tip.style.top=ty+'px';
  }
  function showTip(x,y){
    if(x<geom.l||x>geom.w-geom.r||y<geom.t||y>geom.h-geom.b){tip.style.display='none';return;}
    var t=tOf(x),html='<div class="t-h">'+dateOf(t)+'</div>',any=false;
    drawn.forEach(function(s){
      var best=null,bd=Infinity;
      for(var i=0;i<s.data.length;i++){ var d=Math.abs(s.data[i][0]-t); if(d<bd){bd=d;best=s.data[i];} }
      if(!best||bd>(view.t1-view.t0)*0.012) return;
      any=true;var v=best[1];
      var isLive=s.key&&liveDates[s.key]&&best[2]&&liveDates[s.key][best[2]]===true;
      html+='<div class="t-r"><span style="color:'+s.color+'">● '+s.name+(isLive?' ·实时':'')+'</span><b>'+(v>=1000?v.toFixed(0):v.toFixed(2))+(s.unit?' '+s.unit:'')+'</b></div>';
    });
    if(!any){tip.style.display='none';return;}
    tip.innerHTML=html;tip.style.display='block';
    var tx=x+16,ty=y+12;
    if(tx+190>geom.w) tx=x-190;
    if(ty+120>geom.h) ty=y-120;
    tip.style.left=tx+'px';tip.style.top=ty+'px';
  }

  var anim=null;
  function easeInOut(p){ return p<0.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2; }
  function animateView(to0,to1,dur){
    dur=dur||460;var from0=view.t0,from1=view.t1,t0=(window.performance||Date).now();
    if(anim) anim.cancel=true;
    var token={cancel:false};anim=token;
    function step(now){
      if(token.cancel) return;
      var p=Math.min(1,(now-t0)/dur),e=easeInOut(p);
      view.t0=from0+(to0-from0)*e;view.t1=from1+(to1-from1)*e;render();
      if(p<1) requestAnimationFrame(step); else anim=null;
    }
    requestAnimationFrame(step);
  }
  function resetView(animate){
    var t0=ts(state.start),t1=ts(state.end);
    if(animate&&(Math.abs(t0-view.t0)>1||Math.abs(t1-view.t1)>1)) animateView(t0,t1);
    else {view.t0=t0;view.t1=t1;render();}
  }

  function renderLegend(){
    var el=document.getElementById('legendNote'),html='';
    state.selected.forEach(function(k){html+='<span><i class="dot" style="background:'+meta[k].color+'"></i>'+meta[k].label+'</span>';});
    if(state.ratio) html+='<span><i class="dot" style="background:#B45309"></i>金油比</span><span><i class="dot" style="background:#6D28D9"></i>金银比</span>';
    if(state.kond!=='off') html+='<span><i class="band" style="background:rgba(220,38,38,.12)"></i>康波阶段带（'+KOND[state.kond].label+'）</span>';
    html+='<span><i class="band" style="background:repeating-linear-gradient(90deg,#71717a,#71717a 4px,transparent 4px,transparent 7px)"></i>实时段（虚线）</span>';
    el.innerHTML=html;
  }
  function refresh(){render();renderLegend();}
  function buildChips(){
    var el=document.getElementById('seriesChips');
    Object.keys(meta).forEach(function(k){
      if(k==='cpi') return;
      var b=document.createElement('button');b.className='chip on';b.dataset.k=k;
      b.innerHTML='<i class="dot" style="background:'+meta[k].color+'"></i>'+meta[k].label;
      b.onclick=function(){
        var i=state.selected.indexOf(k);
        if(i>=0){state.selected.splice(i,1);b.classList.remove('on');}
        else {state.selected.push(k);b.classList.add('on');}
        refresh();
      };
      el.appendChild(b);
    });
  }
  function selectAll(on){
    document.querySelectorAll('#seriesChips .chip').forEach(function(b){
      var k=b.dataset.k,i=state.selected.indexOf(k);
      if(on&&i<0){state.selected.push(k);b.classList.add('on');}
      else if(!on&&i>=0){state.selected.splice(i,1);b.classList.remove('on');}
    });
    refresh();
  }
  function bindSeg(id,attr,key,after){
    document.querySelectorAll('#'+id+' button').forEach(function(b){
      b.onclick=function(){
        document.querySelectorAll('#'+id+' button').forEach(function(x){x.classList.remove('on');});
        b.classList.add('on');state[key]=b.dataset[attr];if(after)after();refresh();
      };
    });
  }
  function renderSourceTable(){
    var notes={
      gold:'1258–1717 英制官方价(GBP)；1718–1959 伦敦市场价；1960–2024 世行月度；2025–26 yahoo 期货；2026-02 后 thegoldrates 日收盘补齐。多口径拼接',
      silver:'1688–2026-02 由 freegoldapi 金银比重建；2026-02 后 thegoldrates 日收盘补齐',
      platinum:'1960–2024 世行月度均价；2024-12 后 GoldPrice.com 日收盘补齐',
      palladium:'LBMA 定盘价 + Metals.dev 收盘价，日度',
      wti:'EIA 现货月度均价',brent:'EIA 现货月度均价',
      natural_gas:'Henry Hub 现货日度',gasoline:'纽约港 RBOB 现货日度',
      cpi:'季调 CPI，1982-84=100，用于平减'
    };
    var html='';
    Object.keys(meta).forEach(function(k){
      var s=series[k];if(!s||!s.length)return;
      var liveN=liveDates[k]?Object.keys(liveDates[k]).length:0;
      html+='<tr><td>'+meta[k].label+'</td><td>'+s[0][0]+'</td><td>'+s[s.length-1][0]+'</td><td>'+s.length+(liveN?' (+'+liveN+'实时)':'')+'</td><td>'+s[0][2]+'</td><td>'+(notes[k]||'')+'</td></tr>';
    });
    document.querySelector('#sourceTable tbody').innerHTML=html;
  }

  var METAL_API={gold:'XAU',silver:'XAG',platinum:'XPT',palladium:'XPD'};
  var FX_URLS=['https://open.er-api.com/v6/latest/USD','https://api.exchangerate-api.com/v4/latest/USD'];
  function markLive(key,dateStr){
    if(!liveDates[key]) liveDates[key]={};
    liveDates[key][dateStr]=true;
    try{
      var saved=JSON.parse(localStorage.getItem('kond_live')||'{}');
      if(!saved[key]) saved[key]={};
      saved[key][dateStr]=1;localStorage.setItem('kond_live',JSON.stringify(saved));
    }catch(e){}
  }
  function appendLive(key,dateStr,price,srcTag){
    var arr=series[key];if(!arr||!num(price))return false;
    var last=arr[arr.length-1][0];
    if(dateStr<=last) return false;
    arr.push([dateStr,+num(price).toFixed(4),meta[key].label+' · 实时('+srcTag+')',meta[key].unit]);
    markLive(key,dateStr);
    return true;
  }
  function restoreLive(){
    var n=0;
    try{
      var saved=JSON.parse(localStorage.getItem('kond_live')||'{}');
      Object.keys(saved).forEach(function(k){
        if(!series[k]) return;
        Object.keys(saved[k]).forEach(function(d){
          var arr=series[k],exists=arr.some(function(p){return p[0]===d;});
          if(!exists&&d>arr[arr.length-1][0]) return;
          if(!exists) return;
          if(!liveDates[k]) liveDates[k]={};
          liveDates[k][d]=true;n++;
        });
      });
    }catch(e){}
    return n;
  }
  function tryLiveUpdate(silent){
    var btn=document.getElementById('refreshBtn'),st=document.getElementById('status');
    if(!silent){btn.disabled=true;btn.textContent='↻ 拉取中…';}
    var added=0,failed=0,total=10;
    var key=(localStorage.getItem('kond_av_key')||'').trim();
    if(key) total+=3;
    var connected=0;
    function finish(){
      if(--total>0) return;
      btn.disabled=false;btn.textContent='↻ 刷新实时数据';
      var tm=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
      if(added>0){
        st.innerHTML='<span class="pulse"></span><span>实时更新 +'+added+' 点 · '+connected+' 源可达 · '+tm+'</span>';
        refresh();renderSourceTable();
      } else if(connected>0){
        st.innerHTML='<span class="pulse"></span><span>实时 '+connected+' 源可达 · 数据已至最新（USD/CNY '+usdCny+'）· '+tm+'</span>';
      } else {
        st.innerHTML='<span class="pulse" style="background:#a1a1aa"></span><span>实时源不可达（'+failed+' 项失败），已用预置数据</span>';
      }
    }
    function ok(){connected++;}
    Object.keys(METAL_API).forEach(function(k){
      fetch('https://api.gold-api.com/price/'+METAL_API[k],{cache:'no-store'})
        .then(function(r){if(!r.ok)throw 0;return r.json();})
        .then(function(j){ok();var d=j.updatedAt?j.updatedAt.slice(0,10):dateOf(Date.now());if(appendLive(k,d,j.price,'gold-api'))added++;})
        .catch(function(){failed++;}).then(finish);
    });
    fetch('https://freegoldapi.com/data/latest.json',{cache:'no-store'})
      .then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(j){ok();var last=series.gold[series.gold.length-1][0];
        j.forEach(function(x){if(x.date>last&&num(x.price)&&x.price>100) if(appendLive('gold',x.date,x.price,'freegoldapi'))added++;});
      }).catch(function(){failed++;}).then(finish);
    fetch('https://freegoldapi.com/data/gold_silver_ratio_enriched.csv',{cache:'no-store'})
      .then(function(r){if(!r.ok)throw 0;return r.text();})
      .then(function(txt){
        ok();var lines=txt.trim().split('\n'),last=series.silver[series.silver.length-1][0],addedSilver=0;
        for(var i=1;i<lines.length;i++){
          var p=lines[i].split(',');
          if(p.length<4||!p[3]||!num(p[3])||!num(p[1])) continue;
          if(p[0]>last){ if(appendLive('silver',p[0],num(p[1])/num(p[3]),'freegoldapi金银比')) addedSilver++; }
        }
        added+=addedSilver;
      }).catch(function(){failed++;}).then(finish);
    FX_URLS.forEach(function(url){
      fetch(url,{cache:'no-store'})
        .then(function(r){if(!r.ok)throw 0;return r.json();})
        .then(function(j){ok();var rate=j.rates?j.rates.CNY:(j.quotes?j.quotes.USDCNY:null);if(num(rate)&&num(rate)>0){usdCny=+num(rate).toFixed(4);if(state.anchor==='cny')refresh();}})
        .catch(function(){failed++;}).then(finish);
    });
    fetch('https://xaus.com/api/v1/history',{cache:'no-store'})
      .then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(j){ok();var pts=j.points||[],last=series.gold[series.gold.length-1][0],n=0;
        pts.forEach(function(p){if(p.d>last&&num(p.c)){if(appendLive('gold',p.d,p.c,'XAUS日线'))n++;}});
        added+=n;
      }).catch(function(){failed++;}).then(finish);
    (function(){
      var e=new Date(),s=new Date(e.getTime()-28*86400000);
      function ymd(d){return d.toISOString().slice(0,10);}
      fetch('https://www.algospecial.com/api/ohlc.php?symbol=XAUUSD&tf=D1&from='+ymd(s)+'&to='+ymd(e)+'&format=json',{cache:'no-store'})
        .then(function(r){if(!r.ok)throw 0;return r.json();})
        .then(function(j){ok();var last=series.gold[series.gold.length-1][0];
          (j.data||[]).forEach(function(p){var d=(p.Timestamp||'').replace(/\./g,'-').slice(0,10);
            if(d>last&&num(p.Close))appendLive('gold',d,p.Close,'AlgoSpecial');});
        }).catch(function(){failed++;}).then(finish);
    })();
    if(key){
      [['wti','WTI'],['brent','BRENT'],['natural_gas','NATURAL_GAS']].forEach(function(pair){
        fetch('https://www.alphavantage.co/query?function='+pair[1]+'&interval=daily&outputsize=1&apikey='+encodeURIComponent(key),{cache:'no-store'})
          .then(function(r){return r.json();})
          .then(function(j){
            var sk=Object.keys(j).filter(function(x){return x.indexOf('Time Series')>=0;})[0];
            if(!sk||!j[sk]){failed++;return;}
            ok();var dates=Object.keys(j[sk]).sort();if(!dates.length){return;}
            var ld=dates[dates.length-1],v=num(j[sk][ld]['4. close']||j[sk][ld]['1. open']);
            if(appendLive(pair[0],ld,v,'AlphaVantage'))added++;
          }).catch(function(){failed++;}).then(finish);
      });
    }
  }

  function setRange(start,end,animate){
    state.start=start;state.end=end;syncDateUI();resetView(animate!==false);
  }
  function applyPreset(p){
    if(p==='all'){setRange(FULL_START,FULL_END);return;}
    var d=new Date(),end=dateOf(d.getTime());
    if(p==='1m') d.setMonth(d.getMonth()-1);
    else if(p==='3m') d.setMonth(d.getMonth()-3);
    else if(p==='6m') d.setMonth(d.getMonth()-6);
    else d.setFullYear(d.getFullYear()-parseInt(p,10));
    setRange(dateOf(d.getTime()),end);
  }
  function init(){
    var restored=restoreLive();
    document.getElementById('status').innerHTML='<span class="pulse"></span><span>已加载 · '+DATA.build_date+' 构建 · '+Object.keys(series).length+' 条序列'+(restored?' · 本地实时 '+restored+' 点':'')+'</span>';
    buildChips();renderSourceTable();resetView();refresh();
    bindSeg('modeSeg','m','mode');
    bindSeg('anchorSeg','c','anchor',function(){
      document.getElementById('modeSeg').querySelector('[data-m="real"]').disabled=state.anchor==='cny';
    });
    bindSeg('axisSeg','a','axis');
    bindSeg('kondratievSeg','k','kond');
    document.getElementById('eventToggle').onchange=function(e){state.events=e.target.checked;refresh();};
    document.getElementById('ratioToggle').onchange=function(e){state.ratio=e.target.checked;refresh();};
    document.getElementById('selAllBtn').onclick=function(){selectAll(true);};
    document.getElementById('selNoneBtn').onclick=function(){selectAll(false);};
    document.querySelectorAll('#quickRange button,#fsQuickRange button').forEach(function(b){
      b.onclick=function(){applyPreset(b.dataset.p);};
    });
    document.getElementById('allRangeBtn').onclick=function(){setRange(FULL_START,FULL_END);};
    ['dateStart','dateEnd','fsDateStart','fsDateEnd'].forEach(function(id){
      var el=document.getElementById(id);if(!el)return;
      el.onchange=function(e){
        if(id.indexOf('Start')>=0) state.start=e.target.value||FULL_START;
        else state.end=e.target.value||FULL_END;
        syncDateUI();resetView(true);
      };
    });
    document.getElementById('themeBtn').onclick=function(){document.documentElement.classList.toggle('dark');refresh();};
    document.getElementById('refreshBtn').onclick=function(){tryLiveUpdate(false);};
    var savedKey=localStorage.getItem('kond_av_key')||'';
    if(savedKey) document.getElementById('apiKeyInput').value=savedKey;
    document.getElementById('saveKeyBtn').onclick=function(){
      var k=document.getElementById('apiKeyInput').value.trim();
      if(k) localStorage.setItem('kond_av_key',k); else localStorage.removeItem('kond_av_key');
      document.getElementById('status').innerHTML='<span class="pulse"></span><span>'+(k?'能源 API key 已保存':'未设置 key')+'</span>';
    };
    document.getElementById('clearKeyBtn').onclick=function(){
      document.getElementById('apiKeyInput').value='';localStorage.removeItem('kond_av_key');
      document.getElementById('status').innerHTML='<span class="pulse"></span><span>已清除能源 API key</span>';
    };
    var fullBtn=document.getElementById('fullBtn'),card=document.getElementById('chartCard');
    var controlCard=document.getElementById('controlCard'),controlHome=document.getElementById('controlHome');
    var drawerBody=document.getElementById('fsDrawerBody'),scrim=document.getElementById('fsScrim');
    var fsActive=false;
    function isFullscreen(){return document.fullscreenElement===card||card.classList.contains('chart-card-fs');}
    function closeDrawer(){card.classList.remove('fs-open');}
    function syncFullscreenUi(){
      var now=isFullscreen();
      if(now===fsActive) return;
      fsActive=now;
      if(now){
        drawerBody.appendChild(controlCard);
        closeDrawer();
      }else{
        closeDrawer();
        controlHome.parentNode.insertBefore(controlCard,controlHome.nextSibling);
      }
    }
    function lockLandscape(){
      try{
        if(window.screen&&screen.orientation&&screen.orientation.lock)
          return screen.orientation.lock('landscape');
      }catch(e){}
      return null;
    }
    var rotateNote=document.getElementById('fsRotateNote'),noteTimer=null;
    function hideRotateNote(){rotateNote.style.display='none';if(noteTimer){clearTimeout(noteTimer);noteTimer=null;}}
    function showRotateNote(){
      rotateNote.style.display='block';
      if(noteTimer) clearTimeout(noteTimer);
      noteTimer=setTimeout(hideRotateNote,3600);
    }
    function syncOrientation(){
      var need=fsActive&&window.innerWidth<=900&&window.innerHeight>window.innerWidth+10;
      card.classList.toggle('fs-rotated',need);
      if(!need) hideRotateNote();
      setTimeout(function(){render();syncDateUI();},80);
    }
    function forceLandscape(){
      if(!isFullscreen()) fullBtn.click();
      var p=lockLandscape();
      if(p&&p.then) p.then(hideRotateNote).catch(function(){
        if(window.innerHeight>window.innerWidth) showRotateNote();
      });
      card.classList.toggle('fs-rotated',window.innerHeight>window.innerWidth+10);
      setTimeout(function(){render();syncDateUI();},100);
      setTimeout(function(){if(window.innerHeight>window.innerWidth) showRotateNote();},700);
    }
    function afterFullscreen(){
      syncFullscreenUi();
      fullBtn.textContent=isFullscreen()?'⛶ 退出全屏':'⛶ 全屏';
      syncOrientation();
      setTimeout(function(){render();syncDateUI();},120);
    }
    fullBtn.onclick=function(){
      if(isFullscreen()){
        if(document.fullscreenElement) document.exitFullscreen().catch(function(){});
        card.classList.remove('chart-card-fs','fs-rotated');
        try{ if(window.screen&&screen.orientation&&screen.orientation.unlock) screen.orientation.unlock(); }catch(e){}
        afterFullscreen();
      } else {
        if(card.requestFullscreen){
          card.requestFullscreen().then(function(){var p=lockLandscape();if(p&&p.catch)p.catch(function(){});}).catch(function(){
            card.classList.add('chart-card-fs');afterFullscreen();
          });
        } else {
          card.classList.add('chart-card-fs');afterFullscreen();
        }
        fullBtn.textContent='⛶ 退出全屏';
      }
    };
    document.getElementById('fsExitBtn').onclick=function(){fullBtn.click();};
    document.getElementById('fsRotateBtn').onclick=forceLandscape;
    document.getElementById('forceLandscapeBtn').onclick=forceLandscape;
    document.getElementById('fsSettingsBtn').onclick=function(){
      if(!isFullscreen()) return;
      var open=!card.classList.contains('fs-open');
      card.classList.toggle('fs-open',open);
      if(open) setTimeout(function(){render();syncDateUI();},60);
    };
    scrim.onclick=closeDrawer;
    document.addEventListener('fullscreenchange',afterFullscreen);
    window.addEventListener('orientationchange',function(){setTimeout(syncOrientation,200);});
    window.addEventListener('resize',function(){syncOrientation();});
    setTimeout(function(){tryLiveUpdate(true);},500);
  }
  init();
})();
