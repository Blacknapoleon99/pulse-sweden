import {useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
export function useVisibleClock(interval=10_000){const focused=useIsFocused(),[clock,setClock]=useState(Date.now());useEffect(()=>{let active=AppState.currentState==='active';if(focused)setClock(Date.now());const tick=setInterval(()=>{if(focused&&active)setClock(Date.now());},interval),state=AppState.addEventListener('change',value=>{active=value==='active';if(active&&focused)setClock(Date.now());});return()=>{clearInterval(tick);state.remove();};},[focused,interval]);return clock;}
