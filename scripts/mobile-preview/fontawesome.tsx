import React from 'react';
import glyphs from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/FontAwesome6Free.json';
export default function FontAwesome6({name,size=18,color='#11152A'}:any){return <span aria-hidden style={{fontFamily:'FontAwesome6',fontSize:size,color,lineHeight:1,display:'inline-block',flexShrink:0}}>{String.fromCodePoint((glyphs as any)[name])}</span>;}
