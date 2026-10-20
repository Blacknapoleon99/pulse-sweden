import { Text } from './Typography';
import { StyleSheet, View } from 'react-native';
import type { Event } from './api';
import { incidentColors, incidentGroup } from './MapPreview';

// Counts describe the fetched source window, never a predicted safety score.
export function IncidentBars({events, available}: {events: Event[]; available: boolean}) {
  const groups = (['traffic','violence','other'] as const).map(key => ({
    key, label: key === 'traffic' ? 'Trafik' : key === 'violence' ? 'Våld' : 'Övrigt',
    count: events.filter(event => incidentGroup(event.type) === key).length,
  }));
  const maximum = Math.max(1, ...groups.map(group => group.count));
  return <View style={s.chart} accessibilityRole="image" accessibilityLabel={available ? groups.map(group => `${group.label}: ${group.count} publicerade notiser`).join(', ') : 'Inga tillgängliga uppgifter för diagrammet'}>
    {groups.map(group => <View key={group.key} style={s.column}>
      <Text style={s.count}>{available ? group.count : '—'}</Text>
      <View style={s.track}><View style={{width:'70%',height:available ? 72 * group.count / maximum : 0,backgroundColor:incidentColors[group.key],borderTopLeftRadius:6,borderTopRightRadius:6}} /></View>
      <Text style={s.label}>{group.label}</Text>
    </View>)}
  </View>;
}
const s=StyleSheet.create({chart:{flexDirection:'row',gap:10,padding:14,backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:'#E4EBF3'},column:{flex:1,alignItems:'center'},count:{color:'#11152A',fontSize:20,fontWeight:'800'},track:{height:80,width:'100%',alignItems:'center',justifyContent:'flex-end',borderBottomWidth:1,borderColor:'#CDD8E5',marginBottom:8},label:{fontSize:13,color:'#11152A',fontWeight:'700',textAlign:'center'}});
