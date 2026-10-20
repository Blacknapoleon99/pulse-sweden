import { Text } from './Typography';
import { View, type StyleProp, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

// Flat reference header mark: a blue shield with the "Trygg-Puls" word mark.
export function TryggPulseBrand({nameStyle}:{nameStyle?:StyleProp<TextStyle>}){
  return <View style={{flexDirection:'row',alignItems:'center',gap:6}} accessibilityLabel="Trygg-Puls">
    <Ionicons name="shield-checkmark" size={27} color="#2187F5"/><Text style={[{color:'#10103D',fontSize:21,fontWeight:'800',letterSpacing:-.65},nameStyle]}>Trygg-<Text style={{color:'#1674FF'}}>Puls</Text></Text>
  </View>;
}
