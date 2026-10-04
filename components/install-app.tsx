'use client';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{outcome:string}> };
declare global {interface Window {getcanInstallPrompt?:InstallEvent|null}}
export default function InstallApp({start='/commercial',visible=true}:{start?:string;visible?:boolean}) {
 const [prompt,setPrompt]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(false),[help,setHelp]=useState(false),[ios,setIos]=useState(false);
 useEffect(()=>{
  if('serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});
  const manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');if(manifest && (new URL(manifest.href).searchParams.get('start')??'/commercial')!==start)manifest.href='/api/app-manifest?start='+encodeURIComponent(start);
  if(window.getcanInstallPrompt)setPrompt(window.getcanInstallPrompt);
  setInstalled(matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & {standalone?:boolean}).standalone);
  setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
  const before=(e:Event)=>{e.preventDefault();window.getcanInstallPrompt=e as InstallEvent;setPrompt(e as InstallEvent);};const done=()=>{setInstalled(true);setPrompt(null);window.getcanInstallPrompt=null;setHelp(false);};
  window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',done);
  return()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',done);};
 },[start]);
 async function install(){const ready=prompt??window.getcanInstallPrompt;if(ready){try{await ready.prompt();const choice=await ready.userChoice;if(choice.outcome==='accepted'){setInstalled(true);setHelp(false);}}catch{setHelp(true);}finally{setPrompt(null);window.getcanInstallPrompt=null;}}else setHelp(true);}
 if(installed || !visible)return null;
 return <><button className="gc-install" onClick={()=>void install()}><Download size={17}/>Install GetCan</button>{help&&<div className="gc-overlay" onClick={()=>setHelp(false)}><section className="gc-dialog" role="dialog" aria-modal="true" aria-label="Install GetCan" onClick={e=>e.stopPropagation()}><button className="gc-close" aria-label="Close" onClick={()=>setHelp(false)}><X/></button><img src="/icon-192.png" width="64" height="64" alt="Watercan"/><h2>Keep GetCan on your phone</h2>{prompt && <button className="gc-primary" onClick={()=>void install()}><Download size={18}/>Install now</button>}<p>{ios?'Open this page in Safari. Tap Share, then Add to Home Screen.':'Chrome may need a moment on your first visit. Stay on this page, then tap Install GetCan again. You can also tap the browser’s three-dot menu and choose Install app or Add to Home screen.'}</p><p>Internet is needed to place orders and save deliveries.</p></section></div>}</>;
}
