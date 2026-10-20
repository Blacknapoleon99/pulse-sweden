import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { subscribeFamilySession } from './api';
import { appRequest, type AccountOverview } from './communityApi';
export function useAccount(){
  const [account,setAccount]=useState<AccountOverview|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),generation=useRef(0),focused=useIsFocused();
  async function refresh(){const version=++generation.current;setLoading(true);try{const value=await appRequest<AccountOverview>('/api/account/me');if(version===generation.current){setAccount(value);setError('');}}catch(err){if(version===generation.current){setAccount(null);setError((err as {status?:number}).status===401?'':err instanceof Error?err.message:'Kontot kunde inte hämtas');}}finally{if(version===generation.current)setLoading(false);}}
  useEffect(()=>{const unsubscribe=subscribeFamilySession(()=>{generation.current++;setAccount(null);setError('');if(focused)void refresh();});if(focused)void refresh();return()=>{unsubscribe();generation.current++;};},[focused]);
  return {account,error,loading,refresh};
}
