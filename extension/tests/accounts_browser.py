import json
import subprocess
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

dist = Path(__file__).resolve().parents[1] / "dist"
state = {"connected": True, "attempts": 0}
script = r"""
const originalOpen=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url,...rest){
 const target=new URL(String(url),location.href);
 const mocked=target.pathname.startsWith('/api/')?location.origin+'/mock'+target.pathname+target.search:String(url);
 return originalOpen.call(this,method,mocked,...rest);
};
window.addEventListener('load',async()=>{
 const pause=()=>new Promise(r=>setTimeout(r,100));
 const check=(v,m)=>{if(!v)throw new Error(m)};
 const wait=async f=>{for(let i=0;i<80;i++){if(f())return;await pause()}throw new Error('UI wait timed out')};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(text));
 const manage=()=>document.querySelector('[aria-label="Gerenciar contas conectadas"]');
 const dialog=()=>document.querySelector('[role="dialog"]');
 try {
  await wait(()=>manage()&&document.body.textContent.includes('a@example.test'));
  manage().click(); await wait(dialog);
  check(dialog().textContent.includes('Nome Real'),'Real profile name missing');
  check(dialog().textContent.includes('a@example.test'),'Email missing');
  check(button('Adicionar nova conta').disabled,'Future account button enabled');
  check(dialog().textContent.includes('Em breve'),'Future label missing');
  dialog().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await wait(()=>!dialog());
  manage().click(); await wait(dialog);
  document.querySelector('[aria-label="Fechar contas conectadas"]').click();
  await wait(()=>!dialog());
  manage().click(); await wait(dialog);
  button('Desconectar').click(); await wait(()=>button('Confirmar desconex'));
  let stats=await fetch('/stats').then(r=>r.json()); check(stats.attempts===0,'Disconnected before confirmation');
  button('Cancelar').click(); await wait(()=>button('Desconectar'));
  stats=await fetch('/stats').then(r=>r.json()); check(stats.attempts===0,'Cancel triggered disconnect');
  button('Desconectar').click(); await wait(()=>button('Confirmar desconex'));
  button('Confirmar desconex').click();
  await wait(()=>dialog()?.querySelector('[role="alert"]'));
  check(document.body.textContent.includes('a@example.test'),'Account hidden after failure');
  button('Confirmar desconex').click();
  await wait(()=>!dialog()&&document.body.textContent.includes('Nenhuma conta Google conectada'));
  check(!document.body.textContent.includes('a@example.test'),'Old account still visible');
  manage().click(); await wait(dialog);
  check(button('Conectar conta Google'),'Reconnect action missing');
  stats=await fetch('/stats').then(r=>r.json()); check(stats.attempts===2&&!stats.connected,'Backend result not reflected');
  const result=document.createElement('pre');result.id='ui-check';result.textContent='PASS: open, real identity, disabled future button, Escape, backdrop, cancel, confirm, failure, retry, disconnected state, reconnect action';document.body.append(result);
 }catch(e){const result=document.createElement('pre');result.id='ui-check';result.textContent='FAIL: '+e.message;document.body.append(result)}
});
"""


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(dist), **kwargs)

    def log_message(self, *args):
        pass

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        if self.path == "/stats":
            return self.send_json(state)
        if self.path.startswith("/mock/api/dashboard"):
            return self.send_json({"tasks": [], "google": {
                "connected": state["connected"], "name": "Nome Real" if state["connected"] else None,
                "email": "a@example.test" if state["connected"] else None,
                "connection_id": "ui-test" if state["connected"] else "offline",
                "calendar_connected": state["connected"], "tasks_connected": state["connected"], "agenda_connected": state["connected"],
            }})
        if self.path.startswith("/mock/api/events"):
            return self.send_json({"events": []})
        if self.path.startswith("/mock/api/tasks/history"):
            return self.send_json({"tasks": []})
        if self.path == "/":
            html = (dist / "src/panel/index.html").read_text(encoding="utf-8")
            html = html.replace("<head>", "<head><script>" + script + "</script>")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode())
            return
        return super().do_GET()

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        if self.path != "/mock/api/integrations/google/disconnect" or body != {"expected_email": "a@example.test", "confirmed": True}:
            return self.send_json({"detail": "Unexpected request"}, 400)
        state["attempts"] += 1
        if state["attempts"] == 1:
            return self.send_json({"detail": "Falha simulada na revogacao"}, 502)
        state["connected"] = False
        return self.send_json({"connected": False, "revoked": True})


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with tempfile.TemporaryDirectory(prefix="eunomia-ui-") as profile:
        browser = subprocess.Popen([
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            "--headless=new", "--no-first-run", "--disable-extensions", "--disable-background-networking",
            "--window-size=420,850", "--remote-debugging-port=0",
            "--user-data-dir=" + profile, f"http://127.0.0.1:{server.server_port}/",
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            port_file = Path(profile) / "DevToolsActivePort"
            for _ in range(100):
                if port_file.exists():
                    break
                time.sleep(.1)
            port = port_file.read_text().splitlines()[0]
            node = r'''
const targets=await fetch('http://127.0.0.1:'+process.argv[2]+'/json/list').then(r=>r.json());
const target=targets.find(t=>t.type==='page');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
let seq=0; const pending=new Map();
ws.onmessage=e=>{const d=JSON.parse(e.data);if(pending.has(d.id)){pending.get(d.id)(d);pending.delete(d.id)}};
const command=(method,params={})=>new Promise(resolve=>{const id=++seq;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}))});
let text='';
for(let n=0;n<400;n++){
 const r=await command('Runtime.evaluate',{expression:'document.querySelector("#ui-check")?.textContent || ""',returnByValue:true});
 text=r.result?.result?.value||''; if(text)break;
 await new Promise(resolve=>setTimeout(resolve,100));
}
console.log(text||'FAIL: UI timeout');
ws.send(JSON.stringify({id:++seq,method:'Browser.close'}));
await new Promise(resolve=>setTimeout(resolve,200));ws.close();
process.exit(text.startsWith('PASS')?0:1);
'''
            result = subprocess.run(["node", "--input-type=module", "-", port], input=node, capture_output=True, text=True, timeout=48)
            print(result.stdout.strip() or result.stderr[-1000:])
            if result.returncode:
                raise SystemExit(1)
        finally:
            if browser.poll() is None:
                browser.terminate()
            browser.wait(timeout=5)
finally:
    server.shutdown()
