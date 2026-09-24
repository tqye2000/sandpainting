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

type Grain = { x: number; y: number; size: number; tone: number };
type Point = [number, number];
const DESIGN_W = 1440;
const DESIGN_H = 900;
const GRAINS = 7200;
const TAU = Math.PI * 2;
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = (n: number) => { n = clamp(n); return n * n * (3 - 2 * n); };
const outCubic = (n: number) => 1 - Math.pow(1 - clamp(n), 3);
const random = (seed: number) => { const value = Math.sin(seed * 91.17 + 47.53) * 43758.5453; return value - Math.floor(value); };

class SandSketch {
  points: Point[] = [];
  private seed = 0;

  line(path: Point[], density = 2.4, width = 8) {
    for (let n = 1; n < path.length; n++) {
      const [ax, ay] = path[n - 1]; const [bx, by] = path[n];
      const distance = Math.hypot(bx - ax, by - ay); const count = Math.max(1, Math.floor(distance * density));
      for (let i = 0; i < count; i++) {
        const t = i / count; const jitter = (random(this.seed++) - .5) * width;
        const angle = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
        this.points.push([ax + (bx - ax) * t + Math.cos(angle) * jitter, ay + (by - ay) * t + Math.sin(angle) * jitter]);
      }
    }
    return this;
  }

  ring(x: number, y: number, radius: number, thickness = 9, amount = 950) {
    for (let i = 0; i < amount; i++) {
      const angle = random(this.seed++) * TAU; const r = radius + (random(this.seed++) - .5) * thickness;
      this.points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]);
    }
    return this;
  }

  disc(x: number, y: number, radius: number, amount = 1300) {
    for (let i = 0; i < amount; i++) {
      const angle = random(this.seed++) * TAU; const r = Math.sqrt(random(this.seed++)) * radius;
      if (random(this.seed++) > .14) this.points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]);
    }
    return this;
  }

  person(x: number, y: number, scale = 1) {
    this.ring(x, y - 142 * scale, 28 * scale, 7 * scale, 260);
    this.line([[x - 18 * scale, y - 110 * scale], [x - 36 * scale, y], [x - 70 * scale, y + 105 * scale], [x, y + 70 * scale], [x + 70 * scale, y + 105 * scale], [x + 34 * scale, y], [x + 18 * scale, y - 110 * scale]], 2.5, 10 * scale);
    return this;
  }

  waves(startY = 640, rows = 13) {
    for (let row = 0; row < rows; row++) {
      const path: Point[] = [];
      for (let x = -20; x <= 1460; x += 24) path.push([x, startY + row * 13 + Math.sin(x * .018 + row * .8) * 6]);
      this.line(path, .5, 3);
    }
    return this;
  }
}

const mountains = (s: SandSketch, y = 560) => s
  .line([[0,y],[125,y-65],[230,y-14],[360,y-130],[475,y-18],[600,y-90],[720,y-5],[855,y-100],[1010,y-10],[1140,y-75],[1290,y-10],[1440,y-62]], 1.6, 9)
  .line([[0,y+65],[160,y],[290,y+55],[440,y-10],[610,y+50],[790,y-4],[940,y+45],[1100,y-18],[1260,y+40],[1440,y-5]], .8, 6);

const leaf = (s: SandSketch, x: number, y: number, scale = 1, rotation = 0) => {
  const transform = ([px, py]: Point): Point => [x + (px * Math.cos(rotation) - py * Math.sin(rotation)) * scale, y + (px * Math.sin(rotation) + py * Math.cos(rotation)) * scale];
  const left: Point[] = [], right: Point[] = [];
  for (let i=0;i<=24;i++) { const t=i/24; left.push(transform([-Math.sin(t*Math.PI)*48,t*100])); right.push(transform([Math.sin(t*Math.PI)*48,t*100])); }
  s.line(left,1.7,5).line(right,1.7,5).line([transform([0,0]),transform([0,112])],1.8,4);
};

