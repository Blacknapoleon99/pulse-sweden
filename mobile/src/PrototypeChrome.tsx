import { Text } from './Typography';
import Ionicons from '@expo/vector-icons/Ionicons';
import type {PropsWithChildren} from 'react';
import {useNavigation,useRoute} from '@react-navigation/native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {prototypeDashboardStyles as dashboard} from './PrototypeDashboardStyles';
import {prototypeMapStyles as map} from './PrototypeMapStyles';
import {prototypeTabs,prototypeTabAction,prototypeSelectTabAction,type PrototypeTabName} from './prototypeNavigation';
import {TryggPulseBrand} from './CajklopsBrand';
import {AppHeader} from './ReferenceKit';
import {colors} from './theme';
export {prototypeTabs,isPrototypeTab} from './prototypeNavigation';

export function openPrototypeTab(navigation:any,name:PrototypeTabName){navigation.dispatch(prototypeTabAction(name));}
const selectedTabIcons:Record<PrototypeTabName,keyof typeof Ionicons.glyphMap>={
  home:'home',map:'location',stats:'stats-chart',places:'location',info:'person',
};

// Retained tabs preserve search, map and form state when opening detail screens.
export function PrototypeTabs(props:Partial<BottomTabBarProps>={}){
  const parent=useNavigation<any>(),route=useRoute(),inset=useSafeAreaInsets();
  const tab=props.state?.routes[props.state.index].name||route.name;
  return <View style={[map.tabsWrap,{bottom:0,paddingBottom:inset.bottom,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:colors.border}]}><View style={map.tabs}>
    {prototypeTabs.map(([id,icon,label])=>{
      const selected=tab===id||(id==='home'&&['alerts','news','alarm'].includes(tab))||(id==='map'&&['family','events','route','journey'].includes(tab))||(id==='places'&&tab==='history')||(id==='info'&&['account','blocks','policy','admin','community','compose','report','newsDetail'].includes(tab));
      return <Pressable key={id} style={map.tab} hitSlop={8} accessibilityRole="tab" accessibilityState={{selected}} onPress={()=>{
        if(props.state&&props.navigation){const target=props.state.routes.find(item=>item.name===id);if(!target)return;const event=props.navigation.emit({type:'tabPress',target:target.key,canPreventDefault:true});if(!event.defaultPrevented)props.navigation.dispatch(prototypeSelectTabAction(id));}
        else openPrototypeTab(parent,id);
      }}><Ionicons name={selected?selectedTabIcons[id]:icon} size={23} color={selected?colors.blue:colors.muted}/><Text style={[map.tabText,{color:colors.muted},selected&&{color:colors.link}]}>{label}</Text></Pressable>;
    })}
  </View></View>;
}

export function PrototypeDashboardHeader({back=true,homeBack=false}: {back?:boolean;homeBack?:boolean}){
  const navigation=useNavigation<any>();
  return <AppHeader
    onBack={back?()=>!homeBack&&navigation.canGoBack()?navigation.goBack():openPrototypeTab(navigation,'home'):undefined}
    onBrand={()=>openPrototypeTab(navigation,'home')}
    right="person-circle-outline" rightLabel="Information och profil" onRight={()=>openPrototypeTab(navigation,'info')}
  />;
}

export function PrototypeMapHeader({loading,onRefresh}: {loading:boolean;onRefresh:()=>void}){
  const inset=useSafeAreaInsets();
  return <View style={[map.headerWrap,{top:inset.top+10}]}><View style={map.glass}><View style={map.header}>
    <View style={{flex:1}}><TryggPulseBrand nameStyle={map.brand}/></View>
    <Pressable hitSlop={11} accessibilityRole="button" accessibilityLabel="Uppdatera källor" onPress={onRefresh}>{loading?<ActivityIndicator color="#2187F5"/>:<Ionicons name="refresh" size={22} color="#11152A"/>}</Pressable>
  </View></View></View>;
}

export function PrototypeFeatureFrame({children}:PropsWithChildren){
  const inset=useSafeAreaInsets(),route=useRoute();
  const isMain=['home','map','stats','places','info'].includes(route.name);
  return <View style={{flex:1,backgroundColor:colors.background}}><View style={{paddingHorizontal:16,paddingTop:inset.top+10}}><PrototypeDashboardHeader back={!isMain}/></View><View style={{flex:1}}>{children}</View><PrototypeTabs/></View>;
}
