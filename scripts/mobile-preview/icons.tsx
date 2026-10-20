import React from 'react';
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';
export function Ionicons({name,size=18,color='#11152A',style}:any){return <span aria-hidden style={{fontFamily:'Ionicons',fontSize:size,color,lineHeight:1,display:'inline-block',flexShrink:0,...style}}>{String.fromCodePoint((glyphs as any)[name]||glyphs['ellipse-outline'])}</span>;}
Ionicons.glyphMap=glyphs;
export default Ionicons;
