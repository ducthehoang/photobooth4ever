param(
  [string]$In  = "..\images\frames\frame_pink_ribbon.jpg",
  [string]$Out = "..\images\frames\frame_pink_ribbon.png"
)
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Imaging; using System.Linq;
public static class FrameCut {
  public static string Run(string inp, string outp) {
    var bmp = new Bitmap(inp); int W = bmp.Width, H = bmp.Height, N = W*H;
    var f = new Bitmap(W,H,PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(f)) g.DrawImage(bmp,0,0,W,H);
    var d = f.LockBits(new Rectangle(0,0,W,H), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    byte[] px = new byte[N*4]; System.Runtime.InteropServices.Marshal.Copy(d.Scan0, px, 0, N*4);
    var dark = new bool[N];
    for (int i=0;i<N;i++){ int o=i*4; if (px[o]<50 && px[o+1]<50 && px[o+2]<50) dark[i]=true; }
    var label = new int[N]; var stack = new int[N];
    var comps = new List<int[]>(); comps.Add(null); // area,minX,maxX,minY,maxY,border
    for (int s=0;s<N;s++){
      if(!dark[s]||label[s]!=0) continue;
      int id=comps.Count; var c=new int[]{0,W,0,H,0,0}; int sp=0; stack[sp++]=s; label[s]=id;
      while(sp>0){
        int p=stack[--sp]; int x=p%W, y=p/W; c[0]++;
        if(x<c[1])c[1]=x; if(x>c[2])c[2]=x; if(y<c[3])c[3]=y; if(y>c[4])c[4]=y;
        if(x==0||y==0||x==W-1||y==H-1) c[5]=1;
        if(x>0&&dark[p-1]&&label[p-1]==0){label[p-1]=id;stack[sp++]=p-1;}
        if(x<W-1&&dark[p+1]&&label[p+1]==0){label[p+1]=id;stack[sp++]=p+1;}
        if(y>0&&dark[p-W]&&label[p-W]==0){label[p-W]=id;stack[sp++]=p-W;}
        if(y<H-1&&dark[p+W]&&label[p+W]==0){label[p+W]=id;stack[sp++]=p+W;}
      }
      comps.Add(c);
    }
    double minArea = N*0.01; var hole = new bool[N];
    for(int i=0;i<N;i++){ int id=label[i]; if(id==0) continue; var c=comps[id]; if(c[5]==1||c[0]>=minArea) hole[i]=true; }
    var slots = comps.Skip(1).Where(c=>c[5]==0&&c[0]>=minArea).OrderBy(c=>c[3]).ToList();
    for(int pass=0;pass<2;pass++){
      var nx=(bool[])hole.Clone();
      for(int y=0;y<H;y++)for(int x=0;x<W;x++){int p=y*W+x; if(hole[p])continue;
        if((x>0&&hole[p-1])||(x<W-1&&hole[p+1])||(y>0&&hole[p-W])||(y<H-1&&hole[p+W])) nx[p]=true;}
      hole=nx;
    }
    var col=new int[W]; var row=new int[H];
    for(int i=0;i<N;i++){ if(hole[i]) px[i*4+3]=0; else {col[i%W]++; row[i/W]++;} }
    int bx0=0,bx1=W-1,by0=0,by1=H-1;
    while(bx0<W-1&&col[bx0]<4)bx0++; while(bx1>0&&col[bx1]<4)bx1--;
    while(by0<H-1&&row[by0]<4)by0++; while(by1>0&&row[by1]<4)by1--;
    int bw=bx1-bx0+1, bh=by1-by0+1;
    System.Runtime.InteropServices.Marshal.Copy(px,0,d.Scan0,N*4); f.UnlockBits(d);
    var o2=new Bitmap(bw,bh,PixelFormat.Format32bppArgb);
    using(var g=Graphics.FromImage(o2)){ g.Clear(Color.Transparent); g.DrawImage(f,new Rectangle(0,0,bw,bh),new Rectangle(bx0,by0,bw,bh),GraphicsUnit.Pixel);}
    o2.Save(outp,ImageFormat.Png);
    var inv=System.Globalization.CultureInfo.InvariantCulture;
    var sb=new System.Text.StringBuilder(); sb.Append("w:"+bw+", h:"+bh+", slots:[\n");
    foreach(var c in slots){
      sb.Append("{ x: "+((c[1]-2-bx0)/(double)bw).ToString("0.0000",inv)+", y: "+((c[3]-2-by0)/(double)bh).ToString("0.0000",inv)+
        ", w: "+((c[2]-c[1]+5)/(double)bw).ToString("0.0000",inv)+", h: "+((c[4]-c[3]+5)/(double)bh).ToString("0.0000",inv)+" },\n");
    }
    sb.Append("]"); return sb.ToString();
  }
}
"@ -ReferencedAssemblies System.Drawing
[FrameCut]::Run((Resolve-Path $In).Path, (Join-Path (Split-Path (Resolve-Path $In).Path) (Split-Path $Out -Leaf)))
