import { useEffect, useRef, useState } from 'react';
export function useReadingList<T extends {id:string}>(incoming:T[]){
  const [items,setItems]=useState<T[]>(incoming),[pending,setPending]=useState<T[]>([]),atTop=useRef(true),latest=useRef(incoming),currentItems=useRef(incoming);
  useEffect(()=>{
    latest.current=incoming;
    const current=currentItems.current;
    if(!current.length||atTop.current){setPending([]);currentItems.current=incoming;setItems(incoming);return;}
    const previous=new Set(current.map(item=>item.id)),next=new Map(incoming.map(item=>[item.id,item]));
    setPending(incoming.filter(item=>!previous.has(item.id)));
    // Apply removals and moderation changes immediately; stage only new insertions.
    const retained=current.filter(item=>next.has(item.id)).map(item=>next.get(item.id)!);currentItems.current=retained;setItems(retained);
  },[incoming]);
  return {items,pending,setAtTop:(value:boolean)=>{atTop.current=value;},apply:()=>{currentItems.current=latest.current;setItems(latest.current);setPending([]);}};
}
