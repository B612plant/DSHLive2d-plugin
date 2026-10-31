using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

public sealed class FloatingWindow : Window {
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly Dictionary<string,object> config;
    readonly WebView2CompositionControl view = new WebView2CompositionControl();
    [StructLayout(LayoutKind.Sequential)] struct CursorPoint { public int X; public int Y; }
    [DllImport("user32.dll")] static extern bool GetCursorPos(out CursorPoint point);
    [StructLayout(LayoutKind.Sequential)] struct NativeRect { public int Left,Top,Right,Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int Size;public NativeRect Monitor,Work;public uint Flags; }
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr handle,uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor,ref MonitorInfo info);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr handle,out NativeRect rect);
    readonly DispatcherTimer gazeTimer = new DispatcherTimer();
    readonly DispatcherTimer watchdog = new DispatcherTimer();
    readonly string origin;
    bool closing; bool reported;
    bool gesturing; string gestureEdge;
    CursorPoint gestureCursor;
    double gestureLeft,gestureTop,gestureWidth,gestureHeight,gesturePanel,gestureMinHeight;
    Matrix gestureDpi;
    static double Limit(double value,double min,double max){return Math.Max(min,Math.Min(max,value));}
    void FitToMonitor(){
        var handle=new System.Windows.Interop.WindowInteropHelper(this).Handle;
        var info=new MonitorInfo{Size=Marshal.SizeOf(typeof(MonitorInfo))};NativeRect rect;
        if(!GetMonitorInfo(MonitorFromWindow(handle,2),ref info)||!GetWindowRect(handle,out rect))return;
        var source=PresentationSource.FromVisual(this);var dpi=source!=null?source.CompositionTarget.TransformFromDevice:Matrix.Identity;
        var minX=Left+(info.Work.Left-rect.Left)*dpi.M11;var maxX=Left+(info.Work.Right-rect.Left)*dpi.M11-Width;
        var minY=Top+(info.Work.Top-rect.Top)*dpi.M22;var maxY=Top+(info.Work.Bottom-rect.Top)*dpi.M22-Height;
        Left=Math.Max(minX,Math.Min(maxX,Left));Top=Math.Max(minY,Math.Min(maxY,Top));
    }
    void UpdateGesture(){
        if(!gesturing)return;
        CursorPoint cursor;if(!GetCursorPos(out cursor))return;
        var delta=gestureDpi.Transform(new Vector(cursor.X-gestureCursor.X,cursor.Y-gestureCursor.Y));
        var dx=delta.X;var dy=delta.Y;
        var width=gestureWidth;var height=gestureHeight;var left=gestureLeft;var top=gestureTop;
        if(gestureEdge=="move"){left+=dx;top+=dy;}
        else{
            if(gestureEdge.Contains("e"))width=Limit(gestureWidth+dx,240,1000);
            if(gestureEdge.Contains("w"))width=Limit(gestureWidth-dx,240,1000);
            if(gestureEdge.Contains("s"))height=Limit(gestureHeight+dy,300,1200);
            if(gestureEdge.Contains("n"))height=Limit(gestureHeight-dy,300,1200);
            if(gestureEdge.Contains("w"))left+=gestureWidth-width;
            if(gestureEdge.Contains("n"))top+=gestureHeight-height;
        }
        // All bounds derive from one immutable drag origin, in device-independent pixels.
        // Do not clamp the window position mid-drag: it breaks the opposite-edge anchor.
        Width=width+52+gesturePanel;Height=Math.Max(height,gestureMinHeight);Left=left;Top=top;
        if(view.CoreWebView2!=null)view.CoreWebView2.PostWebMessageAsJson(json.Serialize(new{type="live2d-layout",width=width,height=height,moved=Math.Abs(dx)+Math.Abs(dy)>=4}));
    }
    void EndGesture(){
        if(!gesturing)return;UpdateGesture();gesturing=false;FitToMonitor();
        if(view.CoreWebView2!=null)view.CoreWebView2.PostWebMessageAsJson("{\"type\":\"live2d-gesture-end\"}");
    }
    static void Report(object data) { Console.WriteLine(new JavaScriptSerializer().Serialize(data)); Console.Out.Flush(); }
    public FloatingWindow(Dictionary<string,object> input) {
        config=input;
        var uri=new Uri((string)config["url"]);
        if(uri.Scheme!="http" || uri.Host!="127.0.0.1" || !uri.AbsolutePath.StartsWith("/live2d-stage/")) throw new Exception("Invalid local stage URL");
        origin=uri.GetLeftPart(UriPartial.Authority);
        Title="Live2D 桌面悬浮"; Width=350; Height=470; MinWidth=240; MinHeight=300;
        WindowStyle=WindowStyle.None; AllowsTransparency=true; Background=Brushes.Transparent;
        // Screenshot fixtures expose a selectable window for desktop interaction QA.
        Topmost=true; ShowInTaskbar=config.ContainsKey("screenshot"); ResizeMode=ResizeMode.NoResize; ShowActivated=false;
        Left=Math.Max(0,SystemParameters.WorkArea.Right-Width-24);Top=Math.Max(0,SystemParameters.WorkArea.Bottom-Height-30);
        view.DefaultBackgroundColor=System.Drawing.Color.Transparent;Content=view;
        // Composition input can omit DOM dblclick after capture: forward the native double-click too.
        PreviewMouseLeftButtonDown+=async(s,e)=>{if(e.ClickCount==2 && view.CoreWebView2!=null){var point=e.GetPosition(view);var coords=json.Serialize(new{x=point.X,y=point.Y});try{await view.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('live2d-native-doubleclick',{detail:"+coords+"}))");}catch{}}};
        try{var path=Path.Combine(Path.GetDirectoryName((string)config["profile"]),"window-position.json");if(File.Exists(path)){var saved=json.Deserialize<Dictionary<string,double>>(File.ReadAllText(path));Left=Math.Max(SystemParameters.VirtualScreenLeft,Math.Min(SystemParameters.VirtualScreenLeft+SystemParameters.VirtualScreenWidth-80,saved["left"]));Top=Math.Max(SystemParameters.VirtualScreenTop,Math.Min(SystemParameters.VirtualScreenTop+SystemParameters.VirtualScreenHeight-80,saved["top"]));}}catch{}
        PreviewKeyDown+=async(s,e)=>{if(e.Key==Key.Escape && view.CoreWebView2!=null){try{await view.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('live2d-native-escape'))");}catch{}}};
        Loaded+=async(s,e)=>{try{await Initialize();}catch(Exception error){Report(new{type="error",message=error.Message});Close();}};
        Closed+=(s,e)=>{closing=true;watchdog.Stop();gazeTimer.Stop();view.Dispose();Report(new{type="closed"});};
        watchdog.Interval=TimeSpan.FromSeconds(2);watchdog.Tick+=(s,e)=>{try{if(Process.GetProcessById(Convert.ToInt32(config["parentPid"])).HasExited)Close();}catch{Close();}};watchdog.Start();
    }
    async Task Initialize() {
        // Check the exact Unicode directory before WebView2 displays its own generic dialog.
        var profile=(string)config["profile"];
        try {
            Directory.CreateDirectory(profile);
            var probe=Path.Combine(profile,".write-check-"+Guid.NewGuid().ToString("N"));
            using(var file=new FileStream(probe,FileMode.CreateNew,FileAccess.Write,FileShare.None,1,FileOptions.DeleteOnClose)){file.WriteByte(0);}
        } catch(Exception error) {
            throw new IOException("无法读写桌面悬浮缓存目录："+profile+"。"+error.Message,error);
        }
        var environment=await CoreWebView2Environment.CreateAsync(null,(string)config["profile"],new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required"));
        await view.EnsureCoreWebView2Async(environment);
        var core=view.CoreWebView2;
        core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.IsStatusBarEnabled=false;
        core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=(s,e)=>{
            var uri=new Uri(e.Request.Uri);
            if(uri.GetLeftPart(UriPartial.Authority)==origin && uri.AbsolutePath.StartsWith("/live2d-stage/"))e.Request.Headers.SetHeader("X-Live2D-Float",(string)config["token"]);
            else e.Response=environment.CreateWebResourceResponse(new MemoryStream(),403,"Forbidden","");
        };
        core.NavigationStarting+=(s,e)=>{if(e.Uri!=(string)config["url"])e.Cancel=true;};
        core.NewWindowRequested+=(s,e)=>e.Handled=true;
        core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;
        core.DownloadStarting+=(s,e)=>e.Cancel=true;
        core.WebMessageReceived+=async(s,e)=>{
            if(e.Source!=(string)config["url"])return;
            var message=e.TryGetWebMessageAsString();
            if(message=="ready" && !reported){
                reported=true;
                Report(new{type="ready",handle=new System.Windows.Interop.WindowInteropHelper(this).Handle.ToInt64(),transparent=AllowsTransparency,topmost=Topmost});
                if(config.ContainsKey("screenshot")){
                    await Task.Delay(1800); if(closing)return;
                    var bitmap=new RenderTargetBitmap((int)ActualWidth,(int)ActualHeight,96,96,PixelFormats.Pbgra32);bitmap.Render(this);
                    var png=new PngBitmapEncoder();png.Frames.Add(BitmapFrame.Create(bitmap));using(var file=File.Create((string)config["screenshot"]))png.Save(file);
                    Report(new{type="screenshot"});
                }
            } else if(message=="focus"){Activate();view.Focus();Keyboard.Focus(view);}
            else if(message=="close")Close();
            else if(message=="reset"){Width=402;Height=470;Left=Math.Max(0,SystemParameters.WorkArea.Right-Width-24);Top=Math.Max(0,SystemParameters.WorkArea.Bottom-Height-24);try{File.WriteAllText(Path.Combine(Path.GetDirectoryName((string)config["profile"]),"window-position.json"),json.Serialize(new{left=Left,top=Top}));}catch{}}
            else if(message.StartsWith("layout:") && message.Length<4096){try{var data=json.Deserialize<Dictionary<string,string>>(message.Substring(7));if(data["key"].StartsWith("live2d-stage.layout.native.") && data["key"].Length<160){var path=Path.Combine(Path.GetDirectoryName((string)config["profile"]),"model-layouts.json");var layouts=File.Exists(path)?json.Deserialize<Dictionary<string,string>>(File.ReadAllText(path)):new Dictionary<string,string>();layouts[data["key"]]=data["value"];File.WriteAllText(path,json.Serialize(layouts));}}catch{}}
            else if(message=="save"){try{File.WriteAllText(Path.Combine(Path.GetDirectoryName((string)config["profile"]),"window-position.json"),json.Serialize(new{left=Left,top=Top}));}catch{}}
            else if(message.StartsWith("gesture:") && message.Length<2048){
                try{var data=json.Deserialize<Dictionary<string,object>>(message.Substring(8));var phase=(string)data["phase"];
                    if(phase=="start"){
                        var edge=(string)data["edge"];if(!new List<string>{"move","n","s","e","w","ne","nw","se","sw"}.Contains(edge))return;
                        if(!GetCursorPos(out gestureCursor))return;
                        gestureEdge=edge;gestureLeft=Left;gestureTop=Top;
                        gestureWidth=Limit(Convert.ToDouble(data["width"]),240,1000);gestureHeight=Limit(Convert.ToDouble(data["height"]),300,1200);
                        gesturePanel=Limit(Convert.ToDouble(data["panelWidth"]),0,440);gestureMinHeight=Limit(Convert.ToDouble(data["minHeight"]),300,1200);
                        var source=PresentationSource.FromVisual(this);gestureDpi=source!=null?source.CompositionTarget.TransformFromDevice:Matrix.Identity;
                        gesturing=true;
                    }else if(phase=="move")UpdateGesture();else if(phase=="end")EndGesture();
                }catch{}
            }
            else if(!gesturing && (message.StartsWith("move:") || message.StartsWith("resize:"))){
                var parts=message.Split(':');double x,y;
                if(parts.Length==3 && double.TryParse(parts[1],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out x) && double.TryParse(parts[2],System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out y) && !double.IsNaN(x) && !double.IsNaN(y) && !double.IsInfinity(x) && !double.IsInfinity(y)){
                    if(parts[0]=="resize"){Width=Math.Max(240,Math.Min(1800,x));Height=Math.Max(300,Math.Min(1200,y));FitToMonitor();}
                    else {Left+=Math.Max(-2000,Math.Min(2000,x));Top+=Math.Max(-2000,Math.Min(2000,y));}
                }
            }
        };
        try{var path=Path.Combine(Path.GetDirectoryName((string)config["profile"]),"model-layouts.json");if(File.Exists(path)){var layouts=json.Deserialize<Dictionary<string,string>>(File.ReadAllText(path));await core.AddScriptToExecuteOnDocumentCreatedAsync("try{for(const [k,v] of Object.entries("+json.Serialize(layouts)+")){if(k.startsWith('live2d-stage.layout.native.'))localStorage.setItem(k,v);}}catch{}");}}catch{}
        // Read only cursor position; PointFromScreen handles monitor DPI and negative coordinates.
        gazeTimer.Interval=TimeSpan.FromMilliseconds(33);
        gazeTimer.Tick+=(s,e)=>{if(closing||!reported)return;try{if(gesturing){if(Mouse.LeftButton==MouseButtonState.Pressed)UpdateGesture();else EndGesture();}CursorPoint cursor;if(GetCursorPos(out cursor)){var point=view.PointFromScreen(new Point(cursor.X,cursor.Y));core.PostWebMessageAsJson(json.Serialize(new{type="live2d-pointer",x=point.X,y=point.Y}));}}catch{}};
        gazeTimer.Start();
        core.Navigate((string)config["url"]);
        Task.Run(()=>{try{while(Console.ReadLine()!=null){} }catch{} Dispatcher.BeginInvoke(new Action(()=>{if(!closing)Close();}));});
    }
    [STAThread] public static void Main() {
        // Node pipes JSON as UTF-8. Never decode paths with the Windows console code page.
        Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false,true),false));
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)){AutoFlush=true});
        Console.SetError(new StreamWriter(Console.OpenStandardError(),new UTF8Encoding(false)){AutoFlush=true});
        try{var line=Console.ReadLine();if(line==null)return;var config=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(line);new Application().Run(new FloatingWindow(config));}
        catch(Exception e){Report(new{type="error",message=e.ToString()});Environment.ExitCode=1;}
    }
}
