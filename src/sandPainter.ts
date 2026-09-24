export type SceneInfo = { title: string; lyric: string; english: string };

export const scenes: SceneInfo[] = [
  { title: "序 · 月升", lyric: "中秋月挂天上", english: "THE MID-AUTUMN MOON RISES" },
  { title: "月照木楼", lyric: "映木楼　照小窗", english: "LIGHT FALLS UPON THE WINDOW" },
  { title: "山水杳杳", lyric: "远山云烟渺渺　近水碧波茫茫", english: "MOUNTAINS FADE BEYOND THE WATER" },
  { title: "隔海相望", lyric: "海外万千游子　隔山隔水相望", english: "ACROSS MOUNTAINS AND SEAS" },
  { title: "椰风诉情", lyric: "椰子树风中唱　诉离情话衷肠", english: "PALMS SING OF DISTANT HEARTS" },
  { title: "故园慈母", lyric: "最忆故乡草木　难忘慈母生养", english: "HOME LIVES WITHIN MEMORY" },
  { title: "梧桐叶落", lyric: "秋来梧桐叶落　海外儿女思乡", english: "AUTUMN LEAVES CARRY LONGING" },
  { title: "此意久长", lyric: "思乡，思乡　此情此意久长", english: "BENEATH ONE MOON, LOVE ENDURES" },
];

