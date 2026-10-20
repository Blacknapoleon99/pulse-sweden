import { StyleSheet } from 'react-native';
// The app chrome follows the Trygg-Puls reference screens: a vivid blue action
// color, deep navy headings, soft white cards on a very light blue-grey page.
export const colors = { blue:'#2187F5', link:'#0757B8', ink:'#101D35', muted:'#4F5D73', background:'#F1F5FA', surface:'#FFFFFF', border:'#CBD6E4', secondary:'#E8F0FB', community:'#843DCE', danger:'#F33E49', green:'#29B963', amber:'#F7BE21' };
export const metrics={gutter:14,radius:9,touch:44,bottomSpace:88};
export const shadow={shadowColor:'#304C74',shadowOpacity:.035,shadowRadius:5,shadowOffset:{width:0,height:2},elevation:1};
export const ui = StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background}, content:{padding:metrics.gutter,paddingBottom:metrics.bottomSpace,gap:12},
  title:{fontSize:20,lineHeight:26,fontWeight:'800',letterSpacing:-.5,color:colors.ink}, heading:{fontSize:15,lineHeight:20,fontWeight:'800',letterSpacing:-.3,color:colors.ink},
  body:{fontSize:12,lineHeight:17,color:colors.muted}, meta:{fontSize:10,lineHeight:15,color:colors.muted},
  card:{backgroundColor:colors.surface,borderRadius:metrics.radius,padding:10,borderWidth:1,borderColor:colors.border,gap:6,marginBottom:8,...shadow},
  field:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:12,minHeight:44,paddingHorizontal:12,paddingVertical:8,fontSize:13,color:colors.ink},
  button:{minHeight:42,paddingHorizontal:14,paddingVertical:9,borderRadius:10,backgroundColor:colors.blue,alignItems:'center',justifyContent:'center'},
  buttonText:{fontSize:14,lineHeight:20,fontWeight:'700',color:'#fff'}, secondary:{backgroundColor:colors.secondary}, secondaryText:{color:colors.blue},
  row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8}, error:{fontSize:13,lineHeight:19,color:colors.danger},
  badge:{color:colors.community,fontWeight:'800',fontSize:12,lineHeight:18}, disabled:{opacity:.5}
});
