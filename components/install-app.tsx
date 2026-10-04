'use client';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{outcome:string}> };
declare global {interface Window {getcanInstallPrompt?:InstallEvent|null}}
// Shared install state: the onboarding step and the Install GetCan button both use it.
export function useInstallPrompt(start='/commercial') {
 const [prompt,setPrompt]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(false),[ios,setIos]=useState(false);
 useEffect(()=>{
  if('serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});
  const manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');if(manifest && (new URL(manifest.href).searchParams.get('start')??'/commercial')!==start)manifest.href='/api/app-manifest?start='+encodeURIComponent(start);
  if(window.getcanInstallPrompt)setPrompt(window.getcanInstallPrompt);
  setInstalled(matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & {standalone?:boolean}).standalone);
  setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
  const before=(e:Event)=>{e.preventDefault();window.getcanInstallPrompt=e as InstallEvent;setPrompt(e as InstallEvent);};const done=()=>{setInstalled(true);setPrompt(null);window.getcanInstallPrompt=null;};
  window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',done);
  return()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',done);};
 },[start]);
 // Resolves 'accepted', 'dismissed', or 'unavailable' when the browser has no prompt to show (iPhone, or Chrome not ready yet).
 async function install():Promise<'accepted'|'dismissed'|'unavailable'>{const ready=prompt??window.getcanInstallPrompt;if(!ready)return 'unavailable';try{await ready.prompt();const choice=await ready.userChoice;if(choice.outcome==='accepted'){setInstalled(true);return 'accepted';}return 'dismissed';}catch{return 'unavailable';}finally{setPrompt(null);window.getcanInstallPrompt=null;}}
 return {installed,ios,canPrompt:!!prompt,install};
}

export default function InstallApp({start='/commercial',visible=true}:{start?:string;visible?:boolean}) {
 const {installed,ios,canPrompt,install:run}=useInstallPrompt(start),[help,setHelp]=useState(false);
 async function install(){const outcome=await run();setHelp(outcome==='unavailable');}
 if(installed || !visible)return null;
 return <><button className="gc-install" onClick={()=>void install()}><Download size={17}/>Install GetCan</button>{help&&<div className="gc-overlay" onClick={()=>setHelp(false)}><section className="gc-dialog" role="dialog" aria-modal="true" aria-label="Install GetCan" onClick={e=>e.stopPropagation()}><button className="gc-close" aria-label="Close" onClick={()=>setHelp(false)}><X/></button><img src="/icon-192.png" width="64" height="64" alt="Watercan"/><h2>Keep GetCan on your phone</h2>{canPrompt && <button className="gc-primary" onClick={()=>void install()}><Download size={18}/>Install now</button>}<p>{ios?'Open this page in Safari. Tap Share, then Add to Home Screen.':'Chrome may need a moment on your first visit. Stay on this page, then tap Install GetCan again. You can also tap the browser’s three-dot menu and choose Install app or Add to Home screen.'}</p><p>Internet is needed to place orders and save deliveries.</p></section></div>}</>;
}
