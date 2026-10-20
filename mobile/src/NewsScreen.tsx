import { Text } from './Typography';
import { useMemo, useRef } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Bulletin, FeedResponse } from './api';
import { useAppData, useFeedInterest } from './AppData';
import { useReadingList } from './useReadingList';
import { Button, Freshness } from './UI';
import { ui } from './theme';
import type { RootStackParams } from './navigation';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NewsCard} from './ReferenceKit';
import {PrototypeDashboardHeader,PrototypeTabs} from './PrototypeChrome';
import {prototypeDashboardStyles as styles} from './PrototypeDashboardStyles';
import {newsSource,stableNews} from './newsState';
import {ArticlePreview} from './ArticlePreview';
export {stableNews} from './newsState';
export function NewsScreen({navigation}:NativeStackScreenProps<RootStackParams,'news'>){
  const inset=useSafeAreaInsets();
  const data=useAppData();useFeedInterest(['pressNews','news','zoneNews']);const items=useMemo(()=>stableNews([...(data.feeds.pressNews.data as FeedResponse|null)?.items||[],...(data.feeds.news.data as FeedResponse|null)?.items||[],...(data.feeds.zoneNews.data as FeedResponse|null)?.items||[]]),[data.feeds.pressNews.data,data.feeds.news.data,data.feeds.zoneNews.data]),reading=useReadingList(items),list=useRef<FlatList<Bulletin>>(null);
  return <View style={styles.page}><FlatList ref={list} data={reading.items} showsVerticalScrollIndicator={false} maintainVisibleContentPosition={{minIndexForVisible:0}} keyExtractor={item=>item.id!} contentContainerStyle={[styles.content,{paddingTop:inset.top+10,paddingBottom:inset.bottom+108}]} refreshing={data.feeds.pressNews.loading||data.feeds.news.loading||data.feeds.zoneNews.loading} onRefresh={()=>void data.store.refreshMany(['pressNews','news','zoneNews'],true)} onScroll={event=>reading.setAtTop(event.nativeEvent.contentOffset.y<20)} scrollEventThrottle={100}
    ListHeaderComponent={<>
      <PrototypeDashboardHeader homeBack/>
      <Text style={[styles.heading,{marginTop:0}]}>Nyheter</Text>
      <Text style={styles.intro}>Nyheter från Aftonbladet, Expressen, Krisinformation och Polisen. Läs hela artikeln hos källan.</Text>
      {!!data.feeds.pressNews.error&&<Freshness fetchedAt={(data.feeds.pressNews.data as FeedResponse|null)?.fetchedAt} error={data.feeds.pressNews.error}/>}
      {!!data.feeds.news.error&&<Freshness fetchedAt={(data.feeds.news.data as FeedResponse|null)?.fetchedAt} error={data.feeds.news.error}/>}
      {!!data.feeds.zoneNews.error&&<Freshness fetchedAt={(data.feeds.zoneNews.data as FeedResponse|null)?.fetchedAt} error={data.feeds.zoneNews.error}/>}
      {!!reading.pending.length&&<Button title={`Visa nya uppdateringar (${reading.pending.length})`} onPress={()=>{reading.apply();reading.setAtTop(true);list.current?.scrollToOffset({offset:0,animated:false});}}/>}
    </>}
    renderItem={({item})=><NewsCard item={item} source={newsSource(item)} onPress={()=>navigation.navigate('newsDetail',{item})}/>}
    ListEmptyComponent={<Text style={styles.empty}>{data.feeds.pressNews.loading||data.feeds.news.loading||data.feeds.zoneNews.loading?'Hämtar nyheter…':data.feeds.pressNews.data||data.feeds.news.data||data.feeds.zoneNews.data?'Inga nya artiklar i de hämtade flödena.':'Nyhetsflödena kunde inte hämtas just nu.'}</Text>}
    ListFooterComponent={<>
      <Freshness fetchedAt={(data.feeds.pressNews.data as FeedResponse|null)?.fetchedAt} error={data.feeds.pressNews.error}/>
      <Freshness fetchedAt={(data.feeds.news.data as FeedResponse|null)?.fetchedAt} error={data.feeds.news.error}/>
      <Freshness fetchedAt={(data.feeds.zoneNews.data as FeedResponse|null)?.fetchedAt} error={data.feeds.zoneNews.error}/>
    </>}/><PrototypeTabs/></View>;
}
export function NewsDetailScreen({route}:NativeStackScreenProps<RootStackParams,'newsDetail'>){
  return <ScrollView style={ui.page} contentContainerStyle={ui.content} showsVerticalScrollIndicator={false}><ArticlePreview key={route.params.item.id||route.params.item.url||route.params.item.title} item={route.params.item}/></ScrollView>;
}
