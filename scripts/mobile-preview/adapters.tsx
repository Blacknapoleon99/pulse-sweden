import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {family,overview,saved,station,apiData} from './fixtures';
export const useFamily=()=>family;
export const newsDataContext=createContext<any>(null);
export const useAppData=()=>useContext(newsDataContext);
export const useFeedInterest=()=>{};
export const routeContext=createContext('home');
export const useIsFocused=()=>true;
export const useRoute=()=>({name:useContext(routeContext)});
export const useNavigation=()=>({navigate:()=>{},dispatch:()=>{},canGoBack:()=>true,goBack:()=>{},isFocused:()=>true,addListener:()=>()=>{}});
export const useFocusEffect=(fn:()=>void|(()=>void))=>useEffect(fn,[fn]);
export const useSafeAreaInsets=()=>({top:24,bottom:18,left:0,right:0});
export const getItemAsync=async(key:string)=>key==='tryggpuls-saved-places'?JSON.stringify(saved):key==='tryggpuls-saved-place-coordinates'?JSON.stringify(Object.fromEntries(overview.zones.map(zone=>[zone.id,{lat:zone.lat,lon:zone.lon,address:saved[zone.id as keyof typeof saved]}]))):key==='tryggpuls-place-favorites'?JSON.stringify([station]):null;
export const setItemAsync=async()=>{};
export const getJson=async()=>apiData;
export const familyRequest=async()=>({enabled:false});
export const clearFamilyToken=async()=>{};
export const geocode=async()=>({results:[{...station,displayName:'Centralstationen, Stockholm'}]});
export const API_BASE='https://tryggpuls.onrender.com';
export const useReadingList=()=>({saved:[],isSaved:()=>false,toggle:()=>{}});
export const Empty=()=>null;

const MapContext=createContext({region:{latitude:59.33,longitude:18.068,latitudeDelta:.032,longitudeDelta:.048},width:362,height:238});
export const MapView=React.forwardRef<any,any>(function MapView({children,initialRegion,style,onMapReady}:any,ref){
  const element=useRef<HTMLDivElement>(null),[dimensions,setDimensions]=useState({width:362,height:238});
  React.useImperativeHandle(ref,()=>({animateToRegion:()=>{},fitToCoordinates:()=>{},pointForCoordinate:async(coordinate:any)=>{const p=point(coordinate,{region:initialRegion,...dimensions});return {x:p.left,y:p.top};}}));
  useEffect(()=>{onMapReady?.();},[]);
  useEffect(()=>{if(!element.current)return;const obs=new ResizeObserver(([entry])=>setDimensions({width:entry.contentRect.width,height:entry.contentRect.height}));obs.observe(element.current);return()=>obs.disconnect();},[]);
  const region=initialRegion||{latitude:59.33,longitude:18.068,latitudeDelta:.032,longitudeDelta:.048};
  // Real OpenStreetMap tiles provide geography in this browser-only harness.
  const zoom=14,n=2**zoom,tx=(region.longitude+180)/360*n,latRad=region.latitude*Math.PI/180,ty=(1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n,cx=Math.floor(tx),cy=Math.floor(ty);
  return <MapContext.Provider value={{region,...dimensions}}><div ref={element} style={{position:'absolute',inset:0,overflow:'hidden',background:'#E5EDD9'}}>
    <div style={{position:'absolute',inset:0,filter:'saturate(.85) contrast(1.14)',opacity:1}}>{[-1,0,1].flatMap(dx=>[-1,0,1].map(dy=><img key={`${dx}-${dy}`} src={`https://tile.openstreetmap.org/${zoom}/${cx+dx}/${cy+dy}.png`} style={{position:'absolute',width:256,height:256,left:dimensions.width/2+((cx+dx)-tx)*256,top:dimensions.height/2+((cy+dy)-ty)*256}}/>))}</div>
    {children}<span style={{position:'absolute',bottom:1,right:3,font:'7px sans-serif',color:'#657468',background:'#FFFFFFAA'}}>© OpenStreetMap</span>
  </div></MapContext.Provider>;
});
export default MapView;
function point(coordinate:any,ctx:any){return {left:ctx.width/2+(coordinate.longitude-ctx.region.longitude)/ctx.region.longitudeDelta*ctx.width,top:ctx.height/2-(coordinate.latitude-ctx.region.latitude)/ctx.region.latitudeDelta*ctx.height};}
export const Marker=React.forwardRef<any,any>(function Marker({coordinate,children,title,onCalloutPress,anchor={x:.5,y:1}}:any,ref){const ctx=useContext(MapContext),p=point(coordinate,ctx);React.useImperativeHandle(ref,()=>({redraw:()=>{}}));return <div title={title} onClick={onCalloutPress} style={{position:'absolute',left:p.left,top:p.top,transform:`translate(${-anchor.x*100}%,${-anchor.y*100}%)`,zIndex:3}}>{children||<div style={{width:12,height:12,border:'2px solid white',borderRadius:50,background:'#2187F5'}}/>}</div>;});
export function Circle({center,radius,fillColor}:any){const ctx=useContext(MapContext),p=point(center,ctx),size=radius*2/(ctx.region.latitudeDelta*111000)*ctx.height;return <div style={{position:'absolute',left:p.left-size/2,top:p.top-size/2,width:size,height:size,borderRadius:'50%',background:fillColor}}/>;}
export function Polyline({coordinates,strokeColor,strokeWidth}:any){const ctx=useContext(MapContext);return <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}><polyline points={(coordinates||[]).map((coordinate:any)=>{const p=point(coordinate,ctx);return `${p.left},${p.top}`;}).join(' ')} fill="none" stroke={strokeColor||'#2187F5'} strokeWidth={strokeWidth||3} strokeLinejoin="round" strokeLinecap="round"/></svg>;}
export function Polygon(){return null;}
