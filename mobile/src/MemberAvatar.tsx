import {Image,View} from 'react-native';

const portraits=[
  {source:require('../assets/portraits/man.png'),back:'#E1EEFD'},
  {source:require('../assets/portraits/woman.png'),back:'#FFF0E2'},
  {source:require('../assets/portraits/girl.png'),back:'#F0E8FC'},
  {source:require('../assets/portraits/boy.png'),back:'#E6F4E9'},
];
// Bundled decorative portraits; names and sharing status come from the API.
export function MemberAvatar({index=0,size=34}:{index?:number;size?:number}){
  const p=portraits[index%portraits.length];
  return <View accessible={false} style={{width:size,height:size,borderRadius:size/2,backgroundColor:p.back,overflow:'hidden',borderWidth:1,borderColor:'#FFFFFF'}}>
    <Image source={p.source} resizeMode="contain" style={{width:size,height:size}}/>
  </View>;
}
