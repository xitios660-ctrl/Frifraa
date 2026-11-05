"""TV support client: no credential values or image base64 are printed.
Usage: assist.py redeem CODE | assist.py status | assist.py act OPEN_APP PACKAGE
       assist.py act HOME | assist.py capture
"""
import base64,json,os,sys,time,urllib.request,urllib.error
from pathlib import Path
BASE='https://tv-do-guh-bridge.onrender.com'
ROOT=Path(os.environ.get('TV_SUPPORT_DIR','/workspace/scratch/tv-support'))
ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
SESSION=ROOT/'session.json'
def call(path,body=None,token=None):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urllib.request.urlopen(req,timeout=20) as response:return json.load(response)
def save(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'wb') as out:out.write(data)
def main():
    mode=sys.argv[1]
    if mode=='redeem':
        data=call('/support/redeem',{'code':sys.argv[2]})
        save(SESSION,json.dumps({'token':data['token']}).encode())
        print(json.dumps({'connected':True,'persistent':data.get('persistent',False)}));return
    token=json.loads(SESSION.read_text())['token']
    if mode=='status':
        data=call('/status',token=token)
        print(json.dumps({key:data.get(key) for key in ['online','screenshotAllowed','diagnosticAllowed','supportActive']},ensure_ascii=False));return
    body={'command':'SCREENSHOT'} if mode=='capture' else {'command':sys.argv[2],'observe':True}
    if len(sys.argv)>3:body['package']=sys.argv[3]
    started=time.monotonic();queued=call('/command',body,token)
    cid=queued.get('observationId',queued['id'])
    for _ in range(3):
        data=call('/wait',{'id':cid,'timeoutMs':12000},token)
        if data.get('result',{}).get('state')!='queued':break
    result={'result':data.get('result'),'actionResult':data.get('actionResult'),'elapsedSeconds':round(time.monotonic()-started,3)}
    if data.get('image'):
        image=data['image'];assert image.startswith('data:image/jpeg;base64,')
        path=ROOT/'current-screen.jpg';save(path,base64.b64decode(image.split(',',1)[1],validate=True));result['imagePath']=str(path)
    print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except urllib.error.HTTPError as error:
        try:detail=json.load(error).get('error','API error')
        except Exception:detail='API error'
        print(json.dumps({'httpStatus':error.code,'error':detail},ensure_ascii=False));sys.exit(1)
    except Exception as error:print(json.dumps({'error':str(error)},ensure_ascii=False));sys.exit(1)