const buildScenes = () => {
  const result: Point[][] = [];
  let s = new SandSketch(); s.disc(720,270,105).line([[190,590],[330,510],[470,558],[610,465],[735,545],[875,480],[1015,555],[1170,490],[1300,550]],2.2,10).waves(675,5); result.push(s.points);
  s = new SandSketch(); s.disc(1040,205,84); mountains(s); s.waves(670,7).line([[245,625],[245,380],[445,275],[650,380],[605,380],[605,625],[245,625]],2.3,11).line([[330,610],[330,445],[475,445],[475,610]],2.3,8).line([[500,430],[560,430],[560,510],[500,510],[500,430],[530,430],[530,510]],2.1,6); result.push(s.points);
  s = new SandSketch(); s.disc(1030,190,78); mountains(s,550); s.waves(610,16); for(let i=0;i<450;i++) s.points.push([280+random(i)*880,300+random(i+500)*170]); result.push(s.points);
  s = new SandSketch(); s.disc(340,205,90).waves(650,13).person(920,570,1.08).line([[1010,690],[1150,605],[1280,655],[1440,580]],2,9).line([[420,270],[570,315],[720,360],[880,420]],.7,4); result.push(s.points);
  s = new SandSketch(); s.disc(310,215,78).waves(670,10).person(620,600,.72).line([[1040,715],[1010,580],[1000,450],[1020,320]],2.5,18); for(let i=0;i<10;i++){const a=-2.9+i*.35;s.line([[1020,320],[1020+Math.cos(a)*150,320+Math.sin(a)*105]],2.2,13);} result.push(s.points);
  s = new SandSketch(); s.disc(1080,185,72).line([[120,700],[120,370],[330,260],[560,370],[520,370],[520,700],[120,700]],2.1,11).person(370,600,.63).person(660,620,.44).line([[440,520],[555,478],[635,500]],2,6).line([[60,735],[1380,735]],1.5,7); result.push(s.points);
  s = new SandSketch(); s.disc(1080,200,75).line([[0,190],[230,200],[420,115],[650,175],[835,75]],2.2,16); for(let i=0;i<7;i++) leaf(s,170+i*120,175+Math.sin(i)*50,.35+random(i)*.3,(random(i+8)-.5)*1.4); leaf(s,720,550,.95,1.8); s.waves(710,5); result.push(s.points);
  s = new SandSketch(); s.disc(720,225,112); mountains(s); s.waves(660,8).person(350,620,.46).person(1090,620,.46).ring(720,465,305,6,950); result.push(s.points);
  return result;
};

