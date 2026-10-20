import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Bulletin } from './api';
import { Text } from './Typography';
import { newsSource } from './newsState';
import { articleIntro, articleUrl } from './articleTeaser';
import { colors } from './theme';

export function ArticlePreview({item}:{item:Bulletin}) {
  const source=newsSource(item),url=articleUrl(item),intro=articleIntro(item);
  const [failedImage,setFailedImage]=useState<string|null>(null);
  const [linkError,setLinkError]=useState(false);
  const published=item.publishedAt?new Date(item.publishedAt):null;
  return <View style={s.card}>
    {item.imageUrl?.startsWith('https://')&&failedImage!==item.imageUrl&&<Image source={{uri:item.imageUrl}} accessibilityLabel={`Artikelbild från ${source}`} resizeMode="cover" style={s.image} onError={()=>setFailedImage(item.imageUrl!)}/>}
    <View style={s.body}>
      <View style={s.sourceRow}><View style={s.badge}><Text style={s.badgeText}>FÖRHANDSVISNING</Text></View><Text style={s.source}>Källa: {source}</Text></View>
      <Text accessibilityRole="header" style={s.title}>{item.title}</Text>
      {published&&Number.isFinite(published.getTime())&&<Text style={s.meta}>Publicerad {published.toLocaleString('sv-SE',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</Text>}
      {!!item.area&&<Text style={s.meta}>{item.area}</Text>}
      <Text style={s.intro}>{intro||'Utgivaren har inte skickat någon inledning. Öppna originalartikeln för att läsa nyheten.'}</Text>
      <View style={s.readMore}>
        <Text style={s.readMoreTitle}>Fortsätt läsa hos {source}</Text>
        <Text style={s.explanation}>Här visas en kort inledning. Hela artikeln finns hos utgivaren.</Text>
        {url&&<Pressable accessibilityRole="link" accessibilityLabel={`Läs hela artikeln hos ${source}. Öppnas i webbläsaren.`} onPress={()=>{setLinkError(false);void Linking.openURL(url).catch(()=>setLinkError(true));}} style={({pressed})=>[s.button,pressed&&{opacity:.85}]}>
          <Text style={s.buttonText}>Läs hela artikeln hos {source}</Text><Ionicons name="open-outline" size={18} color="#fff"/>
        </Pressable>}
        {url&&<Text style={s.domain}>{new URL(url).hostname.replace(/^www\./,'')}</Text>}
        {linkError&&<Text accessibilityRole="alert" style={s.error}>Artikeln kunde inte öppnas. Försök igen.</Text>}
      </View>
    </View>
  </View>;
}

const s=StyleSheet.create({
  card:{backgroundColor:'#fff',borderRadius:18,borderWidth:1,borderColor:colors.border,overflow:'hidden'},
  image:{width:'100%',aspectRatio:16/9,backgroundColor:colors.secondary},
  body:{padding:18,gap:12},
  sourceRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8},
  badge:{backgroundColor:'#E4EEFB',paddingHorizontal:8,paddingVertical:5,borderRadius:6},
  badgeText:{fontSize:10,fontWeight:'800',letterSpacing:.7,color:'#164F94'},
  source:{fontSize:13,fontWeight:'700',color:'#253E61'},
  title:{fontSize:25,lineHeight:33,fontWeight:'800',letterSpacing:-.5,color:colors.ink},
  meta:{fontSize:12,lineHeight:18,color:colors.muted},
  intro:{fontSize:17,lineHeight:27,color:'#27364D'},
  readMore:{marginTop:6,paddingTop:18,borderTopWidth:1,borderTopColor:colors.border,gap:9},
  readMoreTitle:{fontSize:16,lineHeight:22,fontWeight:'700',color:colors.ink},
  explanation:{fontSize:13,lineHeight:20,color:colors.muted},
  button:{minHeight:50,backgroundColor:colors.link,borderRadius:12,paddingHorizontal:14,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  buttonText:{flex:1,fontSize:14,lineHeight:21,fontWeight:'700',color:'#fff'},
  domain:{fontSize:12,color:colors.muted},
  error:{fontSize:13,lineHeight:19,color:'#A91C2B'},
});