const TAU = Math.PI * 2;
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const ease = (n: number) => { n = clamp(n); return n * n * (3 - 2 * n); };
const rand = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export class SandPainter {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private scale = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    this.ctx = ctx;
  }

  resize(width = this.canvas.clientWidth, height = this.canvas.clientHeight, dpr = Math.min(devicePixelRatio, 2)) {
    this.w = width; this.h = height; this.scale = Math.min(width / 1440, height / 900);
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(progress: number) {
    const c = this.ctx, w = this.w, h = this.h;
    const stage = clamp(progress) * scenes.length;
    const scene = Math.min(scenes.length - 1, Math.floor(stage));
    const local = stage - scene;
    const fade = Math.min(1, local * 3.2, (1 - local) * 4.5);
    const glow = c.createRadialGradient(w * .5, h * .42, 0, w * .5, h * .45, Math.max(w, h) * .72);
    glow.addColorStop(0, "#b87d3e"); glow.addColorStop(.45, "#76502e"); glow.addColorStop(1, "#26150e");
    c.fillStyle = glow; c.fillRect(0, 0, w, h);
    c.save(); c.globalAlpha = .16;
    for (let i=0;i<900;i++) { const x=rand(i)*w, y=rand(i+999)*h; c.fillStyle=i%3?"#f6ce8c":"#28140b"; c.fillRect(x,y,rand(i+42)*1.5+.3,rand(i+77)*1.5+.3); }
    c.restore();
    c.save(); c.globalAlpha = fade; c.translate(w/2,h/2); c.scale(this.scale,this.scale); c.translate(-720,-450);
    [this.moonrise,this.house,this.landscape,this.wanderer,this.palms,this.mother,this.leaves,this.finale][scene].call(this, local);
    c.restore();
  }

  private stroke(width=7, alpha=.82) { this.ctx.strokeStyle=`rgba(43,22,13,${alpha})`; this.ctx.lineWidth=width; this.ctx.lineCap="round"; this.ctx.lineJoin="round"; }
  private path(points:number[][], reveal=1, width=7) {
    const c=this.ctx, count=Math.max(2,Math.floor(points.length*clamp(reveal))); this.stroke(width); c.beginPath(); c.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<count;i++) c.lineTo(points[i][0],points[i][1]); c.stroke();
    for(let i=0;i<count*3;i++) { const p=points[Math.floor(rand(i+count)*count)]; c.fillStyle=`rgba(41,20,12,${.18+rand(i+7)*.4})`; c.beginPath(); c.arc(p[0]+(rand(i+21)-.5)*width*2,p[1]+(rand(i+49)-.5)*width*2,rand(i+82)*2.2+.3,0,TAU); c.fill(); }
  }
  private moon(x:number,y:number,r:number,alpha=1) {
    const c=this.ctx; c.save(); c.globalAlpha=alpha; c.shadowColor="rgba(255,224,166,.7)"; c.shadowBlur=50; c.fillStyle="#edca8c"; c.beginPath(); c.arc(x,y,r,0,TAU); c.fill(); c.shadowBlur=0;
    for(let i=0;i<75;i++){ const a=rand(i)*TAU, rr=Math.sqrt(rand(i+80))*r*.88; c.fillStyle=`rgba(89,49,25,${rand(i+30)*.16})`; c.beginPath(); c.arc(x+Math.cos(a)*rr,y+Math.sin(a)*rr,rand(i+8)*4+.5,0,TAU); c.fill(); } c.restore();
  }
  private mountains(offset=0) { this.path([[0,570],[120,510],[210,550],[340,435],[465,540],[590,470],[720,550],[860,455],[1010,545],[1145,480],[1280,545],[1440,500]],1,6); this.ctx.save(); this.ctx.globalAlpha=.35; this.ctx.translate(0,65+offset); this.path([[0,570],[150,490],[270,555],[420,480],[590,560],[780,500],[930,555],[1100,475],[1280,550],[1440,505]],1,4); this.ctx.restore(); }
  private water(y=650) { const c=this.ctx; for(let i=0;i<28;i++){ const yy=y+i*8; c.strokeStyle=`rgba(48,25,15,${.08+(i%4)*.04})`; c.lineWidth=2+rand(i)*3; c.beginPath(); for(let x=-20;x<1460;x+=30){ const wave=Math.sin(x*.018+i*.7)*5; x===-20?c.moveTo(x,yy+wave):c.lineTo(x,yy+wave); } c.stroke(); } }

  private moonrise(t:number){ this.moon(720,285,112,ease(t*2)); this.path([[210,570],[340,510],[470,548],[600,465],[720,540],[840,480],[970,555],[1110,490],[1250,550]],ease((t-.18)*2),7); this.path([[520,665],[620,655],[720,670],[825,654],[930,666]],ease((t-.35)*2.2),4); }
  private house(t:number){ this.moon(1030,210,92); this.mountains(); this.water(); const r=ease(t*2.2); this.path([[280,630],[280,365],[590,365],[590,630]],r,9); this.path([[235,380],[435,275],[635,380]],r,12); this.path([[330,610],[330,450],[470,450],[470,610]],r,8); this.ctx.fillStyle="rgba(244,203,133,.7)"; this.ctx.fillRect(487,430,62*r,78*r); this.path([[518,430],[518,508],[487,469],[549,469]],r,4); }
  private landscape(t:number){ this.moon(1020,205,84); this.mountains(Math.sin(t*TAU)*4); this.water(610); const c=this.ctx; c.save(); c.globalAlpha=.15; c.fillStyle="#f3cb88"; c.beginPath(); c.ellipse(1020,690,75,190,0,0,TAU); c.fill(); c.restore(); for(let i=0;i<65;i++){ c.fillStyle=`rgba(60,31,18,${.04+rand(i)*.16})`; c.beginPath(); c.arc(300+rand(i)*850,310+rand(i+30)*200,rand(i+90)*12,0,TAU); c.fill(); } }
  private person(x:number,y:number,s=1){ const c=this.ctx; this.stroke(9*s); c.beginPath(); c.arc(x,y-145*s,28*s,0,TAU); c.stroke(); this.path([[x-17*s,y-115*s],[x-35*s,y-10*s],[x-68*s,y+100*s],[x,y+65*s],[x+68*s,y+100*s],[x+33*s,y-10*s],[x+17*s,y-115*s]],1,8*s); }
  private wanderer(t:number){ this.moon(350,210,95); this.water(650); this.person(920,570,1.05); this.path([[1010,670],[1150,600],[1260,650],[1440,570]],1,6); const c=this.ctx; c.save(); c.globalAlpha=.45; c.strokeStyle="#3a1d11"; c.setLineDash([3,18]); c.beginPath(); c.moveTo(430,260); c.quadraticCurveTo(680,360,885,425); c.stroke(); c.restore(); if(t>.55){ c.fillStyle="#e5bc79"; c.beginPath(); c.ellipse(900,425+(t-.55)*150,5,10,0,0,TAU); c.fill(); } }
  private palms(t:number){ this.moon(310,220,82); this.water(665); const sway=Math.sin(t*TAU)*18; this.path([[1040,700],[1015,580],[1000,450],[1020+sway,325]],1,18); for(let i=0;i<9;i++){const a=-2.9+i*.36;this.path([[1020+sway,325],[1020+sway+Math.cos(a)*140,325+Math.sin(a)*100]],1,10);} this.person(620,590,.72); }
  private mother(t:number){ this.moon(1070,190,76); this.path([[140,680],[140,350],[510,350],[510,680]],1,9); this.path([[100,370],[320,260],[555,370]],1,12); this.person(370,590,.62); this.person(660,610,.42); this.path([[450,505],[560,475],[640,490]],ease(t*2),4); this.path([[90,720],[1350,720]],1,6); }
  private leaf(x:number,y:number,r:number,angle:number){ const c=this.ctx;c.save();c.translate(x,y);c.rotate(angle);this.stroke(4);c.beginPath();c.moveTo(0,0);c.bezierCurveTo(-50*r,-40*r,-70*r,35*r,0,80*r);c.bezierCurveTo(70*r,35*r,50*r,-40*r,0,0);c.stroke();c.beginPath();c.moveTo(0,0);c.lineTo(0,95*r);c.stroke();c.restore(); }
  private leaves(t:number){ this.moon(1070,210,82); this.path([[0,190],[230,200],[420,120],[650,175],[820,80]],1,13); for(let i=0;i<7;i++) this.leaf(180+i*120,180+Math.sin(i)*50+ease(t)*i*12,.4+rand(i)*.3,(rand(i+8)-.5)*1.5); this.leaf(720,260+ease(t)*390,1,1.2+ease(t)*2); this.water(690); }
  private finale(t:number){ this.moon(720,240,125); this.mountains(); this.water(650); this.person(345,610,.48); this.person(1090,610,.48); const c=this.ctx;c.save();c.globalAlpha=ease((t-.25)*2);c.strokeStyle="rgba(52,27,15,.55)";c.lineWidth=6;c.beginPath();c.arc(720,480,300,Math.PI*.18,Math.PI*.82);c.stroke();c.restore(); }
}
