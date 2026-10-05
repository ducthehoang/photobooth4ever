param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [double]$MinAreaPct = 1.5,
  [string]$Clip = ""
)
# Đục trong suốt các ô ảnh có màu trời xanh / cỏ xanh trong khung (monchhichi, receiptify, flower, picnic)
Add-Type -AssemblyName System.Drawing
if (-not ('FrameCut2' -as [type])) {
Add-Type -TypeDefinition @"
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Imaging; using System.Linq;
public static class FrameCut2 {
  static bool Ph(byte r, byte g, byte b) {
    double R=r/255.0,G=g/255.0,B=b/255.0; double mx=Math.Max(R,Math.Max(G,B)), mn=Math.Min(R,Math.Min(G,B));
    double d=mx-mn; if (mx<0.4) return false; double s = d/mx; if (s<0.08) return false;
    double h; if (d==0) return false;
    if (mx==R) h=60*(((G-B)/d)%6); else if (mx==G) h=60*((B-R)/d+2); else h=60*((R-G)/d+4);
    if (h<0) h+=360;
    bool sky = h>=180 && h<=235 && s>=0.08 && s<=0.7 && mx>0.7;
    bool grass = h>=60 && h<=150 && s>=0.25 && mx>=0.6;
    return sky||grass;
  }
  public static string Run(string inp, string outp, double minPct, string clip) {
    var bmp = new Bitmap(inp); int W=bmp.Width,H=bmp.Height,N=W*H;
    var f = new Bitmap(W,H,PixelFormat.Format32bppArgb);
    using (var g=Graphics.FromImage(f)) g.DrawImage(bmp,0,0,W,H);
    var d=f.LockBits(new Rectangle(0,0,W,H),ImageLockMode.ReadWrite,PixelFormat.Format32bppArgb);
    byte[] px=new byte[N*4]; System.Runtime.InteropServices.Marshal.Copy(d.Scan0,px,0,N*4);
    var ph=new bool[N];
    for(int i=0;i<N;i++){int o=i*4; ph[i]=Ph(px[o+2],px[o+1],px[o]);} // BGRA
    if(!string.IsNullOrEmpty(clip)){ var rs=clip.Split(new[]{';'},StringSplitOptions.RemoveEmptyEntries).Select(s=>s.Split(',').Select(int.Parse).ToArray()).ToList();
      for(int i=0;i<N;i++){ if(!ph[i])continue; int x=i%W,y=i/W; bool ok=false; foreach(var r in rs){ if(x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3]){ok=true;break;} } if(!ok) ph[i]=false; } }
    var label=new int[N]; var stack=new int[N]; var comps=new List<int[]>(); comps.Add(null);
    for(int s=0;s<N;s++){
      if(!ph[s]||label[s]!=0)continue; int id=comps.Count; var c=new int[]{0,W,0,H,0,0}; int sp=0; stack[sp++]=s; label[s]=id;
      while(sp>0){int p=stack[--sp]; int x=p%W,y=p/W; c[0]++;
        if(x<c[1])c[1]=x; if(x>c[2])c[2]=x; if(y<c[3])c[3]=y; if(y>c[4])c[4]=y;
        if(x==0||y==0||x==W-1||y==H-1)c[5]=1;
        if(x>0&&ph[p-1]&&label[p-1]==0){label[p-1]=id;stack[sp++]=p-1;}
        if(x<W-1&&ph[p+1]&&label[p+1]==0){label[p+1]=id;stack[sp++]=p+1;}
        if(y>0&&ph[p-W]&&label[p-W]==0){label[p-W]=id;stack[sp++]=p-W;}
        if(y<H-1&&ph[p+W]&&label[p+W]==0){label[p+W]=id;stack[sp++]=p+W;}}
      comps.Add(c);
    }
    double minArea=N*minPct/100.0; var hole=new bool[N]; var slots=new List<int[]>();
    var sb=new System.Text.StringBuilder(); sb.Append("img "+W+"x"+H+"\n");
    // gộp các mảnh (trời + cỏ + mây) gần nhau thành 1 ô
    int nc=comps.Count; var par=new int[nc]; for(int i=0;i<nc;i++)par[i]=i;
    Func<int,int> find=null; find=(a)=>{ while(par[a]!=a){par[a]=par[par[a]];a=par[a];} return a; };
    var cand=new List<int>();
    for(int id=1;id<nc;id++){ var c=comps[id]; if(c[5]==0 && c[0]>=N*0.0015) cand.Add(id); }
    int G=10;
    foreach(int a in cand) foreach(int b in cand){ if(a>=b)continue; var A=comps[a]; var B=comps[b];
      if(A[1]-G<=B[2] && B[1]-G<=A[2] && A[3]-G<=B[4] && B[3]-G<=A[4]) par[find(a)]=find(b); }
    var groups=new Dictionary<int,List<int>>();
    foreach(int a in cand){ int r=find(a); if(!groups.ContainsKey(r)) groups[r]=new List<int>(); groups[r].Add(a); }
    foreach(var kv in groups){
      int area=0,x0=W,x1=0,y0=H,y1=0; foreach(int a in kv.Value){var c=comps[a]; area+=c[0]; if(c[1]<x0)x0=c[1]; if(c[2]>x1)x1=c[2]; if(c[3]<y0)y0=c[3]; if(c[4]>y1)y1=c[4];}
      sb.Append("group area%="+(100.0*area/N).ToString("0.00")+" bbox="+x0+","+y0+","+x1+","+y1+"\n");
      if(area<minArea) continue;
      slots.Add(new int[]{area,x0,x1,y0,y1,0});
      int R=7, pad=R+2; int bw=x1-x0+1+2*pad, bh=y1-y0+1+2*pad;
      var set=new HashSet<int>(kv.Value);
      var m=new bool[bw*bh];
      for(int y=0;y<bh;y++)for(int x=0;x<bw;x++){ int gx=x0-pad+x, gy=y0-pad+y; if(gx<0||gy<0||gx>=W||gy>=H)continue; int l=label[gy*W+gx]; if(l!=0&&set.Contains(l)) m[y*bw+x]=true; }
      Func<bool[],bool,bool[]> morph=(src,dil)=>{ var dst=new bool[bw*bh];
        for(int y=0;y<bh;y++)for(int x=0;x<bw;x++){ bool any=false, all=true;
          for(int dy=-R;dy<=R;dy++)for(int dx=-R;dx<=R;dx++){ int xx=x+dx,yy=y+dy; bool v=(xx>=0&&yy>=0&&xx<bw&&yy<bh)?src[yy*bw+xx]:false; if(v)any=true; else all=false; }
          dst[y*bw+x]= dil?any:all; }
        return dst; };
      var dl=morph(m,true);
      var outside=new bool[bw*bh]; var st=new int[bw*bh]; int sp=0;
      Action<int,int> push=(x,y)=>{ int lp=y*bw+x; if(dl[lp]||outside[lp])return; outside[lp]=true; st[sp++]=lp; };
      for(int x=0;x<bw;x++){push(x,0);push(x,bh-1);} for(int y=0;y<bh;y++){push(0,y);push(bw-1,y);}
      while(sp>0){int lp=st[--sp]; int x=lp%bw,y=lp/bw; if(x>0)push(x-1,y); if(x<bw-1)push(x+1,y); if(y>0)push(x,y-1); if(y<bh-1)push(x,y+1);}
      var filled=new bool[bw*bh]; for(int i=0;i<filled.Length;i++) filled[i]=!outside[i];
      var closed=morph(filled,false);
      for(int y=0;y<bh;y++)for(int x=0;x<bw;x++){ if(!closed[y*bw+x])continue; int gx=x0-pad+x, gy=y0-pad+y; if(gx<0||gy<0||gx>=W||gy>=H)continue; hole[gy*W+gx]=true; }
    }    // mây trắng chạm viền nên chưa được lấp: lan từ vùng đã đục sang các điểm trắng, giới hạn trong bbox của ô
    var inBox=new bool[N];
    foreach(var s in slots){ for(int y=s[3];y<=s[4];y++)for(int x=s[1];x<=s[2];x++) inBox[y*W+x]=true; }
    Func<int,bool> white=(i)=>{ int o=i*4; int mn=Math.Min(px[o],Math.Min(px[o+1],px[o+2])); int mxv=Math.Max(px[o],Math.Max(px[o+1],px[o+2])); return (mn>=232 && (mxv-mn)<=16) || (mn>=170 && (px[o+1]>=px[o+2]+3 || px[o]>=px[o+2]+3)); };
    { var q=new Queue<int>(); for(int i=0;i<N;i++) if(hole[i]) q.Enqueue(i);
      while(q.Count>0){ int p=q.Dequeue(); int x=p%W,y=p/W; int[] nb=new int[]{ x>0?p-1:-1, x<W-1?p+1:-1, y>0?p-W:-1, y<H-1?p+W:-1 };
        foreach(int n in nb){ if(n<0||hole[n]||!inBox[n]||!white(n))continue; hole[n]=true; q.Enqueue(n); } } }    var orderedSlots=slots.OrderBy(c=>c[3]).ToList();
    for(int pass=0;pass<2;pass++){ var nx=(bool[])hole.Clone();
      for(int y=0;y<H;y++)for(int x=0;x<W;x++){int p=y*W+x; if(hole[p])continue;
        if((x>0&&hole[p-1])||(x<W-1&&hole[p+1])||(y>0&&hole[p-W])||(y<H-1&&hole[p+W])) nx[p]=true;}
      hole=nx; }
    for(int i=0;i<N;i++) if(hole[i]) px[i*4+3]=0;
    System.Runtime.InteropServices.Marshal.Copy(px,0,d.Scan0,N*4); f.UnlockBits(d);
    f.Save(outp,ImageFormat.Png);
    var inv=System.Globalization.CultureInfo.InvariantCulture;
    sb.Append("w: "+W+", h: "+H+", slots: [\n");
    foreach(var c in orderedSlots){
      sb.Append("{ x: "+((c[1]-2)/(double)W).ToString("0.0000",inv)+", y: "+((c[3]-2)/(double)H).ToString("0.0000",inv)+
        ", w: "+((c[2]-c[1]+5)/(double)W).ToString("0.0000",inv)+", h: "+((c[4]-c[3]+5)/(double)H).ToString("0.0000",inv)+" },\n"); }
    sb.Append("]"); return sb.ToString();
  }
}
"@ -ReferencedAssemblies System.Drawing
}
$inFull = (Resolve-Path $In).Path
$outFull = Join-Path (Split-Path $inFull) $Out
[FrameCut2]::Run($inFull, $outFull, $MinAreaPct, $Clip)
