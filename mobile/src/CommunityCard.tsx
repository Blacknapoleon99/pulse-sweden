import { Text } from './Typography';
import { Pressable, View } from 'react-native';
import { COMMUNITY_LABEL, categoryNames, type CommunityReport } from './communityApi';
import { colors, ui } from './theme';
export function reportAge(value:string){const minutes=Math.max(0,Math.floor((Date.now()-Date.parse(value))/60_000));return minutes<1?'Nyss':minutes<60?`${minutes} min sedan`:`${Math.floor(minutes/60)} tim sedan`;}
export function CommunityCard({report,onPress}:{report:CommunityReport;onPress:()=>void}){
  return <Pressable accessibilityRole="button" accessibilityLabel={`${COMMUNITY_LABEL}. ${report.title}`} onPress={onPress} style={({pressed})=>[ui.card,{borderLeftColor:colors.community,borderLeftWidth:3},pressed&&{opacity:.76,transform:[{scale:.99}]}]}>
    <Text style={ui.badge}>{COMMUNITY_LABEL}</Text>
    <Text style={ui.heading}>{report.title}</Text>
    <Text style={ui.body} numberOfLines={3}>{report.body}</Text>
    <View style={ui.row}><Text style={ui.meta}>{categoryNames[report.category]} · {reportAge(report.observedAt)}</Text></View>
    <Text style={ui.meta}>Observerat {new Date(report.observedAt).toLocaleString('sv-SE')}</Text>
    <Text style={ui.meta}>{report.status==='active'?'Visas till':'Avslutad · slutdatum'} {new Date(report.expiresAt).toLocaleString('sv-SE')}</Text>
    <Text style={ui.meta}>Ungefärlig plats · {report.author.alias}</Text>
  </Pressable>;
}
