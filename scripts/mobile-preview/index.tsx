import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Bulletin,FeedResponse} from '../../mobile/src/api';
import {NewsScreen,NewsDetailScreen} from '../../mobile/src/NewsScreen';
import {AppHeader} from '../../mobile/src/ReferenceKit';
import {Dashboard} from '../../mobile/src/Dashboard';
import {FamilyMapScreen} from '../../mobile/src/FamilyMapScreen';
import {PrototypeTabs} from '../../mobile/src/PrototypeChrome';
import {routeContext,newsDataContext} from './adapters';
import {events,news,region,sampleRoute} from './fixtures';
import regular from '../../mobile/assets/fonts/Inter_400Regular.ttf';
import medium from '../../mobile/assets/fonts/Inter_500Medium.ttf';
import semibold from '../../mobile/assets/fonts/Inter_600SemiBold.ttf';
import bold from '../../mobile/assets/fonts/Inter_700Bold.ttf';
import awesome from '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Solid.ttf';
import icons from '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf';
const fonts=document.createElement('style');fonts.textContent=`@font-face{font-family:InterRegular;src:url(${regular})}@font-face{font-family:InterMedium;src:url(${medium})}@font-face{font-family:InterSemiBold;src:url(${semibold})}@font-face{font-family:InterBold;src:url(${bold})}@font-face{font-family:FontAwesome6;src:url(${awesome})}@font-face{font-family:Ionicons;src:url(${icons})}*{box-sizing:border-box}body{margin:0;background:#EEF4FC;font-family:InterRegular,sans-serif}button{font:inherit}#root{padding:20px}header{color:#67708A;font-size:12px;margin-bottom:16px}.grid{display:flex;align-items:flex-start;gap:18px;flex-wrap:wrap}.device{width:390px;height:820px;position:relative;overflow:hidden;background:#FAFBFE;border:6px solid #101419;border-radius:32px;box-shadow:0 8px 25px #1E385520}.label{font:14px InterBold;margin-bottom:8px}.status{position:absolute;top:6px;left:22px;right:20px;display:flex;justify-content:space-between;z-index:10;font:10px InterSemiBold;color:#151B27;pointer-events:none}.bar{position:absolute;width:92px;height:4px;background:#151B27;border-radius:5px;bottom:5px;left:calc(50% - 46px);z-index:20}`;document.head.appendChild(fonts);
function Device({initial,label}:any){
  const [page,setPage]=useState(initial);
  const [press,setPress]=useState<FeedResponse|null>(null);
  const [article,setArticle]=useState<Bulletin|null>(null);
  const refreshPress=async()=>{try{setPress(await(await fetch('https://tryggpuls-news.onrender.com/api/press-news')).json());}catch{}};
  useEffect(()=>{if(initial==='home')void refreshPress();},[initial]);
  const openArticle=(item:Bulletin)=>{setArticle(item);setPage('newsDetail');};
  const navigation:any={navigate:(name:string,params:any)=>name==='newsDetail'?openArticle(params.item):setPage(name),canGoBack:()=>true,goBack:()=>setPage('news')};
  const go=(next:any)=>setPage(next);
  const missing=new URLSearchParams(location.search).get('location')==='denied';
  const position=missing?null:{lat:region.latitude,lon:region.longitude};
  return <section><div className="label">{label}</div><div className="device"><div className="status"><span>9:41</span><span>▮▮▮  ▰</span></div><routeContext.Provider value={page}><newsDataContext.Provider value={{feeds:{pressNews:{data:press,loading:!press,error:null},news:{data:null,loading:false,error:null},zoneNews:{data:null,loading:false,error:null}},store:{refreshMany:refreshPress}}}>
    {page==='news'?<NewsScreen navigation={navigation} route={{} as any}/>:page==='newsDetail'&&article?<div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',paddingTop:30}}><div style={{padding:'0 14px'}}><AppHeader onBack={()=>setPage('news')}/></div><NewsDetailScreen navigation={navigation} route={{params:{item:article}} as any}/></div>:page==='map'?<FamilyMapScreen route={sampleRoute} region={region} position={position} events={events} topInset={24} bottomInset={18} refreshing={false} onRefresh={()=>{}} onOpenFamily={()=>go('family')} onExpand={()=>{}} onLocate={()=>{}} openSource={()=>{}} onEditPlaces={()=>go('info')}/>:<Dashboard plannedRoute={sampleRoute} screen={page} topInset={24} bottomInset={18} events={{events,fetchedAt:new Date().toISOString()}} nearby={events} statsEvents={events} areas={[]} allAreas={[]} mapItems={[]} region={region} news={press?null:news} pressNews={press} zoneNews={null} weather={null} crisis={null} hasLocation={!!position} position={position} loading={false} eventsRefreshing={false} locationStatus={missing?'denied':'granted'} positionCheckedAt={position?Date.now():null} feedErrors={{}} communityReports={[]} onRefresh={()=>{}} onLocate={()=>{}} locate={async()=>position} go={go} openSource={()=>{}} onRouteTo={()=>{}} initialDestination="" onRouteResult={()=>{}} onOpenReport={()=>{}} onOpenNews={openArticle} onOpenEvents={()=>{}} onBack={()=>setPage('home')} onOpenStats={()=>setPage('stats')}/>}
    {page!=='news'&&<PrototypeTabs/>}</newsDataContext.Provider></routeContext.Provider><div className="bar"/></div></section>;
}
createRoot(document.getElementById('root')!).render(<><header>Visual QA · sample map/family/incidents · live publisher news · OpenStreetMap preview; native app uses its map provider</header><main className="grid"><Device initial="home" label="Hem / Översikt"/><Device initial="stats" label="Incidentstatistik"/><Device initial="places" label="Platshistorik — välj Centralstationen"/><Device initial="map" label="Karta · Familj & platser"/></main></>);