export class SandPainter {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private ratio = 1;
  private targets = buildScenes();
  private grains: Grain[] = Array.from({ length: GRAINS }, (_, i) => ({ x: random(i*3)*DESIGN_W, y: -80-random(i*3+1)*420, size: .55+random(i*3+2)*2.1, tone: random(i+9100) }));

  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas 2D is unavailable"); this.ctx = context;
  }

  resize(width = this.canvas.clientWidth, height = this.canvas.clientHeight, dpr = Math.min(devicePixelRatio, 2)) {
    this.width = width; this.height = height; this.ratio = Math.min(width / DESIGN_W, height / DESIGN_H);
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr); this.ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  render(progress: number) {
    const c=this.ctx, stage=clamp(progress)*scenes.length, current=Math.min(scenes.length-1,Math.floor(stage)), local=current===scenes.length-1&&progress===1?1:stage-current;
    const glow=c.createRadialGradient(this.width*.5,this.height*.42,0,this.width*.5,this.height*.45,Math.max(this.width,this.height)*.74);
    glow.addColorStop(0,"#d39a53"); glow.addColorStop(.46,"#865a32"); glow.addColorStop(1,"#28150d"); c.fillStyle=glow;c.fillRect(0,0,this.width,this.height);
    this.drawLightboxDust(progress);
    c.save();c.translate(this.width/2,this.height/2);c.scale(this.ratio,this.ratio);c.translate(-DESIGN_W/2,-DESIGN_H/2);
    this.drawMovingSand(current,local,progress); this.drawSandBank(progress); if(local<.24&&current>0)this.drawHandSweep(local);
    c.restore();
  }

  private point(scene: number, index: number): Point {
    const points=this.targets[clamp(scene,0,this.targets.length-1)]; return points[index%points.length];
  }

  private drawMovingSand(scene: number, local: number, global: number) {
    const c=this.ctx, entering=smooth(local/.3), previous=Math.max(0,scene-1);
    for(let i=0;i<this.grains.length;i++) {
      const grain=this.grains[i], from=scene===0?[grain.x,grain.y] as Point:this.point(previous,i*17+31), to=this.point(scene,i*17+31);
      const delay=random(i+77)*.18, travel=smooth((entering-delay)/(1-delay));
      const direction=random(i+1200)>.5?1:-1, arc=Math.sin(travel*Math.PI)*(65+random(i+80)*190)*direction;
      const wind=Math.sin(global*80+i*.17)*(.7+random(i)*1.8);
      let x=from[0]+(to[0]-from[0])*travel+arc;
      let y=from[1]+(to[1]-from[1])*travel-Math.abs(arc)*.25;
      if(scene===0) y=from[1]+(to[1]-from[1])*outCubic(clamp(local*1.7-delay));
      if(travel>.93){x+=(random(i+global*2)-.5)*2+wind;y+=(random(i+3000)-.5)*2;}
      const alpha=.28+grain.tone*.62; c.fillStyle=`rgba(${42+grain.tone*15},${22+grain.tone*8},${12+grain.tone*4},${alpha})`;
      c.beginPath();c.arc(x,y,grain.size*(travel<.9?1.15:1),0,TAU);c.fill();
      if(travel>.15&&travel<.9&&i%3===0){c.globalAlpha=.16;c.beginPath();c.arc(x-arc*.035,y+Math.abs(arc)*.012,grain.size*.8,0,TAU);c.fill();c.globalAlpha=1;}
    }
    // Loose grains keep falling even after the drawing settles.
    for(let i=0;i<150;i++){
      const cycle=(global*(.18+random(i)*.25)+random(i+500))%1, x=random(i+800)*DESIGN_W;
      c.fillStyle=`rgba(61,31,16,${.12*(1-cycle)})`;c.beginPath();c.arc(x,-30+cycle*800,random(i+44)*1.7+.4,0,TAU);c.fill();
    }
  }

  private drawSandBank(progress: number) {
    const c=this.ctx;c.save();c.globalAlpha=.25;c.fillStyle="#3b1e10";c.beginPath();c.moveTo(0,790);
    for(let x=0;x<=DESIGN_W;x+=30)c.lineTo(x,794+Math.sin(x*.018+progress*15)*4+random(x)*7);
    c.lineTo(DESIGN_W,900);c.lineTo(0,900);c.fill();c.restore();
  }

  private drawHandSweep(local: number) {
    const c=this.ctx, t=outCubic(local/.24), x=-260+t*(DESIGN_W+520);c.save();c.translate(x,360);c.rotate(-.12);
    c.filter="blur(14px)";c.fillStyle="rgba(30,14,8,.13)";c.beginPath();c.ellipse(0,0,210,62,0,0,TAU);c.fill();c.filter="none";
    c.strokeStyle="rgba(247,205,139,.11)";c.lineWidth=7;for(let i=-2;i<=2;i++){c.beginPath();c.moveTo(-155,i*17);c.lineTo(170,i*17);c.stroke();}c.restore();
  }

  private drawLightboxDust(progress: number) {
    const c=this.ctx;c.save();
    for(let i=0;i<650;i++){const x=random(i)*this.width,y=random(i+700)*this.height;c.fillStyle=i%4?"rgba(255,220,160,.07)":"rgba(30,13,7,.12)";c.fillRect(x,y,.4+random(i+22)*1.3,.4+random(i+45)*1.3);}
    c.globalAlpha=.06+.02*Math.sin(progress*TAU);c.strokeStyle="#f8d99c";c.lineWidth=1;for(let i=0;i<10;i++){c.beginPath();c.moveTo(0,this.height*(i/10)+random(i)*20);c.bezierCurveTo(this.width*.3,random(i+5)*this.height,this.width*.7,random(i+8)*this.height,this.width,this.height*(i/10));c.stroke();}c.restore();
  }
}
